#!/usr/bin/env node

/**
 * Operator V1 — CLI entry point for Claude Code to trigger image generation.
 *
 * Reads project state from shared data/ storage, builds prompt using the same
 * logic as the browser UI (locked elements → carry-forward → assembled prompt),
 * calls Vertex AI via the extracted generation function, and saves the output
 * record so it appears in the browser UI.
 *
 * Usage:
 *   node --env-file=.env operator/run.js
 *   node --env-file=.env operator/run.js --project <project-id>
 *   node --env-file=.env operator/run.js --model gemini-3-pro-image-preview
 *   node --env-file=.env operator/run.js --prompt "override prompt text"
 *   node --env-file=.env operator/run.js --intent "iterate on lighting" --reason "winner had flat lighting"
 *   node --env-file=.env operator/run.js --decision-file /tmp/decision.json
 *
 * Decision file shape (all fields optional):
 *   { "prompt": "...", "model": "...", "intent": "...", "reason": "..." }
 *
 * Precedence: CLI flag > decision file > session state.
 *
 * Requires Vertex AI env + Application Default Credentials for real model generation.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import * as storage from '../server/storage.js'
import { generateFromVertexAI } from '../server/gemini.js'
import { ensureVertexAIAuthReady, getVertexAIConfigError } from '../server/vertex-auth.js'
import { buildIterationContext, buildCrossSessionContext } from '../src/planning/iterationContext.js'
import { getEffectiveFeedback, normalizeFeedback, getFeedbackDisplay } from '../src/reviewFeedback.js'
import { buildOperatorContext } from './context.js'
import { generateProjectBrief, generateGlobalState, readBrief, readGlobalState, generateRecommendations } from './analyze.js'
import { buildStructuredPrompt } from './promptBuilder.js'
import { PROMPT_SECTION_ORDER, PROMPT_SECTION_LABELS } from '../src/prompt/structuredPrompt.js'
import { DEFAULT_IMAGE_MODEL, FAST_IMAGE_MODEL, PRO_IMAGE_MODEL, resolveImageModel } from '../src/modelConfig.js'

// --- Sensible operator defaults (no browser UI dependency) ---

const OPERATOR_DEFAULTS = {
  model: DEFAULT_IMAGE_MODEL,
  imageSize: '1K',
  aspectRatio: '1:1',
  thinkingLevel: 'minimal',
  googleSearch: false,
  imageSearch: false,
  batchSize: 2,
}

// --- Parse CLI args ---

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const promptPreviewFlag = args.includes('--prompt-preview')
const isPivot = args.includes('--pivot')
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null
}

function isPromptPreviewOutput(output) {
  return output?.outputKind === 'prompt-preview'
}

// --- Progress reporting (written to file, read by /api/operator/status) ---
const PROGRESS_FILE = fileURLToPath(new URL('../data/operator-progress.json', import.meta.url))
function writeProgress(phase, detail) {
  try { writeFileSync(PROGRESS_FILE, JSON.stringify({ phase, detail, ts: Date.now() })) } catch {}
}
function clearProgress() {
  try { unlinkSync(PROGRESS_FILE) } catch {}
}

// --- Load decision file (if provided) ---

const decisionFilePath = getArg('decision-file')
let decisionFile = {}

if (decisionFilePath) {
  let raw
  try {
    raw = readFileSync(decisionFilePath, 'utf-8')
  } catch (err) {
    console.error(`[operator] Cannot read decision file: ${decisionFilePath} — ${err.message}`)
    process.exit(1)
  }
  try {
    decisionFile = JSON.parse(raw)
  } catch {
    console.error(`[operator] Decision file is not valid JSON: ${decisionFilePath}`)
    process.exit(1)
  }
  console.log(`[operator] Decision file loaded: ${decisionFilePath}`)
}

// --- Resolve project and session ---

const projectId = getArg('project') || storage.getActiveProject()
const project = storage.get('projects', projectId)
if (!project) {
  console.error(`[operator] Project not found: ${projectId}`)
  process.exit(1)
}

// Sort sessions newest-first so sessions[0] is always the most recently active
const sessions = storage.getAllByIndex('sessions', 'projectId', projectId)
  .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
const session = sessions[0]
if (!session) {
  console.error(`[operator] No session found for project: ${projectId}`)
  process.exit(1)
}

writeProgress('context', `Loading project "${project.name}"`)
console.log(`[operator] Project: "${project.name}" (${projectId})`)
console.log(`[operator] Session: ${session.id} (${sessions.length} total session${sessions.length !== 1 ? 's' : ''} for this project)`)
console.log(`[operator] Goal: ${project.goal || session.goal || '(none)'}`)

// --- Load session entities ---
// Outputs and winners span ALL sessions — historical data should be visible across the full project
// Locked elements and refs stay session-specific (active-session concerns)

const allOutputs = sessions.flatMap(s => storage.getAllByIndex('outputs', 'sessionId', s.id))
const allWinners = sessions.flatMap(s => storage.getAllByIndex('winners', 'sessionId', s.id))
const allLockedElements = storage.getAllByIndex('lockedElements', 'sessionId', session.id)
const allRefs = storage.getAllByIndex('refs', 'sessionId', session.id)
const learningOutputs = allOutputs.filter((output) => !isPromptPreviewOutput(output))
const promptPreviewMode = promptPreviewFlag || decisionFile.promptPreview === true || session.promptPreviewMode === true

// --- Rating & Winner Summary (pre-flight check) ---
const winnerOutputIds = new Set(allWinners.map(w => w.outputId))
const ratedOutputs = learningOutputs
  .filter(o => o.feedback !== null && o.feedback !== undefined)
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  .slice(0, 12)

if (ratedOutputs.length > 0 || allWinners.length > 0) {
  console.log(`\n[operator] === RATING & WINNER SUMMARY ===`)
  if (ratedOutputs.length > 0) {
    for (const o of ratedOutputs) {
      const rating = normalizeFeedback(o.feedback)
      const display = getFeedbackDisplay(o.feedback)
      const isWinner = winnerOutputIds.has(o.id)
      const winTag = isWinner ? ' ★ WINNER' : ''
      const id = o.displayId || o.id.slice(0, 8)
      console.log(`  ${id}: ${rating}/5 (${display.label})${winTag}`)
    }
  }
  if (allWinners.length > 0) {
    console.log(`  Total winners: ${allWinners.length}`)
  }
  const avgRating = ratedOutputs.length > 0
    ? (ratedOutputs.reduce((sum, o) => sum + (normalizeFeedback(o.feedback) || 0), 0) / ratedOutputs.length).toFixed(1)
    : '--'
  console.log(`  Avg rating: ${avgRating} | Rated: ${ratedOutputs.length}/${learningOutputs.length}`)
  console.log(`[operator] ===============================\n`)

  // --- Stalled iteration detection ---
  const recentRated = ratedOutputs.slice(0, 3) // most recent 3
  const recentScores = recentRated.map(o => normalizeFeedback(o.feedback)).filter(r => r !== null)
  if (recentScores.length >= 2 && recentScores.every(r => r <= 2)) {
    console.log(`\n[operator] ⚠ WARNING: Last ${recentScores.length} outputs scored ${recentScores.join(', ')}. Iteration may be stalled.`)
    console.log(`[operator] Consider: asking for hex codes, reference images, or changing approach entirely.\n`)
  }

  // --- Questioning pre-flight: same failure category in last 2 low-rated outputs? ---
  const lowRatedAnnotated = learningOutputs
    .filter(o => {
      const r = normalizeFeedback(o.feedback)
      return r !== null && r <= 2 && o.operatorAnnotation && !o.operatorAnnotation.pass
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 2)

  if (lowRatedAnnotated.length === 2) {
    const [last, prev] = lowRatedAnnotated
    if (last.operatorAnnotation.category === prev.operatorAnnotation.category) {
      const category = last.operatorAnnotation.category
      const questions = {
        shape: "I've flagged nail shape twice in a row — can you send a reference image or describe the exact tip shape you want?",
        finish: "The finish isn't landing after two tries — can you point to a winner that had it right, or describe what's missing?",
        color: "The color isn't working after two tries — want to give me a hex code instead of a color name?",
        technique: "The technique keeps coming out wrong — can you describe what correct looks like, or share a reference?",
        other: "I've flagged the same issue twice and I'm guessing at this point — what specifically needs to change?",
      }
      console.log(`\n[operator] ⛔ SAME FAILURE TWICE (${category})`)
      console.log(`[operator] ${questions[category] || questions.other}`)
      console.log(`[operator] Stopping to ask rather than guessing a third time.`)
      console.log(`[operator] Answer the question above, then run the operator again.`)
      clearProgress()
      process.exit(0)
    }
  }

  // --- Smart model switching suggestion ---
  if (recentScores.length >= 3) {
    const last3 = recentScores.slice(0, 3)
    const allMediocre = last3.every(r => r >= 2 && r <= 3)
    if (allMediocre) {
      const avg3 = (last3.reduce((s, v) => s + v, 0) / 3).toFixed(1)
      // Check what model the recent outputs used
      const recentModels = recentRated.slice(0, 3).map(o => o.model || OPERATOR_DEFAULTS.model)
      const allFlash = recentModels.every(m => m.includes('flash'))
      const allPro = recentModels.every(m => m.includes('pro'))

      if (allFlash) {
        console.log(`\n[operator] MODEL SUGGESTION: Last 3 outputs averaged ${avg3} on Flash. Consider switching to Pro for higher quality.`)
        console.log(`[operator] Run with: --model ${PRO_IMAGE_MODEL}\n`)
      } else if (allPro) {
        console.log(`\n[operator] PROMPT SUGGESTION: Last 3 outputs averaged ${avg3} on Pro. Model upgrade won't help — consider changing prompt approach, adding refs, or asking for hex codes.\n`)
      }
    }
  }
}

// --- Analysis Engine: Generate/read project brief + global state ---
writeProgress('analysis', 'Running analysis engine...')

let projectBrief = null
let globalState = null
try {
  projectBrief = generateProjectBrief(projectId)
  globalState = generateGlobalState()
} catch (err) {
  console.log(`[operator] Analysis engine error (non-fatal): ${err.message}`)
}

if (projectBrief) {
  console.log(`\n[operator] === ANALYSIS INSIGHTS ===`)
  console.log(`  Project: ${projectBrief.projectName}`)
  console.log(`  Stats: ${projectBrief.stats.totalOutputs} outputs, ${projectBrief.stats.totalRated} rated, ${projectBrief.stats.totalWinners} winners, avg ${projectBrief.stats.avgRating ?? 'n/a'}`)

  if (projectBrief.whatWorks.length > 0) {
    console.log(`  What works:`)
    for (const w of projectBrief.whatWorks.slice(0, 5)) {
      console.log(`    "${w.keyword}" → avg ${w.avg} (${w.count} outputs)`)
    }
  }

  if (projectBrief.whatFails.length > 0) {
    console.log(`  What fails:`)
    for (const f of projectBrief.whatFails.slice(0, 5)) {
      console.log(`    "${f.keyword}" → avg ${f.avg} (${f.count} outputs)`)
    }
  }

  if (projectBrief.winnerDNA.length > 0) {
    console.log(`  Winner DNA:`)
    for (const d of projectBrief.winnerDNA.slice(0, 5)) {
      console.log(`    "${d.keyword}" → in ${d.pct}% of winners`)
    }
  }

  if (projectBrief.manualNotes?.liked?.length > 0) {
    console.log(`  Liked: ${projectBrief.manualNotes.liked.join(', ')}`)
  }
  if (projectBrief.manualNotes?.hated?.length > 0) {
    console.log(`  Hated: ${projectBrief.manualNotes.hated.join(', ')}`)
  }

  console.log(`[operator] ================================\n`)
}

if (globalState?.tasteProfile) {
  const { alwaysHigh, alwaysLow } = globalState.tasteProfile
  if (alwaysHigh.length > 0 || alwaysLow.length > 0) {
    console.log(`[operator] === GLOBAL TASTE PROFILE ===`)
    if (alwaysHigh.length > 0) {
      console.log(`  Always scores well: ${alwaysHigh.slice(0, 5).map(h => `"${h.keyword}" (${h.avg})`).join(', ')}`)
    }
    if (alwaysLow.length > 0) {
      console.log(`  Always scores poorly: ${alwaysLow.slice(0, 5).map(l => `"${l.keyword}" (${l.avg})`).join(', ')}`)
    }
    if (globalState.vocabulary && Object.keys(globalState.vocabulary).length > 0) {
      console.log(`  Vocabulary: ${Object.entries(globalState.vocabulary).map(([k, v]) => `${k} = ${v}`).join(', ')}`)
    }
    console.log(`[operator] =================================\n`)
  }
}

// --- Recommendations ---
try {
  const recs = generateRecommendations(projectId)
  if (recs.length > 0) {
    console.log(`[operator] === RECOMMENDATIONS ===`)
    for (const rec of recs) {
      console.log(`  • ${rec}`)
    }
    console.log(`[operator] =============================\n`)
  }
} catch {}

// --- Load active project memories ---
const allMemories = storage.getAllByIndex('memories', 'projectId', projectId)
const activeMemories = allMemories
  .filter((m) => m.active)
  .sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
  .slice(0, 12) // cap matches sourcePipeline.js CAPS.memory

// Order by session's ID arrays (same as UI does)
const outputMap = new Map(learningOutputs.map((o) => [o.id, o]))
const winnerMap = new Map(allWinners.map((w) => [w.id, w]))
const lockedMap = new Map(allLockedElements.map((l) => [l.id, l]))

const orderedOutputs = (project.outputIds || session.outputIds || []).map((id) => outputMap.get(id)).filter(Boolean)
const orderedWinners = (project.winnerIds || session.winnerIds || []).map((id) => winnerMap.get(id)).filter(Boolean)
const orderedLocked = (session.lockedElementIds || []).map((id) => lockedMap.get(id)).filter(Boolean)

// Refs marked for sending
const sendingRefs = allRefs.filter((r) => r.send)

// --- Build carry-forward context (same as App.jsx:668) ---

const outputsById = new Map(orderedOutputs.map((o) => [o.id, o]))
let iterationContext = buildIterationContext(orderedWinners, outputsById)

// --pivot: strip winner bucket carry-forward so old design directions don't bleed in.
// Rating signals (preserve/change) are kept — only bucket snapshot text is removed.
if (isPivot && iterationContext) {
  iterationContext = {
    ...iterationContext,
    preserve: iterationContext.preserve.filter((p) => p.source !== 'bucket'),
    change: iterationContext.change.filter((c) => c.source !== 'bucket'),
  }
  console.log('[operator] PIVOT MODE — bucket carry-forward cleared. Starting fresh direction.')
}

// --- Extract feedback source IDs (which outputs' feedback drove this generation) ---
const feedbackSourceIds = iterationContext
  ? [...new Set([
      ...iterationContext.preserve.filter((p) => p.outputId).map((p) => p.outputId),
      ...iterationContext.change.filter((c) => c.outputId).map((c) => c.outputId),
    ])]
  : []

// --- Cross-session carry-forward (lessons from previous session) ---
const crossSessionLessons = buildCrossSessionContext(projectId, session.id, storage)
let crossSessionPreamble = null
if (crossSessionLessons.length > 0) {
  crossSessionPreamble = `[Prior session lessons: ${crossSessionLessons.map((l) => l.text).join('; ')}]`
}

writeProgress('prompt', `Assembling prompt — ${activeMemories.length} memories, ${orderedLocked.filter(e => e.enabled).length} locked, ${sendingRefs.length} refs`)
// --- Assemble prompt through the structured builder ---

// Precedence: CLI flag > decision file > session state
const promptOverride = getArg('prompt') || decisionFile.prompt || null
const activeLockedElements = orderedLocked.filter((el) => el.enabled)
const activeLockedTexts = activeLockedElements.map((el) => el.text)
const promptBuild = buildStructuredPrompt({
  goal: session.goal || '',
  session,
  promptOverride,
  activeLockedElements: activeLockedTexts,
  sendingRefs,
  activeMemories,
  orderedOutputs,
  orderedWinners,
  iterationContext,
  crossSessionLessons,
  projectBrief,
  categoryState: projectBrief?.category ? globalState?.categoryProfiles?.[projectBrief.category] : null,
})
const finalPrompt = promptBuild.finalPrompt

if (!finalPrompt.trim()) {
  console.error('[operator] No prompt to send. Set buckets in the UI, use --prompt, or add locked elements.')
  process.exit(1)
}

// --- Read handoff file for project/session identification only ---

try {
  const handoffPath = fileURLToPath(new URL('../data/handoff.json', import.meta.url))
  const handoffData = JSON.parse(readFileSync(handoffPath, 'utf-8'))
  if (handoffData && handoffData.projectId === projectId) {
    // Only read projectId/sessionId from handoff — generation settings use operator defaults
  }
} catch {
  // No handoff file or parse error — that's fine
}

// --- Resolve model ---
// Precedence: CLI flag > decision file > operator defaults

const modelOverride = getArg('model') || decisionFile.model || null
const model = resolveImageModel(modelOverride || OPERATOR_DEFAULTS.model)

// --- Resolve batch size ---
// Precedence: decision file > operator defaults
const batchSize = parseInt(getArg('batch') || decisionFile.batchSize || OPERATOR_DEFAULTS.batchSize, 10)

// --- Resolve gen options ---
// Precedence: decision file > operator defaults
const genOptions = {
  imageSize: decisionFile.imageSize || OPERATOR_DEFAULTS.imageSize,
  aspectRatio: decisionFile.aspectRatio || OPERATOR_DEFAULTS.aspectRatio,
  thinkingLevel: decisionFile.thinkingLevel || OPERATOR_DEFAULTS.thinkingLevel,
  googleSearch: decisionFile.googleSearch ?? OPERATOR_DEFAULTS.googleSearch,
  imageSearch: decisionFile.imageSearch ?? OPERATOR_DEFAULTS.imageSearch,
}

// --- Prepare refs ---

const refPayloads = sendingRefs
  .filter((r) => r.blobBase64)
  .map((r) => ({
    base64: r.blobBase64,
    mimeType: r.type || 'image/png',
  }))

const sentRefsMeta = sendingRefs.map((r) => ({
  id: r.id,
  name: r.name,
  type: r.type,
  size: r.size,
  anchor: r.anchor || false,
  notes: r.notes || '',
}))

// --- Build output context snapshot (matches App.jsx:687-701) ---

const buckets = session.buckets || { subject: '', style: '', lighting: '', composition: '', technical: '' }
const memoriesUsedMeta = activeMemories.map((m) => ({ id: m.id, type: m.type, text: m.text.slice(0, 60) }))

const generationReceipt = {
  memoriesUsed: { count: activeMemories.length, ids: activeMemories.map((m) => m.id) },
  carryForwardUsed: {
    preserveCount: promptBuild.iterationSnapshot?.preserveUsed?.length || 0,
    changeCount: promptBuild.iterationSnapshot?.changeUsed?.length || 0,
  },
  lockedElementsUsed: activeLockedTexts.length,
  refsUsed: refPayloads.length,
  feedbackSourceIds,
  promptPreviewMode,
  crossSessionContext: crossSessionLessons.length > 0,
  crossSessionLessonCount: crossSessionLessons.length,
}

const outputContext = {
  provider: 'vertex-ai',
  model,
  sessionGoal: session.goal || '',
  approvedPlanSnapshot: session.approvedPlan || null,
  bucketSnapshot: { ...promptBuild.sections },
  assembledPromptSnapshot: promptOverride || session.assembledPrompt || '',
  activeLockedElementsSnapshot: activeLockedTexts,
  finalPromptSent: finalPrompt,
  promptSectionsSnapshot: promptBuild.sections,
  promptFilterSnapshot: promptBuild.filterSnapshot,
  sentRefs: sentRefsMeta,
  prompt: finalPrompt,
  planRunId: null,
  iterationPreamble: null,
  iterationSnapshot: promptBuild.iterationSnapshot || null,
  memoriesUsed: memoriesUsedMeta,
  feedbackSourceIds,
  generationReceipt,
}

// --- Build operator decision snapshot (optional, stays small) ---

const intent = getArg('intent') || decisionFile.intent || null
const reason = getArg('reason') || decisionFile.reason || null

const operatorDecision = {
  operatorMode: true,
  intent: intent || null,
  reason: reason || null,
  resolvedModel: model,
  resolvedPromptSource: getArg('prompt') ? 'cli' : decisionFile.prompt ? 'decision-file' : 'session',
  decisionFile: decisionFilePath ? decisionFile : null,
  contextSnapshot: {
    winnersCount: orderedWinners.length,
    carryForwardSummary: null,
    lockedCount: activeLockedTexts.length,
    refsCount: refPayloads.length,
    promptPreviewMode,
  },
}

// --- Dry-run: full prompt preview without Gemini call ---

if (dryRun) {
  console.log(`\n[operator] === DRY RUN — PROMPT PREVIEW ===\n`)

  for (const section of PROMPT_SECTION_ORDER) {
    console.log(`--- ${PROMPT_SECTION_LABELS[section].toUpperCase()} ---`)
    console.log(promptBuild.sections[section] || '(empty)')
    console.log('')
  }

  console.log(`--- FULL ASSEMBLED (${finalPrompt.length} chars) ---`)
  console.log(finalPrompt)
  console.log('')

  console.log(`--- FILTER SUMMARY ---`)
  console.log(`Promoted: ${promptBuild.filterSnapshot.promoted.length}`)
  console.log(`Suppressed: ${promptBuild.filterSnapshot.suppressed.length}`)
  console.log(`Source-of-truth output: ${promptBuild.filterSnapshot.sourceTruthOutputId || '--'}`)
  console.log('')

  console.log(`  Settings: ${model} | ${genOptions.imageSize} | ${genOptions.aspectRatio} | thinking: ${genOptions.thinkingLevel} | search: ${genOptions.googleSearch ? 'on' : 'off'} | batch: ${batchSize}`)
  console.log(`  Refs sending: ${refPayloads.length}`)
  if (crossSessionPreamble) {
    console.log(`  Cross-session lessons: ${crossSessionLessons.length}`)
  }
  console.log('')
  console.log(`[operator] DRY RUN COMPLETE — no Gemini call made.`)
  process.exit(0)
}

if (promptPreviewMode) {
  const createdAt = Date.now()
  const outputId = randomUUID()
  const previewOutput = {
    id: outputId,
    createdAt,
    feedback: null,
    status: 'prompt-preview',
    outputKind: 'prompt-preview',
    promptPreviewSections: promptBuild.sections,
    promptPreviewText: finalPrompt,
    ...outputContext,
    metadata: null,
    operatorDecision,
    projectId,
    sessionId: session.id,
  }

  storage.put('outputs', previewOutput)

  const freshSession = storage.get('sessions', session.id) || session
  const currentOutputIds = freshSession.outputIds || []
  const updatedSession = {
    ...freshSession,
    outputIds: [outputId, ...currentOutputIds],
    updatedAt: Date.now(),
  }
  storage.put('sessions', updatedSession)

  const freshProject = storage.get('projects', projectId) || project
  const currentProjectOutputIds = freshProject.outputIds || []
  storage.put('projects', {
    ...freshProject,
    outputIds: [outputId, ...currentProjectOutputIds.filter(id => id !== outputId)],
    updatedAt: Date.now(),
  })

  console.log(`[operator] Prompt Preview mode is on — saved assembled prompt instead of generating an image.`)
  console.log(`[operator] Preview output: ${outputId}`)
  clearProgress()
  process.exit(0)
}

// --- Log what we're about to do ---

console.log(`[operator] Model: ${model}`)
console.log(`[operator] Locked elements: ${activeLockedTexts.length}`)
console.log(`[operator] Memories injected: ${activeMemories.length}`)
console.log(`[operator] Refs sending: ${refPayloads.length}`)
if (crossSessionPreamble) {
  console.log(`[operator] Cross-session lessons: ${crossSessionLessons.length}`)
}
if (feedbackSourceIds.length > 0) {
  console.log(`[operator] Feedback from outputs: ${feedbackSourceIds.length}`)
}
console.log(`[operator] Structured prompt sections: ${PROMPT_SECTION_ORDER.map((section) => `${PROMPT_SECTION_LABELS[section]}=${promptBuild.sections[section] ? 'yes' : 'no'}`).join(' | ')}`)
console.log(`[operator] Batch size: ${batchSize}`)
console.log(`\n  Settings: ${model} | ${genOptions.imageSize} | ${genOptions.aspectRatio} | thinking: ${genOptions.thinkingLevel} | search: ${genOptions.googleSearch ? 'on' : 'off'} | images: ${batchSize}`)
console.log(`[operator] Final prompt (${finalPrompt.length} chars):`)
console.log(`  ${finalPrompt.slice(0, 300)}${finalPrompt.length > 300 ? '...' : ''}`)
const vertexConfigError = getVertexAIConfigError()
if (vertexConfigError) {
  console.error(`[operator] ${vertexConfigError}`)
  console.error('[operator] Real generation now uses Vertex AI with Application Default Credentials.')
  console.error('[operator] Prompt Preview and --dry-run do not need model auth, but real generation does.')
  process.exit(1)
}
writeProgress('auth', 'Checking Vertex AI Application Default Credentials')
try {
  await ensureVertexAIAuthReady()
} catch (err) {
  console.error(`[operator] ${err.message}`)
  if (err.detail) console.error(`[operator] Detail: ${err.detail}`)
  console.error('[operator] Real generation now uses Vertex AI with Application Default Credentials.')
  console.error('[operator] Run "gcloud auth application-default login" if ADC is not set up yet.')
  process.exit(1)
}
writeProgress('sending', `Sending prompt (${finalPrompt.length} chars) + ${refPayloads.length} ref(s) to ${model}`)
console.log(`[operator] Calling Vertex AI...`)

// --- Detect which setting caused a failure ---
function detectRestriction(err, model, options) {
  const msg = (err.message || '').toLowerCase()
  const detail = (err.detail || '').toLowerCase()
  const combined = `${msg} ${detail}`

  // Thinking level not supported
  if (combined.includes('thinking') && combined.includes('not supported')) {
    return { setting: 'thinkingLevel', value: options.thinkingLevel || 'High', model, error: err.message }
  }
  // Rate limited on specific size (often 4K on free tier)
  if ((err.code === 'RATE_LIMITED' || combined.includes('high demand')) && options.imageSize === '4K') {
    return { setting: 'imageSize', value: '4K', model, error: err.message }
  }
  // Image search not available
  if (combined.includes('image_search') || combined.includes('imagesearch')) {
    return { setting: 'imageSearch', value: 'true', model, error: err.message }
  }
  // Google search not available
  if (combined.includes('google_search') && (err.status === 400 || err.status === 403)) {
    return { setting: 'googleSearch', value: 'true', model, error: err.message }
  }
  return null
}

// --- Call Gemini: parallel first, then sequential retries for failures ---
// Fire all requests at once for speed. Any that fail get retried one at a time
// to avoid triggering another throttling spike.

const MAX_RETRIES = 3

try {
  // Phase 1: fire all in parallel
  writeProgress('waiting', `Waiting for Vertex AI — ${batchSize} image(s) requested`)
  console.log(`[operator] Firing ${batchSize} parallel requests...`)
  const batchPromises = Array.from({ length: batchSize }, () =>
    generateFromVertexAI(finalPrompt, refPayloads, model, genOptions)
  )
  const batchResults = await Promise.allSettled(batchPromises)

  const allImages = []
  let lastMetadata = null
  let failures = 0

  for (const settled of batchResults) {
    if (settled.status === 'fulfilled') {
      const result = settled.value
      lastMetadata = result.metadata
      for (const img of result.images) {
        allImages.push({ ...img, metadata: result.metadata })
      }
    } else {
      failures++
      console.log(`[operator] Parallel call failed: ${settled.reason?.message || 'unknown'}`)
    }
  }

  // Phase 2: retry failures sequentially (one at a time, up to MAX_RETRIES each)
  if (failures > 0) {
    writeProgress('retrying', `${allImages.length} succeeded, retrying ${failures} failed call(s)`)
    console.log(`[operator] Retrying ${failures} failed call(s) sequentially...`)
    for (let f = 0; f < failures; f++) {
      let succeeded = false
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await generateFromVertexAI(finalPrompt, refPayloads, model, genOptions)
          lastMetadata = result.metadata
          for (const img of result.images) {
            allImages.push({ ...img, metadata: result.metadata })
          }
          succeeded = true
          console.log(`[operator] Retry ${f + 1}/${failures} succeeded (attempt ${attempt})`)
          break
        } catch (err) {
          const retryable = err.name === 'AbortError' || err.message === 'This operation was aborted' || err.retryable
          if (retryable && attempt < MAX_RETRIES) {
            console.log(`[operator] Retry ${f + 1}/${failures} attempt ${attempt} failed (${err.message}) — retrying...`)
          } else {
            console.error(`[operator] Retry ${f + 1}/${failures} failed after ${attempt} attempt(s): ${err.message}`)
            break
          }
        }
      }
    }
  }

  if (allImages.length === 0) {
    console.error('[operator] All calls failed')
    process.exit(1)
  }

  const endedAt = Date.now()
  writeProgress('saving', `Received ${allImages.length} image(s), saving to project`)
  console.log(`[operator] Generation succeeded: ${allImages.length} image(s) from ${batchSize} call(s)`)

  // --- Save output records (matches App.jsx:760-776) ---

  const newOutputIds = []

  for (const img of allImages) {
    const outputId = randomUUID()
    const imagePath = storage.writeImageFile(outputId, img.mimeType, img.base64)

    const output = {
      id: outputId,
      imagePath,
      mimeType: img.mimeType,
      createdAt: endedAt,
      feedback: null,
      notes: '',
      status: 'succeeded',
      errorCode: null,
      errorMessage: null,
      ...outputContext,
      metadata: img.metadata || lastMetadata || null,
      operatorDecision,
      projectId,
      sessionId: session.id,
    }

    storage.put('outputs', output)
    newOutputIds.push(output.id)
    console.log(`[operator] Saved output: ${output.id}`)
  }

  // --- Update session outputIds (same as App.jsx:282 effect) ---

  // Re-read session from disk right before writing — generation takes time and the
  // browser may have written session fields (feedback, buckets, etc.) since we loaded.
  // This keeps those changes and only prepends the new output IDs.
  const freshSession = storage.get('sessions', session.id) || session
  const currentOutputIds = freshSession.outputIds || []
  // Prepend new outputs (UI shows newest first via [...newOutputs, ...prev])
  const updatedOutputIds = [...newOutputIds, ...currentOutputIds]
  const updatedSession = {
    ...freshSession,
    outputIds: updatedOutputIds,
    updatedAt: Date.now(),
  }
  storage.put('sessions', updatedSession)

  // Write outputIds to project (project is now primary data unit)
  const freshProject = storage.get('projects', projectId) || project
  const currentProjectOutputIds = freshProject.outputIds || []
  const mergedProjectOutputIds = [...newOutputIds, ...currentProjectOutputIds.filter(id => !newOutputIds.includes(id))]
  storage.put('projects', { ...freshProject, outputIds: mergedProjectOutputIds, updatedAt: Date.now() })

  // --- Write last-batch.json so verbal feedback can be saved to these outputs ---
  const lastBatchPath = fileURLToPath(new URL('../data/last-batch.json', import.meta.url))
  writeFileSync(lastBatchPath, JSON.stringify({
    outputIds: newOutputIds,
    sessionId: session.id,
    projectId,
    batchSize: allImages.length,
    generatedAt: Date.now(),
  }, null, 2))

  // --- Summary ---

  console.log('')
  console.log('=== OPERATOR RUN COMPLETE ===')
  console.log(`Project:  ${project.name}`)
  console.log(`Model:    ${model}`)
  console.log(`Batch:    ${batchSize} call(s)`)
  console.log(`Images:   ${allImages.length}`)
  console.log(`Outputs:  ${newOutputIds.join(', ')}`)
  console.log('')
  console.log('Open the app in the browser to view results and give feedback.')
  clearProgress()

} catch (err) {
  console.error(`[operator] Generation failed: ${err.code || 'UNKNOWN'} — ${err.message}`)
  if (err.detail) console.error(`[operator] Detail: ${err.detail}`)
  if (err.retryable) console.error('[operator] This error may be retryable.')

  // Record restriction so UI can grey out the setting that caused this
  try {
    const restrictionsPath = fileURLToPath(new URL('../data/generation-restrictions.json', import.meta.url))
    let current = { restrictions: [], updatedAt: null }
    try {
      if (existsSync(restrictionsPath)) current = JSON.parse(readFileSync(restrictionsPath, 'utf-8'))
    } catch {}

    const restriction = detectRestriction(err, model, genOptions)
    if (restriction) {
      const exists = current.restrictions.some((r) =>
        r.setting === restriction.setting && r.value === restriction.value && r.model === restriction.model
      )
      if (!exists) {
        current.restrictions.push({ ...restriction, createdAt: Date.now() })
        current.updatedAt = Date.now()
        writeFileSync(restrictionsPath, JSON.stringify(current, null, 2), 'utf-8')
        console.log(`[operator] Recorded restriction: ${restriction.setting}=${restriction.value} on ${restriction.model}`)
      }
    }
  } catch {}

  clearProgress()
  process.exit(1)
}
