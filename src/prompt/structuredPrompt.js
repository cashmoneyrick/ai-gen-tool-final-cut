export const PROMPT_SECTION_ORDER = ['subject', 'style', 'lighting', 'composition', 'technical']

export const PROMPT_SECTION_LABELS = {
  subject: 'Subject',
  style: 'Style',
  lighting: 'Lighting',
  composition: 'Composition',
  technical: 'Technical Refinements',
}

export function createEmptyPromptSections() {
  return {
    subject: '',
    style: '',
    lighting: '',
    composition: '',
    technical: '',
  }
}

export function normalizePromptSections(raw) {
  const next = createEmptyPromptSections()
  if (!raw || typeof raw !== 'object') return next

  for (const key of PROMPT_SECTION_ORDER) {
    next[key] = typeof raw[key] === 'string' ? raw[key].trim() : ''
  }

  return next
}

export function hasAnyPromptSections(sections) {
  return PROMPT_SECTION_ORDER.some((key) => sections?.[key]?.trim())
}

function sanitizeFragment(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/^[\s\-*•\d.)]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function classifyPromptSection(text, fallbackSection = 'subject') {
  const value = sanitizeFragment(text).toLowerCase()
  if (!value) return fallbackSection

  const technicalKeywords = [
    'avoid', 'without', 'no ', 'not ', 'do not', 'don’t', 'dont', 'remove', 'keep everything else',
    'change only', 'fix', 'correct', 'accurate', 'crisp', 'sharp focus', 'high resolution',
    'duplicate', 'partial', 'extra nail', 'extra nails', 'artifact', 'realistic', 'physically believable',
  ]
  if (technicalKeywords.some((keyword) => value.includes(keyword))) return 'technical'

  const compositionKeywords = [
    'composition', 'framing', 'frame', 'crop', 'cropped', 'camera', 'angle', 'pose', 'background',
    'scene', 'layout', 'spacing', 'arrange', 'arranged', 'flat lay', 'flatlay', 'head-on',
    'negative space', 'close-up', 'macro', 'hero shot', 'shot type', 'full set', '5 nails', '10 nails',
  ]
  if (compositionKeywords.some((keyword) => value.includes(keyword))) return 'composition'

  const lightingKeywords = [
    'lighting', 'light', 'lit', 'glow', 'reflection', 'reflections', 'glare', 'shadow', 'shadows',
    'sunlight', 'sunlit', 'diffused', 'backlit', 'rim light', 'key light', 'fill light', 'highlight',
  ]
  if (lightingKeywords.some((keyword) => value.includes(keyword))) return 'lighting'

  const styleKeywords = [
    'style', 'finish', 'texture', 'textures', 'matte', 'glossy', 'gloss', 'shimmer', 'sparkle',
    'glitter', 'metallic', 'chrome', 'cat eye', 'cateye', 'french tip', 'palette', 'color', 'colour',
    'opalescent', 'iridescent', 'aesthetic', 'mood', 'luxury', 'editorial', 'handmade', 'product photography',
  ]
  if (styleKeywords.some((keyword) => value.includes(keyword))) return 'style'

  return fallbackSection
}

export function splitPromptClauses(text, fallbackSection = 'subject') {
  const value = String(text || '').trim()
  if (!value) return []

  return value
    .split(/\n+|(?<=[.;])\s+/)
    .map((part) => sanitizeFragment(part))
    .filter(Boolean)
    .map((part) => ({
      text: part,
      section: classifyPromptSection(part, fallbackSection),
    }))
}

export function distributeFreeformTextIntoSections(text, fallbackSection = 'subject') {
  const sections = createEmptyPromptSections()
  const grouped = {
    subject: [],
    style: [],
    lighting: [],
    composition: [],
    technical: [],
  }

  for (const clause of splitPromptClauses(text, fallbackSection)) {
    grouped[clause.section].push(clause.text)
  }

  for (const key of PROMPT_SECTION_ORDER) {
    sections[key] = grouped[key].join('. ').trim()
  }

  return sections
}

export function parseStructuredPrompt(text) {
  const value = String(text || '').trim()
  if (!value) return createEmptyPromptSections()

  const headerRegex = /^(Subject|Style|Lighting|Composition|Technical Refinements|Technical)\s*:\s*(.*)$/gim
  const matches = [...value.matchAll(headerRegex)]
  if (matches.length === 0) {
    return distributeFreeformTextIntoSections(value)
  }

  const sections = createEmptyPromptSections()
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]
    const next = matches[index + 1]
    const label = current[1].toLowerCase()
    const sectionKey = label === 'technical' || label === 'technical refinements' ? 'technical' : label
    const sameLine = sanitizeFragment(current[2] || '')
    const start = current.index + current[0].length
    const end = next ? next.index : value.length
    const trailing = value.slice(start, end).trim()
    const combined = [sameLine, trailing].filter(Boolean).join('\n')
    sections[sectionKey] = combined.trim()
  }

  return normalizePromptSections(sections)
}

export function renderStructuredPrompt(rawSections, { includeLabels = true } = {}) {
  const sections = normalizePromptSections(rawSections)

  if (includeLabels) {
    return PROMPT_SECTION_ORDER
      .map((key) => `${PROMPT_SECTION_LABELS[key]}: ${sections[key] || ''}`.trimEnd())
      .join('\n\n')
      .trim()
  }

  return PROMPT_SECTION_ORDER
    .map((key) => sections[key])
    .filter(Boolean)
    .join('\n\n')
    .trim()
}
