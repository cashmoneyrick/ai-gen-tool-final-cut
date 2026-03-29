/**
 * Shared source pipeline for plan context.
 * Single source of truth for filtering, excluding, sorting, and capping
 * plan sources. Used by both the PlanSources inspector and handleGeneratePlan.
 */

export const CAPS = {
  memory: 12,
  doc: 6,
  sharedMemory: 8,
  sharedDoc: 4,
}

export const TEXT_LIMITS = {
  memory: 200,
  doc: 500,
  sharedMemory: 200,
  sharedDoc: 500,
}

/**
 * Sort: pinned first, then by createdAt descending.
 */
function pinnedFirstRecent(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return b.createdAt - a.createdAt
}

/**
 * Build the plan-ready source list for one category.
 *
 * @param {Array} items - active items for this category
 * @param {Set} excludedKeys - typed exclude keys like "memory:<id>"
 * @param {string} keyPrefix - "memory" | "doc" | "sharedMemory" | "sharedDoc"
 * @returns {{ included: Array, excluded: Array, overCap: Array, cap: number }}
 *   - included: items that will be sent (after exclude + sort + cap)
 *   - excluded: items removed by per-run override
 *   - overCap: items that are included but cut by the cap
 *   - cap: the cap value for this category
 */
export function buildSourceList(items, excludedKeys, keyPrefix) {
  const cap = CAPS[keyPrefix]

  const excluded = []
  const available = []

  for (const item of items) {
    const key = `${keyPrefix}:${item.id}`
    if (excludedKeys.has(key)) {
      excluded.push(item)
    } else {
      available.push(item)
    }
  }

  // Sort available: pinned first, then recent
  available.sort(pinnedFirstRecent)

  const included = available.slice(0, cap)
  const overCap = available.slice(cap)

  return { included, excluded, overCap, cap }
}

/**
 * Build the full plan source set for all 4 categories.
 *
 * @param {object} params
 * @param {Array} params.memories - active project memories
 * @param {Array} params.docs - active project docs
 * @param {Array} params.sharedMemories - shared memories active in this project
 * @param {Array} params.sharedDocs - shared docs active in this project
 * @param {Set} params.excludedKeys - typed exclude keys
 * @returns {object} - { memory, doc, sharedMemory, sharedDoc } each with { included, excluded, overCap, cap }
 */
export function buildAllSourceLists({ memories, docs, sharedMemories, sharedDocs, excludedKeys }) {
  return {
    memory: buildSourceList(memories, excludedKeys, 'memory'),
    doc: buildSourceList(docs, excludedKeys, 'doc'),
    sharedMemory: buildSourceList(sharedMemories, excludedKeys, 'sharedMemory'),
    sharedDoc: buildSourceList(sharedDocs, excludedKeys, 'sharedDoc'),
  }
}

/**
 * Build the plan payload from source lists (for API call).
 * Trims text to limits.
 */
export function buildPlanPayload(sourceLists) {
  return {
    memories: sourceLists.memory.included.map((m) => ({
      type: m.type,
      text: m.text.slice(0, TEXT_LIMITS.memory),
      pinned: m.pinned,
      source: m.source,
    })),
    docs: sourceLists.doc.included.map((d) => ({
      title: d.title,
      type: d.type,
      text: d.text.slice(0, TEXT_LIMITS.doc),
      pinned: d.pinned,
    })),
    sharedMemories: sourceLists.sharedMemory.included.map((m) => ({
      type: m.type,
      text: m.text.slice(0, TEXT_LIMITS.sharedMemory),
      pinned: m.pinned,
    })),
    sharedDocs: sourceLists.sharedDoc.included.map((d) => ({
      title: d.title,
      type: d.type,
      text: d.text.slice(0, TEXT_LIMITS.sharedDoc),
      pinned: d.pinned,
    })),
  }
}

/**
 * Build a snapshot of what was actually sent (for post-plan display).
 */
export function buildSourceSnapshot(sourceLists, excludedKeysSize) {
  return {
    memories: sourceLists.memory.included.map((m) => ({
      type: m.type,
      text: m.text.slice(0, 60),
      pinned: m.pinned,
    })),
    docs: sourceLists.doc.included.map((d) => ({
      title: d.title,
      type: d.type,
      pinned: d.pinned,
    })),
    sharedMemories: sourceLists.sharedMemory.included.map((m) => ({
      type: m.type,
      text: m.text.slice(0, 60),
      pinned: m.pinned,
    })),
    sharedDocs: sourceLists.sharedDoc.included.map((d) => ({
      title: d.title,
      type: d.type,
      pinned: d.pinned,
    })),
    excludedCount: excludedKeysSize,
  }
}
