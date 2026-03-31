#!/usr/bin/env node

/**
 * Operator V1 — CLI entry point for Claude Code to trigger image generation.
 *
 * Reads project state from shared data/ storage, builds prompt using the same
 * logic as the browser UI (locked elements → carry-forward → assembled prompt),
 * calls Gemini via the extracted generation function, and saves the output
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
 * Requires GEMINI_API_KEY in .env or environment.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import * as storage from '../server/storage.js'
import { generateFromGemini } from '../server/gemini.js'
import { buildIterationContext, formatIterationContextForGeneration, buildCrossSessionContext } from '../src/planning/iterationContext.js'
import { getEffectiveFeedback } from '../src/reviewFeedback.js'
import { buildOperatorContext } from './context.js'

// --- Parse CLI args ---

const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null
}

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('[operator] GEMINI_API_KEY not set. Run with: node --env-file=.env operator/run.js')
  process.exit(1)
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

const sessions = storage.getAllByIndex('sessions', 'projectId', projectId)
const session = sessions[0]
if (!session) {
  console.error(`[operator] No session found for project: ${projectId}`)
  process.exit(1)
}

console.log(`[operator] Project: "${project.name}" (${projectId})`)
console.log(`[operator] Session: ${session.id}`)
console.log(`[operator] Goal: ${session.goal || '(none)'}`)

// --- Load session entities ---

const allOutputs = storage.getAllByIndex('outputs', 'sessionId', session.id)
const allWinners = storage.getAllByIndex('winners', 'sessionId', session.id)
const allLockedElements = storage.getAllByIndex('lockedElements', 'sessionId', session.id)
const allRefs = storage.getAllByIndex('refs', 'sessionId', session.id)

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
const outputMap = new Map(allOutputs.map((o) => [o.id, o]))
const winnerMap = new Map(allWinners.map((w) => [w.id, w]))
const lockedMap = new Map(allLockedElements.map((l) => [l.id, l]))

const orderedOutputs = (session.outputIds || []).map((id) => outputMap.get(id)).filter(Boolean)
const orderedWinners = (session.winnerIds || []).map((id) => winnerMap.get(id)).filter(Boolean)
const orderedLocked = (session.lockedElementIds || []).map((id) => lockedMap.get(id)).filter(Boolean)

// Refs marked for sending
const sendingRefs = allRefs.filter((r) => r.send)

// --- Build carry-forward context (same as App.jsx:668) ---

const outputsById = new Map(orderedOutputs.map((o) => [o.id, o]))
const iterationContext = buildIterationContext(orderedWinners, outputsById)
const genCarryForward = formatIterationContextForGeneration(iterationContext)

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

// --- Assemble prompt (same order as App.jsx:670-674) ---

// Precedence: CLI flag > decision file > session state
const promptOverride = getArg('prompt') || decisionFile.prompt || null
const activeLockedElements = orderedLocked.filter((el) => el.enabled)
const activeLockedTexts = activeLockedElements.map((el) => el.text)

// Build anchored ref notes (high-priority constraints, like locked elements)
const anchoredRefNotes = sendingRefs
  .filter((r) => r.anchor && (r.notes || '').trim())
  .map((r) => `[Anchored ref "${r.name}"]: ${r.notes.trim()}`)
const softRefNotes = sendingRefs
  .filter((r) => !r.anchor && (r.notes || '').trim())
  .map((r) => `[Ref "${r.name}"]: ${r.notes.trim()}`)

// --- Format memory directives ---
const memoryTypePrefix = { success: 'ALWAYS', failure: 'NEVER', correction: 'IMPORTANT', preference: 'PREFER' }
const memoryDirectives = activeMemories.map((m) => {
  const prefix = memoryTypePrefix[m.type] || 'NOTE'
  return `${prefix}: ${m.text.slice(0, 200)}`
})
const memoryBlock = memoryDirectives.length > 0
  ? `[Project memory directives (${memoryDirectives.length} lessons)]\n${memoryDirectives.join('\n')}`
  : null

// Prompt order: locked elements (highest) → memories → anchored ref notes → iteration guidance → cross-session → soft ref notes → assembled prompt
const promptParts = [...activeLockedTexts]
if (memoryBlock) promptParts.push(memoryBlock)
if (anchoredRefNotes.length > 0) promptParts.push(anchoredRefNotes.join('\n'))
if (genCarryForward) promptParts.push(genCarryForward.preamble)
if (crossSessionPreamble) promptParts.push(crossSessionPreamble)
if (softRefNotes.length > 0) promptParts.push(softRefNotes.join('\n'))

if (promptOverride) {
  promptParts.push(promptOverride)
} else if (session.assembledPrompt?.trim()) {
  promptParts.push(session.assembledPrompt.trim())
}

const finalPrompt = promptParts.join('\n\n')

if (!finalPrompt.trim()) {
  console.error('[operator] No prompt to send. Set buckets in the UI, use --prompt, or add locked elements.')
  process.exit(1)
}

// --- Read handoff file (V3 control panel settings) ---

let handoffImageCount = null
let handoffModel = null
let genOptions = {}
try {
  const handoffPath = fileURLToPath(new URL('../data/handoff.json', import.meta.url))
  const handoffData = JSON.parse(readFileSync(handoffPath, 'utf-8'))
  if (handoffData && handoffData.projectId === projectId) {
    if (handoffData.imageCount) handoffImageCount = handoffData.imageCount
    if (handoffData.model) handoffModel = handoffData.model
    // Generation options from V3 control panel
    if (handoffData.imageSize) genOptions.imageSize = handoffData.imageSize
    if (handoffData.aspectRatio) genOptions.aspectRatio = handoffData.aspectRatio
    if (handoffData.thinkingLevel) genOptions.thinkingLevel = handoffData.thinkingLevel
    if (handoffData.googleSearch) genOptions.googleSearch = true
    if (handoffData.imageSearch) genOptions.imageSearch = true
  }
} catch {
  // No handoff file or parse error — fall back to session
}

// --- Resolve model ---
// Precedence: CLI flag > decision file > handoff (V3 UI) > session state > default

const modelOverride = getArg('model') || decisionFile.model || null
const model = modelOverride || handoffModel || session.model || 'gemini-3.1-flash-image-preview'

// --- Resolve batch size (image count) ---
// Prefer handoff.imageCount (written synchronously by V3) over session.batchSize (debounced)
const batchSize = handoffImageCount || session.batchSize || 1

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
    preserveCount: genCarryForward?.snapshot?.preserveUsed?.length || 0,
    changeCount: genCarryForward?.snapshot?.changeUsed?.length || 0,
  },
  lockedElementsUsed: activeLockedTexts.length,
  refsUsed: refPayloads.length,
  feedbackSourceIds,
  crossSessionContext: crossSessionLessons.length > 0,
  crossSessionLessonCount: crossSessionLessons.length,
}

const outputContext = {
  provider: 'gemini',
  model,
  sessionGoal: session.goal || '',
  approvedPlanSnapshot: session.approvedPlan || null,
  bucketSnapshot: { ...buckets },
  assembledPromptSnapshot: promptOverride || session.assembledPrompt || '',
  activeLockedElementsSnapshot: activeLockedTexts,
  finalPromptSent: finalPrompt,
  sentRefs: sentRefsMeta,
  prompt: finalPrompt,
  planRunId: null,
  iterationPreamble: genCarryForward?.preamble || null,
  iterationSnapshot: genCarryForward?.snapshot || null,
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
    carryForwardSummary: genCarryForward?.preamble || null,
    lockedCount: activeLockedTexts.length,
    refsCount: refPayloads.length,
  },
}

// --- Log what we're about to do ---

console.log(`[operator] Model: ${model}`)
console.log(`[operator] Locked elements: ${activeLockedTexts.length}`)
console.log(`[operator] Memories injected: ${activeMemories.length}`)
console.log(`[operator] Refs sending: ${refPayloads.length}`)
if (genCarryForward) {
  console.log(`[operator] Carry-forward: ${genCarryForward.preamble}`)
}
if (crossSessionPreamble) {
  console.log(`[operator] Cross-session lessons: ${crossSessionLessons.length}`)
}
if (feedbackSourceIds.length > 0) {
  console.log(`[operator] Feedback from outputs: ${feedbackSourceIds.length}`)
}
console.log(`[operator] Batch size: ${batchSize}`)
if (Object.keys(genOptions).length > 0) {
  console.log(`[operator] Gen options: ${JSON.stringify(genOptions)}`)
}
console.log(`[operator] Final prompt (${finalPrompt.length} chars):`)
console.log(`  ${finalPrompt.slice(0, 300)}${finalPrompt.length > 300 ? '...' : ''}`)
console.log(`[operator] Calling Gemini...`)

// --- Call Gemini: parallel first, then sequential retries for failures ---
// Fire all requests at once for speed. Any that fail get retried one at a time
// to avoid triggering another throttling spike.

const MAX_RETRIES = 3

try {
  // Phase 1: fire all in parallel
  console.log(`[operator] Firing ${batchSize} parallel requests...`)
  const batchPromises = Array.from({ length: batchSize }, () =>
    generateFromGemini(finalPrompt, refPayloads, model, apiKey, genOptions)
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
    console.log(`[operator] Retrying ${failures} failed call(s) sequentially...`)
    for (let f = 0; f < failures; f++) {
      let succeeded = false
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await generateFromGemini(finalPrompt, refPayloads, model, apiKey, genOptions)
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
  console.log(`[operator] Generation succeeded: ${allImages.length} image(s) from ${batchSize} call(s)`)

  // --- Save output records (matches App.jsx:760-776) ---

  const newOutputIds = []

  for (const img of allImages) {
    const output = {
      id: randomUUID(),
      dataUrl: `data:${img.mimeType};base64,${img.base64}`,
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

  // Also touch project updatedAt
  storage.put('projects', { ...project, updatedAt: Date.now() })

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

} catch (err) {
  console.error(`[operator] Generation failed: ${err.code || 'UNKNOWN'} — ${err.message}`)
  if (err.detail) console.error(`[operator] Detail: ${err.detail}`)
  if (err.retryable) console.error('[operator] This error may be retryable.')
  process.exit(1)
}
