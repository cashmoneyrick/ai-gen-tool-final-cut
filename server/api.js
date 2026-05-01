/**
 * CRUD API router for shared JSON storage.
 * Designed as Vite dev-server middleware.
 *
 * Routes:
 *   GET    /api/store/:store              → getAll
 *   GET    /api/store/:store/:id          → get by id
 *   POST   /api/store/:store              → put (upsert single record)
 *   POST   /api/store/:store/batch        → putMany
 *   DELETE /api/store/:store/:id          → delete by id
 *   DELETE /api/store/:store              → clearStore
 *   GET    /api/store/:store/by/:idx/:val → getAllByIndex
 *
 *   GET    /api/meta/active-project       → get active project id
 *   PUT    /api/meta/active-project       → set active project id
 *
 *   POST   /api/migrate                   → bulk import from IndexedDB dump
 */

import { writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import * as storage from './storage.js'
import { suppressLiveSyncFor } from './live-sync.js'
import { readBrief, updateBriefNotes, generateProjectBrief, generateGlobalState, readGlobalState, updateVocabulary, saveRefAnalysis, mineBrandDNA, generateRecommendations, saveTemplate, listTemplates, getTemplate, applyTemplate, deleteTemplate } from '../operator/analyze.js'
import { DEFAULT_IMAGE_MODEL } from '../src/modelConfig.js'

function sendJSON(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

function sendError(res, status, message) {
  sendJSON(res, status, { error: message })
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString())
}

// --- Image serving route ---
function handleImageRoute(req, res) {
  if (req.method !== 'GET') return sendError(res, 405, 'GET only')
  const imgUrl = req.url.split('?')[0]
  const outputId = imgUrl.slice('/api/images/'.length)
  if (!outputId) return sendError(res, 400, 'Missing output ID')

  const imageFile = storage.readImageFile(outputId)
  if (imageFile) {
    res.statusCode = 200
    res.setHeader('Content-Type', imageFile.mimeType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.end(imageFile.buffer)
    return
  }

  // Fallback: inline dataUrl on the output record (pre-migration)
  const output = storage.get('outputs', outputId)
  if (output?.dataUrl) {
    const match = output.dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
    if (match) {
      res.statusCode = 200
      res.setHeader('Content-Type', match[1])
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.end(Buffer.from(match[2], 'base64'))
      return
    }
  }

  return sendError(res, 404, 'Image not found')
}

/**
 * Parse a URL path relative to /api/store/ or /api/meta/ or /api/migrate.
 * Returns { type, parts } where type is 'store', 'meta', or 'migrate'.
 */
function parseRoute(url) {
  // Strip query string
  const path = url.split('?')[0]

  if (path === '/api/migrate') {
    return { type: 'migrate', parts: [] }
  }

  if (path.startsWith('/api/meta/')) {
    const rest = path.slice('/api/meta/'.length)
    return { type: 'meta', parts: rest.split('/').filter(Boolean) }
  }

  if (path.startsWith('/api/store/')) {
    const rest = path.slice('/api/store/'.length)
    return { type: 'store', parts: rest.split('/').filter(Boolean) }
  }

  return null
}

// --- Store route handler ---

async function handleStoreRoute(req, res, parts) {
  const storeName = parts[0]
  if (!storeName || !storage.isValidStore(storeName)) {
    return sendError(res, 400, `Invalid store: ${storeName}`)
  }

  // GET /api/store/:store/by/:idx/:val
  if (parts[1] === 'by' && parts[2] && parts[3] !== undefined) {
    if (req.method !== 'GET') return sendError(res, 405, 'GET only for index queries')
    const indexName = parts[2]
    const value = decodeURIComponent(parts[3])
    const validIndexes = storage.getValidIndexes(storeName)
    if (!validIndexes.includes(indexName)) {
      return sendError(res, 400, `Invalid index "${indexName}" for store "${storeName}"`)
    }
    try {
      const results = storage.getAllByIndex(storeName, indexName, value)
      return sendJSON(res, 200, results)
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }

  // POST /api/store/:store/batch
  if (parts[1] === 'batch') {
    if (req.method !== 'POST') return sendError(res, 405, 'POST only for batch')
    try {
      const records = await readBody(req)
      if (!Array.isArray(records)) return sendError(res, 400, 'Body must be an array')
      suppressLiveSyncFor(storeName)
      storage.putMany(storeName, records)
      return sendJSON(res, 200, { ok: true, count: records.length })
    } catch (err) {
      return sendError(res, 400, err.message)
    }
  }

  const id = parts[1] ? decodeURIComponent(parts[1]) : null

  switch (req.method) {
    case 'GET': {
      if (id) {
        const record = storage.get(storeName, id)
        if (!record) return sendError(res, 404, 'Not found')
        return sendJSON(res, 200, record)
      }
      const all = storage.getAll(storeName)
      if (storeName === 'outputs') {
        return sendJSON(res, 200, all.map(({ dataUrl, ...rest }) => rest))
      }
      return sendJSON(res, 200, all)
    }

    case 'POST': {
      try {
        const record = await readBody(req)
        if (!record || !record.id) return sendError(res, 400, 'Record must have an id field')
        suppressLiveSyncFor(storeName)
        storage.put(storeName, record)
        return sendJSON(res, 200, { ok: true })
      } catch (err) {
        return sendError(res, 400, err.message)
      }
    }

    case 'DELETE': {
      if (id) {
        suppressLiveSyncFor(storeName)
        storage.del(storeName, id)
        return sendJSON(res, 200, { ok: true })
      }
      // DELETE without id = clearStore
      suppressLiveSyncFor(storeName)
      storage.clearStore(storeName)
      return sendJSON(res, 200, { ok: true })
    }

    default:
      return sendError(res, 405, `Method ${req.method} not allowed`)
  }
}

// --- Meta route handler ---

async function handleMetaRoute(req, res, parts) {
  const key = parts[0]
  if (key !== 'active-project') {
    return sendError(res, 400, `Unknown meta key: ${key}`)
  }

  if (req.method === 'GET') {
    const id = storage.getActiveProject()
    return sendJSON(res, 200, { activeProjectId: id })
  }

  if (req.method === 'PUT') {
    try {
      const body = await readBody(req)
      if (!body.activeProjectId) return sendError(res, 400, 'Missing activeProjectId')
      storage.setActiveProject(body.activeProjectId)
      return sendJSON(res, 200, { ok: true })
    } catch (err) {
      return sendError(res, 400, err.message)
    }
  }

  return sendError(res, 405, `Method ${req.method} not allowed`)
}

// --- Migrate route handler ---

async function handleMigrateRoute(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'POST only')
  }
  try {
    const dump = await readBody(req)
    const result = storage.migrateAll(dump)
    return sendJSON(res, 200, { ok: true, ...result })
  } catch (err) {
    return sendError(res, 500, err.message)
  }
}

// --- Handoff route handler ---
// Writes a minimal decision JSON to data/handoff.json for operator/run.js --decision-file

const HANDOFF_FILE = join(process.cwd(), 'data', 'handoff.json')
const BASELINES_FILE = join(process.cwd(), 'data', 'handoff-baselines.json')

function readBaselines() {
  try {
    if (existsSync(BASELINES_FILE)) return JSON.parse(readFileSync(BASELINES_FILE, 'utf-8'))
  } catch {}
  return {}
}

function writeBaselines(baselines) {
  const tmp = join(process.cwd(), 'data', `handoff-baselines.tmp.${randomUUID()}.json`)
  writeFileSync(tmp, JSON.stringify(baselines, null, 2), 'utf-8')
  renameSync(tmp, BASELINES_FILE)
}

async function handleHandoffRoute(req, res) {
  if (req.method === 'GET') {
    try {
      if (existsSync(HANDOFF_FILE)) {
        const data = JSON.parse(readFileSync(HANDOFF_FILE, 'utf-8'))
        return sendJSON(res, 200, data)
      }
      return sendJSON(res, 200, null)
    } catch {
      return sendJSON(res, 200, null)
    }
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req)
      // Write decision handoff for operator
      const tmp = join(process.cwd(), 'data', `handoff.tmp.${randomUUID()}.json`)
      writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf-8')
      renameSync(tmp, HANDOFF_FILE)
      // Also persist per-project review baseline
      if (body.projectId && body.reviewSnapshot) {
        const baselines = readBaselines()
        baselines[body.projectId] = body.reviewSnapshot
        writeBaselines(baselines)
      }
      return sendJSON(res, 200, { ok: true, path: 'data/handoff.json' })
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }
  return sendError(res, 405, 'GET or POST only')
}

// Per-project baseline endpoint
async function handleBaselineRoute(req, res, projectId) {
  if (req.method === 'GET') {
    const baselines = readBaselines()
    return sendJSON(res, 200, baselines[projectId] || null)
  }
  return sendError(res, 405, 'GET only')
}

// --- Generation restrictions handler ---
// Tracks which settings have failed so UI can grey them out

const RESTRICTIONS_FILE = join(process.cwd(), 'data', 'generation-restrictions.json')

function readRestrictions() {
  try {
    if (existsSync(RESTRICTIONS_FILE)) return JSON.parse(readFileSync(RESTRICTIONS_FILE, 'utf-8'))
  } catch {}
  return { restrictions: [], updatedAt: null }
}

function writeRestrictions(data) {
  const tmp = join(process.cwd(), 'data', `restrictions.tmp.${randomUUID()}.json`)
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, RESTRICTIONS_FILE)
}

async function handleRestrictionsRoute(req, res) {
  if (req.method === 'GET') {
    return sendJSON(res, 200, readRestrictions())
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req)
      // body: { restriction: { setting, value, model, error } }
      if (body.restriction) {
        const current = readRestrictions()
        // Avoid duplicates
        const exists = current.restrictions.some((r) =>
          r.setting === body.restriction.setting &&
          r.value === body.restriction.value &&
          r.model === body.restriction.model
        )
        if (!exists) {
          current.restrictions.push({ ...body.restriction, createdAt: Date.now() })
          current.updatedAt = Date.now()
          writeRestrictions(current)
        }
      }
      return sendJSON(res, 200, { ok: true })
    } catch (err) {
      return sendError(res, 400, err.message)
    }
  }
  if (req.method === 'DELETE') {
    // Clear all restrictions (user upgraded API key)
    writeRestrictions({ restrictions: [], updatedAt: Date.now() })
    return sendJSON(res, 200, { ok: true })
  }
  return sendError(res, 405, 'GET, POST, or DELETE')
}

// --- Operator trigger handler ---
// Spawns operator/run.js as a child process so the browser can trigger generation directly

let activeOperator = null

async function handleOperatorRun(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'POST only')

  if (activeOperator) {
    return sendJSON(res, 409, { error: 'Generation already in progress', running: true })
  }

  try {
    const body = await readBody(req)
    const projectId = body.projectId
    const model = body.model
    const promptPreview = body.promptPreview === true

    const args = ['--env-file=.env', 'operator/run.js']
    if (projectId) args.push('--project', projectId)
    if (model) args.push('--model', model)
    if (promptPreview) args.push('--prompt-preview')

    const child = spawn('node', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    activeOperator = child
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    child.on('close', (code) => {
      activeOperator = null
      // Write result for UI to poll
      const resultPath = join(process.cwd(), 'data', 'operator-result.json')
      const result = {
        exitCode: code,
        success: code === 0,
        stdout: stdout.slice(-2000),
        stderr: stderr.slice(-1000),
        completedAt: Date.now(),
      }
      try { writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8') } catch {}
    })

    return sendJSON(res, 200, { ok: true, message: 'Generation started' })
  } catch (err) {
    activeOperator = null
    return sendError(res, 500, err.message)
  }
}

async function handleOperatorStatus(req, res) {
  if (req.method !== 'GET') return sendError(res, 405, 'GET only')

  if (activeOperator) {
    // Include progress detail if available
    const progressPath = join(process.cwd(), 'data', 'operator-progress.json')
    let progress = null
    try {
      if (existsSync(progressPath)) progress = JSON.parse(readFileSync(progressPath, 'utf-8'))
    } catch {}
    return sendJSON(res, 200, { running: true, progress })
  }

  // Return last result
  const resultPath = join(process.cwd(), 'data', 'operator-result.json')
  try {
    if (existsSync(resultPath)) {
      const result = JSON.parse(readFileSync(resultPath, 'utf-8'))
      return sendJSON(res, 200, { running: false, ...result })
    }
  } catch {}
  return sendJSON(res, 200, { running: false })
}

// --- Operator feedback handler ---
// Saves verbal feedback from Claude Code to the most recently generated batch.
// Reads data/last-batch.json (written by run.js) to identify which outputs to update.

async function handleOperatorFeedback(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'POST only')

  let body
  try {
    body = await readBody(req)
  } catch {
    return sendError(res, 400, 'Invalid JSON body')
  }

  const { notesKeep, notesFix } = body
  if (!notesKeep && !notesFix) {
    return sendError(res, 400, 'Provide notesKeep, notesFix, or both')
  }

  const lastBatchPath = join(process.cwd(), 'data', 'last-batch.json')
  let lastBatch
  try {
    lastBatch = JSON.parse(readFileSync(lastBatchPath, 'utf-8'))
  } catch (err) {
    if (err.code === 'ENOENT') return sendError(res, 404, 'No recent batch found — run the operator first')
    return sendError(res, 500, err.message)
  }

  const { outputIds = [], sessionId, projectId, generatedAt } = lastBatch
  if (outputIds.length === 0) return sendError(res, 404, 'Last batch had no outputs')

  const updated = []
  for (const outputId of outputIds) {
    const output = storage.get('outputs', outputId)
    if (!output) continue
    storage.put('outputs', {
      ...output,
      ...(notesKeep !== undefined ? { batchNotesKeep: notesKeep } : {}),
      ...(notesFix !== undefined ? { batchNotesFix: notesFix } : {}),
    })
    updated.push(outputId)
  }

  return sendJSON(res, 200, {
    saved: true,
    outputIds: updated,
    count: updated.length,
    sessionId,
    projectId,
    batchGeneratedAt: generatedAt,
  })
}

async function handleOperatorAnnotation(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'POST only')

  let body
  try {
    body = await readBody(req)
  } catch {
    return sendError(res, 400, 'Invalid JSON body')
  }

  const { outputId, pass, note, category, readiness, score, reason } = body
  if (!outputId) return sendError(res, 400, 'outputId is required')

  const output = storage.get('outputs', outputId)
  if (!output) return sendError(res, 404, 'Output not found')

  const operatorReason = String(reason || note || '')
  const operatorScore = Number.isFinite(Number(score)) ? Number(score) : null
  const operatorReadiness = readiness ? String(readiness) : null

  storage.put('outputs', {
    ...output,
    operatorAnnotation: {
      pass: Boolean(pass),
      note: String(note || ''),
      category: String(category || 'other'),
    },
    operatorReview: {
      pass: Boolean(pass),
      readiness: operatorReadiness,
      score: operatorScore,
      reason: operatorReason,
      category: String(category || 'other'),
      updatedAt: Date.now(),
    },
  })

  return sendJSON(res, 200, { ok: true, outputId })
}

async function handleAnnotationCorrection(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'POST only')

  let body
  try {
    body = await readBody(req)
  } catch {
    return sendError(res, 400, 'Invalid JSON body')
  }

  const { outputId, corrected, reason } = body
  if (!outputId) return sendError(res, 400, 'outputId is required')

  const output = storage.get('outputs', outputId)
  if (!output) return sendError(res, 404, 'Output not found')

  storage.put('outputs', {
    ...output,
    annotationCorrection: {
      corrected: Boolean(corrected),
      reason: String(reason || ''),
      correctedAt: Date.now(),
    },
  })

  return sendJSON(res, 200, { ok: true, outputId })
}

// --- Session end marker handler ---
// Operator reads this to trigger auto-distillation

async function handleSessionEndRoute(req, res) {
  const filePath = join(process.cwd(), 'data', 'session-end.json')
  if (req.method === 'POST') {
    try {
      const body = await readBody(req)
      writeFileSync(filePath, JSON.stringify(body, null, 2))
      return sendJSON(res, 200, { ok: true })
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }
  if (req.method === 'GET') {
    try {
      if (!existsSync(filePath)) return sendJSON(res, 200, null)
      return sendJSON(res, 200, JSON.parse(readFileSync(filePath, 'utf8')))
    } catch {
      return sendJSON(res, 200, null)
    }
  }
  return sendError(res, 405, 'GET or POST only')
}

// --- Main middleware entry point ---

/* ── Lightweight project stats (no base64 sent to client) ── */

const PRICING_SERVER = {
  'gemini-2.5-flash-image': { inputPerM: 0.50, imageOutputPerM: 60.00 },
  'gemini-3.1-flash-image-preview': { inputPerM: 0.50, imageOutputPerM: 60.00 },
  'gemini-3-pro-image-preview': { inputPerM: 2.00, imageOutputPerM: 120.00 },
}
const DEFAULT_PRICING_SERVER = PRICING_SERVER[DEFAULT_IMAGE_MODEL]

function estimateCostServer(output) {
  const tokens = output?.metadata?.tokenUsage
  if (!tokens || (!tokens.total && !tokens.prompt && !tokens.output)) return 0
  const pricing = PRICING_SERVER[output.model] || DEFAULT_PRICING_SERVER
  return ((tokens.prompt || 0) / 1e6) * pricing.inputPerM +
         ((tokens.output || 0) / 1e6) * pricing.imageOutputPerM
}

function handleProjectStats(req, res) {
  if (req.method !== 'GET') return sendJSON(res, 405, { error: 'GET only' })
  const projects = storage.getAll('projects')
  const sessions = storage.getAll('sessions')
  // Read outputs ONCE (212MB), group by sessionId
  const allOutputs = storage.getAll('outputs')
  const outputsBySession = new Map()
  for (const o of allOutputs) {
    const sid = o.sessionId
    if (!sid) continue
    if (!outputsBySession.has(sid)) outputsBySession.set(sid, [])
    outputsBySession.get(sid).push(o)
  }
  // Build session → project mapping
  const sessionToProject = new Map()
  for (const s of sessions) sessionToProject.set(s.id, s.projectId)
  // Compute stats per project
  const stats = {}
  for (const p of projects) stats[p.id] = { outputCount: 0, totalCost: 0 }
  for (const [sid, outputs] of outputsBySession) {
    const pid = sessionToProject.get(sid)
    if (!pid || !stats[pid]) continue
    stats[pid].outputCount += outputs.length
    for (const o of outputs) stats[pid].totalCost += estimateCostServer(o)
  }
  return sendJSON(res, 200, stats)
}

// --- Upscale queue handler ---

const UPSCALE_QUEUE_FILE = join(process.cwd(), 'data', 'upscale-queue.json')

async function handleUpscaleQueueRoute(req, res) {
  if (req.method === 'GET') {
    try {
      if (!existsSync(UPSCALE_QUEUE_FILE)) return sendJSON(res, 200, [])
      const data = JSON.parse(readFileSync(UPSCALE_QUEUE_FILE, 'utf8'))
      return sendJSON(res, 200, data)
    } catch {
      return sendJSON(res, 200, [])
    }
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req)
      writeFileSync(UPSCALE_QUEUE_FILE, JSON.stringify(body, null, 2))
      return sendJSON(res, 200, { ok: true })
    } catch (err) {
      return sendJSON(res, 500, { error: err.message })
    }
  }
  return sendError(res, 405, 'GET or POST only')
}

// --- Brief route handler ---

async function handleBriefRoute(req, res, projectId) {
  if (req.method === 'GET') {
    try {
      const brief = readBrief(projectId)
      return sendJSON(res, 200, brief)
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req)
      updateBriefNotes(projectId, body.liked || [], body.hated || [])
      return sendJSON(res, 200, { ok: true })
    } catch (err) {
      return sendError(res, 400, err.message)
    }
  }
  return sendError(res, 405, 'GET or POST only')
}

// --- Analyze route handler ---

async function handleAnalyzeRoute(req, res, projectId) {
  if (req.method === 'GET') {
    try {
      const brief = readBrief(projectId)
      return sendJSON(res, 200, brief)
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }
  if (req.method === 'POST') {
    try {
      const brief = await generateProjectBrief(projectId)
      const globalState = await generateGlobalState()
      return sendJSON(res, 200, { brief, globalState })
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }
  return sendError(res, 405, 'GET or POST only')
}

// --- Global state route handler ---

async function handleGlobalStateRoute(req, res) {
  if (req.method !== 'GET') return sendError(res, 405, 'GET only')
  try {
    const state = readGlobalState()
    return sendJSON(res, 200, state)
  } catch (err) {
    return sendError(res, 500, err.message)
  }
}

// --- Vocabulary route handler ---

async function handleVocabularyRoute(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'POST only')
  try {
    const body = await readBody(req)
    updateVocabulary(body.term, body.meaning)
    return sendJSON(res, 200, { ok: true })
  } catch (err) {
    return sendError(res, 400, err.message)
  }
}

// --- Ref analysis route handler ---

async function handleRefAnalysisRoute(req, res, refId) {
  if (req.method === 'GET') {
    const ref = storage.get('refs', refId)
    if (!ref) return sendError(res, 404, 'Ref not found')
    return sendJSON(res, 200, ref.analysis || null)
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req)
      if (!body.analysis) return sendError(res, 400, 'Missing analysis field')
      const updated = saveRefAnalysis(refId, body.analysis)
      if (!updated) return sendError(res, 404, 'Ref not found')
      return sendJSON(res, 200, { ok: true, analysis: updated.analysis })
    } catch (err) {
      return sendError(res, 400, err.message)
    }
  }
  return sendError(res, 405, 'GET or POST only')
}

// --- Template routes ---
async function handleTemplateRoute(req, res, templateId) {
  if (req.method === 'GET') {
    if (templateId) {
      const template = getTemplate(templateId)
      return sendJSON(res, 200, template)
    }
    // List all, optionally filtered by projectId query param
    const url = new URL(req.url, 'http://localhost')
    const projectId = url.searchParams.get('projectId')
    return sendJSON(res, 200, listTemplates(projectId))
  }
  if (req.method === 'POST') {
    try {
      const body = await readBody(req)
      if (templateId === 'apply') {
        // POST /api/templates/apply — apply a template with variable values
        const result = applyTemplate(body.templateId, body.variables || {})
        if (!result) return sendError(res, 404, 'Template not found')
        return sendJSON(res, 200, result)
      }
      // POST /api/templates — create new template
      const template = saveTemplate(body)
      return sendJSON(res, 200, template)
    } catch (err) {
      return sendError(res, 400, err.message)
    }
  }
  if (req.method === 'DELETE' && templateId) {
    const deleted = deleteTemplate(templateId)
    return sendJSON(res, 200, { ok: deleted })
  }
  return sendError(res, 405, 'Method not allowed')
}

// --- Recommendations route ---
async function handleRecommendationsRoute(req, res, projectId) {
  if (req.method !== 'GET') return sendError(res, 405, 'GET only')
  try {
    const recs = generateRecommendations(projectId)
    return sendJSON(res, 200, { recommendations: recs })
  } catch (err) {
    return sendError(res, 500, err.message)
  }
}

// --- Brand DNA route ---
async function handleBrandDNARoute(req, res) {
  if (req.method !== 'GET') return sendError(res, 405, 'GET only')
  try {
    const dna = mineBrandDNA()
    return sendJSON(res, 200, dna)
  } catch (err) {
    return sendError(res, 500, err.message)
  }
}

// --- One-time collection migration: lift session fields onto project records ---

const EMPTY_BUCKETS_MIGRATE = { subject: '', style: '', lighting: '', composition: '', technical: '' }

function mergeIds(projectIds, sessionIds) {
  const seen = new Set(projectIds || [])
  const result = [...(projectIds || [])]
  for (const id of (sessionIds || [])) {
    if (!seen.has(id)) { seen.add(id); result.push(id) }
  }
  return result
}

export function runCollectionMigration() {
  const projects = storage.getAll('projects')
  const sessions = storage.getAll('sessions')
  const sessionByProject = new Map(sessions.map(s => [s.projectId, s]))

  let migrated = 0
  for (const project of projects) {
    if (project._sessionMigrated) continue
    const session = sessionByProject.get(project.id)
    if (!session) {
      storage.put('projects', { ...project, _sessionMigrated: true })
      migrated++
      continue
    }
    storage.put('projects', {
      ...project,
      goal: project.goal ?? session.goal ?? '',
      buckets: project.buckets ?? session.buckets ?? { ...EMPTY_BUCKETS_MIGRATE },
      assembledPrompt: project.assembledPrompt ?? session.assembledPrompt ?? '',
      assembledPromptDirty: project.assembledPromptDirty ?? session.assembledPromptDirty ?? false,
      roughNotes: project.roughNotes ?? session.roughNotes ?? '',
      lockedElementIds: mergeIds(project.lockedElementIds, session.lockedElementIds),
      refIds: mergeIds(project.refIds, session.refIds),
      outputIds: mergeIds(project.outputIds, session.outputIds),
      winnerIds: mergeIds(project.winnerIds, session.winnerIds),
      model: project.model ?? session.model ?? null,
      batchSize: project.batchSize ?? session.batchSize ?? 1,
      planStatus: project.planStatus ?? session.planStatus ?? 'idle',
      approvedPlan: project.approvedPlan ?? session.approvedPlan ?? null,
      promptPreviewMode: project.promptPreviewMode ?? session.promptPreviewMode ?? false,
      _sessionMigrated: true,
    })
    migrated++
  }
  if (migrated > 0) {
    console.log(`[migrate] Lifted ${migrated} session(s) into project records`)
  }
  return migrated
}

export function runRefMigration() {
  const refs = storage.getAll('refs')
  const sessions = storage.getAll('sessions')
  const sessionProjectMap = new Map(sessions.map(s => [s.id, s.projectId]))

  let migrated = 0
  for (const ref of refs) {
    if (ref.projectId) continue
    const projectId = sessionProjectMap.get(ref.sessionId)
    if (!projectId) continue
    storage.put('refs', {
      ...ref,
      projectId,
      refType: ref.refType || 'general',
    })
    migrated++
  }
  if (migrated > 0) {
    console.log(`[migrate] Backfilled projectId+refType on ${migrated} ref(s)`)
  }
  return migrated
}

// Run on startup
runCollectionMigration()
runRefMigration()

// --- Variation plan route handler ---

async function handleVariationPlanRoute(req, res, vpProjectId) {
  if (!vpProjectId) return sendError(res, 400, 'Missing projectId')

  if (req.method === 'GET') {
    const vpProject = storage.get('projects', vpProjectId)
    if (!vpProject) return sendError(res, 404, 'Project not found')
    return sendJSON(res, 200, vpProject.variationPlan || null)
  }

  if (req.method === 'POST') {
    try {
      const vpBody = await readBody(req)
      const vpProject = storage.get('projects', vpProjectId)
      if (!vpProject) return sendError(res, 404, 'Project not found')
      storage.put('projects', { ...vpProject, variationPlan: vpBody, updatedAt: Date.now() })
      return sendJSON(res, 200, { ok: true })
    } catch (err) {
      return sendError(res, 400, err.message)
    }
  }

  return sendError(res, 405, 'GET or POST only')
}

// --- Main middleware entry point ---

export function handleStoreAPI(req, res, next) {
  const route = parseRoute(req.url)

  // Handle /api/handoff separately (not a store route)
  const cleanUrl = req.url.split('?')[0]

  if (cleanUrl.startsWith('/api/images/')) {
    return handleImageRoute(req, res)
  }

  // Template, recommendations, and brand DNA routes
  if (cleanUrl === '/api/templates' || cleanUrl.startsWith('/api/templates/')) {
    const templateId = cleanUrl === '/api/templates' ? null : cleanUrl.slice('/api/templates/'.length)
    return handleTemplateRoute(req, res, templateId)
  }
  if (cleanUrl.startsWith('/api/recommendations/')) {
    const recProjectId = cleanUrl.slice('/api/recommendations/'.length)
    return handleRecommendationsRoute(req, res, recProjectId)
  }
  if (cleanUrl === '/api/brand-dna') {
    return handleBrandDNARoute(req, res)
  }

  // Analysis engine routes
  if (cleanUrl.startsWith('/api/briefs/')) {
    const briefProjectId = cleanUrl.slice('/api/briefs/'.length)
    return handleBriefRoute(req, res, briefProjectId)
  }
  if (cleanUrl.startsWith('/api/analyze/')) {
    const analyzeProjectId = cleanUrl.slice('/api/analyze/'.length)
    return handleAnalyzeRoute(req, res, analyzeProjectId)
  }
  if (cleanUrl === '/api/global-state') {
    return handleGlobalStateRoute(req, res)
  }
  if (cleanUrl === '/api/vocabulary') {
    return handleVocabularyRoute(req, res)
  }
  if (cleanUrl === '/api/project-stats') {
    return handleProjectStats(req, res)
  }
  if (cleanUrl === '/api/session-end') {
    return handleSessionEndRoute(req, res)
  }
  if (cleanUrl === '/api/upscale-queue') {
    return handleUpscaleQueueRoute(req, res)
  }
  if (cleanUrl === '/api/handoff') {
    return handleHandoffRoute(req, res)
  }
  if (cleanUrl === '/api/restrictions') {
    return handleRestrictionsRoute(req, res)
  }
  if (cleanUrl === '/api/operator/run') {
    return handleOperatorRun(req, res)
  }
  if (cleanUrl === '/api/operator/status') {
    return handleOperatorStatus(req, res)
  }
  if (cleanUrl === '/api/operator/feedback') {
    return handleOperatorFeedback(req, res)
  }
  if (cleanUrl.startsWith('/api/variation-plan/')) {
    const vpProjectId = cleanUrl.slice('/api/variation-plan/'.length)
    return handleVariationPlanRoute(req, res, vpProjectId)
  }
  if (cleanUrl === '/api/operator/annotation') {
    return handleOperatorAnnotation(req, res)
  }
  if (cleanUrl === '/api/operator/annotation-correction') {
    return handleAnnotationCorrection(req, res)
  }
  // Handle /api/handoff/baseline/:projectId
  const baselineMatch = cleanUrl.match(/^\/api\/handoff\/baseline\/(.+)$/)
  if (baselineMatch) {
    return handleBaselineRoute(req, res, baselineMatch[1])
  }

  // Ref analysis endpoint
  const refAnalysisMatch = cleanUrl.match(/^\/api\/ref-analysis\/(.+)$/)
  if (refAnalysisMatch) {
    return handleRefAnalysisRoute(req, res, refAnalysisMatch[1])
  }

  if (!route) return next()

  switch (route.type) {
    case 'store':
      return handleStoreRoute(req, res, route.parts)
    case 'meta':
      return handleMetaRoute(req, res, route.parts)
    case 'migrate':
      return handleMigrateRoute(req, res)
    default:
      return next()
  }
}
