/**
 * Live Sync — file watcher + SSE endpoint.
 *
 * Watches data/*.json for changes and pushes notifications
 * to all connected browser clients via Server-Sent Events.
 *
 * Any write source (CLI operator, API, manual edit) triggers
 * an automatic refresh in the browser — no manual Sync needed.
 */

import { watch } from 'node:fs'
import { join, basename } from 'node:path'

const DATA_DIR = join(process.cwd(), 'data')

// Connected SSE clients
const clients = new Set()

// Debounce per-file to avoid duplicate events from atomic write (tmp+rename)
const debounceTimers = new Map()
const DEBOUNCE_MS = 300

// Suppress live-sync for stores recently written by the browser API.
// This prevents the browser from reloading its own writes.
const suppressedStores = new Map()
const SUPPRESS_MS = 1500

export function suppressLiveSyncFor(store) {
  suppressedStores.set(store, Date.now())
  // Auto-clear after SUPPRESS_MS
  setTimeout(() => suppressedStores.delete(store), SUPPRESS_MS)
}

function notifyClients(store) {
  // Skip if this write was triggered by the browser API
  const suppressedAt = suppressedStores.get(store)
  if (suppressedAt && Date.now() - suppressedAt < SUPPRESS_MS) {
    return
  }

  const payload = `data: ${JSON.stringify({ store, ts: Date.now() })}\n\n`
  for (const res of clients) {
    try {
      res.write(payload)
    } catch {
      clients.delete(res)
    }
  }
}

// Start watching data/ directory
let watcher = null

export function startFileWatcher() {
  if (watcher) return

  watcher = watch(DATA_DIR, (eventType, filename) => {
    if (!filename || !filename.endsWith('.json')) return
    // Ignore tmp files from atomic writes
    if (filename.includes('.tmp.')) return

    const store = basename(filename, '.json')

    // Debounce — coalesce rapid events from the same file
    if (debounceTimers.has(store)) {
      clearTimeout(debounceTimers.get(store))
    }
    debounceTimers.set(
      store,
      setTimeout(() => {
        debounceTimers.delete(store)
        notifyClients(store)
      }, DEBOUNCE_MS)
    )
  })

  console.log('[live-sync] watching data/ for changes')
}

/**
 * SSE middleware handler.
 * Mount at /api/live-sync on the Vite dev server.
 */
export function handleLiveSync(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  // Send initial heartbeat so client knows connection is live
  res.write('data: {"connected":true}\n\n')

  clients.add(res)

  // Keep-alive ping every 30s to prevent proxy/browser timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      clearInterval(heartbeat)
      clients.delete(res)
    }
  }, 30_000)

  req.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(res)
  })
}
