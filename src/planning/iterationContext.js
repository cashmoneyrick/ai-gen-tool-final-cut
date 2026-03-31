import { getEffectiveFeedback } from '../reviewFeedback.js'

/**
 * buildIterationContext — extracts structured carry-forward data from winners + linked outputs.
 * Also reads V3 per-output feedback (notesKeep/notesFix) directly from outputs.
 *
 * Returns null if no actionable iteration signals exist.
 * Otherwise returns { preserve, change, lockedElements, bucketSnapshots }.
 */
export function buildIterationContext(winners, outputsById) {
  const preserve = []
  const change = []
  const lockedElementsSet = new Set()
  const bucketSnapshots = []

  // --- V3 (active): per-output and batch-level notes feedback ---
  const seenBatchNotes = new Set() // deduplicate batch notes (shared across outputs in same batch)
  if (outputsById && outputsById.size > 0) {
    for (const output of outputsById.values()) {
      // Per-output notes
      if (output.notesKeep && output.notesKeep.trim().length > 5) {
        preserve.push({ source: 'notes', text: output.notesKeep.trim(), outputId: output.id, createdAt: output.createdAt })
      }
      if (output.notesFix && output.notesFix.trim().length > 5) {
        change.push({ source: 'notes', text: output.notesFix.trim(), outputId: output.id, createdAt: output.createdAt })
      }
      // Batch-level notes (deduplicate — same text is on every output in the batch)
      if (output.batchNotesKeep && output.batchNotesKeep.trim().length > 5) {
        const key = `keep:${output.batchNotesKeep.trim()}`
        if (!seenBatchNotes.has(key)) {
          seenBatchNotes.add(key)
          preserve.push({ source: 'batch-notes', text: output.batchNotesKeep.trim(), batchCreatedAt: output.createdAt })
        }
      }
      if (output.batchNotesFix && output.batchNotesFix.trim().length > 5) {
        const key = `fix:${output.batchNotesFix.trim()}`
        if (!seenBatchNotes.has(key)) {
          seenBatchNotes.add(key)
          change.push({ source: 'batch-notes', text: output.batchNotesFix.trim(), batchCreatedAt: output.createdAt })
        }
      }
    }
  }

  // --- LEGACY (V1/V2 only): winner-based bucket/notes feedback ---
  // V3 does not use winners for feedback. This path is kept for backward compatibility
  // and can be removed when V1/V2 are fully deleted.
  if (winners && winners.length > 0) {
    for (const w of winners) {
      const output = outputsById?.get(w.outputId)
      const feedback = getEffectiveFeedback(output, w)

      if (feedback === 'up') {
        const buckets = output?.bucketSnapshot
        if (buckets) {
          for (const [key, value] of Object.entries(buckets)) {
            if (value && value.trim()) {
              preserve.push({ source: 'bucket', bucket: key, text: value.trim(), winnerId: w.id })
            }
          }
          if (bucketSnapshots.length < 4) {
            bucketSnapshots.push({ winnerId: w.id, buckets })
          }
        }

        const locked = output?.activeLockedElementsSnapshot
        if (locked && Array.isArray(locked)) {
          for (const el of locked) lockedElementsSet.add(el)
        }

        if (w.notes && w.notes.trim().length > 5) {
          preserve.push({ source: 'notes', text: w.notes.trim(), winnerId: w.id })
        }
      } else if (feedback === 'down') {
        if (w.notes && w.notes.trim().length > 5) {
          change.push({ source: 'notes', text: w.notes.trim(), winnerId: w.id })
        } else {
          change.push({ source: 'rejection', text: 'Output rejected without specific notes', winnerId: w.id })
        }
      }
    }
  }

  if (preserve.length === 0 && change.length === 0) return null

  // Deduplicate preserve entries by text (same bucket value from multiple winners)
  const seenPreserve = new Set()
  const deduped = preserve.filter((p) => {
    const key = `${p.source}:${p.text}`
    if (seenPreserve.has(key)) return false
    seenPreserve.add(key)
    return true
  })

  if (deduped.length === 0 && change.length === 0) return null

  return {
    preserve: deduped,
    change,
    lockedElements: Array.from(lockedElementsSet),
    bucketSnapshots,
  }
}

/**
 * formatIterationContextForPlan — formats iteration context as structured text for the plan prompt.
 */
export function formatIterationContextForPlan(ctx) {
  if (!ctx) return ''
  const parts = []

  if (ctx.preserve.length > 0) {
    parts.push('ELEMENTS TO PRESERVE:')
    const batchEntries = ctx.preserve.filter((p) => p.source === 'batch-notes')
    const bucketEntries = ctx.preserve.filter((p) => p.source === 'bucket')
    const noteEntries = ctx.preserve.filter((p) => p.source === 'notes')

    if (batchEntries.length > 0) {
      parts.push('  Batch-level direction (high priority):')
      for (const e of batchEntries) {
        parts.push(`    "${e.text.slice(0, 200)}"`)
      }
    }
    if (bucketEntries.length > 0) {
      const byBucket = {}
      for (const e of bucketEntries) {
        if (!byBucket[e.bucket]) byBucket[e.bucket] = e.text
      }
      for (const [bucket, text] of Object.entries(byBucket)) {
        parts.push(`  ${bucket}: ${text}`)
      }
    }
    if (noteEntries.length > 0) {
      for (const e of noteEntries) {
        parts.push(`  User note: "${e.text.slice(0, 200)}"`)
      }
    }
  }

  if (ctx.change.length > 0) {
    parts.push('ELEMENTS TO CHANGE:')
    const batchChanges = ctx.change.filter((c) => c.source === 'batch-notes')
    const noteChanges = ctx.change.filter((c) => c.source === 'notes')
    const otherChanges = ctx.change.filter((c) => c.source !== 'batch-notes' && c.source !== 'notes')

    if (batchChanges.length > 0) {
      parts.push('  Batch-level direction (high priority):')
      for (const c of batchChanges) {
        parts.push(`    Fix: "${c.text.slice(0, 200)}"`)
      }
    }
    if (noteChanges.length > 0) {
      for (const c of noteChanges) {
        parts.push(`  Fix: "${c.text.slice(0, 200)}"`)
      }
    }
    for (const c of otherChanges) {
      parts.push(`  - ${c.text}`)
    }
  }

  if (ctx.lockedElements.length > 0) {
    parts.push(`LOCKED ELEMENTS FROM WINNERS: ${ctx.lockedElements.join('; ')}`)
  }

  return parts.join('\n')
}

/**
 * formatIterationContextForGeneration — produces a compact preamble for the generation prompt.
 *
 * Returns { preamble, snapshot } or null if nothing actionable.
 * - preamble: a single compact text block for injection into the prompt
 * - snapshot: structured data for inspectability (stored in outputContext)
 *
 * Placed AFTER locked elements in the prompt so locked elements take priority.
 * Marked as "supporting guidance" so the model treats it as secondary to explicit prompt instructions.
 */
export function formatIterationContextForGeneration(ctx) {
  if (!ctx) return null

  // Split preserves by source — batch notes get priority (high-level direction)
  const batchPreserves = ctx.preserve.filter((p) => p.source === 'batch-notes')
  const notePreserves = ctx.preserve.filter((p) => p.source === 'notes')
  const bucketPreserves = ctx.preserve.filter((p) => p.source === 'bucket')

  // Split changes by source — batch notes get priority
  const batchChanges = ctx.change.filter((c) => c.source === 'batch-notes')
  const noteChanges = ctx.change.filter((c) => c.source === 'notes')

  // Batch notes: up to 3 keep + 3 fix (250 char each)
  const usedBatchPreserves = batchPreserves.slice(0, 3)
    .map((p) => ({ ...p, text: p.text.slice(0, 250) }))
  const usedBatchChanges = batchChanges.slice(0, 3)
    .map((c) => ({ ...c, text: c.text.slice(0, 250) }))

  // Per-image notes: up to 6 keep + 6 fix (250 char each)
  const usedNotePreserves = notePreserves.slice(0, 6)
    .map((p) => ({ ...p, text: p.text.slice(0, 250) }))
  const usedNoteChanges = noteChanges.slice(0, 6)
    .map((c) => ({ ...c, text: c.text.slice(0, 250) }))

  // Determine the 2 most recent batch timestamps for recency labels
  const allTimestamps = [
    ...usedBatchPreserves, ...usedBatchChanges,
    ...usedNotePreserves, ...usedNoteChanges,
  ].map((n) => n.batchCreatedAt || n.createdAt).filter(Boolean)
  const recentTimes = new Set(
    [...new Set(allTimestamps)].sort((a, b) => (b > a ? 1 : -1)).slice(0, 2)
  )
  const tagNote = (n) => {
    const ts = n.batchCreatedAt || n.createdAt
    if (!ts || recentTimes.size === 0) return n.text
    return recentTimes.has(ts) ? `[recent] ${n.text}` : `[earlier] ${n.text}`
  }

  // Bucket names as compact references (up to 3)
  const usedBucketPreserves = []
  const uniqueBuckets = [...new Set(bucketPreserves.map((p) => p.bucket))]
  if (uniqueBuckets.length > 0) {
    usedBucketPreserves.push({ source: 'buckets', text: uniqueBuckets.slice(0, 3).join(', ') })
  }

  const allPreserves = [...usedBatchPreserves, ...usedNotePreserves, ...usedBucketPreserves]
  const allChanges = [...usedBatchChanges, ...usedNoteChanges]

  if (allPreserves.length === 0 && allChanges.length === 0) return null

  // --- Escalation detection: flag fix directives that appear across multiple batches ---
  const fixFrequency = new Map() // normalized text → Set of batch timestamps
  for (const c of [...usedBatchChanges, ...usedNoteChanges]) {
    const key = c.text.toLowerCase().slice(0, 80)
    const ts = c.batchCreatedAt || c.createdAt || ''
    if (!fixFrequency.has(key)) fixFrequency.set(key, new Set())
    fixFrequency.get(key).add(ts)
  }
  const persistentFixes = new Set(
    [...fixFrequency.entries()].filter(([, timestamps]) => timestamps.size > 1).map(([key]) => key)
  )
  const escalateTag = (c) => {
    const key = c.text.toLowerCase().slice(0, 80)
    return persistentFixes.has(key) ? `PERSISTENT UNRESOLVED: ${c.text}` : c.text
  }

  // Build compact preamble — batch notes get uppercase labels for priority, notes tagged with recency
  const parts = []
  if (usedBatchPreserves.length > 0) {
    parts.push(`KEEP (batch): ${usedBatchPreserves.map((p) => tagNote(p)).join('; ')}`)
  }
  if (usedNotePreserves.length > 0) {
    parts.push(`keep: ${usedNotePreserves.map((p) => tagNote(p)).join('; ')}`)
  }
  if (usedBucketPreserves.length > 0) {
    parts.push(`keep buckets: ${usedBucketPreserves.map((p) => p.text).join('; ')}`)
  }
  if (usedBatchChanges.length > 0) {
    parts.push(`CRITICAL FIX (batch): ${usedBatchChanges.map((c) => { const t = tagNote({ ...c, text: escalateTag(c) }); return t }).join('; ')}`)
  }
  if (usedNoteChanges.length > 0) {
    parts.push(`MUST FIX: ${usedNoteChanges.map((c) => { const t = tagNote({ ...c, text: escalateTag(c) }); return t }).join('; ')}`)
  }

  const preamble = `[MANDATORY iteration directives — ${parts.join('. ')}.]`

  // Build structured snapshot for inspectability
  const allUsed = [...allPreserves, ...allChanges]
  const snapshot = {
    preserveUsed: allPreserves.map((p) => ({
      source: p.source,
      text: p.text,
      winnerId: p.winnerId || null,
      outputId: p.outputId || null,
      batchCreatedAt: p.batchCreatedAt || null,
    })),
    changeUsed: allChanges.map((c) => ({
      source: c.source,
      text: c.text,
      winnerId: c.winnerId || null,
      outputId: c.outputId || null,
      batchCreatedAt: c.batchCreatedAt || null,
    })),
    sourceWinnerIds: [
      ...new Set(allUsed.filter((e) => e.winnerId).map((e) => e.winnerId)),
    ],
  }

  return { preamble, snapshot }
}

/**
 * buildCrossSessionContext — pulls key lessons from the most recent previous session
 * in the same project, so new sessions start with accumulated knowledge instead of zero.
 *
 * @param {string} projectId
 * @param {string} currentSessionId
 * @param {object} storageModule — the server/storage.js module (passed to keep this testable)
 * @returns {Array<{text: string, source: string}>} — up to 4 prior session lessons
 */
export function buildCrossSessionContext(projectId, currentSessionId, storageModule) {
  const allSessions = storageModule.getAllByIndex('sessions', 'projectId', projectId)

  // Find the most recent previous session (not the current one)
  const previous = allSessions
    .filter((s) => s.id !== currentSessionId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]

  if (!previous) return []

  // Load winners and outputs from previous session
  const prevWinners = storageModule.getAllByIndex('winners', 'sessionId', previous.id)
  const prevOutputs = storageModule.getAllByIndex('outputs', 'sessionId', previous.id)
  const prevOutputsById = new Map(prevOutputs.map((o) => [o.id, o]))

  const lessons = []

  // Extract lessons from winner-linked outputs (strongest signal)
  for (const w of prevWinners) {
    if (lessons.length >= 4) break
    const output = prevOutputsById.get(w.outputId)
    if (output?.notesKeep && output.notesKeep.trim().length > 5) {
      lessons.push({ text: output.notesKeep.trim().slice(0, 200), source: 'prior-session-winner' })
    }
  }

  // Also pull batch-level keep notes (deduplicated)
  const seenBatch = new Set()
  for (const o of prevOutputs) {
    if (lessons.length >= 4) break
    if (o.batchNotesKeep && o.batchNotesKeep.trim().length > 5) {
      const key = o.batchNotesKeep.trim().slice(0, 80)
      if (!seenBatch.has(key)) {
        seenBatch.add(key)
        lessons.push({ text: o.batchNotesKeep.trim().slice(0, 200), source: 'prior-session-batch' })
      }
    }
  }

  return lessons
}

/**
 * summarizeIterationContext — returns a compact human-readable summary for UI display.
 */
export function summarizeIterationContext(ctx) {
  if (!ctx) return null

  const parts = []

  const preserveBatchNotes = ctx.preserve.filter((p) => p.source === 'batch-notes')
  const preserveBuckets = ctx.preserve.filter((p) => p.source === 'bucket')
  const preserveNotes = ctx.preserve.filter((p) => p.source === 'notes')

  if (preserveBatchNotes.length > 0) {
    parts.push(`${preserveBatchNotes.length} batch note${preserveBatchNotes.length > 1 ? 's' : ''}`)
  }
  if (preserveBuckets.length > 0) {
    const uniqueBuckets = [...new Set(preserveBuckets.map((p) => p.bucket))]
    parts.push(`keep ${uniqueBuckets.join(', ')}`)
  }
  if (preserveNotes.length > 0) {
    parts.push(`${preserveNotes.length} image note${preserveNotes.length > 1 ? 's' : ''}`)
  }

  if (ctx.change.length > 0) {
    const batchChanges = ctx.change.filter((c) => c.source === 'batch-notes')
    const noteChanges = ctx.change.filter((c) => c.source === 'notes')
    const rejections = ctx.change.filter((c) => c.source === 'rejection')

    if (batchChanges.length > 0) {
      parts.push(`batch fix: ${batchChanges.map((c) => c.text.slice(0, 40)).join(', ')}`)
    }
    if (noteChanges.length > 0) {
      parts.push(`fix: ${noteChanges.map((c) => c.text.slice(0, 40)).join(', ')}`)
    }
    if (rejections.length > 0 && batchChanges.length === 0 && noteChanges.length === 0) {
      parts.push(`${rejections.length} rejection${rejections.length > 1 ? 's' : ''}`)
    }
  }

  if (ctx.lockedElements.length > 0) {
    parts.push(`${ctx.lockedElements.length} locked element${ctx.lockedElements.length > 1 ? 's' : ''}`)
  }

  return parts.join(' · ')
}
