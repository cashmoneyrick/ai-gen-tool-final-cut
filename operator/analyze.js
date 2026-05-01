#!/usr/bin/env node

/**
 * Operator Analysis Engine
 *
 * Analyzes rated outputs across projects to find keyword/rating correlations,
 * winner patterns, model comparisons, and taste profiles. Generates project
 * briefs and global state summaries for operator decision-making.
 *
 * Usage:
 *   import { analyzeProject, generateProjectBrief } from './operator/analyze.js'
 *
 * Self-test:
 *   node operator/analyze.js [projectId]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import * as storage from '../server/storage.js'
import { normalizeFeedback } from '../src/reviewFeedback.js'
import { distillAutoLessons } from './autoLessons.js'

function isPromptPreviewOutput(output) {
  return output?.outputKind === 'prompt-preview'
}

const DATA_DIR = join(process.cwd(), 'data')
const BRIEFS_DIR = join(DATA_DIR, 'briefs')

// --- Stop words: common English + common prompt filler ---

const STOP_WORDS = new Set([
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'its', 'this', 'that', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall',
  'can', 'not', 'no', 'so', 'if', 'then', 'than', 'too', 'very', 'just',
  'about', 'up', 'out', 'into', 'over', 'after', 'before', 'between',
  'under', 'again', 'there', 'here', 'when', 'where', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'only', 'own', 'same', 'also', 'as', 'any',
  // Prompt filler
  'image', 'photo', 'photograph', 'picture', 'showing', 'shows', 'show',
  'create', 'creating', 'generate', 'generating', 'make', 'making',
  'display', 'displaying', 'depict', 'depicting', 'render', 'rendered',
  'feature', 'featuring', 'features', 'include', 'including', 'includes',
  'look', 'looking', 'looks', 'like', 'style', 'styled',
  'ensure', 'ensuring', 'must', 'always', 'never',
  'background', 'foreground',
  'ref', 'reference',
])

const CATEGORY_KEYWORDS = {
  nails: ['nail', 'nails', 'press-on', 'press on', 'french tip', 'cat eye', 'gel', 'manicure', 'almond', 'coffin', 'stiletto'],
  logos: ['logo', 'wordmark', 'brand mark', 'icon mark', 'symbol', 'typography'],
  packaging: ['pouch', 'packaging', 'embroidery', 'embroidered', 'drawstring', 'suede pouch', 'microsuede'],
  mockups: ['mockup', 'mock-up', 'product shot', 'ecommerce', 'flat lay', 'flatlay'],
  branding: ['brand', 'branding', 'identity', 'visual identity', 'palette', 'brand system'],
}

const CATEGORY_ORDER = ['nails', 'logos', 'packaging', 'mockups', 'branding']

// --- Tokenization ---

/**
 * Tokenize a prompt string into unigrams and bigrams.
 * Preserves hex color codes as-is. Strips bracket tags like [REF].
 * Returns { tokens: string[], hexColors: string[] }
 */
function tokenizePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return { tokens: [], hexColors: [] }

  // Extract hex colors first
  const hexPattern = /#[0-9a-fA-F]{6}\b/g
  const hexColors = []
  let match
  while ((match = hexPattern.exec(prompt)) !== null) {
    hexColors.push(match[0].toLowerCase())
  }

  // Remove bracket tags like [REF], [LOCKED], etc.
  let cleaned = prompt.replace(/\[[A-Z_]+\]/g, ' ')

  // Remove hex codes from the text for word tokenization (we track them separately)
  cleaned = cleaned.replace(/#[0-9a-fA-F]{6}\b/g, ' ')

  // Lowercase, strip non-alpha chars (keep spaces, hyphens within words)
  cleaned = cleaned.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = cleaned.split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w))

  // Build unigrams + bigrams
  const tokens = [...words]
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]} ${words[i + 1]}`)
  }

  return { tokens, hexColors }
}

function normalizeCategory(value) {
  return CATEGORY_ORDER.includes(value) ? value : 'general'
}

function scoreCategoryText(text, category) {
  const clean = String(text || '').toLowerCase()
  if (!clean) return 0
  return CATEGORY_KEYWORDS[category].reduce((score, keyword) => {
    return score + (clean.includes(keyword) ? 1 : 0)
  }, 0)
}

export function inferProjectCategory(project, sessions = [], outputs = []) {
  const textParts = [
    project?.name || '',
    ...(sessions || []).map((session) => session?.goal || ''),
    ...(outputs || []).slice(0, 12).map((output) =>
      output?.finalPromptSent || output?.prompt || output?.assembledPromptSnapshot || ''
    ),
  ]

  const combined = textParts.filter(Boolean).join(' \n ')
  let bestCategory = 'general'
  let bestScore = 0

  for (const category of CATEGORY_ORDER) {
    const score = scoreCategoryText(combined, category)
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  return bestScore > 0 ? bestCategory : 'general'
}

// --- Core analysis ---

/**
 * Analyze all rated outputs for a project.
 * Reads outputs.json ONCE (it can be 212MB).
 */
export function analyzeProject(projectId) {
  const resolvedId = projectId || storage.getActiveProject()
  const project = storage.get('projects', resolvedId)
  if (!project) return null

  // Read all outputs ONCE, filter to this project directly (outputs carry projectId)
  const allOutputs = storage.getAll('outputs')
  const projectOutputs = allOutputs.filter((o) => o.projectId === resolvedId && !isPromptPreviewOutput(o))

  // Read all winners for this project directly
  const allWinners = storage.getAll('winners')
  const projectWinners = allWinners.filter(w => w.projectId === resolvedId)
  const winnerOutputIds = new Set(projectWinners.map(w => w.outputId || w.id))

  // Separate rated outputs
  const ratedOutputs = []
  const winnerOutputs = []

  for (const o of projectOutputs) {
    const rating = normalizeFeedback(o.feedback)
    if (rating !== null) {
      ratedOutputs.push({ ...o, _rating: rating })
    }
    if (winnerOutputIds.has(o.id)) {
      winnerOutputs.push(o)
    }
  }

  // --- Keyword / rating correlation ---

  // First pass: collect all keywords and their ratings
  const keywordStats = new Map() // keyword -> { sum, count, ratings[] }
  const allKeywordSets = [] // per-output keyword sets (to find constants)

  for (const o of ratedOutputs) {
    const promptText = o.finalPromptSent || o.prompt || ''
    const { tokens } = tokenizePrompt(promptText)
    const uniqueTokens = new Set(tokens)
    allKeywordSets.push(uniqueTokens)

    for (const token of uniqueTokens) {
      if (!keywordStats.has(token)) {
        keywordStats.set(token, { sum: 0, count: 0, ratings: [] })
      }
      const stat = keywordStats.get(token)
      stat.sum += o._rating
      stat.count++
      stat.ratings.push(o._rating)
    }
  }

  // Filter out keywords that appear in ALL outputs (locked elements / constants)
  const totalRated = ratedOutputs.length
  const constantKeywords = new Set()
  if (totalRated > 2) {
    for (const [keyword, stat] of keywordStats) {
      if (stat.count === totalRated) {
        constantKeywords.add(keyword)
      }
    }
  }

  // What works: avg >= 3.5, count >= 2, not a constant
  const whatWorks = []
  // What fails: avg <= 2.5, count >= 2, not a constant
  const whatFails = []

  for (const [keyword, stat] of keywordStats) {
    if (constantKeywords.has(keyword)) continue
    if (stat.count < 2) continue
    const avg = stat.sum / stat.count
    if (avg >= 3.5) {
      whatWorks.push({ keyword, avg: Math.round(avg * 10) / 10, count: stat.count })
    } else if (avg <= 2.5) {
      whatFails.push({ keyword, avg: Math.round(avg * 10) / 10, count: stat.count })
    }
  }

  whatWorks.sort((a, b) => b.avg - a.avg || b.count - a.count)
  whatFails.sort((a, b) => a.avg - b.avg || b.count - a.count)

  // --- Model comparison ---

  const modelStats = new Map() // model -> { sum, count }
  for (const o of ratedOutputs) {
    const model = o.model || 'unknown'
    if (!modelStats.has(model)) modelStats.set(model, { sum: 0, count: 0 })
    const stat = modelStats.get(model)
    stat.sum += o._rating
    stat.count++
  }

  const modelComparison = []
  for (const [model, stat] of modelStats) {
    modelComparison.push({
      model,
      avg: Math.round((stat.sum / stat.count) * 10) / 10,
      count: stat.count,
    })
  }
  modelComparison.sort((a, b) => b.avg - a.avg)

  // --- Winner DNA: common keywords across 50%+ of winners ---

  const winnerKeywordCounts = new Map()
  const winnerPromptCount = winnerOutputs.length

  for (const w of winnerOutputs) {
    const promptText = w.finalPromptSent || w.prompt || ''
    const { tokens } = tokenizePrompt(promptText)
    const uniqueTokens = new Set(tokens)
    for (const token of uniqueTokens) {
      winnerKeywordCounts.set(token, (winnerKeywordCounts.get(token) || 0) + 1)
    }
  }

  const winnerDNA = []
  if (winnerPromptCount > 0) {
    const threshold = winnerPromptCount * 0.5
    for (const [keyword, count] of winnerKeywordCounts) {
      if (constantKeywords.has(keyword)) continue
      if (count >= threshold && count >= 2) {
        winnerDNA.push({
          keyword,
          pct: Math.round((count / winnerPromptCount) * 100),
          count,
        })
      }
    }
    winnerDNA.sort((a, b) => b.pct - a.pct || b.count - a.count)
  }

  // --- Hex colors used ---

  const colorStats = new Map() // hex -> { sum, count }
  for (const o of ratedOutputs) {
    const promptText = o.finalPromptSent || o.prompt || ''
    const { hexColors } = tokenizePrompt(promptText)
    for (const hex of hexColors) {
      if (!colorStats.has(hex)) colorStats.set(hex, { sum: 0, count: 0 })
      const stat = colorStats.get(hex)
      stat.sum += o._rating
      stat.count++
    }
  }

  const colors = []
  for (const [hex, stat] of colorStats) {
    colors.push({
      hex,
      avg: Math.round((stat.sum / stat.count) * 10) / 10,
      count: stat.count,
    })
  }
  colors.sort((a, b) => b.count - a.count)

  // --- Implicit signals ---

  const signalCounts = { recipe: 0, save: 0, copy: 0, useAsRef: 0 }
  for (const o of projectOutputs) {
    if (Array.isArray(o.signals)) {
      for (const sig of o.signals) {
        if (sig.type && sig.type in signalCounts) signalCounts[sig.type]++
      }
    }
  }

  // --- Compute overall avg ---

  const ratingSum = ratedOutputs.reduce((s, o) => s + o._rating, 0)
  const avgRating = ratedOutputs.length > 0
    ? Math.round((ratingSum / ratedOutputs.length) * 10) / 10
    : null

  const category = normalizeCategory(
    project.category || inferProjectCategory(project, [], projectOutputs)
  )

  const personalStandards = buildPersonalStandards(projectOutputs, winnerOutputIds)

  return {
    projectId: resolvedId,
    projectName: project.name || resolvedId,
    category,
    totalOutputs: projectOutputs.length,
    totalRated: ratedOutputs.length,
    totalWinners: winnerOutputs.length,
    avgRating,
    whatWorks: whatWorks.slice(0, 20),
    whatFails: whatFails.slice(0, 20),
    modelComparison,
    winnerDNA: winnerDNA.slice(0, 20),
    colors,
    signalCounts,
    constantKeywords: [...constantKeywords].slice(0, 30),
    personalStandards,
  }
}

function buildPersonalStandards(projectOutputs, winnerOutputIds) {
  const lines = []

  const winnerOutputs = projectOutputs.filter(o => winnerOutputIds.has(o.id))
  for (const o of winnerOutputs.slice(0, 5)) {
    if (o.notesKeep?.trim()) lines.push(`APPROVED: ${o.notesKeep.trim()}`)
    if (o.batchNotesKeep?.trim()) lines.push(`APPROVED: ${o.batchNotesKeep.trim()}`)
  }

  const highRated = projectOutputs
    .filter(o => normalizeFeedback(o.feedback) >= 4)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5)
  for (const o of highRated) {
    if (o.notesKeep?.trim()) lines.push(`LIKED: ${o.notesKeep.trim()}`)
  }

  const corrected = projectOutputs
    .filter(o => o.annotationCorrection?.corrected === false)
    .slice(0, 5)
  for (const o of corrected) {
    if (o.operatorAnnotation?.note) {
      lines.push(`NOTE: Evaluation was wrong about: "${o.operatorAnnotation.note}"`)
    }
  }

  return [...new Set(lines)].join('\n')
}

/**
 * Cross-project analysis. Reads all outputs ONCE.
 */
export function analyzeGlobal() {
  const allOutputs = storage.getAll('outputs').filter((output) => !isPromptPreviewOutput(output))
  const allSessions = storage.getAll('sessions')
  const allProjects = storage.getAll('projects')
  const allWinners = storage.getAll('winners')

  // Map session -> project
  const sessionToProject = new Map()
  for (const s of allSessions) {
    sessionToProject.set(s.id, s.projectId)
  }

  // Group outputs by project
  const projectOutputs = new Map() // projectId -> outputs[]
  for (const o of allOutputs) {
    const projId = sessionToProject.get(o.sessionId)
    if (!projId) continue
    if (!projectOutputs.has(projId)) projectOutputs.set(projId, [])
    projectOutputs.get(projId).push(o)
  }

  // Per-project keyword stats (only rated outputs)
  // keyword -> Map<projectId, { sum, count }>
  const crossKeywords = new Map()
  const categoryStats = new Map()

  const projectSummaries = []

  for (const proj of allProjects) {
    const outputs = projectOutputs.get(proj.id) || []
    const sessions = allSessions.filter((session) => session.projectId === proj.id)
    const rated = outputs.filter(o => normalizeFeedback(o.feedback) !== null)
    const winners = allWinners.filter(w => {
      const projId = sessionToProject.get(w.sessionId)
      return projId === proj.id
    })
    const category = normalizeCategory(
      proj.category || inferProjectCategory(proj, sessions, outputs)
    )

    const ratingSum = rated.reduce((s, o) => s + normalizeFeedback(o.feedback), 0)
    const avg = rated.length > 0 ? Math.round((ratingSum / rated.length) * 10) / 10 : null

    projectSummaries.push({
      id: proj.id,
      name: proj.name || proj.id,
      category,
      totalOutputs: outputs.length,
      totalRated: rated.length,
      totalWinners: winners.length,
      avgRating: avg,
    })

    if (!categoryStats.has(category)) {
      categoryStats.set(category, {
        outputs: [],
        rated: [],
        winnerOutputs: [],
        projectIds: new Set(),
      })
    }
    const categoryEntry = categoryStats.get(category)
    categoryEntry.outputs.push(...outputs)
    categoryEntry.rated.push(...rated)
    categoryEntry.projectIds.add(proj.id)
    const winnerOutputIds = new Set(winners.map((winner) => winner.outputId || winner.id))
    categoryEntry.winnerOutputs.push(...outputs.filter((output) => winnerOutputIds.has(output.id)))

    // Collect keywords per project
    for (const o of rated) {
      const rating = normalizeFeedback(o.feedback)
      const promptText = o.finalPromptSent || o.prompt || ''
      const { tokens } = tokenizePrompt(promptText)
      const uniqueTokens = new Set(tokens)

      for (const token of uniqueTokens) {
        if (!crossKeywords.has(token)) crossKeywords.set(token, new Map())
        const projMap = crossKeywords.get(token)
        if (!projMap.has(proj.id)) projMap.set(proj.id, { sum: 0, count: 0 })
        const stat = projMap.get(proj.id)
        stat.sum += rating
        stat.count++
      }
    }
  }

  // Cross-project patterns: keywords in 2+ projects with 3+ total occurrences
  const alwaysHigh = [] // avg >= 3.5 across all projects where it appears
  const alwaysLow = []  // avg <= 2.5 across all projects

  for (const [keyword, projMap] of crossKeywords) {
    if (projMap.size < 2) continue

    let totalSum = 0
    let totalCount = 0
    for (const stat of projMap.values()) {
      totalSum += stat.sum
      totalCount += stat.count
    }
    if (totalCount < 3) continue

    const avg = totalSum / totalCount
    const entry = {
      keyword,
      avg: Math.round(avg * 10) / 10,
      projects: projMap.size,
      totalCount,
    }

    if (avg >= 3.5) alwaysHigh.push(entry)
    else if (avg <= 2.5) alwaysLow.push(entry)
  }

  alwaysHigh.sort((a, b) => b.avg - a.avg || b.totalCount - a.totalCount)
  alwaysLow.sort((a, b) => a.avg - b.avg || b.totalCount - a.totalCount)

  const categoryProfiles = {}
  for (const [category, stats] of categoryStats.entries()) {
    const keywordStats = new Map()
    for (const output of stats.rated) {
      const rating = normalizeFeedback(output.feedback)
      const { tokens } = tokenizePrompt(output.finalPromptSent || output.prompt || '')
      const uniqueTokens = new Set(tokens)
      for (const token of uniqueTokens) {
        if (!keywordStats.has(token)) keywordStats.set(token, { sum: 0, count: 0 })
        const entry = keywordStats.get(token)
        entry.sum += rating
        entry.count++
      }
    }

    const whatWorks = []
    const whatFails = []
    for (const [keyword, stat] of keywordStats.entries()) {
      if (stat.count < 2) continue
      const avg = stat.sum / stat.count
      const summary = { keyword, avg: Math.round(avg * 10) / 10, count: stat.count }
      if (avg >= 3.5) whatWorks.push(summary)
      else if (avg <= 2.5) whatFails.push(summary)
    }
    whatWorks.sort((a, b) => b.avg - a.avg || b.count - a.count)
    whatFails.sort((a, b) => a.avg - b.avg || b.count - a.count)

    const winnerKeywordCounts = new Map()
    for (const output of stats.winnerOutputs) {
      const { tokens } = tokenizePrompt(output.finalPromptSent || output.prompt || '')
      const uniqueTokens = new Set(tokens)
      for (const token of uniqueTokens) {
        winnerKeywordCounts.set(token, (winnerKeywordCounts.get(token) || 0) + 1)
      }
    }
    const winnerDNA = []
    const winnerCount = stats.winnerOutputs.length
    if (winnerCount > 0) {
      for (const [keyword, count] of winnerKeywordCounts.entries()) {
        if (count >= 2 && count / winnerCount >= 0.5) {
          winnerDNA.push({
            keyword,
            pct: Math.round((count / winnerCount) * 100),
            count,
          })
        }
      }
      winnerDNA.sort((a, b) => b.pct - a.pct || b.count - a.count)
    }

    const modelStats = new Map()
    for (const output of stats.rated) {
      const model = output.model || 'unknown'
      if (!modelStats.has(model)) modelStats.set(model, { sum: 0, count: 0 })
      const entry = modelStats.get(model)
      entry.sum += normalizeFeedback(output.feedback)
      entry.count++
    }
    const modelComparison = [...modelStats.entries()]
      .map(([model, stat]) => ({
        model,
        avg: Math.round((stat.sum / stat.count) * 10) / 10,
        count: stat.count,
      }))
      .sort((a, b) => b.avg - a.avg)

    const avgRating = stats.rated.length > 0
      ? Math.round((stats.rated.reduce((sum, output) => sum + normalizeFeedback(output.feedback), 0) / stats.rated.length) * 10) / 10
      : null

    categoryProfiles[category] = {
      category,
      projectCount: stats.projectIds.size,
      totalOutputs: stats.outputs.length,
      totalRated: stats.rated.length,
      totalWinners: stats.winnerOutputs.length,
      avgRating,
      whatWorks: whatWorks.slice(0, 12),
      whatFails: whatFails.slice(0, 12),
      winnerDNA: winnerDNA.slice(0, 12),
      modelComparison,
    }
  }

  const autoLessons = distillAutoLessons({
    projects: allProjects,
    sessions: allSessions,
    outputs: allOutputs,
  })

  for (const lesson of autoLessons) {
    if (!categoryProfiles[lesson.category]) continue
    if (!categoryProfiles[lesson.category].autoLessons) {
      categoryProfiles[lesson.category].autoLessons = []
    }
    categoryProfiles[lesson.category].autoLessons.push(lesson)
  }

  return {
    totalProjects: allProjects.length,
    totalOutputs: allOutputs.length,
    totalWinners: allWinners.length,
    projectSummaries,
    categoryProfiles,
    autoLessons,
    tasteProfile: {
      alwaysHigh: alwaysHigh.slice(0, 20),
      alwaysLow: alwaysLow.slice(0, 20),
    },
  }
}

// --- Atomic file write (tmp + rename) ---

function atomicWriteJSON(filePath, data) {
  const dir = join(filePath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = filePath + `.tmp.${randomUUID()}`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, filePath)
}

function readJSON(filePath) {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

// --- Project Brief ---

/**
 * Generate and save a project brief.
 */
export function generateProjectBrief(projectId) {
  const resolvedId = projectId || storage.getActiveProject()
  if (!resolvedId) return null

  const briefPath = join(BRIEFS_DIR, `${resolvedId}.json`)

  // Cheap staleness check — skip full analysis if nothing has changed since last brief.
  // Compares output count, rated count, and winner count against cached stats.
  const existing = readJSON(briefPath)
  if (existing?.stats && existing.generatedAt) {
    const sessions = storage.getAllByIndex('sessions', 'projectId', resolvedId)
    const sessionIds = new Set(sessions.map(s => s.id))
    const projectOutputs = storage.getAll('outputs')
      .filter(o => sessionIds.has(o.sessionId) && !isPromptPreviewOutput(o))
    const projectWinners = storage.getAll('winners').filter(w => sessionIds.has(w.sessionId))
    const currentRated = projectOutputs.filter(o => o.feedback !== null && o.feedback !== undefined).length

    if (
      projectOutputs.length === existing.stats.totalOutputs &&
      currentRated === existing.stats.totalRated &&
      projectWinners.length === existing.stats.totalWinners
    ) {
      return existing // nothing changed — skip the expensive tokenization pass
    }
  }

  const analysis = analyzeProject(projectId)
  if (!analysis) return null

  // Preserve existing manual notes (existing was already read for the staleness check above)
  const manualNotes = existing?.manualNotes || { liked: [], hated: [] }

  // Get project record for savedColors
  const project = storage.get('projects', analysis.projectId)
  const savedColors = project?.savedColors || []

  // Get recent winner recipes
  const sessions = storage.getAllByIndex('sessions', 'projectId', analysis.projectId)
  const sessionIds = new Set(sessions.map(s => s.id))
  const allWinners = storage.getAll('winners')
  const projectWinners = allWinners
    .filter(w => sessionIds.has(w.sessionId))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10)

  const winnerRecipes = projectWinners.map(w => ({
    id: w.id,
    model: w.model,
    prompt: (w.finalPromptSent || w.prompt || '').slice(0, 300),
    feedback: w.feedback,
    createdAt: w.createdAt,
  }))

  const brief = {
    projectId: analysis.projectId,
    projectName: analysis.projectName,
    category: analysis.category,
    generatedAt: Date.now(),
    stats: {
      totalOutputs: analysis.totalOutputs,
      totalRated: analysis.totalRated,
      totalWinners: analysis.totalWinners,
      avgRating: analysis.avgRating,
    },
    whatWorks: analysis.whatWorks.slice(0, 15),
    whatFails: analysis.whatFails.slice(0, 15),
    winnerDNA: analysis.winnerDNA.slice(0, 15),
    modelComparison: analysis.modelComparison,
    colors: analysis.colors,
    savedColors,
    signalCounts: analysis.signalCounts,
    winnerRecipes,
    manualNotes,
  }

  atomicWriteJSON(briefPath, brief)
  return brief
}

/**
 * Generate and save global state.
 */
export function generateGlobalState() {
  const analysis = analyzeGlobal()
  const brandDNA = mineBrandDNA()

  const globalPath = join(DATA_DIR, 'global-state.json')

  // Preserve existing vocabulary
  const existing = readJSON(globalPath)
  const vocabulary = existing?.vocabulary || {}

  const state = {
    generatedAt: Date.now(),
    totalProjects: analysis.totalProjects,
    totalOutputs: analysis.totalOutputs,
    totalWinners: analysis.totalWinners,
    projectSummaries: analysis.projectSummaries,
    categoryProfiles: analysis.categoryProfiles || {},
    autoLessons: analysis.autoLessons || [],
    tasteProfile: analysis.tasteProfile,
    brandDNA: brandDNA ? { dna: brandDNA.dna.slice(0, 15), colors: brandDNA.colors, models: brandDNA.models } : null,
    vocabulary,
    systemLayers: {
      global: 'cross-project taste and brand DNA',
      category: 'domain-specific learning such as nails vs logos vs packaging',
      project: 'direction-specific brief and manual notes',
      session: 'active buckets, refs, locked elements, outputs, and winners',
      request: 'current user ask or prompt override',
    },
  }

  atomicWriteJSON(globalPath, state)
  return state
}

// --- Readers ---

/**
 * Read a saved project brief.
 */
export function readBrief(projectId) {
  const resolvedId = projectId || storage.getActiveProject()
  return readJSON(join(BRIEFS_DIR, `${resolvedId}.json`))
}

/**
 * Read saved global state.
 */
export function readGlobalState() {
  return readJSON(join(DATA_DIR, 'global-state.json'))
}

// --- Updaters ---

/**
 * Update manual liked/hated notes on a project brief.
 */
export function updateBriefNotes(projectId, liked, hated) {
  const resolvedId = projectId || storage.getActiveProject()
  const briefPath = join(BRIEFS_DIR, `${resolvedId}.json`)
  const brief = readJSON(briefPath)
  if (!brief) return null

  brief.manualNotes = {
    liked: Array.isArray(liked) ? liked : brief.manualNotes?.liked || [],
    hated: Array.isArray(hated) ? hated : brief.manualNotes?.hated || [],
  }
  brief.notesUpdatedAt = Date.now()

  atomicWriteJSON(briefPath, brief)
  return brief
}

/**
 * Add a vocabulary entry to global state.
 */
export function updateVocabulary(term, meaning) {
  const globalPath = join(DATA_DIR, 'global-state.json')
  const state = readJSON(globalPath) || {
    generatedAt: Date.now(),
    vocabulary: {},
  }

  if (!state.vocabulary) state.vocabulary = {}
  state.vocabulary[term] = meaning
  state.vocabularyUpdatedAt = Date.now()

  atomicWriteJSON(globalPath, state)
  return state
}

// --- Brand DNA (Prompt Archaeology) ---

/**
 * Find the user's "brand fingerprint" — keywords/patterns that appear
 * significantly more in winners than non-winners across ALL projects.
 */
export function mineBrandDNA() {
  // Read all outputs and winners ONCE
  const allOutputs = storage.getAll('outputs').filter((output) => !isPromptPreviewOutput(output))
  const allWinners = storage.getAll('winners')
  const allSessions = storage.getAll('sessions')

  // Map session -> project
  const sessionToProject = new Map()
  for (const s of allSessions) sessionToProject.set(s.id, s.projectId)

  // Get all winner output IDs
  const winnerOutputIds = new Set(allWinners.map(w => w.outputId || w.id))

  // Separate winners from non-winners
  const winnerOutputs = allOutputs.filter(o => winnerOutputIds.has(o.id))
  const nonWinnerOutputs = allOutputs.filter(o => !winnerOutputIds.has(o.id) && normalizeFeedback(o.feedback) !== null)

  if (winnerOutputs.length < 3) return null // Need enough data

  // Tokenize all winner prompts, count keyword frequency
  const winnerKeywords = new Map() // keyword -> count
  for (const o of winnerOutputs) {
    const { tokens } = tokenizePrompt(o.finalPromptSent || o.prompt || '')
    const unique = new Set(tokens)
    for (const t of unique) {
      winnerKeywords.set(t, (winnerKeywords.get(t) || 0) + 1)
    }
  }

  // Tokenize non-winner prompts
  const nonWinnerKeywords = new Map()
  for (const o of nonWinnerOutputs) {
    const { tokens } = tokenizePrompt(o.finalPromptSent || o.prompt || '')
    const unique = new Set(tokens)
    for (const t of unique) {
      nonWinnerKeywords.set(t, (nonWinnerKeywords.get(t) || 0) + 1)
    }
  }

  // Find keywords that are significantly more common in winners
  // "Significantly more" = appears in 40%+ of winners AND at higher rate than in non-winners
  const totalWinners = winnerOutputs.length
  const totalNonWinners = nonWinnerOutputs.length

  const brandDNA = []
  for (const [keyword, winCount] of winnerKeywords) {
    const winRate = winCount / totalWinners
    if (winRate < 0.4) continue // Must be in 40%+ of winners
    if (winCount < 2) continue

    const nonWinCount = nonWinnerKeywords.get(keyword) || 0
    const nonWinRate = totalNonWinners > 0 ? nonWinCount / totalNonWinners : 0

    // Winner rate must be at least 1.3x the non-winner rate
    const lift = nonWinRate > 0 ? winRate / nonWinRate : 10
    if (lift < 1.3) continue

    brandDNA.push({
      keyword,
      winnerRate: Math.round(winRate * 100),
      nonWinnerRate: Math.round(nonWinRate * 100),
      lift: Math.round(lift * 10) / 10,
      winnerCount: winCount,
    })
  }

  brandDNA.sort((a, b) => b.lift - a.lift || b.winnerRate - a.winnerRate)

  // Also extract common hex colors from winners
  const winnerColors = new Map()
  for (const o of winnerOutputs) {
    const { hexColors } = tokenizePrompt(o.finalPromptSent || o.prompt || '')
    for (const hex of hexColors) {
      winnerColors.set(hex, (winnerColors.get(hex) || 0) + 1)
    }
  }
  const commonColors = [...winnerColors.entries()]
    .filter(([_, count]) => count >= 2)
    .map(([hex, count]) => ({ hex, count, pct: Math.round((count / totalWinners) * 100) }))
    .sort((a, b) => b.count - a.count)

  // Common models in winners
  const winnerModels = new Map()
  for (const o of winnerOutputs) {
    const m = o.model || 'unknown'
    winnerModels.set(m, (winnerModels.get(m) || 0) + 1)
  }
  const modelBreakdown = [...winnerModels.entries()]
    .map(([model, count]) => ({ model, count, pct: Math.round((count / totalWinners) * 100) }))
    .sort((a, b) => b.count - a.count)

  return {
    totalWinners: winnerOutputs.length,
    totalNonWinners: nonWinnerOutputs.length,
    dna: brandDNA.slice(0, 30),
    colors: commonColors.slice(0, 10),
    models: modelBreakdown,
  }
}

// --- Cross-Project Recommendations ---

/**
 * Generate actionable text recommendations for the operator.
 */
export function generateRecommendations(projectId) {
  const brief = readBrief(projectId)
  const globalState = readGlobalState()
  const brandDNA = mineBrandDNA()
  const categoryState = brief?.category ? globalState?.categoryProfiles?.[brief.category] : null

  const recommendations = []

  // 1. From project brief: what works
  if (brief?.whatWorks?.length > 0) {
    const topWorks = brief.whatWorks.slice(0, 3).map(w => `"${w.keyword}"`).join(', ')
    recommendations.push(`Include: ${topWorks} — these correlate with high ratings in this project`)
  }

  // 2. From project brief: what fails
  if (brief?.whatFails?.length > 0) {
    const topFails = brief.whatFails.slice(0, 3).map(f => `"${f.keyword}"`).join(', ')
    recommendations.push(`Avoid: ${topFails} — these correlate with low ratings in this project`)
  }

  // 3. From manual notes
  if (brief?.manualNotes?.hated?.length > 0) {
    recommendations.push(`Rick hates: ${brief.manualNotes.hated.join(', ')}`)
  }
  if (brief?.manualNotes?.liked?.length > 0) {
    recommendations.push(`Rick likes: ${brief.manualNotes.liked.join(', ')}`)
  }

  // 4. From global taste profile
  if (globalState?.tasteProfile?.alwaysHigh?.length > 0) {
    const globalGood = globalState.tasteProfile.alwaysHigh.slice(0, 3).map(h => `"${h.keyword}"`).join(', ')
    recommendations.push(`Cross-project winners use: ${globalGood}`)
  }
  if (globalState?.tasteProfile?.alwaysLow?.length > 0) {
    const globalBad = globalState.tasteProfile.alwaysLow.slice(0, 3).map(l => `"${l.keyword}"`).join(', ')
    recommendations.push(`Cross-project losers use: ${globalBad}`)
  }

  // 4.5 Category layer
  if (categoryState?.winnerDNA?.length > 0) {
    const categoryWinners = categoryState.winnerDNA.slice(0, 3).map(item => `"${item.keyword}"`).join(', ')
    recommendations.push(`${brief.category} winners often use: ${categoryWinners}`)
  }
  if (categoryState?.whatFails?.length > 0) {
    const categoryFails = categoryState.whatFails.slice(0, 3).map(item => `"${item.keyword}"`).join(', ')
    recommendations.push(`${brief.category} misses often drift into: ${categoryFails}`)
  }

  // 5. From brand DNA
  if (brandDNA?.dna?.length > 0) {
    const dnaKeywords = brandDNA.dna.slice(0, 5).map(d => `"${d.keyword}"`).join(', ')
    recommendations.push(`Brand DNA (winner fingerprint): ${dnaKeywords}`)
  }

  // 6. Model recommendation
  if (brief?.modelComparison?.length > 1) {
    const sorted = [...brief.modelComparison].sort((a, b) => b.avg - a.avg)
    if (sorted[0].avg - sorted[1].avg >= 0.5) {
      recommendations.push(`${sorted[0].model.includes('pro') ? 'Pro' : 'Flash'} scores ${sorted[0].avg - sorted[1].avg} higher than ${sorted[1].model.includes('pro') ? 'Pro' : 'Flash'} for this project`)
    }
  } else if (categoryState?.modelComparison?.length > 1) {
    const sorted = [...categoryState.modelComparison].sort((a, b) => b.avg - a.avg)
    if (sorted[0].avg - sorted[1].avg >= 0.5) {
      recommendations.push(`Across ${brief.category}, ${sorted[0].model.includes('pro') ? 'Pro' : 'Flash'} tends to score ${sorted[0].avg - sorted[1].avg} higher than ${sorted[1].model.includes('pro') ? 'Pro' : 'Flash'}`)
    }
  }

  return recommendations
}

// --- Collection Templates ---

const TEMPLATES_FILE = join(DATA_DIR, 'templates.json')

function readTemplates() {
  return readJSON(TEMPLATES_FILE) || []
}

function writeTemplates(templates) {
  atomicWriteJSON(TEMPLATES_FILE, templates)
}

/**
 * Save a winner's recipe as a reusable template.
 * Variables are parts of the prompt that can be swapped (e.g., color, specific element).
 */
export function saveTemplate({ name, winnerId, projectId, prompt, model, variables, settings }) {
  const templates = readTemplates()
  const template = {
    id: `tmpl-${randomUUID().slice(0, 8)}`,
    name,
    winnerId,
    projectId,
    prompt, // The full winning prompt
    model,
    variables: variables || [], // Array of { name, placeholder, defaultValue }
    settings: settings || {},
    createdAt: Date.now(),
  }
  templates.push(template)
  writeTemplates(templates)
  return template
}

/**
 * List all templates, optionally filtered by project.
 */
export function listTemplates(projectId) {
  const templates = readTemplates()
  if (projectId) return templates.filter(t => t.projectId === projectId)
  return templates
}

/**
 * Get a specific template by ID.
 */
export function getTemplate(templateId) {
  const templates = readTemplates()
  return templates.find(t => t.id === templateId) || null
}

/**
 * Generate a prompt from a template by substituting variables.
 * variableValues is an object: { variableName: value }
 */
export function applyTemplate(templateId, variableValues) {
  const template = getTemplate(templateId)
  if (!template) return null

  let prompt = template.prompt
  for (const v of template.variables) {
    const value = variableValues[v.name] || v.defaultValue || ''
    // Replace the placeholder in the prompt
    prompt = prompt.replace(new RegExp(escapeRegex(v.placeholder), 'gi'), value)
  }

  return {
    prompt,
    model: template.model,
    settings: template.settings,
    templateId: template.id,
    templateName: template.name,
    substitutions: variableValues,
  }
}

/**
 * Delete a template.
 */
export function deleteTemplate(templateId) {
  const templates = readTemplates()
  const filtered = templates.filter(t => t.id !== templateId)
  writeTemplates(filtered)
  return filtered.length < templates.length
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// --- Ref Analysis helpers ---

/**
 * Save a structured analysis to a ref record.
 * Called by the operator after analyzing a reference image.
 */
export function saveRefAnalysis(refId, analysis) {
  const ref = storage.get('refs', refId)
  if (!ref) return null
  const updated = { ...ref, analysis, analysisUpdatedAt: Date.now() }
  storage.put('refs', updated)
  return updated
}

/**
 * Get all analyzed refs for a project's active session.
 */
export function getAnalyzedRefs(projectId) {
  const sessions = storage.getAllByIndex('sessions', 'projectId', projectId || storage.getActiveProject())
  if (sessions.length === 0) return []
  const session = sessions[0]
  const refs = storage.getAllByIndex('refs', 'sessionId', session.id)
  return refs.filter(r => r.analysis).map(r => ({
    id: r.id,
    name: r.name,
    analysis: r.analysis,
    send: r.send,
    mode: r.mode,
  }))
}

// --- Self-test ---

if (process.argv[1]?.endsWith('analyze.js')) {
  const requestedId = process.argv[2] || null

  console.log('')

  // Project analysis
  const analysis = analyzeProject(requestedId)
  if (!analysis) {
    console.error('No project found. Pass a project ID or set an active project.')
    process.exit(1)
  }

  console.log(`=== PROJECT ANALYSIS: ${analysis.projectName} ===`)
  console.log(`Outputs: ${analysis.totalOutputs} | Rated: ${analysis.totalRated} | Winners: ${analysis.totalWinners} | Avg: ${analysis.avgRating ?? 'n/a'}`)

  if (analysis.whatWorks.length > 0) {
    console.log('\n--- WHAT WORKS ---')
    for (const w of analysis.whatWorks.slice(0, 10)) {
      console.log(`  "${w.keyword}" -> avg ${w.avg} (${w.count} outputs)`)
    }
  }

  if (analysis.whatFails.length > 0) {
    console.log('\n--- WHAT FAILS ---')
    for (const f of analysis.whatFails.slice(0, 10)) {
      console.log(`  "${f.keyword}" -> avg ${f.avg} (${f.count} outputs)`)
    }
  }

  if (analysis.winnerDNA.length > 0) {
    console.log('\n--- WINNER DNA ---')
    for (const d of analysis.winnerDNA.slice(0, 10)) {
      console.log(`  "${d.keyword}" -> in ${d.pct}% of winners`)
    }
  }

  if (analysis.modelComparison.length > 0) {
    console.log('\n--- MODEL COMPARISON ---')
    for (const m of analysis.modelComparison) {
      console.log(`  ${m.model} -> avg ${m.avg} (${m.count} outputs)`)
    }
  }

  if (analysis.colors.length > 0) {
    console.log('\n--- COLORS ---')
    for (const c of analysis.colors.slice(0, 10)) {
      console.log(`  ${c.hex} -> avg ${c.avg} (${c.count} uses)`)
    }
  }

  if (analysis.constantKeywords.length > 0) {
    console.log(`\n--- CONSTANTS (filtered out) ---`)
    console.log(`  ${analysis.constantKeywords.slice(0, 15).join(', ')}`)
  }

  // Save brief
  const brief = generateProjectBrief(requestedId)
  if (brief) {
    console.log(`\nBrief saved to data/briefs/${analysis.projectId}.json`)
  }

  // Global analysis
  const globalState = generateGlobalState()
  console.log(`Global state saved to data/global-state.json`)

  if (globalState.tasteProfile.alwaysHigh.length > 0) {
    console.log('\n--- GLOBAL TASTE: ALWAYS HIGH ---')
    for (const h of globalState.tasteProfile.alwaysHigh.slice(0, 5)) {
      console.log(`  "${h.keyword}" -> avg ${h.avg} across ${h.projects} projects`)
    }
  }

  if (globalState.tasteProfile.alwaysLow.length > 0) {
    console.log('\n--- GLOBAL TASTE: ALWAYS LOW ---')
    for (const l of globalState.tasteProfile.alwaysLow.slice(0, 5)) {
      console.log(`  "${l.keyword}" -> avg ${l.avg} across ${l.projects} projects`)
    }
  }

  if (globalState.brandDNA?.dna?.length > 0) {
    console.log('\n--- BRAND DNA ---')
    for (const d of globalState.brandDNA.dna.slice(0, 10)) {
      console.log(`  "${d.keyword}" -> in ${d.winnerRate}% of winners vs ${d.nonWinnerRate}% of others (${d.lift}x lift)`)
    }
  }

  console.log('')
}
