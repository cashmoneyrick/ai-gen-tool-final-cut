/**
 * Compact decision context builder for the operator.
 * Reads shared state from data/*.json and returns a high-signal summary
 * optimized for Claude to reason over — no base64, no dataUrls, truncated prompts.
 *
 * Usage:
 *   import { buildOperatorContext } from './operator/context.js'
 *   const ctx = buildOperatorContext()          // active project
 *   const ctx = buildOperatorContext('proj-id') // specific project
 *
 * Self-test:
 *   node operator/context.js --debug
 */

import * as storage from '../server/storage.js'
import { buildIterationContext, summarizeIterationContext } from '../src/planning/iterationContext.js'
import { getEffectiveFeedback } from '../src/reviewFeedback.js'

const MAX_RECENT_OUTPUTS = 12
const MAX_WINNERS = 10
const MAX_MEMORIES = 12
const MAX_PROMPT_PREVIEW = 200

function truncate(str, max = MAX_PROMPT_PREVIEW) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '...' : str
}

/**
 * Build a compact decision context for the operator.
 *
 * @param {string} [projectId] - Project ID. Defaults to active project.
 * @returns {object|null} Context object, or null if project/session not found.
 */
export function buildOperatorContext(projectId) {
  const resolvedProjectId = projectId || storage.getActiveProject()
  const project = storage.get('projects', resolvedProjectId)
  if (!project) return null

  const sessions = storage.getAllByIndex('sessions', 'projectId', resolvedProjectId)
  const session = sessions[0]
  if (!session) return null

  // Load session entities
  const allOutputs = storage.getAllByIndex('outputs', 'sessionId', session.id)
  const allWinners = storage.getAllByIndex('winners', 'sessionId', session.id)
  const allLockedElements = storage.getAllByIndex('lockedElements', 'sessionId', session.id)
  const allRefs = storage.getAllByIndex('refs', 'sessionId', session.id)

  // Order by session's ID arrays (same as UI)
  const outputMap = new Map(allOutputs.map((o) => [o.id, o]))
  const winnerMap = new Map(allWinners.map((w) => [w.id, w]))
  const lockedMap = new Map(allLockedElements.map((l) => [l.id, l]))

  const orderedOutputs = (session.outputIds || []).map((id) => outputMap.get(id)).filter(Boolean)
  const orderedWinners = (session.winnerIds || []).map((id) => winnerMap.get(id)).filter(Boolean)
  const orderedLocked = (session.lockedElementIds || []).map((id) => lockedMap.get(id)).filter(Boolean)

  // Build carry-forward
  const outputsById = new Map(orderedOutputs.map((o) => [o.id, o]))
  const iterationContext = buildIterationContext(orderedWinners, outputsById)
  const carryForwardSummary = summarizeIterationContext(iterationContext)

  // Feedback stats
  const feedbackCounts = { up: 0, down: 0, none: 0 }
  for (const o of orderedOutputs) {
    if (o.feedback === 'up') feedbackCounts.up++
    else if (o.feedback === 'down') feedbackCounts.down++
    else feedbackCounts.none++
  }
  const totalWithFeedback = feedbackCounts.up + feedbackCounts.down
  const positiveRate = totalWithFeedback > 0
    ? Math.round((feedbackCounts.up / totalWithFeedback) * 100)
    : null

  // Aggregate ALL feedback notes across all outputs (not just recent N)
  const MAX_FEEDBACK_NOTES = 15
  const seenBatchKeep = new Set()
  const seenBatchFix = new Set()
  const batchKeep = []
  const batchFix = []
  const imageKeep = []
  const imageFix = []
  let rejectionsWithoutNotes = 0

  for (const o of orderedOutputs) {
    if (o.notesKeep && o.notesKeep.trim().length > 5 && imageKeep.length < MAX_FEEDBACK_NOTES) {
      imageKeep.push({ text: o.notesKeep.trim(), outputId: o.id })
    }
    if (o.notesFix && o.notesFix.trim().length > 5 && imageFix.length < MAX_FEEDBACK_NOTES) {
      imageFix.push({ text: o.notesFix.trim(), outputId: o.id })
    }
    if (o.batchNotesKeep && o.batchNotesKeep.trim().length > 5 && !seenBatchKeep.has(o.batchNotesKeep.trim())) {
      seenBatchKeep.add(o.batchNotesKeep.trim())
      batchKeep.push({ text: o.batchNotesKeep.trim(), batchCreatedAt: o.createdAt })
    }
    if (o.batchNotesFix && o.batchNotesFix.trim().length > 5 && !seenBatchFix.has(o.batchNotesFix.trim())) {
      seenBatchFix.add(o.batchNotesFix.trim())
      batchFix.push({ text: o.batchNotesFix.trim(), batchCreatedAt: o.createdAt })
    }
    if (o.feedback === 'down' && (!o.notesFix || o.notesFix.trim().length <= 5)) {
      rejectionsWithoutNotes++
    }
  }

  const feedbackSummary = {
    batchKeep,
    batchFix,
    imageKeep,
    imageFix,
    totalNotes: batchKeep.length + batchFix.length + imageKeep.length + imageFix.length,
  }

  // Load memories (active only)
  const allMemories = storage.getAllByIndex('memories', 'projectId', resolvedProjectId)
  const activeMemories = allMemories
    .filter((m) => m.active)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.createdAt - a.createdAt
    })
    .slice(0, MAX_MEMORIES)

  // Build context
  return {
    project: {
      id: resolvedProjectId,
      name: project.name,
    },
    session: {
      id: session.id,
      goal: session.goal || '',
      model: session.model || 'gemini-3.1-flash-image-preview',
      planStatus: session.planStatus || 'idle',
    },
    buckets: session.buckets || { subject: '', style: '', lighting: '', composition: '', technical: '' },
    assembledPrompt: truncate(session.assembledPrompt || ''),
    lockedElements: orderedLocked
      .filter((el) => el.enabled)
      .map((el) => ({ text: el.text })),
    refs: allRefs.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      send: r.send,
      anchor: r.anchor || false,
      notes: r.notes || '',
    })),
    recentOutputs: orderedOutputs.slice(0, MAX_RECENT_OUTPUTS).map((o) => ({
      id: o.id,
      model: o.model,
      feedback: o.feedback,
      notesKeep: o.notesKeep || '',
      notesFix: o.notesFix || '',
      batchNotesKeep: o.batchNotesKeep || '',
      batchNotesFix: o.batchNotesFix || '',
      prompt: truncate(o.finalPromptSent),
      createdAt: o.createdAt,
      operatorMode: o.operatorDecision?.operatorMode || false,
    })),
    winners: orderedWinners.slice(0, MAX_WINNERS).map((w) => ({
      id: w.id,
      model: w.model,
      feedback: w.feedback,
      notes: w.notes || '',
      prompt: truncate(w.finalPromptSent || w.prompt),
      createdAt: w.createdAt,
    })),
    carryForward: {
      summary: carryForwardSummary,
      preserve: iterationContext?.preserve || [],
      change: iterationContext?.change || [],
    },
    memories: activeMemories.map((m) => ({
      id: m.id,
      type: m.type,
      text: truncate(m.text),
      pinned: m.pinned,
    })),
    feedbackSummary,
    stats: {
      totalOutputs: orderedOutputs.length,
      totalWinners: orderedWinners.length,
      positiveRate,
      rejectionsWithoutNotes,
    },
  }
}

// --- Self-test (only when run directly with --debug) ---

if (process.argv[1]?.endsWith('context.js') && process.argv.includes('--debug')) {
  const ctx = buildOperatorContext()
  if (!ctx) {
    console.error('No active project found.')
    process.exit(1)
  }
  console.log(JSON.stringify(ctx, null, 2))
}
