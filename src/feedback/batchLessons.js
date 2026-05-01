const READY_VALUES = new Set(['ready', 'cleanup'])
const USEFUL_VALUES = new Set(['ready', 'cleanup', 'inspiration'])
const MISS_VALUES = new Set(['wrong', 'reject'])

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function pushUnique(list, text, limit) {
  const cleaned = cleanText(text)
  if (!cleaned) return
  if (list.some((item) => item.toLowerCase() === cleaned.toLowerCase())) return
  if (list.length >= limit) return
  list.push(cleaned)
}

function reviewFor(output) {
  return output?.rickReview || {}
}

function createdAt(output) {
  return output?.createdAt || output?.rickReview?.updatedAt || 0
}

export function buildBatchLesson(outputs, options = {}) {
  const limit = options.limit || 5
  const reviewedOutputs = (outputs || [])
    .filter((output) => reviewFor(output).readiness)
    .sort((a, b) => createdAt(b) - createdAt(a))

  const stats = {
    reviewed: reviewedOutputs.length,
    ready: 0,
    cleanup: 0,
    inspiration: 0,
    wrong: 0,
    reject: 0,
    useful: 0,
  }
  const keep = []
  const avoid = []
  const refCandidateIds = []

  for (const output of reviewedOutputs) {
    const review = reviewFor(output)
    const readiness = review.readiness
    if (Object.prototype.hasOwnProperty.call(stats, readiness)) stats[readiness] += 1
    if (USEFUL_VALUES.has(readiness)) stats.useful += 1

    if (READY_VALUES.has(readiness) && output.id && refCandidateIds.length < limit) {
      refCandidateIds.push(output.id)
    }

    if (USEFUL_VALUES.has(readiness)) {
      pushUnique(keep, review.reason, limit)
      pushUnique(keep, output.notesKeep, limit)
    }

    if (MISS_VALUES.has(readiness)) {
      pushUnique(avoid, review.reason, limit)
      pushUnique(avoid, output.notesFix, limit)
    } else if (readiness === 'cleanup') {
      pushUnique(avoid, output.notesFix, Math.max(2, Math.floor(limit / 2)))
    }
  }

  const usableRate = stats.reviewed > 0 ? Math.round((stats.useful / stats.reviewed) * 100) : null
  const parts = []
  parts.push(`Batch lesson from ${stats.reviewed} reviewed image${stats.reviewed === 1 ? '' : 's'}: ${stats.useful} useful (${usableRate ?? 0}%).`)
  if (keep.length > 0) parts.push(`Keep next time: ${keep.join('; ')}.`)
  if (avoid.length > 0) parts.push(`Avoid next time: ${avoid.join('; ')}.`)
  if (refCandidateIds.length > 0) parts.push(`Best ref candidates: ${refCandidateIds.map((id) => id.slice(0, 8)).join(', ')}.`)

  return {
    hasSignal: stats.reviewed > 0 && (keep.length > 0 || avoid.length > 0 || refCandidateIds.length > 0),
    stats,
    usableRate,
    keep,
    avoid,
    refCandidateIds,
    text: parts.join(' '),
  }
}
