/**
 * File-system JSON storage engine for shared persistence.
 * One JSON file per store in data/ directory.
 * Same logical API shape as the old IndexedDB wrapper (db.js).
 *
 * Each store file contains an array of records.
 * Index lookups scan the array and filter by field value.
 * Writes are atomic (write to temp file, then rename).
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const DATA_DIR = join(process.cwd(), 'data')
const IMAGES_DIR = join(DATA_DIR, 'images')

// --- Image file utilities ---

function ensureImagesDir() {
  if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true })
}

export function writeImageFile(outputId, mimeType, base64String) {
  ensureImagesDir()
  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  const filename = `${outputId}.${ext}`
  const filePath = join(IMAGES_DIR, filename)
  const tmp = join(IMAGES_DIR, `${outputId}.tmp.${randomUUID()}.${ext}`)
  writeFileSync(tmp, Buffer.from(base64String, 'base64'))
  renameSync(tmp, filePath)
  return `images/${filename}`
}

export function readImageFile(outputId) {
  for (const ext of ['jpg', 'png']) {
    const filePath = join(IMAGES_DIR, `${outputId}.${ext}`)
    if (existsSync(filePath)) {
      return {
        buffer: readFileSync(filePath),
        mimeType: ext === 'png' ? 'image/png' : 'image/jpeg',
        path: filePath,
      }
    }
  }
  return null
}

export function imageFileExists(outputId) {
  for (const ext of ['jpg', 'png']) {
    const filePath = join(IMAGES_DIR, `${outputId}.${ext}`)
    if (existsSync(filePath)) return filePath
  }
  return null
}

// Mirror the index config from src/storage/db.js STORES
const STORE_INDEXES = {
  projects: [],
  sessions: ['projectId'],
  refs: ['sessionId', 'projectId'],
  lockedElements: ['sessionId'],
  outputs: ['sessionId'],
  winners: ['sessionId'],
  memories: ['projectId'],
  docs: ['projectId'],
  suggestions: ['projectId', 'winnerId'],
  sharedMemories: [],
  sharedDocs: [],
  sharedActivations: ['projectId', 'sharedItemId'],
  planRuns: ['projectId', 'sessionId'],
  projectLessons: ['projectId'],
  knowledgeOverrides: ['projectId'],
  folders: ['projectId'],
  folderItems: ['folderId', 'outputId'],
}

const VALID_STORES = new Set(Object.keys(STORE_INDEXES))

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function storeFile(storeName) {
  return join(DATA_DIR, `${storeName}.json`)
}

function readStore(storeName) {
  const file = storeFile(storeName)
  if (!existsSync(file)) return []
  try {
    const raw = readFileSync(file, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeStore(storeName, records) {
  ensureDataDir()
  const file = storeFile(storeName)
  const tmp = join(DATA_DIR, `${storeName}.tmp.${randomUUID()}.json`)
  writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf-8')
  renameSync(tmp, file)
}

// --- Meta store (active project ID, etc.) ---

const META_FILE = join(DATA_DIR, 'meta.json')

function readMeta() {
  if (!existsSync(META_FILE)) return {}
  try {
    return JSON.parse(readFileSync(META_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function writeMeta(meta) {
  ensureDataDir()
  const tmp = join(DATA_DIR, `meta.tmp.${randomUUID()}.json`)
  writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf-8')
  renameSync(tmp, META_FILE)
}

// --- Public API (mirrors db.js shape) ---

export function isValidStore(name) {
  return VALID_STORES.has(name)
}

export function getValidIndexes(storeName) {
  return STORE_INDEXES[storeName] || []
}

export function put(storeName, record) {
  // Extract image data to file for outputs (keeps outputs.json small)
  if (storeName === 'outputs' && record.dataUrl && !record.imagePath) {
    const match = record.dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
    if (match) {
      record.imagePath = writeImageFile(record.id, match[1], match[2])
      delete record.dataUrl
    }
  }

  const records = readStore(storeName)
  const idx = records.findIndex((r) => r.id === record.id)

  let finalRecord = record

  // Sessions: union-merge array ID fields so a stale browser write never evicts
  // operator-written IDs. outputIds/winnerIds/refIds/lockedElementIds can only grow.
  if ((storeName === 'sessions' || storeName === 'projects') && idx >= 0) {
    const existing = records[idx]
    const arrayFields = ['outputIds', 'winnerIds', 'refIds', 'lockedElementIds']
    let merged = { ...record }
    for (const field of arrayFields) {
      if (Array.isArray(existing[field]) && Array.isArray(record[field])) {
        const incomingSet = new Set(record[field])
        const diskOnlyIds = existing[field].filter((id) => !incomingSet.has(id))
        if (diskOnlyIds.length > 0) {
          // Disk-only IDs (added by operator) go to the front — they are newer
          merged[field] = [...diskOnlyIds, ...record[field]]
        }
      }
    }
    finalRecord = merged
  }

  if (idx >= 0) {
    records[idx] = finalRecord
  } else {
    records.push(finalRecord)
  }
  writeStore(storeName, records)
}

export function get(storeName, id) {
  const records = readStore(storeName)
  return records.find((r) => r.id === id) || null
}

export function getAll(storeName) {
  return readStore(storeName)
}

export function getAllByIndex(storeName, indexName, value) {
  const validIndexes = getValidIndexes(storeName)
  if (!validIndexes.includes(indexName)) {
    throw new Error(`Invalid index "${indexName}" for store "${storeName}"`)
  }
  const records = readStore(storeName)
  return records.filter((r) => r[indexName] === value)
}

export function del(storeName, id) {
  const records = readStore(storeName)
  const filtered = records.filter((r) => r.id !== id)
  if (filtered.length !== records.length) {
    writeStore(storeName, filtered)
  }
}

export function clearStore(storeName) {
  writeStore(storeName, [])
}

export function putMany(storeName, newRecords) {
  // Extract image data to files for outputs
  if (storeName === 'outputs') {
    for (const rec of newRecords) {
      if (rec.dataUrl && !rec.imagePath) {
        const match = rec.dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
        if (match) {
          rec.imagePath = writeImageFile(rec.id, match[1], match[2])
          delete rec.dataUrl
        }
      }
    }
  }
  const records = readStore(storeName)
  const byId = new Map(records.map((r) => [r.id, r]))
  for (const rec of newRecords) {
    byId.set(rec.id, rec)
  }
  writeStore(storeName, Array.from(byId.values()))
}

// --- Meta operations ---

export function getActiveProject() {
  const meta = readMeta()
  return meta.activeProjectId || 'project-default'
}

export function setActiveProject(id) {
  const meta = readMeta()
  meta.activeProjectId = id
  writeMeta(meta)
}

// --- Bulk migrate (one-shot import from IndexedDB dump) ---

export function migrateAll(dump) {
  ensureDataDir()
  let storesWritten = 0
  for (const [storeName, records] of Object.entries(dump)) {
    if (storeName === 'activeProjectId') {
      setActiveProject(records)
      continue
    }
    if (!isValidStore(storeName)) continue
    if (!Array.isArray(records)) continue
    writeStore(storeName, records)
    storesWritten++
  }
  return { storesWritten }
}
