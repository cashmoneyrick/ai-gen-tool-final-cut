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

import { writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import * as storage from './storage.js'

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
      return sendJSON(res, 200, all)
    }

    case 'POST': {
      try {
        const record = await readBody(req)
        if (!record || !record.id) return sendError(res, 400, 'Record must have an id field')
        storage.put(storeName, record)
        return sendJSON(res, 200, { ok: true })
      } catch (err) {
        return sendError(res, 400, err.message)
      }
    }

    case 'DELETE': {
      if (id) {
        storage.del(storeName, id)
        return sendJSON(res, 200, { ok: true })
      }
      // DELETE without id = clearStore
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

async function handleHandoffRoute(req, res) {
  if (req.method === 'POST') {
    try {
      const body = await readBody(req)
      const tmp = join(process.cwd(), 'data', `handoff.tmp.${randomUUID()}.json`)
      writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf-8')
      renameSync(tmp, HANDOFF_FILE)
      return sendJSON(res, 200, { ok: true, path: 'data/handoff.json' })
    } catch (err) {
      return sendError(res, 500, err.message)
    }
  }
  return sendError(res, 405, 'POST only')
}

// --- Main middleware entry point ---

export function handleStoreAPI(req, res, next) {
  const route = parseRoute(req.url)

  // Handle /api/handoff separately (not a store route)
  if (req.url.split('?')[0] === '/api/handoff') {
    return handleHandoffRoute(req, res)
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
