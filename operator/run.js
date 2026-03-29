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
import { randomUUID } from 'node:crypto'
import * as storage from '../server/storage.js'
import { generateFromGemini } from '../server/gemini.js'
import { buildIterationContext, formatIterationContextForGeneration } from '../src/planning/iterationContext.js'
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

// --- Assemble prompt (same order as App.jsx:670-674) ---

// Precedence: CLI flag > decision file > session state
const promptOverride = getArg('prompt') || decisionFile.prompt || null
const activeLockedElements = orderedLocked.filter((el) => el.enabled)
const activeLockedTexts = activeLockedElements.map((el) => el.text)

const promptParts = [...activeLockedTexts]
if (genCarryForward) promptParts.push(genCarryForward.preamble)

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

// --- Resolve model ---

const modelOverride = getArg('model') || decisionFile.model || null
const model = modelOverride || session.model || 'gemini-3.1-flash-image-preview'

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
}))

// --- Build output context snapshot (matches App.jsx:687-701) ---

const buckets = session.buckets || { subject: '', style: '', lighting: '', composition: '', technical: '' }
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
console.log(`[operator] Refs sending: ${refPayloads.length}`)
if (genCarryForward) {
  console.log(`[operator] Carry-forward: ${genCarryForward.preamble}`)
}
console.log(`[operator] Final prompt (${finalPrompt.length} chars):`)
console.log(`  ${finalPrompt.slice(0, 300)}${finalPrompt.length > 300 ? '...' : ''}`)
console.log(`[operator] Calling Gemini...`)

// --- Call Gemini ---

try {
  const result = await generateFromGemini(finalPrompt, refPayloads, model, apiKey)
  const endedAt = Date.now()

  console.log(`[operator] Generation succeeded: ${result.images.length} image(s), ${result.metadata.durationMs}ms`)

  // --- Save output records (matches App.jsx:760-776) ---

  const newOutputIds = []

  for (const img of result.images) {
    const output = {
      id: randomUUID(),
      dataUrl: `data:${img.mimeType};base64,${img.base64}`,
      mimeType: img.mimeType,
      createdAt: endedAt,
      feedback: null,
      status: 'succeeded',
      errorCode: null,
      errorMessage: null,
      ...outputContext,
      metadata: result.metadata || null,
      operatorDecision,
      // Stamped by storage (same as session.js:saveOutput)
      projectId,
      sessionId: session.id,
    }

    storage.put('outputs', output)
    newOutputIds.push(output.id)
    console.log(`[operator] Saved output: ${output.id}`)
  }

  // --- Update session outputIds (same as App.jsx:282 effect) ---

  const currentOutputIds = session.outputIds || []
  // Prepend new outputs (UI shows newest first via [...newOutputs, ...prev])
  const updatedOutputIds = [...newOutputIds, ...currentOutputIds]
  const updatedSession = {
    ...session,
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
  console.log(`Images:   ${result.images.length}`)
  console.log(`Duration: ${result.metadata.durationMs}ms`)
  console.log(`Outputs:  ${newOutputIds.join(', ')}`)
  if (result.text) {
    console.log(`Text:     ${result.text.slice(0, 200)}`)
  }
  console.log('')
  console.log('Open the app in the browser to view results and give feedback.')

} catch (err) {
  console.error(`[operator] Generation failed: ${err.code || 'UNKNOWN'} — ${err.message}`)
  if (err.detail) console.error(`[operator] Detail: ${err.detail}`)
  if (err.retryable) console.error('[operator] This error may be retryable.')
  process.exit(1)
}
