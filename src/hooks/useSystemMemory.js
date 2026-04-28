import { useState, useCallback, useMemo, useRef } from 'react'
import * as persist from '../storage/session'
import { createId } from '../utils/id'

/**
 * useSystemMemory — owns all system-memory state and CRUD handlers.
 *
 * Encapsulates: project memories, docs, shared knowledge, lessons, and knowledge overrides.
 * Exposes: active items for planning, status counts for UI, raw data + handlers for inspector.
 */
export default function useSystemMemory({ activeProjectId, activeSessionId }) {
  // --- State ---
  const [memories, setMemories] = useState([])
  const [memoryDraft, setMemoryDraft] = useState(null)
  const [docs, setDocs] = useState([])
  const [sharedMemories, setSharedMemories] = useState([])
  const [sharedDocs, setSharedDocs] = useState([])
  const [sharedActivations, setSharedActivations] = useState([])
  const [projectLessons, setProjectLessons] = useState([])
  const [knowledgeOverrides, setKnowledgeOverrides] = useState([])

  // Ref for deduplication in rapid lesson saves
  const projectLessonsRef = useRef(projectLessons)
  projectLessonsRef.current = projectLessons

  // --- Hydrate from loaded project state ---
  const hydrate = useCallback((state) => {
    setMemories(state.memories || [])
    setMemoryDraft(null)
    setDocs(state.docs || [])
    setSharedMemories(state.sharedMemories || [])
    setSharedDocs(state.sharedDocs || [])
    setSharedActivations(state.sharedActivations || [])
    setProjectLessons(state.projectLessons || [])
    setKnowledgeOverrides(state.knowledgeOverrides || [])
  }, [])

  // --- Derived active sets for planning ---
  const active = useMemo(() => ({
    memories: memories.filter((m) => m.active),
    docs: docs.filter((d) => d.active),
    sharedMemories: sharedMemories.filter((m) =>
      sharedActivations.some((a) => a.sharedItemType === 'memory' && a.sharedItemId === m.id)
    ),
    sharedDocs: sharedDocs.filter((d) =>
      sharedActivations.some((a) => a.sharedItemType === 'doc' && a.sharedItemId === d.id)
    ),
  }), [memories, docs, sharedMemories, sharedDocs, sharedActivations])

  // --- Status counts for compact UI ---
  const status = useMemo(() => {
    const activeMemories = memories.filter((m) => m.active)
    const pinnedMemories = memories.filter((m) => m.pinned)
    const activeDocs = docs.filter((d) => d.active)
    const pinnedDocs = docs.filter((d) => d.pinned)
    const activeOverrides = knowledgeOverrides.filter((o) => o.isActive)
    return {
      memoriesCount: { active: activeMemories.length, pinned: pinnedMemories.length, total: memories.length },
      docsCount: { active: activeDocs.length, pinned: pinnedDocs.length, total: activeDocs.length },
      lessonsCount: projectLessons.length,
      sharedCount: { memories: active.sharedMemories.length, docs: active.sharedDocs.length },
      overridesCount: { active: activeOverrides.length, total: knowledgeOverrides.length },
    }
  }, [memories, docs, projectLessons, knowledgeOverrides, active.sharedMemories.length, active.sharedDocs.length])

  // --- Memory handlers ---

  const handleAddMemory = useCallback((memoryData) => {
    const memory = {
      id: createId(),
      projectId: activeProjectId,
      sessionId: activeSessionId || null,
      outputId: memoryData.outputId || null,
      winnerId: memoryData.winnerId || null,
      createdAt: Date.now(),
      type: memoryData.type || 'preference',
      text: memoryData.text,
      source: memoryData.source || 'manual',
      tags: memoryData.tags || [],
      pinned: memoryData.pinned || false,
      active: true,
    }
    persist.saveMemory(memory)
    setMemories((prev) => [memory, ...prev])
    setMemoryDraft(null)
  }, [activeProjectId, activeSessionId])

  const handleUpdateMemory = useCallback((id, updates) => {
    setMemories((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m
        const updated = { ...m, ...updates }
        persist.saveMemory(updated)
        return updated
      })
    )
  }, [])

  const handleRemoveMemory = useCallback((id) => {
    setMemories((prev) => prev.filter((m) => m.id !== id))
    persist.deleteMemory(id)
  }, [])

  // --- Doc handlers ---

  const handleAddDoc = useCallback((docData) => {
    const doc = {
      id: createId(),
      projectId: activeProjectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: docData.title || 'Untitled',
      type: docData.type || 'notes',
      text: docData.text,
      pinned: false,
      active: true,
    }
    persist.saveDoc(doc)
    setDocs((prev) => [doc, ...prev])
  }, [activeProjectId])

  const handleUpdateDoc = useCallback((id, updates) => {
    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d
        const updated = { ...d, ...updates, updatedAt: Date.now() }
        persist.saveDoc(updated)
        return updated
      })
    )
  }, [])

  const handleRemoveDoc = useCallback((id) => {
    setDocs((prev) => prev.filter((d) => d.id !== id))
    persist.deleteDoc(id)
  }, [])

  // --- Shared knowledge handlers ---

  const handlePromoteMemoryToShared = useCallback(async (memoryId) => {
    const memory = memories.find((m) => m.id === memoryId)
    if (!memory) return
    const existing = await persist.getSharedMemoryBySourceId(memoryId)
    if (existing) return
    const shared = {
      id: createId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      type: memory.type,
      text: memory.text,
      pinned: false,
      source: 'shared',
      sourceProjectId: activeProjectId,
      sourceMemoryId: memoryId,
    }
    await persist.saveSharedMemory(shared)
    setSharedMemories((prev) => [{ ...shared, activeInProject: false }, ...prev])
  }, [memories, activeProjectId])

  const handlePromoteDocToShared = useCallback(async (docId) => {
    const doc = docs.find((d) => d.id === docId)
    if (!doc) return
    const existing = await persist.getSharedDocBySourceId(docId)
    if (existing) return
    const shared = {
      id: createId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: doc.title,
      type: doc.type,
      text: doc.text,
      pinned: false,
      sourceProjectId: activeProjectId,
      sourceDocId: docId,
    }
    await persist.saveSharedDoc(shared)
    setSharedDocs((prev) => [{ ...shared, activeInProject: false }, ...prev])
  }, [docs, activeProjectId])

  const handleToggleSharedActivation = useCallback(async (sharedItemId, sharedItemType) => {
    const existing = await persist.findSharedActivation(activeProjectId, sharedItemId)
    if (existing) {
      await persist.deleteSharedActivation(existing.id)
      setSharedActivations((prev) => prev.filter((a) => a.id !== existing.id))
      const setter = sharedItemType === 'memory' ? setSharedMemories : setSharedDocs
      setter((prev) => prev.map((item) =>
        item.id === sharedItemId ? { ...item, activeInProject: false } : item
      ))
    } else {
      const activation = {
        id: createId(),
        projectId: activeProjectId,
        sharedItemId,
        sharedItemType,
        activatedAt: Date.now(),
      }
      await persist.saveSharedActivation(activation)
      setSharedActivations((prev) => [...prev, activation])
      const setter = sharedItemType === 'memory' ? setSharedMemories : setSharedDocs
      setter((prev) => prev.map((item) =>
        item.id === sharedItemId ? { ...item, activeInProject: true } : item
      ))
    }
  }, [activeProjectId])

  const handleUpdateSharedMemory = useCallback(async (id, updates) => {
    await persist.updateSharedMemory(id, updates)
    setSharedMemories((prev) => prev.map((m) =>
      m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
    ))
  }, [])

  const handleUpdateSharedDoc = useCallback(async (id, updates) => {
    await persist.updateSharedDoc(id, updates)
    setSharedDocs((prev) => prev.map((d) =>
      d.id === id ? { ...d, ...updates, updatedAt: Date.now() } : d
    ))
  }, [])

  const handleRemoveSharedMemory = useCallback(async (id) => {
    await persist.deleteSharedMemory(id)
    setSharedMemories((prev) => prev.filter((m) => m.id !== id))
    setSharedActivations((prev) => prev.filter((a) => a.sharedItemId !== id))
  }, [])

  const handleRemoveSharedDoc = useCallback(async (id) => {
    await persist.deleteSharedDoc(id)
    setSharedDocs((prev) => prev.filter((d) => d.id !== id))
    setSharedActivations((prev) => prev.filter((a) => a.sharedItemId !== id))
  }, [])

  // --- Lesson handlers ---

  const handleSaveLesson = useCallback((text, signal, sourcePlanRunId) => {
    if (!activeProjectId) return
    const trimmed = text.trim()
    if (!trimmed) return
    const isDupe = projectLessonsRef.current.some(
      (l) => l.projectId === activeProjectId && l.text === trimmed && l.signal === signal
    )
    if (isDupe) return
    const lesson = {
      id: createId(),
      projectId: activeProjectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      text: trimmed,
      signal,
      sourcePlanRunId: sourcePlanRunId || null,
    }
    projectLessonsRef.current = [lesson, ...projectLessonsRef.current]
    setProjectLessons((prev) => [lesson, ...prev])
    persist.saveProjectLesson(lesson)
  }, [activeProjectId])

  const handleRemoveLesson = useCallback((id) => {
    setProjectLessons((prev) => prev.filter((l) => l.id !== id))
    persist.deleteProjectLesson(id)
  }, [])

  // --- Knowledge Override handlers ---

  const handleAddOverride = useCallback((overrideData) => {
    if (!activeProjectId) return
    const override = {
      id: createId(),
      projectId: activeProjectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      action: overrideData.action || 'prefer',
      targetEntryId: overrideData.targetEntryId || null,
      kind: overrideData.kind || 'rule',
      title: overrideData.title || '',
      body: overrideData.body || '',
      systemTags: overrideData.systemTags || ['*'],
      taskTypes: overrideData.taskTypes || ['*'],
      priority: overrideData.priority || 2,
      notes: overrideData.notes || '',
      isActive: true,
    }
    setKnowledgeOverrides((prev) => [override, ...prev])
    persist.saveKnowledgeOverride(override)
  }, [activeProjectId])

  const handleUpdateOverride = useCallback((id, updates) => {
    setKnowledgeOverrides((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o
        const updated = { ...o, ...updates, updatedAt: Date.now() }
        persist.saveKnowledgeOverride(updated)
        return updated
      })
    )
  }, [])

  const handleRemoveOverride = useCallback((id) => {
    setKnowledgeOverrides((prev) => prev.filter((o) => o.id !== id))
    persist.deleteKnowledgeOverride(id)
  }, [])

  // --- Return the system-memory boundary API ---
  return {
    active,
    status,
    data: {
      memories,
      docs,
      sharedMemories,
      sharedDocs,
      sharedActivations,
      projectLessons,
      knowledgeOverrides,
    },
    handlers: {
      addMemory: handleAddMemory,
      updateMemory: handleUpdateMemory,
      removeMemory: handleRemoveMemory,
      promoteMemoryToShared: handlePromoteMemoryToShared,
      addDoc: handleAddDoc,
      updateDoc: handleUpdateDoc,
      removeDoc: handleRemoveDoc,
      promoteDocToShared: handlePromoteDocToShared,
      toggleSharedActivation: handleToggleSharedActivation,
      updateSharedMemory: handleUpdateSharedMemory,
      updateSharedDoc: handleUpdateSharedDoc,
      removeSharedMemory: handleRemoveSharedMemory,
      removeSharedDoc: handleRemoveSharedDoc,
      saveLesson: handleSaveLesson,
      removeLesson: handleRemoveLesson,
      addOverride: handleAddOverride,
      updateOverride: handleUpdateOverride,
      removeOverride: handleRemoveOverride,
    },
    memoryDraft,
    setMemoryDraft,
    clearDraft: useCallback(() => setMemoryDraft(null), []),
    hydrate,
  }
}
