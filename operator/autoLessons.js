import { normalizeFeedback } from '../src/reviewFeedback.js'

export const AUTO_LESSON_VERSION = 1

const USEFUL_READINESS = new Set(['ready', 'cleanup', 'inspiration'])
const READY_READINESS = new Set(['ready', 'cleanup'])
const MISS_READINESS = new Set(['wrong', 'reject'])

const CATEGORY_KEYWORDS = {
  nails: ['nail', 'nails', 'french', 'floral', 'flower', 'press-on', 'manicure', 'tip'],
}

const NAIL_RULES = [
  {
    id: 'nails-french-tip-visible',
    signal: 'correction',
    text: 'For nail sets, avoid thin or barely visible French tips; make French tips clearly readable and intentionally shaped.',
    match: (text) => includesAll(text, ['french']) && includesAny(text, ['thin', 'too thin', 'skinny', 'barely']),
  },
  {
    id: 'nails-hand-painted-florals',
    signal: 'correction',
    text: 'For nail sets, florals should look like hand-painted nail art, not printed decals, photo flowers, or random pasted graphics.',
    match: (text) => includesAny(text, ['flower', 'flowers', 'floral']) && includesAny(text, ['printed', 'decal', 'sticker', 'not hand painted', 'not hand-painted', 'photo']),
  },
  {
    id: 'nails-avoid-basic',
    signal: 'correction',
    text: 'For nail sets, avoid designs that feel too basic or empty; include one clear focal idea while keeping the set wearable.',
    match: (text) => includesAny(text, ['basic', 'boring', 'plain', 'empty', 'too simple']),
  },
  {
    id: 'nails-motif-direction',
    signal: 'correction',
    text: 'For nail sets, keep fruit and floral motifs facing naturally and consistently across the five nails.',
    match: (text) => includesAny(text, ['wrong way', 'wrong direction', 'facing wrong', 'upside down']),
  },
  {
    id: 'nails-no-random-objects',
    signal: 'correction',
    text: 'For nail sets, avoid random rocks, gems, charms, or center objects unless Rick explicitly asks for them.',
    match: (text) => includesAny(text, ['rock', 'rocks', 'gem', 'gems', 'random object', 'center object']),
  },
  {
    id: 'nails-five-nail-readability',
    signal: 'preference',
    text: 'For nail sets, prefer a clean five-nail presentation with readable individual designs, a nude or soft base, and balanced accent nails.',
    match: (text, output) => isUseful(output) && includesAny(text, ['five', '5 nail', '5-nail', 'set', 'balanced', 'clean', 'good', 'nice', 'ready']),
  },
]

function cleanText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle))
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle))
}

function getReview(output) {
  return output?.rickReview || {}
}

function isUseful(output) {
  const readiness = getReview(output).readiness
  const rating = normalizeFeedback(output?.feedback)
  return USEFUL_READINESS.has(readiness) || (rating !== null && rating >= 4)
}

function isReady(output) {
  const readiness = getReview(output).readiness
  const rating = normalizeFeedback(output?.feedback)
  return READY_READINESS.has(readiness) || (rating !== null && rating >= 4)
}

function isMiss(output) {
  const readiness = getReview(output).readiness
  const rating = normalizeFeedback(output?.feedback)
  return MISS_READINESS.has(readiness) || (rating !== null && rating <= 2)
}

function outputText(output) {
  const review = getReview(output)
  return cleanText([
    review.reason,
    output?.notesKeep,
    output?.notesFix,
    output?.batchNotesKeep,
    output?.batchNotesFix,
    output?.finalPromptSent,
    output?.prompt,
  ].filter(Boolean).join(' '))
}

export function inferAutoLessonCategory(project, sessions = [], outputs = []) {
  const explicit = project?.category
  if (explicit) return explicit

  const combined = cleanText([
    project?.name,
    ...(sessions || []).map((session) => session?.goal),
    ...(outputs || []).slice(0, 12).map((output) => output?.finalPromptSent || output?.prompt),
  ].filter(Boolean).join(' '))

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (includesAny(combined, keywords)) return category
  }

  return 'general'
}

export function distillAutoLessons({ projects = [], sessions = [], outputs = [] } = {}) {
  const sessionToProject = new Map()
  const sessionsByProject = new Map()
  for (const session of sessions) {
    if (!session?.projectId) continue
    sessionToProject.set(session.id, session.projectId)
    if (!sessionsByProject.has(session.projectId)) sessionsByProject.set(session.projectId, [])
    sessionsByProject.get(session.projectId).push(session)
  }

  const outputsByProject = new Map()
  for (const output of outputs) {
    const projectId = output?.projectId || sessionToProject.get(output?.sessionId)
    if (!projectId || output?.outputKind === 'prompt-preview') continue
    if (!outputsByProject.has(projectId)) outputsByProject.set(projectId, [])
    outputsByProject.get(projectId).push(output)
  }

  const ruleHits = new Map()
  for (const project of projects) {
    const projectSessions = sessionsByProject.get(project.id) || []
    const projectOutputs = outputsByProject.get(project.id) || []
    const category = inferAutoLessonCategory(project, projectSessions, projectOutputs)
    if (category !== 'nails') continue

    for (const output of projectOutputs) {
      if (!getReview(output).readiness && normalizeFeedback(output.feedback) === null) continue
      const text = outputText(output)
      for (const rule of NAIL_RULES) {
        if (!rule.match(text, output)) continue
        if (rule.signal === 'preference' && !isReady(output)) continue
        if (rule.signal === 'correction' && !isMiss(output) && !text) continue
        const key = `${category}:${rule.id}`
        if (!ruleHits.has(key)) {
          ruleHits.set(key, {
            id: rule.id,
            scope: 'category',
            category,
            signal: rule.signal,
            text: rule.text,
            support: 0,
            projectIds: new Set(),
            outputIds: [],
            version: AUTO_LESSON_VERSION,
          })
        }
        const hit = ruleHits.get(key)
        hit.support += 1
        hit.projectIds.add(project.id)
        if (output.id && hit.outputIds.length < 8) hit.outputIds.push(output.id)
      }
    }
  }

  return [...ruleHits.values()]
    .filter((lesson) => lesson.support >= 2)
    .map((lesson) => ({
      ...lesson,
      projectIds: [...lesson.projectIds],
      confidence: lesson.support >= 5 ? 'high' : 'medium',
      updatedAt: Date.now(),
    }))
    .sort((a, b) => b.support - a.support || a.id.localeCompare(b.id))
}

export function selectAutoLessonsForProject(globalState, project, limit = 8) {
  const category = project?.category || globalState?.projectSummaries?.find((entry) => entry.id === project?.id)?.category || 'general'
  const categoryLessons = globalState?.categoryProfiles?.[category]?.autoLessons || []
  const globalLessons = globalState?.autoLessons || []
  const seen = new Set()

  return [...categoryLessons, ...globalLessons]
    .filter((lesson) => lesson?.text && !seen.has(lesson.id) && seen.add(lesson.id))
    .slice(0, limit)
}
