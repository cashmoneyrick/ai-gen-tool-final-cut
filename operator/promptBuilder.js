import {
  PROMPT_SECTION_ORDER,
  createEmptyPromptSections,
  normalizePromptSections,
  hasAnyPromptSections,
  parseStructuredPrompt,
  renderStructuredPrompt,
  classifyPromptSection,
  splitPromptClauses,
} from '../src/prompt/structuredPrompt.js'
import { normalizeFeedback } from '../src/reviewFeedback.js'

// Default section limits — how many candidates can contribute per section
const SECTION_LIMITS = {
  subject: 3,
  style: 4,
  lighting: 3,
  composition: 4,
  technical: 5,
}

// Tight limits when a promptOverride is present — the override IS the section
const SECTION_LIMITS_OVERRIDE = {
  subject: 1,
  style: 2,
  lighting: 1,
  composition: 2,
  technical: 2,
}

const SOURCE_PRIORITY = {
  locked: 1000,
  promptOverride: 940,
  bucket: 900,
  assembledBase: 880,
  sourceTruth: 850,
  localCorrectionGuard: 845,
  refRole: 820,
  refAnalysis: 805,
  batchNote: 780,
  outputNote: 760,
  memoryPinned: 700,
  briefManual: 660,
  briefPattern: 620,
  categoryPattern: 600,
  memory: 580,
  ratingFallback: 520,
  crossSession: 500,
}

const GENERIC_PHRASES = [
  'overall direction is good',
  'significant changes needed',
  'basically perfect',
  'great job',
  'general idea is correct',
  'starting to get there',
]

function normalizeText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/Prompt:\s*.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKey(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function hasConcreteVisualSignal(text) {
  const value = normalizeText(text).toLowerCase()
  if (!value) return false
  const cues = [
    'nail', 'nails', 'hand', 'product', 'shot', 'background', 'color', 'palette', 'lighting', 'shadow',
    'glow', 'reflection', 'camera', 'angle', 'crop', 'layout', 'shape', 'material', 'texture', 'finish',
    'cat eye', 'french tip', 'glitter', 'shimmer', 'chrome', 'matte', 'gloss', 'white', 'black',
    'silver', 'gold', 'blue', 'pink', 'green', 'opal', 'stone', '#',
  ]
  return cues.some((cue) => value.includes(cue)) || /\d/.test(value)
}

function isWeakText(text) {
  const value = normalizeText(text)
  if (!value) return true
  if (value.length < 8) return true
  const key = normalizeKey(value)
  if (!key) return true
  return GENERIC_PHRASES.some((phrase) => key.includes(phrase))
}

function joinSentences(items) {
  return items
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .map((item) => {
      if (/[.!?]$/.test(item)) return item
      return `${item}.`
    })
    .join(' ')
    .trim()
}

/**
 * Keep only entries from the N most recent distinct batches.
 * "batch" = distinct batchCreatedAt or createdAt timestamp.
 * Prevents old session notes from accumulating indefinitely.
 */
function getRecentBatches(entries, maxBatches = 2) {
  if (!entries || entries.length === 0) return []
  const times = [...new Set(
    entries.map((e) => e.batchCreatedAt || e.createdAt || 0).filter(Boolean)
  )].sort((a, b) => b - a) // newest first
  const cutoff = times[maxBatches - 1] // keep entries at or newer than this timestamp
  if (cutoff == null) return entries
  return entries.filter((e) => (e.batchCreatedAt || e.createdAt || 0) >= cutoff)
}

function pickSourceTruthOutput(orderedOutputs, orderedWinners) {
  const winnerOutputIds = new Set((orderedWinners || []).map((winner) => winner.outputId))
  const winnerOutput = (orderedOutputs || []).find((output) => winnerOutputIds.has(output.id))
  if (winnerOutput) return winnerOutput

  return (orderedOutputs || []).find((output) => (normalizeFeedback(output.feedback) || 0) >= 4) || null
}

function topKeywords(entries, limit = 4) {
  return (entries || [])
    .map((entry) => String(entry?.keyword || '').trim())
    .filter((keyword) => keyword.length >= 4 && !/^\d+$/.test(keyword))
    .filter((keyword) => !['product', 'photography', 'image', 'design'].includes(keyword.toLowerCase()))
    .slice(0, limit)
}

function addSectionTextCandidates(candidates, text, { sourceType, role = 'preserve', priority, defaultSection = 'subject', createdAt = 0, meta = {} }) {
  const sourceText = normalizeText(text)
  if (!sourceText) return

  const parsed = parseStructuredPrompt(sourceText)
  if (hasAnyPromptSections(parsed)) {
    for (const section of PROMPT_SECTION_ORDER) {
      const sectionText = normalizeText(parsed[section])
      if (!sectionText) continue
      candidates.push({
        section,
        text: sectionText,
        role,
        sourceType,
        priority,
        createdAt,
        meta,
      })
    }
    return
  }

  for (const clause of splitPromptClauses(sourceText, defaultSection)) {
    candidates.push({
      section: clause.section || defaultSection,
      text: clause.text,
      role,
      sourceType,
      priority,
      createdAt,
      meta,
    })
  }
}

function addRefCandidates(candidates, ref) {
  const mode = ref.mode || (ref.anchor ? 'match' : 'reference')
  const name = ref.name || 'reference'
  const notes = normalizeText(ref.notes)
  const analysis = ref.analysis || {}

  if (mode === 'match') {
    candidates.push({
      section: 'composition',
      text: `Use reference "${name}" as the source-of-truth for framing, crop, spacing, and overall layout.`,
      role: 'lock',
      sourceType: 'refRole',
      priority: SOURCE_PRIORITY.refRole,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode },
    })
    candidates.push({
      section: 'style',
      text: `Match the visual treatment, finish, and major design behavior from reference "${name}".`,
      role: 'preserve',
      sourceType: 'refRole',
      priority: SOURCE_PRIORITY.refRole,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode },
    })
  } else if (mode === 'style') {
    candidates.push({
      section: 'style',
      text: `Borrow the style language and finish behavior from reference "${name}" without changing the underlying subject structure.`,
      role: 'preserve',
      sourceType: 'refRole',
      priority: SOURCE_PRIORITY.refRole,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode },
    })
  } else if (mode === 'palette') {
    candidates.push({
      section: 'style',
      text: `Use the color palette from reference "${name}" only; keep other visual decisions controlled separately.`,
      role: 'preserve',
      sourceType: 'refRole',
      priority: SOURCE_PRIORITY.refRole,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode },
    })
  } else if (mode === 'inspire') {
    candidates.push({
      section: 'style',
      text: `Treat reference "${name}" as loose inspiration only, not as a direct copy.`,
      role: 'preserve',
      sourceType: 'refRole',
      priority: SOURCE_PRIORITY.refRole,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode },
    })
  }

  if (notes) {
    addSectionTextCandidates(candidates, notes, {
      sourceType: 'refRole',
      role: mode === 'match' ? 'lock' : 'preserve',
      priority: SOURCE_PRIORITY.refRole - 5,
      defaultSection: mode === 'match' ? 'composition' : 'style',
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode, noteDriven: true },
    })
  }

  if (analysis.composition) {
    candidates.push({
      section: 'composition',
      text: analysis.composition,
      role: 'preserve',
      sourceType: 'refAnalysis',
      priority: SOURCE_PRIORITY.refAnalysis,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode, analysisField: 'composition' },
    })
  }

  if (analysis.lighting) {
    candidates.push({
      section: 'lighting',
      text: analysis.lighting,
      role: 'preserve',
      sourceType: 'refAnalysis',
      priority: SOURCE_PRIORITY.refAnalysis,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode, analysisField: 'lighting' },
    })
  }

  if (analysis.style?.length > 0) {
    candidates.push({
      section: 'style',
      text: `Style cues from "${name}": ${analysis.style.slice(0, 4).join(', ')}`,
      role: 'preserve',
      sourceType: 'refAnalysis',
      priority: SOURCE_PRIORITY.refAnalysis,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode, analysisField: 'style' },
    })
  }

  const colorNames = (analysis.colors || []).map((color) => color?.name || color?.hex).filter(Boolean).slice(0, 4)
  if (colorNames.length > 0) {
    candidates.push({
      section: 'style',
      text: `Palette cues from "${name}": ${colorNames.join(', ')}`,
      role: 'preserve',
      sourceType: 'refAnalysis',
      priority: SOURCE_PRIORITY.refAnalysis,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode, analysisField: 'colors' },
    })
  }

  if (analysis.textures?.length > 0) {
    candidates.push({
      section: 'style',
      text: `Surface behavior from "${name}": ${analysis.textures.slice(0, 3).join(', ')}`,
      role: 'preserve',
      sourceType: 'refAnalysis',
      priority: SOURCE_PRIORITY.refAnalysis,
      createdAt: ref.createdAt || 0,
      meta: { refId: ref.id, refMode: mode, analysisField: 'textures' },
    })
  }
}

// Sources that are "bulk context" and should be blocked in override mode
const BULK_CONTEXT_SOURCES = new Set(['bucket', 'assembledBase', 'sourceTruth', 'ratingFallback', 'crossSession'])

function buildFilteredSections(candidates, {
  goal = '',
  sourceTruthOutput = null,
  projectBrief = null,
  overrideSections = new Set(), // sections fully owned by the promptOverride
  hasOverride = false,
}) {
  const promoted = []
  const suppressed = []
  const sectionEntries = {
    subject: [],
    style: [],
    lighting: [],
    composition: [],
    technical: [],
  }
  const seen = new Map()

  // Choose limits — tighter when override is active
  const limits = hasOverride ? SECTION_LIMITS_OVERRIDE : SECTION_LIMITS

  const sorted = [...candidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return (b.createdAt || 0) - (a.createdAt || 0)
  })

  for (const candidate of sorted) {
    const text = normalizeText(candidate.text)
    const key = `${candidate.section}:${normalizeKey(text)}`
    if (!text) {
      suppressed.push({ ...candidate, reason: 'empty' })
      continue
    }
    if (isWeakText(text)) {
      suppressed.push({ ...candidate, text, reason: 'weak' })
      continue
    }
    if ((candidate.sourceType === 'memory' || candidate.sourceType === 'memoryPinned') && !hasConcreteVisualSignal(text)) {
      suppressed.push({ ...candidate, text, reason: 'memory-not-concrete' })
      continue
    }

    // Override-owned section: only locked and promptOverride allowed
    if (overrideSections.has(candidate.section) &&
        candidate.sourceType !== 'locked' &&
        candidate.sourceType !== 'promptOverride') {
      suppressed.push({ ...candidate, text, reason: 'override-owned' })
      continue
    }

    // Override active but section not owned: block bulk context sources
    if (hasOverride && !overrideSections.has(candidate.section) && BULK_CONTEXT_SOURCES.has(candidate.sourceType)) {
      suppressed.push({ ...candidate, text, reason: 'override-noise-blocked' })
      continue
    }

    if (seen.has(key)) {
      suppressed.push({ ...candidate, text, reason: 'duplicate', replacedBy: seen.get(key) })
      continue
    }
    if (sectionEntries[candidate.section].length >= limits[candidate.section]) {
      suppressed.push({ ...candidate, text, reason: 'section-limit' })
      continue
    }
    seen.set(key, candidate.sourceType)
    const promotedEntry = { ...candidate, text }
    sectionEntries[candidate.section].push(promotedEntry)
    promoted.push(promotedEntry)
  }

  const sections = createEmptyPromptSections()

  const subjectParts = sectionEntries.subject.map((entry) => entry.text)
  const styleParts = sectionEntries.style.map((entry) => entry.text)
  const lightingParts = sectionEntries.lighting.map((entry) => entry.text)
  const compositionParts = sectionEntries.composition.map((entry) => entry.text)

  const technicalPreserve = sectionEntries.technical.filter((entry) => entry.role === 'preserve' || entry.role === 'lock').map((entry) => entry.text)
  const technicalChange = sectionEntries.technical.filter((entry) => entry.role === 'change').map((entry) => entry.text)
  const technicalNegative = sectionEntries.technical.filter((entry) => entry.role === 'negative').map((entry) => entry.text)

  sections.subject = joinSentences(subjectParts)
  sections.style = joinSentences(styleParts)
  sections.lighting = joinSentences(lightingParts)
  sections.composition = joinSentences(compositionParts)

  const technicalParts = []
  if (technicalPreserve.length > 0) technicalParts.push(joinSentences(technicalPreserve))
  if (technicalChange.length > 0) technicalParts.push(`Change only the following: ${technicalChange.join('; ')}`)
  if (technicalNegative.length > 0) technicalParts.push(`Avoid: ${technicalNegative.join('; ')}`)
  sections.technical = joinSentences(technicalParts)

  const winnerKeywords = hasOverride ? [] : topKeywords(projectBrief?.winnerDNA)
  const workKeywords = hasOverride ? [] : topKeywords(projectBrief?.whatWorks)
  const failKeywords = hasOverride ? [] : topKeywords(projectBrief?.whatFails)

  if (!sections.subject) {
    sections.subject = goal?.trim()
      ? `${goal.trim()}.`
      : 'Define the primary subject clearly and keep the physical identity specific.'
  }
  if (!sections.style) {
    sections.style = winnerKeywords.length > 0
      ? `Carry forward the strongest approved style cues around ${winnerKeywords.join(', ')}.`
      : 'Keep the finish, color behavior, and material treatment specific and production-like.'
  }
  if (!sections.lighting) {
    sections.lighting = 'Lock clean intentional lighting with controlled reflections and believable shadow behavior.'
  }
  if (!sections.composition) {
    sections.composition = workKeywords.length > 0
      ? `Keep framing and layout controlled, especially around ${workKeywords.join(', ')}.`
      : 'Lock framing, crop, spacing, and background deliberately so the layout does not drift.'
  }
  if (!sections.technical) {
    sections.technical = sourceTruthOutput && !hasOverride
      ? 'Preserve the current approved variables unless a correction is explicitly requested. Keep the render crisp, realistic, and free of unwanted extras.'
      : 'Keep the render crisp, physically believable, and free of unwanted extras or layout drift.'
  }
  if (failKeywords.length > 0 && !sections.technical.toLowerCase().includes('avoid:')) {
    sections.technical = joinSentences([sections.technical, `Avoid drift toward ${failKeywords.join(', ')}`])
  }

  return {
    sections: normalizePromptSections(sections),
    filterSnapshot: {
      promoted: promoted.map((entry) => ({
        section: entry.section,
        role: entry.role,
        sourceType: entry.sourceType,
        text: entry.text,
        priority: entry.priority,
        createdAt: entry.createdAt || null,
      })),
      suppressed: suppressed.map((entry) => ({
        section: entry.section,
        role: entry.role,
        sourceType: entry.sourceType,
        text: normalizeText(entry.text),
        priority: entry.priority,
        reason: entry.reason,
      })),
      sectionCounts: Object.fromEntries(PROMPT_SECTION_ORDER.map((section) => [section, sectionEntries[section].length])),
      sourceTruthOutputId: sourceTruthOutput?.id || null,
    },
  }
}

export function buildStructuredPrompt({
  goal = '',
  session = {},
  promptOverride = null,
  activeLockedElements = [],
  sendingRefs = [],
  activeMemories = [],
  orderedOutputs = [],
  orderedWinners = [],
  iterationContext = null,
  crossSessionLessons = [],
  projectBrief = null,
  categoryState = null,
}) {
  const candidates = []
  const baseBuckets = normalizePromptSections(session.buckets)

  // Detect override mode — when the caller provides an explicit prompt, it owns the result
  const hasOverride = !!(promptOverride?.trim())

  // Parse the override carefully:
  // - If it has explicit section headers (Subject: / Style: etc.), parse structured
  // - If it's a free-form conversational prompt (no headers), put the whole thing in
  //   subject so it isn't misclassified by keyword matching (e.g., "flat lay" pulling
  //   the whole text into composition instead of staying in subject)
  let overrideParsed = createEmptyPromptSections()
  if (hasOverride) {
    const hasExplicitHeaders = /^(Subject|Style|Lighting|Composition|Technical(?:\s+Refinements)?)\s*:/im.test(promptOverride.trim())
    if (hasExplicitHeaders) {
      overrideParsed = parseStructuredPrompt(promptOverride)
    } else {
      // Free-form: the whole text is the subject
      overrideParsed = { ...createEmptyPromptSections(), subject: promptOverride.trim() }
    }
  }

  // Which sections are explicitly covered by the override text
  const overrideSectionSet = new Set(
    PROMPT_SECTION_ORDER.filter((s) => overrideParsed[s]?.trim())
  )

  const sourceTruthOutput = pickSourceTruthOutput(orderedOutputs, orderedWinners)

  // --- Locked elements (always highest priority, never suppressed) ---
  for (const text of activeLockedElements || []) {
    addSectionTextCandidates(candidates, text, {
      sourceType: 'locked',
      role: 'lock',
      priority: SOURCE_PRIORITY.locked,
      defaultSection: classifyPromptSection(text, 'subject'),
    })
  }

  // --- promptOverride: inject parsed sections at high priority ---
  for (const section of PROMPT_SECTION_ORDER) {
    if (overrideParsed[section]) {
      candidates.push({
        section,
        text: overrideParsed[section],
        role: 'preserve',
        sourceType: 'promptOverride',
        priority: SOURCE_PRIORITY.promptOverride,
        createdAt: Date.now(),
      })
    }
  }

  // --- Session buckets + assembled prompt — skip entirely in override mode ---
  // These are accumulated working state from prior generations. When the user
  // gives an explicit prompt, they've already told us what they want. Injecting
  // stale bucket text drowns the current request.
  if (!hasOverride) {
    for (const section of PROMPT_SECTION_ORDER) {
      if (baseBuckets[section]) {
        candidates.push({
          section,
          text: baseBuckets[section],
          role: 'preserve',
          sourceType: 'bucket',
          priority: SOURCE_PRIORITY.bucket,
          createdAt: session.updatedAt || 0,
        })
      }
    }

    if (session.assembledPrompt?.trim()) {
      addSectionTextCandidates(candidates, session.assembledPrompt, {
        sourceType: 'assembledBase',
        role: 'preserve',
        priority: SOURCE_PRIORITY.assembledBase,
        defaultSection: 'subject',
        createdAt: session.updatedAt || 0,
      })
    }
  }

  // --- Source-of-truth output (winner/top-rated) bucket snapshot ---
  // Also skip in override mode — we don't want old winner context hijacking the new direction
  if (!hasOverride && sourceTruthOutput?.bucketSnapshot) {
    const snapshot = normalizePromptSections(sourceTruthOutput.bucketSnapshot)
    for (const section of PROMPT_SECTION_ORDER) {
      if (!snapshot[section]) continue
      candidates.push({
        section,
        text: snapshot[section],
        role: 'preserve',
        sourceType: 'sourceTruth',
        priority: SOURCE_PRIORITY.sourceTruth,
        createdAt: sourceTruthOutput.createdAt || 0,
        meta: { outputId: sourceTruthOutput.id },
      })
    }
  }

  // --- Local correction guard (only when iterating without override) ---
  if (!hasOverride && sourceTruthOutput && iterationContext?.change?.length > 0) {
    candidates.push({
      section: 'technical',
      text: 'Keep the current approved subject, style, lighting, and composition locked unless a specific correction below changes one variable.',
      role: 'lock',
      sourceType: 'localCorrectionGuard',
      priority: SOURCE_PRIORITY.localCorrectionGuard,
      createdAt: sourceTruthOutput.createdAt || 0,
      meta: { outputId: sourceTruthOutput.id },
    })
  }

  // --- Refs (always allowed — user explicitly added them) ---
  for (const ref of sendingRefs || []) {
    addRefCandidates(candidates, ref)
  }

  // --- Iteration context: preserve/change notes ---
  // Limit to the most recent 2 batches only — prevents old session notes from accumulating.
  // In override mode, limit further to 1 batch (only the very latest feedback).
  const recentPreserve = getRecentBatches(iterationContext?.preserve || [], hasOverride ? 1 : 2)
  const recentChange = getRecentBatches(iterationContext?.change || [], hasOverride ? 1 : 2)

  for (const preserve of recentPreserve) {
    const sourceType = preserve.source === 'batch-notes' ? 'batchNote'
      : preserve.source === 'notes' ? 'outputNote'
      : preserve.source === 'rating' ? 'ratingFallback'
      : 'outputNote'
    const priority = SOURCE_PRIORITY[sourceType] || SOURCE_PRIORITY.outputNote
    const defaultSection = preserve.bucket || classifyPromptSection(preserve.text, 'style')
    addSectionTextCandidates(candidates, preserve.text, {
      sourceType,
      role: 'preserve',
      priority,
      defaultSection,
      createdAt: preserve.batchCreatedAt || preserve.createdAt || 0,
      meta: { outputId: preserve.outputId || null },
    })
  }

  for (const change of recentChange) {
    const sourceType = change.source === 'batch-notes' ? 'batchNote'
      : change.source === 'notes' ? 'outputNote'
      : 'ratingFallback'
    const priority = SOURCE_PRIORITY[sourceType] || SOURCE_PRIORITY.outputNote
    const defaultSection = classifyPromptSection(change.text, 'technical')
    addSectionTextCandidates(candidates, change.text, {
      sourceType,
      role: defaultSection === 'technical' ? 'negative' : 'change',
      priority,
      defaultSection,
      createdAt: change.batchCreatedAt || change.createdAt || 0,
      meta: { outputId: change.outputId || null },
    })
  }

  // NOTE: fallbackRatedOutputs loop removed.
  // Injecting full bucketSnapshots from multiple rated outputs duplicates sourceTruth,
  // multiplies prompt size, and is the primary cause of stale context bleeding in.
  // The sourceTruth output already covers the best output's context.

  // --- Active memories ---
  for (const memory of activeMemories || []) {
    const clean = normalizeText(memory.text)
    if (!clean) continue
    const sourceType = memory.pinned ? 'memoryPinned' : 'memory'
    const priority = SOURCE_PRIORITY[sourceType]
    let role = 'preserve'
    let defaultSection = classifyPromptSection(clean, 'style')

    if (memory.type === 'failure') {
      role = defaultSection === 'technical' ? 'negative' : 'change'
      defaultSection = classifyPromptSection(clean, 'technical')
    } else if (memory.type === 'correction') {
      role = defaultSection === 'technical' ? 'negative' : 'change'
      defaultSection = classifyPromptSection(clean, 'technical')
    } else if (memory.type === 'preference' && !hasConcreteVisualSignal(clean)) {
      continue
    }

    addSectionTextCandidates(candidates, clean, {
      sourceType,
      role,
      priority,
      defaultSection,
      createdAt: memory.createdAt || 0,
      meta: { memoryId: memory.id, memoryType: memory.type },
    })
  }

  // --- Project brief signals — skip in override mode (avoid old project patterns hijacking) ---
  if (!hasOverride) {
    for (const liked of projectBrief?.manualNotes?.liked || []) {
      addSectionTextCandidates(candidates, liked, {
        sourceType: 'briefManual',
        role: 'preserve',
        priority: SOURCE_PRIORITY.briefManual,
        defaultSection: classifyPromptSection(liked, 'style'),
      })
    }

    for (const hated of projectBrief?.manualNotes?.hated || []) {
      addSectionTextCandidates(candidates, hated, {
        sourceType: 'briefManual',
        role: 'negative',
        priority: SOURCE_PRIORITY.briefManual,
        defaultSection: classifyPromptSection(hated, 'technical'),
      })
    }

    const winnerKeywords = topKeywords(projectBrief?.winnerDNA)
    if (winnerKeywords.length > 0) {
      candidates.push({
        section: classifyPromptSection(winnerKeywords.join(', '), 'style'),
        text: `Carry forward the strongest winner DNA around ${winnerKeywords.join(', ')}.`,
        role: 'preserve',
        sourceType: 'briefPattern',
        priority: SOURCE_PRIORITY.briefPattern,
        createdAt: projectBrief?.generatedAt || 0,
      })
    }

    const workKeywords = topKeywords(projectBrief?.whatWorks)
    if (workKeywords.length > 0) {
      candidates.push({
        section: classifyPromptSection(workKeywords.join(', '), 'composition'),
        text: `Preserve the strongest working cues around ${workKeywords.join(', ')}.`,
        role: 'preserve',
        sourceType: 'briefPattern',
        priority: SOURCE_PRIORITY.briefPattern,
        createdAt: projectBrief?.generatedAt || 0,
      })
    }

    const failKeywords = topKeywords(projectBrief?.whatFails)
    if (failKeywords.length > 0) {
      candidates.push({
        section: 'technical',
        text: `Avoid recurring failure patterns around ${failKeywords.join(', ')}.`,
        role: 'negative',
        sourceType: 'briefPattern',
        priority: SOURCE_PRIORITY.briefPattern,
        createdAt: projectBrief?.generatedAt || 0,
      })
    }

    const categoryWinnerKeywords = topKeywords(categoryState?.winnerDNA)
    if (categoryWinnerKeywords.length > 0) {
      candidates.push({
        section: 'style',
        text: `Across ${categoryState.category} work, keep the strongest repeated cues around ${categoryWinnerKeywords.join(', ')} when they fit the current request.`,
        role: 'preserve',
        sourceType: 'categoryPattern',
        priority: SOURCE_PRIORITY.categoryPattern,
        createdAt: categoryState?.generatedAt || projectBrief?.generatedAt || 0,
      })
    }

    const categoryWorkKeywords = topKeywords(categoryState?.whatWorks)
    if (categoryWorkKeywords.length > 0) {
      candidates.push({
        section: 'composition',
        text: `For ${categoryState.category} work, preserve proven cues around ${categoryWorkKeywords.join(', ')} when they support the current direction.`,
        role: 'preserve',
        sourceType: 'categoryPattern',
        priority: SOURCE_PRIORITY.categoryPattern,
        createdAt: categoryState?.generatedAt || projectBrief?.generatedAt || 0,
      })
    }

    const categoryFailKeywords = topKeywords(categoryState?.whatFails)
    if (categoryFailKeywords.length > 0) {
      candidates.push({
        section: 'technical',
        text: `For ${categoryState.category} work, avoid recurring misses around ${categoryFailKeywords.join(', ')} unless the user asks for them directly.`,
        role: 'negative',
        sourceType: 'categoryPattern',
        priority: SOURCE_PRIORITY.categoryPattern,
        createdAt: categoryState?.generatedAt || projectBrief?.generatedAt || 0,
      })
    }

    // Cross-session lessons only apply when iterating without an explicit new direction
    for (const lesson of crossSessionLessons || []) {
      addSectionTextCandidates(candidates, lesson.text, {
        sourceType: 'crossSession',
        role: 'preserve',
        priority: SOURCE_PRIORITY.crossSession,
        defaultSection: classifyPromptSection(lesson.text, 'style'),
      })
    }
  }

  const { sections, filterSnapshot } = buildFilteredSections(candidates, {
    goal,
    sourceTruthOutput,
    projectBrief,
    overrideSections: overrideSectionSet,
    hasOverride,
  })

  const finalPrompt = renderStructuredPrompt(sections)

  return {
    sections,
    finalPrompt,
    filterSnapshot,
    iterationSnapshot: {
      preserveUsed: filterSnapshot.promoted.filter((entry) => entry.role === 'preserve' || entry.role === 'lock'),
      changeUsed: filterSnapshot.promoted.filter((entry) => entry.role === 'change' || entry.role === 'negative'),
      sourceTruthOutputId: filterSnapshot.sourceTruthOutputId,
    },
  }
}

/**
 * Build a complete prompt for one 2D variation variant.
 *
 * The basePrompt should use {color} as a placeholder for the variant's color.
 * If no placeholder is found, the color is appended as an explicit override.
 *
 * @param {object} opts
 * @param {string} opts.basePrompt     - Locked base recipe from variationPlan.basePrompt
 * @param {string|null} opts.colorSpec - Hex code e.g. '#6B0F1A'
 * @param {string} opts.label          - Human label e.g. 'Garnet / January'
 * @param {string|null} opts.finishOverride - e.g. 'matte'; null keeps base finish
 */
export function buildVariationPrompt({ basePrompt, colorSpec, label, finishOverride }) {
  if (!basePrompt) return ''
  let prompt = basePrompt

  const colorInstruction = colorSpec
    ? `${label ? label + ' ' : ''}${colorSpec}`
    : label || ''

  if (colorInstruction) {
    if (prompt.includes('{color}')) {
      prompt = prompt.replaceAll('{color}', colorInstruction)
    } else {
      prompt = `${prompt.trimEnd()} Color override: ${colorInstruction}.`
    }
  }

  if (finishOverride) {
    prompt = `${prompt.trimEnd()} Finish override: ${finishOverride}.`
  }

  return prompt.trim()
}
