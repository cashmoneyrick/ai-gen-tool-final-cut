/**
 * Project-aware persistence logic for Studio v1.
 * Step 12: supports multiple projects, each with one active session.
 */

import * as db from './db'
import { DEFAULT_IMAGE_MODEL } from '../modelConfig'
import { createId } from '../utils/id'

const DEFAULT_PROJECT_ID = 'project-default'
const DEFAULT_SESSION_ID = 'session-default'

const EMPTY_BUCKETS = {
  subject: '',
  style: '',
  lighting: '',
  composition: '',
  technical: '',
}

// --- Active project (server-side shared storage) ---

export async function getActiveProjectId() {
  try {
    const res = await fetch('/api/meta/active-project')
    if (res.ok) {
      const data = await res.json()
      return data.activeProjectId || DEFAULT_PROJECT_ID
    }
  } catch {
    // Fallback on network error
  }
  return DEFAULT_PROJECT_ID
}

export async function setActiveProjectId(id) {
  try {
    await fetch('/api/meta/active-project', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProjectId: id }),
    })
  } catch {
    // Fire-and-forget — log but don't break
    console.warn('[session] failed to persist active project id')
  }
}

// --- Project CRUD ---

export async function listProjects() {
  const all = await db.getAll('projects')
  // Sort by updatedAt desc (most recently used first)
  return all
    .filter((p) => !p.archived)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function createProject(name) {
  const projectId = createId()
  const sessionId = createId()
  const now = Date.now()

  const project = {
    id: projectId,
    name: name || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    archived: false,
    notes: '',
    defaultModel: null,
    // Collection-level fields (also on session for backward compat)
    goal: '',
    buckets: { ...EMPTY_BUCKETS },
    assembledPrompt: '',
    assembledPromptDirty: false,
    roughNotes: '',
    lockedElementIds: [],
    refIds: [],
    outputIds: [],
    winnerIds: [],
    model: DEFAULT_IMAGE_MODEL,
    batchSize: 1,
    planStatus: 'idle',
    approvedPlan: null,
    promptPreviewMode: false,
    _sessionMigrated: true,
  }

  const session = {
    id: sessionId,
    projectId,
    createdAt: now,
    updatedAt: now,
    title: '',
    goal: '',
    goalDirtyAfterApproval: false,
    planStatus: 'idle',
    approvedPlan: null,
    buckets: { ...EMPTY_BUCKETS },
    assembledPrompt: '',
    assembledPromptDirty: false,
    roughNotes: '',
    lockedElementIds: [],
    refIds: [],
    outputIds: [],
    winnerIds: [],
    model: DEFAULT_IMAGE_MODEL,
    promptPreviewMode: false,
  }

  await db.put('projects', project)
  await db.put('sessions', session)

  return { projectId, sessionId, project }
}

export async function listAllProjects() {
  const all = await db.getAll('projects')
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function renameProject(projectId, name) {
  const project = await db.get('projects', projectId)
  if (!project) return
  await db.put('projects', { ...project, name, updatedAt: Date.now() })
}

export async function archiveProject(projectId) {
  const project = await db.get('projects', projectId)
  if (!project) return
  await db.put('projects', { ...project, archived: true, updatedAt: Date.now() })
}

export async function restoreProject(projectId) {
  const project = await db.get('projects', projectId)
  if (!project) return
  await db.put('projects', { ...project, archived: false, updatedAt: Date.now() })
}

// --- Bootstrap (ensures default project exists for migration) ---

async function ensureDefaultProject() {
  let project = await db.get('projects', DEFAULT_PROJECT_ID)
  if (!project) {
    project = {
      id: DEFAULT_PROJECT_ID,
      name: 'Default Project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
      notes: '',
      defaultModel: null,
    }
    await db.put('projects', project)
  }

  // Ensure the default session exists too
  let session = await db.get('sessions', DEFAULT_SESSION_ID)
  if (!session) {
    session = {
      id: DEFAULT_SESSION_ID,
      projectId: DEFAULT_PROJECT_ID,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      goal: '',
      goalDirtyAfterApproval: false,
      planStatus: 'idle',
      approvedPlan: null,
      buckets: { ...EMPTY_BUCKETS },
      assembledPrompt: '',
      assembledPromptDirty: false,
      roughNotes: '',
      lockedElementIds: [],
      refIds: [],
      outputIds: [],
      winnerIds: [],
      model: DEFAULT_IMAGE_MODEL,
      promptPreviewMode: false,
    }
    await db.put('sessions', session)
  }

  return { project, session }
}

// --- Load project state ---

export async function getSessionForProject(projectId) {
  const sessions = await db.getAllByIndex('sessions', 'projectId', projectId)
  // Return first (only one session per project for now)
  return sessions[0] || null
}

function needsOutputFeedbackNormalization(output) {
  return !Object.prototype.hasOwnProperty.call(output, 'feedback') || output.feedback === undefined
}

async function normalizeOutputFeedback(outputs, winners) {
  const fallbackFeedbackByOutputId = new Map()
  for (const winner of winners) {
    if (!winner?.outputId) continue
    if (winner.feedback !== 'up' && winner.feedback !== 'down') continue
    if (!fallbackFeedbackByOutputId.has(winner.outputId)) {
      fallbackFeedbackByOutputId.set(winner.outputId, winner.feedback)
    }
  }

  const repairedOutputs = []
  const normalizedOutputs = outputs.map((output) => {
    if (!needsOutputFeedbackNormalization(output)) return output

    const normalized = {
      ...output,
      feedback: fallbackFeedbackByOutputId.get(output.id) || null,
    }
    repairedOutputs.push(normalized)
    return normalized
  })

  if (repairedOutputs.length > 0) {
    await db.putMany('outputs', repairedOutputs)
  }

  return normalizedOutputs
}

export async function loadProjectState(projectId) {
  // Ensure default project exists (migration safety)
  await ensureDefaultProject()

  // Find the session for this project
  const session = await getSessionForProject(projectId)
  if (!session) {
    // Project has no session — shouldn't happen, but return empty state
    return {
      sessionId: null,
      goal: '',
      goalDirtyAfterApproval: false,
      plan: null,
      planStatus: 'idle',
      buckets: { ...EMPTY_BUCKETS },
      assembled: '',
      assembledDirty: false,
      model: DEFAULT_IMAGE_MODEL,
      batchSize: 1,
      promptPreviewMode: false,
      refs: [],
      lockedElements: [],
      outputs: [],
      winners: [],
      memories: [],
      docs: [],
      suggestions: [],
      planRuns: [],
      projectLessons: [],
      knowledgeOverrides: [],
    }
  }

  const sessionId = session.id

  // Load entities by sessionId
  const [allRefs, allLocked, allOutputs, allWinners] = await Promise.all([
    projectId
      ? db.getAllByIndex('refs', 'projectId', projectId)
      : db.getAllByIndex('refs', 'sessionId', sessionId),
    db.getAllByIndex('lockedElements', 'sessionId', sessionId),
    db.getAllByIndex('outputs', 'sessionId', sessionId),
    db.getAllByIndex('winners', 'sessionId', sessionId),
  ])

  // Order entities by their ID arrays on the session
  const refMap = new Map(allRefs.map((r) => [r.id, r]))
  const lockedMap = new Map(allLocked.map((l) => [l.id, l]))
  const outputMap = new Map(allOutputs.map((o) => [o.id, o]))
  const winnerMap = new Map(allWinners.map((w) => [w.id, w]))

  const orderedRefs = (session.refIds || [])
    .map((id) => refMap.get(id))
    .filter(Boolean)
  const orderedLocked = (session.lockedElementIds || [])
    .map((id) => lockedMap.get(id))
    .filter(Boolean)
  const orderedOutputs = (session.outputIds || [])
    .map((id) => outputMap.get(id))
    .filter(Boolean)
  const orderedWinners = (session.winnerIds || [])
    .map((id) => winnerMap.get(id))
    .filter(Boolean)

  const normalizedOutputs = await normalizeOutputFeedback(orderedOutputs, orderedWinners)

  // Hydrate refs: reconstruct blob from stored base64, generate previewUrl
  const hydratedRefs = orderedRefs.map((ref) => {
    let blob = ref.blob || null
    if (!blob && ref.blobBase64) {
      blob = base64ToBlob(ref.blobBase64, ref.type || 'image/png')
    }
    const previewUrl = blob
      ? URL.createObjectURL(blob)
      : ref.imagePath
        ? `/api/images/${ref.id}`
        : null
    return { ...ref, blob, previewUrl }
  })

  // Load project-scoped memories, docs, suggestions, planRuns, lessons + shared layer
  const [allMemories, allDocs, allSuggestions, allPlanRuns, allProjectLessons, allKnowledgeOverrides, allSharedMemories, allSharedDocs, allSharedActivations] = await Promise.all([
    getMemoriesForProject(projectId),
    getDocsForProject(projectId),
    getSuggestionsForProject(projectId),
    getPlanRunsForProject(projectId),
    getProjectLessonsForProject(projectId),
    getKnowledgeOverridesForProject(projectId),
    getAllSharedMemories(),
    getAllSharedDocs(),
    getSharedActivationsForProject(projectId),
  ])

  // Annotate shared items with per-project activation status
  const activeSharedIds = new Set(allSharedActivations.map((a) => a.sharedItemId))
  const annotatedSharedMemories = allSharedMemories.map((m) => ({
    ...m,
    activeInProject: activeSharedIds.has(m.id),
  }))
  const annotatedSharedDocs = allSharedDocs.map((d) => ({
    ...d,
    activeInProject: activeSharedIds.has(d.id),
  }))

  // Load project record as primary source of truth for collection-level fields
  const project = await db.get('projects', projectId)

  return {
    sessionId,
    goal: project?.goal ?? session.goal ?? '',
    goalDirtyAfterApproval: project?.goalDirtyAfterApproval ?? session.goalDirtyAfterApproval ?? false,
    plan: project?.approvedPlan ?? session.approvedPlan ?? null,
    planStatus: project?.planStatus ?? session.planStatus ?? 'idle',
    buckets: project?.buckets ?? session.buckets ?? { ...EMPTY_BUCKETS },
    assembled: project?.assembledPrompt ?? session.assembledPrompt ?? '',
    assembledDirty: project?.assembledPromptDirty ?? session.assembledPromptDirty ?? false,
    model: project?.model ?? session.model ?? DEFAULT_IMAGE_MODEL,
    batchSize: project?.batchSize ?? session.batchSize ?? 1,
    promptPreviewMode: project?.promptPreviewMode ?? session.promptPreviewMode ?? false,
    refs: hydratedRefs,
    lockedElements: orderedLocked.map((el) => ({
      id: el.id,
      text: el.text,
      enabled: el.enabled,
    })),
    outputs: normalizedOutputs,
    winners: orderedWinners,
    memories: allMemories,
    docs: allDocs,
    suggestions: allSuggestions,
    planRuns: allPlanRuns,
    projectLessons: allProjectLessons,
    knowledgeOverrides: allKnowledgeOverrides,
    sharedMemories: annotatedSharedMemories,
    sharedDocs: annotatedSharedDocs,
    sharedActivations: allSharedActivations,
  }
}

// --- Save session fields ---

export async function saveSessionFields(sessionId, updates) {
  // Write to session for backward compat
  const session = await db.get('sessions', sessionId)
  if (session) {
    await db.put('sessions', { ...session, ...updates, updatedAt: Date.now() })
  }

  // Write to project (project is now primary data unit)
  const projectId = session?.projectId
  if (projectId) {
    const project = await db.get('projects', projectId)
    if (project) {
      await db.put('projects', { ...project, ...updates, updatedAt: Date.now() })
    }
  }
}

// --- Blob ↔ base64 helpers for ref image storage ---

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

// --- Refs ---

export async function saveRef(sessionId, ref, projectId = null) {
  const { previewUrl: _previewUrl, file: _file, blob, ...persistable } = ref
  // Convert blob to base64 for JSON-safe storage
  let blobBase64 = persistable.blobBase64 || null
  if (blob && !blobBase64) {
    try {
      blobBase64 = await blobToBase64(blob)
    } catch {
      console.warn('[session] failed to convert ref blob to base64')
    }
  }
  await db.put('refs', { ...persistable, sessionId, projectId, blobBase64 })
}

export async function deleteRef(id) {
  await db.del('refs', id)
}

export async function updateRefIds(sessionId, ids) {
  await saveSessionFields(sessionId, { refIds: ids })
}

// --- Locked Elements ---

export async function saveLockedElement(sessionId, el) {
  await db.put('lockedElements', {
    ...el,
    sessionId,
    createdAt: el.createdAt || Date.now(),
  })
}

export async function deleteLockedElement(id) {
  await db.del('lockedElements', id)
}

export async function updateLockedElementIds(sessionId, ids) {
  await saveSessionFields(sessionId, { lockedElementIds: ids })
}

// --- Outputs ---

export async function saveOutput(projectId, sessionId, output) {
  await db.put('outputs', {
    ...output,
    projectId,
    sessionId,
  })
}

export async function updateOutputIds(sessionId, ids) {
  // Update session (backward compat) with union-merge
  const session = await db.get('sessions', sessionId)
  if (session) {
    const diskIds = session.outputIds || []
    const browserSet = new Set(ids)
    const operatorOnlyIds = diskIds.filter((id) => !browserSet.has(id))
    const merged = [...operatorOnlyIds, ...ids]
    await db.put('sessions', { ...session, outputIds: merged, updatedAt: Date.now() })
  }

  // Update project (primary data unit) with same union-merge logic
  const projectId = session?.projectId
  if (projectId) {
    const project = await db.get('projects', projectId)
    if (project) {
      const diskIds = project.outputIds || []
      const browserSet = new Set(ids)
      const operatorOnlyIds = diskIds.filter((id) => !browserSet.has(id))
      const merged = [...operatorOnlyIds, ...ids]
      await db.put('projects', { ...project, outputIds: merged, updatedAt: Date.now() })
    }
  }
}

// --- Winners ---

export async function saveWinner(projectId, sessionId, winner) {
  await db.put('winners', {
    ...winner,
    projectId,
    sessionId,
  })
}

export async function deleteWinner(id) {
  await db.del('winners', id)
}

export async function updateWinnerIds(sessionId, ids) {
  await saveSessionFields(sessionId, { winnerIds: ids })
}

// --- Reset session ---

export async function clearSession(sessionId) {
  const [refs, locked, outputs, winners] = await Promise.all([
    db.getAllByIndex('refs', 'sessionId', sessionId),
    db.getAllByIndex('lockedElements', 'sessionId', sessionId),
    db.getAllByIndex('outputs', 'sessionId', sessionId),
    db.getAllByIndex('winners', 'sessionId', sessionId),
  ])

  await Promise.all([
    ...refs.map((r) => db.del('refs', r.id)),
    ...locked.map((l) => db.del('lockedElements', l.id)),
    ...outputs.map((o) => db.del('outputs', o.id)),
    ...winners.map((w) => db.del('winners', w.id)),
  ])

  const session = await db.get('sessions', sessionId)
  if (session) {
    await db.put('sessions', {
      ...session,
      updatedAt: Date.now(),
      goal: '',
      goalDirtyAfterApproval: false,
      planStatus: 'idle',
      approvedPlan: null,
      buckets: { ...EMPTY_BUCKETS },
      assembledPrompt: '',
      assembledPromptDirty: false,
      roughNotes: '',
      lockedElementIds: [],
      refIds: [],
      outputIds: [],
      winnerIds: [],
    })
  }
}

// --- Memories (project-scoped) ---

export async function saveMemory(memory) {
  await db.put('memories', memory)
}

export async function updateMemory(id, updates) {
  const existing = await db.get('memories', id)
  if (!existing) return
  await db.put('memories', { ...existing, ...updates })
}

export async function deleteMemory(id) {
  await db.del('memories', id)
}

export async function getMemoriesForProject(projectId) {
  const all = await db.getAllByIndex('memories', 'projectId', projectId)
  all.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.createdAt - a.createdAt
  })
  return all
}

// --- Docs (project-scoped) ---

export async function saveDoc(doc) {
  await db.put('docs', doc)
}

export async function updateDoc(id, updates) {
  const existing = await db.get('docs', id)
  if (!existing) return
  await db.put('docs', { ...existing, ...updates, updatedAt: Date.now() })
}

export async function deleteDoc(id) {
  await db.del('docs', id)
}

export async function getDocsForProject(projectId) {
  const all = await db.getAllByIndex('docs', 'projectId', projectId)
  all.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.createdAt - a.createdAt
  })
  return all
}

// --- Suggestions (project-scoped) ---

export async function saveSuggestion(suggestion) {
  await db.put('suggestions', suggestion)
}

export async function updateSuggestion(id, updates) {
  const existing = await db.get('suggestions', id)
  if (!existing) return
  await db.put('suggestions', { ...existing, ...updates })
}

export async function deleteSuggestion(id) {
  await db.del('suggestions', id)
}

export async function getSuggestionsForProject(projectId) {
  const all = await db.getAllByIndex('suggestions', 'projectId', projectId)
  return all
    .filter((s) => s.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function getSuggestionByWinnerId(winnerId) {
  const all = await db.getAllByIndex('suggestions', 'winnerId', winnerId)
  return all.find((s) => s.status === 'pending') || null
}

export async function getAllSuggestionsForProject(projectId) {
  return db.getAllByIndex('suggestions', 'projectId', projectId)
}

// --- Shared Memories (global) ---

export async function saveSharedMemory(memory) {
  await db.put('sharedMemories', memory)
}

export async function updateSharedMemory(id, updates) {
  const existing = await db.get('sharedMemories', id)
  if (!existing) return
  await db.put('sharedMemories', { ...existing, ...updates, updatedAt: Date.now() })
}

export async function deleteSharedMemory(id) {
  await db.del('sharedMemories', id)
  // Cascade: delete all activations referencing this shared item
  const activations = await db.getAllByIndex('sharedActivations', 'sharedItemId', id)
  await Promise.all(activations.map((a) => db.del('sharedActivations', a.id)))
}

export async function getAllSharedMemories() {
  const all = await db.getAll('sharedMemories')
  all.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.createdAt - a.createdAt
  })
  return all
}

export async function getSharedMemoryBySourceId(sourceMemoryId) {
  const all = await db.getAll('sharedMemories')
  return all.find((m) => m.sourceMemoryId === sourceMemoryId) || null
}

// --- Shared Docs (global) ---

export async function saveSharedDoc(doc) {
  await db.put('sharedDocs', doc)
}

export async function updateSharedDoc(id, updates) {
  const existing = await db.get('sharedDocs', id)
  if (!existing) return
  await db.put('sharedDocs', { ...existing, ...updates, updatedAt: Date.now() })
}

export async function deleteSharedDoc(id) {
  await db.del('sharedDocs', id)
  // Cascade: delete all activations referencing this shared item
  const activations = await db.getAllByIndex('sharedActivations', 'sharedItemId', id)
  await Promise.all(activations.map((a) => db.del('sharedActivations', a.id)))
}

export async function getAllSharedDocs() {
  const all = await db.getAll('sharedDocs')
  all.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.createdAt - a.createdAt
  })
  return all
}

export async function getSharedDocBySourceId(sourceDocId) {
  const all = await db.getAll('sharedDocs')
  return all.find((d) => d.sourceDocId === sourceDocId) || null
}

// --- Shared Activations (project↔shared junction) ---

export async function saveSharedActivation(activation) {
  await db.put('sharedActivations', activation)
}

export async function deleteSharedActivation(id) {
  await db.del('sharedActivations', id)
}

export async function getSharedActivationsForProject(projectId) {
  return db.getAllByIndex('sharedActivations', 'projectId', projectId)
}

export async function findSharedActivation(projectId, sharedItemId) {
  const all = await db.getAllByIndex('sharedActivations', 'projectId', projectId)
  return all.find((a) => a.sharedItemId === sharedItemId) || null
}

// --- Plan Runs (project-scoped) ---

export async function savePlanRun(planRun) {
  await db.put('planRuns', planRun)
}

export async function updatePlanRun(id, updates) {
  const existing = await db.get('planRuns', id)
  if (!existing) return
  await db.put('planRuns', { ...existing, ...updates })
}

export async function getPlanRunsForProject(projectId) {
  const all = await db.getAllByIndex('planRuns', 'projectId', projectId)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

// --- Project Lessons (project-scoped) ---

export async function saveProjectLesson(lesson) {
  await db.put('projectLessons', lesson)
}

export async function deleteProjectLesson(id) {
  await db.del('projectLessons', id)
}

export async function getProjectLessonsForProject(projectId) {
  const all = await db.getAllByIndex('projectLessons', 'projectId', projectId)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

// --- Knowledge Overrides (project-scoped) ---

export async function saveKnowledgeOverride(override) {
  await db.put('knowledgeOverrides', override)
}

export async function deleteKnowledgeOverride(id) {
  await db.del('knowledgeOverrides', id)
}

export async function getKnowledgeOverridesForProject(projectId) {
  const all = await db.getAllByIndex('knowledgeOverrides', 'projectId', projectId)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

// --- Cross-session project queries ---

export async function loadAllProjectOutputsAndWinners(projectId) {
  const sessions = await db.getAllByIndex('sessions', 'projectId', projectId)
  const results = await Promise.all(
    sessions.map(async (session) => {
      const [outputs, winners] = await Promise.all([
        db.getAllByIndex('outputs', 'sessionId', session.id),
        db.getAllByIndex('winners', 'sessionId', session.id),
      ])
      const normalizedOutputs = await normalizeOutputFeedback(outputs, winners)
      return { outputs: normalizedOutputs, winners }
    })
  )
  const allOutputs = []
  const allWinners = []
  for (const r of results) {
    allOutputs.push(...r.outputs)
    allWinners.push(...r.winners)
  }
  return { outputs: allOutputs, winners: allWinners }
}

export async function loadAllSiteOutputsAndWinners() {
  const [allOutputs, allWinners] = await Promise.all([
    db.getAll('outputs'),
    db.getAll('winners'),
  ])

  const normalizedOutputs = await normalizeOutputFeedback(allOutputs, allWinners)
  normalizedOutputs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  return {
    outputs: normalizedOutputs,
    winners: allWinners,
  }
}
