/**
 * Deterministic retrieval for starter knowledge.
 * No embeddings — tag/condition matching + priority scoring.
 */

// --- Keyword lists for context derivation ---

const SYSTEM_KEYWORDS = [
  // Multi-word compounds first (checked before single words)
  { words: ['cat eye'], system: 'cateye' },
  { words: ['cateye'], system: 'cateye' },
  { words: ['embroidered'], system: 'packaging' },
  { words: ['packaging'], system: 'packaging' },
  { words: ['pouch'], system: 'packaging' },
  { words: ['flat lay'], system: 'flatlay' },
  { words: ['flatlay'], system: 'flatlay' },
  { words: ['flat-lay'], system: 'flatlay' },
  // Single words last
  { words: ['nail'], system: 'nails' },
  { words: ['nails'], system: 'nails' },
]

const TASK_TYPE_KEYWORDS = [
  { words: ['convert'], taskType: 'conversion' },
  { words: ['conversion'], taskType: 'conversion' },
  { words: ['translate'], taskType: 'conversion' },
  { words: ['correct'], taskType: 'correction' },
  { words: ['fix'], taskType: 'correction' },
  { words: ['edit'], taskType: 'correction' },
  { words: ['redo'], taskType: 'correction' },
  { words: ['local fix'], taskType: 'correction' },
  { words: ['continuity'], taskType: 'continuity' },
  { words: ['collection'], taskType: 'continuity' },
  { words: ['series'], taskType: 'continuity' },
  { words: ['monthly'], taskType: 'continuity' },
]

const OUTPUT_TYPE_MAP = {
  packaging: 'packaging',
  flatlay: 'flatlay',
  cateye: 'product-shot',
  nails: 'hand-shot',
}

function findKeyword(text, keywords) {
  const lower = text.toLowerCase()
  for (const kw of keywords) {
    if (kw.words.some((w) => lower.includes(w))) return kw
  }
  return null
}

/**
 * Derive task context from current session state.
 * Pure function — no side effects.
 */
export function deriveTaskContext({ goal, refs, buckets, outputs, winners }) {
  // Combine goal + bucket values for scanning
  const bucketText = Object.values(buckets || {}).filter(Boolean).join(' ')
  const goalText = goal || ''
  const searchText = goalText + ' ' + bucketText

  // System — check goal first for priority, then buckets
  const goalSystem = findKeyword(goalText, SYSTEM_KEYWORDS)
  const bucketSystem = findKeyword(bucketText, SYSTEM_KEYWORDS)
  const system = goalSystem?.system || bucketSystem?.system || null

  // Task type
  const taskMatch = findKeyword(searchText, TASK_TYPE_KEYWORDS)
  const taskType = taskMatch?.taskType || 'generation'

  // Output type — inferred from system
  const outputType = system ? (OUTPUT_TYPE_MAP[system] || null) : null

  // Reference state
  const refList = refs || []
  const hasReferences = refList.length > 0
  const referenceCount = refList.length

  // Conversion / correction flags
  const isConversion = taskType === 'conversion'
  const isCorrection = taskType === 'correction'

  // First pass — no outputs or winners yet
  const isFirstPass = (!outputs || outputs.length === 0) && (!winners || winners.length === 0)

  return {
    system,
    taskType,
    outputType,
    hasReferences,
    referenceCount,
    isConversion,
    isCorrection,
    isFirstPass,
  }
}

// --- Scoring ---

const KIND_TIEBREAK = {
  rule: 0.5,
  workflow: 0.4,
  pattern: 0.3,
  lesson: 0.2,
  preference: 0.1,
}

/**
 * Score entries against a task context.
 * Returns entries with _score and _matchReasons attached.
 */
export function scoreEntries(entries, context) {
  const scored = []

  for (const entry of entries) {
    let score = 0
    const reasons = []

    // System tag match
    for (const tag of entry.systemTags) {
      if (tag === context.system) {
        score += 3
        reasons.push(`system:${tag}`)
      } else if (tag === '*') {
        score += 1
        reasons.push('system:*')
      }
    }

    // Task type match
    for (const tt of entry.taskTypes) {
      if (tt === context.taskType) {
        score += 3
        reasons.push(`task:${tt}`)
      } else if (tt === '*') {
        score += 1
        reasons.push('task:*')
      }
    }

    // Trigger condition bonuses
    if (entry.triggerConditions) {
      const tc = entry.triggerConditions
      if (tc.hasReferences && context.hasReferences) {
        score += 2
        reasons.push('trigger:hasRefs')
      }
      if (tc.isConversion && context.isConversion) {
        score += 2
        reasons.push('trigger:conversion')
      }
      if (tc.isCorrection && context.isCorrection) {
        score += 2
        reasons.push('trigger:correction')
      }
      if (tc.isFirstPass && context.isFirstPass) {
        score += 2
        reasons.push('trigger:firstPass')
      }
      if (tc.isContinuity && context.taskType === 'continuity') {
        score += 2
        reasons.push('trigger:continuity')
      }
      if (tc.minReferenceCount && context.referenceCount >= tc.minReferenceCount) {
        score += 1
        reasons.push(`trigger:refs>=${tc.minReferenceCount}`)
      }
    }

    // Skip irrelevant entries
    if (score <= 0) continue

    // Priority multiplier
    score *= entry.priority

    // Kind tiebreaker
    score += KIND_TIEBREAK[entry.kind] || 0

    scored.push({ ...entry, _score: score, _matchReasons: reasons })
  }

  // Sort descending by score
  scored.sort((a, b) => b._score - a._score)

  return scored
}

/**
 * Build effective entry pool: starter entries + add overrides,
 * with replacement metadata attached before scoring.
 */
function buildEffectivePool(entries, overrides) {
  if (!overrides || overrides.length === 0) return entries

  // Index overrides by targetEntryId for fast lookup
  const overridesByTarget = new Map()
  const addOverrides = []
  for (const ov of overrides) {
    if (ov.action === 'add') {
      addOverrides.push(ov)
    } else if (ov.targetEntryId) {
      if (!overridesByTarget.has(ov.targetEntryId)) overridesByTarget.set(ov.targetEntryId, [])
      overridesByTarget.get(ov.targetEntryId).push(ov)
    }
  }

  // Annotate starter entries with override metadata
  const annotated = entries.map((entry) => {
    const ovs = overridesByTarget.get(entry.id)
    if (!ovs) return entry

    let result = { ...entry }
    for (const ov of ovs) {
      if (ov.action === 'replace') {
        result._replacement = { title: ov.title, body: ov.body }
        result._overrideAction = 'replace'
        result._overrideNote = ov.notes || null
        result._overrideId = ov.id
      } else if (ov.action === 'suppress') {
        result._overrideAction = 'suppress'
        result._overrideNote = ov.notes || null
        result._overrideId = ov.id
      } else if (ov.action === 'prefer') {
        result._overrideAction = 'prefer'
        result._overrideNote = ov.notes || null
        result._overrideId = ov.id
      }
    }
    return result
  })

  // Create synthetic entries from 'add' overrides
  const synthetic = addOverrides.map((ov) => ({
    id: ov.id,
    kind: ov.kind || 'rule',
    title: ov.title,
    body: ov.body,
    systemTags: ov.systemTags || ['*'],
    taskTypes: ov.taskTypes || ['*'],
    priority: ov.priority || 2,
    triggerConditions: null,
    antiPatterns: null,
    sourceSection: 'project_override',
    relatedIds: null,
    _overrideAction: 'add',
    _overrideNote: ov.notes || null,
    _overrideId: ov.id,
  }))

  return [...annotated, ...synthetic]
}

/**
 * Unified retrieval pipeline:
 * 1. Build effective pool (starter + add overrides + replacement metadata)
 * 2. Score the full pool
 * 3. Apply prefer (×2) and suppress (remove) effects
 * 4. Sort and slice
 */
export function getRelevantKnowledge(entries, context, { maxResults = 15, overrides = [] } = {}) {
  if (!context) return []

  const activeOverrides = overrides.filter((o) => o.isActive)
  const pool = buildEffectivePool(entries, activeOverrides)
  const scored = scoreEntries(pool, context)

  // Apply prefer/suppress effects after scoring
  const effective = []
  for (const entry of scored) {
    if (entry._overrideAction === 'suppress') continue // Remove suppressed

    if (entry._overrideAction === 'prefer') {
      entry._score *= 2
      entry._matchReasons.push('override:prefer')
    }

    if (entry._overrideAction === 'add') {
      entry._matchReasons.push('override:project')
    }

    if (entry._overrideAction === 'replace') {
      entry._matchReasons.push('override:replace')
    }

    effective.push(entry)
  }

  // Re-sort after prefer boosts
  effective.sort((a, b) => b._score - a._score)

  return effective.slice(0, maxResults)
}

/**
 * Format an entry for the planning prompt.
 * Uses replacement body/title when present.
 */
function formatEntryForPlanning(entry) {
  // Use replacement content if this entry was overridden
  const title = entry._replacement?.title || entry.title
  const body = entry._replacement?.body || entry.body

  switch (entry.kind) {
    case 'rule':
      return {
        kind: 'rule',
        title,
        rule: body.split('\n')[0],
        notes: body.split('\n').slice(1).join(' ').trim() || null,
        isOverride: !!entry._overrideAction,
      }
    case 'workflow': {
      const lines = body.split('\n')
      const useWhen = lines[0] || ''
      const steps = lines.filter((l) => /^\d+\./.test(l)).map((l) => l.replace(/^\d+\.\s*/, ''))
      const failLine = lines.find((l) => l.startsWith('Failure modes:'))
      return {
        kind: 'workflow',
        title,
        useWhen: useWhen.replace('Use when: ', ''),
        keySteps: steps.slice(0, 4),
        failureModes: failLine ? failLine.replace('Failure modes: ', '').split('; ').slice(0, 3) : [],
        isOverride: !!entry._overrideAction,
      }
    }
    case 'lesson': {
      const parts = body.split('\n')
      return {
        kind: 'lesson',
        title,
        lesson: parts[0] || '',
        failedPattern: parts.find((l) => l.startsWith('Failed:'))?.replace('Failed: ', '') || null,
        betterPattern: parts.find((l) => l.startsWith('Better:'))?.replace('Better: ', '') || null,
        isOverride: !!entry._overrideAction,
      }
    }
    case 'pattern': {
      const parts = body.split('\n')
      return {
        kind: 'pattern',
        title,
        pattern: parts[0] || '',
        exampleStructure: parts.find((l) => l.startsWith('Example:'))?.replace('Example: ', '') || null,
        isOverride: !!entry._overrideAction,
      }
    }
    case 'preference':
      return {
        kind: 'preference',
        title,
        preference: body.split('\n')[0],
        notes: body.split('\n').slice(1).join(' ').trim() || null,
        isOverride: !!entry._overrideAction,
      }
    default:
      return { kind: entry.kind, title, body: body.slice(0, 300), isOverride: !!entry._overrideAction }
  }
}

/**
 * Get knowledge formatted for the planning prompt.
 * Runs the full pipeline with overrides, then formats top 8.
 */
export function getKnowledgeForPlanning(entries, context, overrides = []) {
  const relevant = getRelevantKnowledge(entries, context, { maxResults: 8, overrides })
  return relevant.map(formatEntryForPlanning)
}
