/**
 * Pure computation engine for the Insights diagnostic page.
 * Fetches all stores and computes metrics across all projects.
 * No React dependencies — just data in, insights out.
 */

import { estimateCost } from '../costUtils.js'

// --- Stop words for prompt pattern analysis ---
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall',
  'this', 'that', 'these', 'those', 'it', 'its', 'not', 'no', 'so', 'if', 'as',
  'up', 'out', 'about', 'into', 'over', 'after', 'before', 'between', 'under',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'when', 'where',
  'how', 'what', 'which', 'who', 'whom', 'why', 'can', 'only', 'own', 'same',
  'then', 'once', 'any', 'image', 'make', 'like', 'use', 'using', 'keep', 'get',
  'must', 'need', 'want', 'ensure', 'should', 'please', 'always', 'never',
])

/**
 * Fetch a store from the API, stripping heavy fields we don't need.
 */
async function fetchStore(name) {
  const res = await fetch(`/api/store/${name}`)
  if (!res.ok) return []
  const data = await res.json()
  if (name === 'outputs' || name === 'winners') {
    // Strip base64 image data — we only need metadata
    return data.map(({ dataUrl, ...rest }) => rest)
  }
  return data
}

/**
 * Main entry point. Returns all computed insights.
 */
export async function computeInsights() {
  const [projects, sessions, outputs, winners, memories] = await Promise.all([
    fetchStore('projects'),
    fetchStore('sessions'),
    fetchStore('outputs'),
    fetchStore('winners'),
    fetchStore('memories'),
  ])

  return {
    health: computeHealth(outputs, winners, memories, sessions),
    trends: computeTrends(outputs, sessions, winners),
    patterns: computePatterns(outputs),
    projects: computeProjects(projects, outputs, winners, sessions),
    models: computeModels(outputs, winners),
    costs: computeCosts(outputs, projects, winners),
  }
}

// ===================== SECTION 1: HEALTH =====================

function computeHealth(outputs, winners, memories, sessions) {
  const totalImages = outputs.length
  const totalWinners = winners.length

  // Win rate: outputs with feedback='up' / outputs with any feedback
  const withFeedback = outputs.filter((o) => o.feedback === 'up' || o.feedback === 'down')
  const thumbsUp = outputs.filter((o) => o.feedback === 'up').length
  const winRate = withFeedback.length > 0 ? Math.round((thumbsUp / withFeedback.length) * 100) : null

  // Memory stats
  const activeMemories = memories.filter((m) => m.active).length
  const totalMemories = memories.length

  // How many recent outputs used memories (check generationReceipt)
  const recentOutputs = outputs.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20)
  const outputsWithMemories = recentOutputs.filter((o) => o.generationReceipt?.memoriesUsed?.count > 0).length
  const memoryUtilization = recentOutputs.length > 0 ? Math.round((outputsWithMemories / recentOutputs.length) * 100) : 0

  // Carry-forward active
  const outputsWithCarryForward = recentOutputs.filter((o) => o.iterationPreamble).length
  const carryForwardRate = recentOutputs.length > 0 ? Math.round((outputsWithCarryForward / recentOutputs.length) * 100) : 0

  // Average convergence: attempts to first winner per session
  const convergences = []
  for (const s of sessions) {
    const sessionOutputIds = s.outputIds || []
    const sessionWinnerOutputIds = new Set((winners.filter((w) => w.sessionId === s.id)).map((w) => w.outputId))
    if (sessionWinnerOutputIds.size === 0) continue
    // Count outputs until first winner
    let attempts = 0
    for (const oid of sessionOutputIds.reverse()) { // outputIds are newest-first, reverse to get chronological
      attempts++
      if (sessionWinnerOutputIds.has(oid)) break
    }
    convergences.push(attempts)
  }
  const avgConvergence = convergences.length > 0 ? Math.round(convergences.reduce((a, b) => a + b, 0) / convergences.length) : null

  return {
    totalImages,
    totalWinners,
    winRate,
    activeMemories,
    totalMemories,
    memoryUtilization,
    carryForwardRate,
    avgConvergence,
  }
}

// ===================== SECTION 2: TRENDS =====================

function computeTrends(outputs, sessions, winners) {
  // Sort outputs chronologically
  const sorted = outputs.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  if (sorted.length < 4) return { earlyWinRate: null, recentWinRate: null, earlyConvergence: null, recentConvergence: null, feedbackResolutionRate: null }

  const mid = Math.floor(sorted.length / 2)
  const early = sorted.slice(0, mid)
  const recent = sorted.slice(mid)

  const winRateOf = (arr) => {
    const reviewed = arr.filter((o) => o.feedback === 'up' || o.feedback === 'down')
    if (reviewed.length === 0) return null
    return Math.round((reviewed.filter((o) => o.feedback === 'up').length / reviewed.length) * 100)
  }

  // Convergence trend: split sessions chronologically
  const sortedSessions = sessions.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  const sessionMid = Math.floor(sortedSessions.length / 2)

  const convergenceOf = (sessionSlice) => {
    const convergences = []
    for (const s of sessionSlice) {
      const sessionWinnerOutputIds = new Set(winners.filter((w) => w.sessionId === s.id).map((w) => w.outputId))
      if (sessionWinnerOutputIds.size === 0) continue
      const ids = [...(s.outputIds || [])].reverse()
      let attempts = 0
      for (const oid of ids) {
        attempts++
        if (sessionWinnerOutputIds.has(oid)) break
      }
      convergences.push(attempts)
    }
    return convergences.length > 0 ? Math.round(convergences.reduce((a, b) => a + b, 0) / convergences.length) : null
  }

  // Feedback resolution rate: after a fix note, does the next batch have more thumbs up?
  // Group outputs by session and batch
  let fixFollowedByImprovement = 0
  let fixTotal = 0
  const outputsBySession = new Map()
  for (const o of sorted) {
    if (!outputsBySession.has(o.sessionId)) outputsBySession.set(o.sessionId, [])
    outputsBySession.get(o.sessionId).push(o)
  }

  for (const [, sessionOutputs] of outputsBySession) {
    // Group by batch (createdAt)
    const batches = []
    let currentBatch = null
    for (const o of sessionOutputs) {
      if (!currentBatch || o.createdAt !== currentBatch.createdAt) {
        currentBatch = { createdAt: o.createdAt, outputs: [] }
        batches.push(currentBatch)
      }
      currentBatch.outputs.push(o)
    }

    for (let i = 0; i < batches.length - 1; i++) {
      const batch = batches[i]
      const nextBatch = batches[i + 1]
      const hasFix = batch.outputs.some((o) => o.notesFix && o.notesFix.trim().length > 5)
      if (!hasFix) continue
      fixTotal++
      const nextHasUp = nextBatch.outputs.some((o) => o.feedback === 'up')
      if (nextHasUp) fixFollowedByImprovement++
    }
  }

  return {
    earlyWinRate: winRateOf(early),
    recentWinRate: winRateOf(recent),
    earlyConvergence: convergenceOf(sortedSessions.slice(0, sessionMid)),
    recentConvergence: convergenceOf(sortedSessions.slice(sessionMid)),
    feedbackResolutionRate: fixTotal > 0 ? Math.round((fixFollowedByImprovement / fixTotal) * 100) : null,
    fixTotal,
    fixResolved: fixFollowedByImprovement,
  }
}

// ===================== SECTION 3: PATTERNS =====================

function computePatterns(outputs) {
  const winningPrompts = outputs.filter((o) => o.feedback === 'up').map((o) => o.finalPromptSent || '')
  const rejectedPrompts = outputs.filter((o) => o.feedback === 'down').map((o) => o.finalPromptSent || '')

  const tokenize = (text) => text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w))

  const freqMap = (prompts) => {
    const freq = new Map()
    for (const p of prompts) {
      const words = new Set(tokenize(p)) // unique per prompt to avoid length bias
      for (const w of words) freq.set(w, (freq.get(w) || 0) + 1)
    }
    return freq
  }

  const winFreq = freqMap(winningPrompts)
  const rejectFreq = freqMap(rejectedPrompts)

  // Distinctive words: appear in one group significantly more than the other
  const winningWords = [...winFreq.entries()]
    .filter(([w, count]) => count >= 2 && count > (rejectFreq.get(w) || 0) * 1.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count, total: winningPrompts.length }))

  const rejectedWords = [...rejectFreq.entries()]
    .filter(([w, count]) => count >= 2 && count > (winFreq.get(w) || 0) * 1.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count, total: rejectedPrompts.length }))

  // Most common fix requests
  const fixTexts = outputs
    .filter((o) => o.notesFix && o.notesFix.trim().length > 5)
    .map((o) => o.notesFix.trim().slice(0, 100))
  const fixFreq = new Map()
  for (const t of fixTexts) {
    const key = t.toLowerCase().slice(0, 60)
    fixFreq.set(key, { count: (fixFreq.get(key)?.count || 0) + 1, text: t })
  }
  const topFixes = [...fixFreq.values()].sort((a, b) => b.count - a.count).slice(0, 8)

  // Most common keep directives
  const keepTexts = outputs
    .filter((o) => o.notesKeep && o.notesKeep.trim().length > 5)
    .map((o) => o.notesKeep.trim().slice(0, 100))
  const keepFreq = new Map()
  for (const t of keepTexts) {
    const key = t.toLowerCase().slice(0, 60)
    keepFreq.set(key, { count: (keepFreq.get(key)?.count || 0) + 1, text: t })
  }
  const topKeeps = [...keepFreq.values()].sort((a, b) => b.count - a.count).slice(0, 8)

  return { winningWords, rejectedWords, topFixes, topKeeps }
}

// ===================== SECTION 4: PROJECTS =====================

function computeProjects(projects, outputs, winners, sessions) {
  const activeProjects = projects.filter((p) => !p.archived)

  return activeProjects.map((project) => {
    const projOutputs = outputs.filter((o) => o.projectId === project.id)
    const projWinners = winners.filter((w) => w.projectId === project.id)
    const projSessions = sessions.filter((s) => s.projectId === project.id)

    const reviewed = projOutputs.filter((o) => o.feedback === 'up' || o.feedback === 'down')
    const thumbsUp = projOutputs.filter((o) => o.feedback === 'up').length
    const winRate = reviewed.length > 0 ? Math.round((thumbsUp / reviewed.length) * 100) : null

    let totalCost = 0
    for (const o of projOutputs) {
      const c = estimateCost(o)
      if (c !== null) totalCost += c
    }

    // Convergence for this project
    const convergences = []
    for (const s of projSessions) {
      const sessionWinnerOutputIds = new Set(projWinners.filter((w) => w.sessionId === s.id).map((w) => w.outputId))
      if (sessionWinnerOutputIds.size === 0) continue
      const ids = [...(s.outputIds || [])].reverse()
      let attempts = 0
      for (const oid of ids) {
        attempts++
        if (sessionWinnerOutputIds.has(oid)) break
      }
      convergences.push(attempts)
    }
    const avgConvergence = convergences.length > 0 ? Math.round(convergences.reduce((a, b) => a + b, 0) / convergences.length) : null

    return {
      id: project.id,
      name: project.name,
      totalOutputs: projOutputs.length,
      totalWinners: projWinners.length,
      winRate,
      totalCost,
      avgConvergence,
      lastActivity: project.updatedAt || project.createdAt,
    }
  })
    .filter((p) => p.totalOutputs > 0)
    .sort((a, b) => (b.winRate || 0) - (a.winRate || 0))
}

// ===================== SECTION 5: MODELS =====================

function computeModels(outputs, winners) {
  const modelMap = new Map()

  for (const o of outputs) {
    const model = o.model || 'unknown'
    if (!modelMap.has(model)) modelMap.set(model, { total: 0, up: 0, down: 0, cost: 0, duration: 0, durationCount: 0, winners: 0 })
    const m = modelMap.get(model)
    m.total++
    if (o.feedback === 'up') m.up++
    if (o.feedback === 'down') m.down++
    const c = estimateCost(o)
    if (c !== null) m.cost += c
    if (o.metadata?.durationMs) { m.duration += o.metadata.durationMs; m.durationCount++ }
  }

  for (const w of winners) {
    const model = w.model || 'unknown'
    if (modelMap.has(model)) modelMap.get(model).winners++
  }

  return [...modelMap.entries()].map(([model, m]) => {
    const reviewed = m.up + m.down
    return {
      model,
      displayName: model.includes('pro') ? 'Pro' : model.includes('flash') ? 'Flash' : model,
      total: m.total,
      winRate: reviewed > 0 ? Math.round((m.up / reviewed) * 100) : null,
      totalCost: m.cost,
      costPerWinner: m.winners > 0 ? m.cost / m.winners : null,
      avgDuration: m.durationCount > 0 ? Math.round(m.duration / m.durationCount / 1000) : null, // seconds
      winners: m.winners,
    }
  }).sort((a, b) => b.total - a.total)
}

// ===================== SECTION 6: COSTS =====================

function computeCosts(outputs, projects, winners) {
  let totalSpend = 0
  let costedCount = 0
  for (const o of outputs) {
    const c = estimateCost(o)
    if (c !== null) { totalSpend += c; costedCount++ }
  }

  const totalWinners = winners.length
  const costPerWinner = totalWinners > 0 ? totalSpend / totalWinners : null

  // Per-project costs
  const projectCosts = new Map()
  for (const o of outputs) {
    const c = estimateCost(o)
    if (c === null) continue
    projectCosts.set(o.projectId, (projectCosts.get(o.projectId) || 0) + c)
  }

  const projectCostList = [...projectCosts.entries()]
    .map(([projectId, cost]) => {
      const project = projects.find((p) => p.id === projectId)
      return { projectId, name: project?.name || 'Unknown', cost }
    })
    .sort((a, b) => b.cost - a.cost)

  // Cost trend: first half vs second half
  const sorted = outputs.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  const mid = Math.floor(sorted.length / 2)
  const earlyCost = sorted.slice(0, mid).reduce((sum, o) => sum + (estimateCost(o) || 0), 0)
  const recentCost = sorted.slice(mid).reduce((sum, o) => sum + (estimateCost(o) || 0), 0)

  return {
    totalSpend,
    costedCount,
    costPerWinner,
    projectCosts: projectCostList,
    earlyCost,
    recentCost,
  }
}
