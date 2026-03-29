import { getEffectiveFeedback } from '../reviewFeedback.js'

/**
 * buildIterationContext — extracts structured carry-forward data from winners + linked outputs.
 *
 * Returns null if no actionable iteration signals exist.
 * Otherwise returns { preserve, change, lockedElements, bucketSnapshots }.
 */
export function buildIterationContext(winners, outputsById) {
  if (!winners || winners.length === 0) return null

  const preserve = []
  const change = []
  const lockedElementsSet = new Set()
  const bucketSnapshots = []

  for (const w of winners) {
    const output = outputsById.get(w.outputId)
    const feedback = getEffectiveFeedback(output, w)

    if (feedback === 'up') {
      // Extract bucket-level preserve entries from the linked output
      const buckets = output?.bucketSnapshot
      if (buckets) {
        for (const [key, value] of Object.entries(buckets)) {
          if (value && value.trim()) {
            preserve.push({ source: 'bucket', bucket: key, text: value.trim(), winnerId: w.id })
          }
        }
        // Keep full bucket snapshot for reference (cap at 4)
        if (bucketSnapshots.length < 4) {
          bucketSnapshots.push({ winnerId: w.id, buckets })
        }
      }

      // Collect locked elements from positive winners
      const locked = output?.activeLockedElementsSnapshot
      if (locked && Array.isArray(locked)) {
        for (const el of locked) lockedElementsSet.add(el)
      }

      // Winner notes on a positive winner = explicit "keep this" signal
      if (w.notes && w.notes.trim().length > 5) {
        preserve.push({ source: 'notes', text: w.notes.trim(), winnerId: w.id })
      }
    } else if (feedback === 'down') {
      // Notes on a negative winner = explicit "fix this" signal
      if (w.notes && w.notes.trim().length > 5) {
        change.push({ source: 'notes', text: w.notes.trim(), winnerId: w.id })
      } else {
        change.push({ source: 'rejection', text: 'Output rejected without specific notes', winnerId: w.id })
      }
    }
    // Neutral feedback (null) is not actionable for carry-forward
  }

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
    parts.push('ELEMENTS TO PRESERVE (from approved winners):')
    // Group by source type
    const bucketEntries = ctx.preserve.filter((p) => p.source === 'bucket')
    const noteEntries = ctx.preserve.filter((p) => p.source === 'notes')

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
    parts.push('ELEMENTS TO CHANGE (from rejected outputs):')
    for (const c of ctx.change) {
      if (c.source === 'notes') {
        parts.push(`  Fix: "${c.text.slice(0, 200)}"`)
      } else {
        parts.push(`  - ${c.text}`)
      }
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

  // Prioritize notes over raw bucket values for preserve (more explicit signal)
  const notePreserves = ctx.preserve.filter((p) => p.source === 'notes')
  const bucketPreserves = ctx.preserve.filter((p) => p.source === 'bucket')

  // Cap: up to 2 note preserves + up to 3 bucket names (not full values)
  const usedPreserves = []
  for (const p of notePreserves.slice(0, 2)) {
    usedPreserves.push({ ...p, text: p.text.slice(0, 80) })
  }
  // Add unique bucket names as compact references
  const uniqueBuckets = [...new Set(bucketPreserves.map((p) => p.bucket))]
  if (uniqueBuckets.length > 0 && usedPreserves.length < 3) {
    usedPreserves.push({ source: 'buckets', text: uniqueBuckets.slice(0, 3).join(', ') })
  }

  // Cap: up to 2 change entries (notes only, skip generic rejections)
  const usedChanges = ctx.change
    .filter((c) => c.source === 'notes')
    .slice(0, 2)
    .map((c) => ({ ...c, text: c.text.slice(0, 80) }))

  if (usedPreserves.length === 0 && usedChanges.length === 0) return null

  // Build compact preamble — marked as supporting guidance
  const parts = []
  if (usedPreserves.length > 0) {
    const keepTexts = usedPreserves.map((p) => p.text).join('; ')
    parts.push(`keep: ${keepTexts}`)
  }
  if (usedChanges.length > 0) {
    const fixTexts = usedChanges.map((c) => c.text).join('; ')
    parts.push(`fix: ${fixTexts}`)
  }

  const preamble = `[Supporting iteration guidance — ${parts.join('. ')}.]`

  // Build structured snapshot for inspectability
  const snapshot = {
    preserveUsed: usedPreserves.map((p) => ({
      source: p.source,
      text: p.text,
      winnerId: p.winnerId || null,
    })),
    changeUsed: usedChanges.map((c) => ({
      source: c.source,
      text: c.text,
      winnerId: c.winnerId || null,
    })),
    sourceWinnerIds: [
      ...new Set([
        ...usedPreserves.filter((p) => p.winnerId).map((p) => p.winnerId),
        ...usedChanges.filter((c) => c.winnerId).map((c) => c.winnerId),
      ]),
    ],
  }

  return { preamble, snapshot }
}

/**
 * summarizeIterationContext — returns a compact human-readable summary for UI display.
 */
export function summarizeIterationContext(ctx) {
  if (!ctx) return null

  const parts = []

  const preserveBuckets = ctx.preserve.filter((p) => p.source === 'bucket')
  const preserveNotes = ctx.preserve.filter((p) => p.source === 'notes')

  if (preserveBuckets.length > 0) {
    const uniqueBuckets = [...new Set(preserveBuckets.map((p) => p.bucket))]
    parts.push(`keep ${uniqueBuckets.join(', ')}`)
  }
  if (preserveNotes.length > 0) {
    parts.push(`${preserveNotes.length} winner note${preserveNotes.length > 1 ? 's' : ''}`)
  }

  if (ctx.change.length > 0) {
    const noteChanges = ctx.change.filter((c) => c.source === 'notes')
    if (noteChanges.length > 0) {
      parts.push(`fix: ${noteChanges.map((c) => c.text.slice(0, 40)).join(', ')}`)
    } else {
      parts.push(`${ctx.change.length} rejection${ctx.change.length > 1 ? 's' : ''}`)
    }
  }

  if (ctx.lockedElements.length > 0) {
    parts.push(`${ctx.lockedElements.length} locked element${ctx.lockedElements.length > 1 ? 's' : ''}`)
  }

  return parts.join(' · ')
}
