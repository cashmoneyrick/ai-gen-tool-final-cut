import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import ReviewConsole from './v3/ReviewConsole'
import useSystemMemory from './hooks/useSystemMemory'
import useLiveSync from './hooks/useLiveSync'
import { buildIterationContext } from './planning/iterationContext'
import * as persist from './storage/session'

const EMPTY_BUCKETS = {
  subject: '',
  style: '',
  lighting: '',
  composition: '',
  technical: '',
}

const FALLBACK_OUTPUT_DISPLAY_ID = 'Output —'

function formatOutputDisplayId(index) {
  return `Output ${String(index + 1).padStart(3, '0')}`
}

function buildOutputDisplayIdMap(outputs) {
  const uniqueOutputs = Array.from(
    new Map((outputs || []).map((output) => [output.id, output])).values()
  )

  uniqueOutputs.sort((a, b) => {
    const aHasCreatedAt = Number.isFinite(a?.createdAt)
    const bHasCreatedAt = Number.isFinite(b?.createdAt)

    if (aHasCreatedAt && bHasCreatedAt && a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt
    }

    if (aHasCreatedAt !== bHasCreatedAt) {
      return aHasCreatedAt ? -1 : 1
    }

    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })

  return new Map(
    uniqueOutputs.map((output, index) => [output.id, formatOutputDisplayId(index)])
  )
}


export default function App() {
  // --- Hydration flag ---
  const [hydrated, setHydrated] = useState(false)

  // --- Project state ---
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [projects, setProjects] = useState([])

  // --- Session state ---
  const [goal, setGoal] = useState('')
  const [buckets, setBuckets] = useState({ ...EMPTY_BUCKETS })
  const [assembled, setAssembled] = useState('')
  const [assembledDirty, setAssembledDirty] = useState(false)
  const [refs, setRefs] = useState([])
  const refsRef = useRef(refs)
  refsRef.current = refs

  const [batchSize, setBatchSize] = useState(1)
  const [outputs, setOutputs] = useState([])
  const [projectOutputCatalog, setProjectOutputCatalog] = useState([])

  // Winners state
  const [winners, setWinners] = useState([])

  // Locked elements state
  const [lockedElements, setLockedElements] = useState([])

  // System memory (memories, docs, shared knowledge, lessons, overrides)
  const systemMemory = useSystemMemory({ activeProjectId, activeSessionId })

  // Model selection state
  const [model, setModel] = useState('gemini-3.1-flash-image-preview')

  // --- Helper: apply loaded state to all React state ---
  const applyState = useCallback((state) => {
    setActiveSessionId(state.sessionId)
    setGoal(state.goal)
    setBuckets(state.buckets)
    setAssembled(state.assembled)
    setAssembledDirty(state.assembledDirty)
    setModel(state.model)
    setBatchSize(state.batchSize || 1)
    setRefs(state.refs)
    setLockedElements(state.lockedElements)
    setOutputs(state.outputs)
    setWinners(state.winners)
    systemMemory.hydrate(state)
  }, [])

  // --- Helper: revoke current ref preview URLs ---
  const revokeRefUrls = useCallback(() => {
    refsRef.current.forEach((r) => {
      if (r.previewUrl) URL.revokeObjectURL(r.previewUrl)
    })
  }, [])

  // --- Hydrate from IndexedDB on mount ---
  useEffect(() => {
    async function init() {
      try {
        const projectId = await persist.getActiveProjectId()
        const [{ outputs: allProjectOutputs }, state, projectList] = await Promise.all([
          persist.loadAllProjectOutputsAndWinners(projectId),
          persist.loadProjectState(projectId),
          persist.listAllProjects(),
        ])
        setActiveProjectId(projectId)
        setProjects(projectList)
        setProjectOutputCatalog(allProjectOutputs)
        applyState(state)
      } catch (err) {
        console.error('Failed to hydrate from IndexedDB:', err)
      }
      setHydrated(true)
    }
    init()
  }, [applyState])

  // --- Revoke preview URLs on unmount ---
  useEffect(() => {
    return () => revokeRefUrls()
  }, [revokeRefUrls])

  // --- Persistence effects (only after hydration) ---

  const debounceRef = useRef({})
  const debouncedSave = useCallback((key, fn, delay = 500) => {
    clearTimeout(debounceRef.current[key])
    debounceRef.current[key] = setTimeout(fn, delay)
  }, [])

  // Save session-level fields (debounced)
  useEffect(() => {
    if (!hydrated || !activeSessionId) return
    const sid = activeSessionId
    debouncedSave('session', () => {
      persist.saveSessionFields(sid, {
        goal,
        buckets,
        assembledPrompt: assembled,
        assembledPromptDirty: assembledDirty,
        model,
        batchSize,
      })
    })
  }, [hydrated, activeSessionId, goal, buckets, assembled, assembledDirty, model, batchSize, debouncedSave])

  // Save ref ordering
  useEffect(() => {
    if (!hydrated || !activeSessionId) return
    persist.updateRefIds(activeSessionId, refs.map((r) => r.id))
  }, [hydrated, activeSessionId, refs])

  // Save locked element ordering
  useEffect(() => {
    if (!hydrated || !activeSessionId) return
    persist.updateLockedElementIds(activeSessionId, lockedElements.map((el) => el.id))
  }, [hydrated, activeSessionId, lockedElements])

  // Save output ordering
  useEffect(() => {
    if (!hydrated || !activeSessionId) return
    persist.updateOutputIds(activeSessionId, outputs.map((o) => o.id))
  }, [hydrated, activeSessionId, outputs])

  // Save winner ordering
  useEffect(() => {
    if (!hydrated || !activeSessionId) return
    persist.updateWinnerIds(activeSessionId, winners.map((w) => w.id))
  }, [hydrated, activeSessionId, winners])

  // --- Project handlers ---

  const handleCreateProject = useCallback(async () => {
    const { projectId, project } = await persist.createProject('New Project')
    persist.setActiveProjectId(projectId)
    setActiveProjectId(projectId)
    setProjects((prev) => [project, ...prev])
    // Load empty state for new project
    const [{ outputs: allProjectOutputs }, state] = await Promise.all([
      persist.loadAllProjectOutputsAndWinners(projectId),
      persist.loadProjectState(projectId),
    ])
    revokeRefUrls()
    setProjectOutputCatalog(allProjectOutputs)
    applyState(state)
  }, [applyState, revokeRefUrls])

  const handleSwitchProject = useCallback(async (projectId) => {
    if (projectId === activeProjectId) return
    // Flush any pending debounced saves for current session
    Object.values(debounceRef.current).forEach(clearTimeout)
    debounceRef.current = {}

    persist.setActiveProjectId(projectId)
    setActiveProjectId(projectId)
    revokeRefUrls()
    const [{ outputs: allProjectOutputs }, state] = await Promise.all([
      persist.loadAllProjectOutputsAndWinners(projectId),
      persist.loadProjectState(projectId),
    ])
    setProjectOutputCatalog(allProjectOutputs)
    applyState(state)
  }, [activeProjectId, applyState, revokeRefUrls])

  // Re-read all shared JSON state from disk for the current project
  const handleSyncState = useCallback(async () => {
    const pid = activeProjectId
    if (!pid) return
    const [{ outputs: allProjectOutputs }, state] = await Promise.all([
      persist.loadAllProjectOutputsAndWinners(pid),
      persist.loadProjectState(pid),
    ])
    setProjectOutputCatalog(allProjectOutputs)
    applyState(state)
  }, [activeProjectId, applyState])

  // Auto-sync when data files change on disk (from CLI operator, etc.)
  useLiveSync(handleSyncState, hydrated)

  const handleRenameProject = useCallback(async (projectId, name) => {
    await persist.renameProject(projectId, name)
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, name, updatedAt: Date.now() } : p))
    )
  }, [])

  const handleArchiveProject = useCallback(async (projectId) => {
    await persist.archiveProject(projectId)
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, archived: true, updatedAt: Date.now() } : p))
    )
    // If archiving the active project, switch to first non-archived
    if (projectId === activeProjectId) {
      const remaining = projects.filter((p) => p.id !== projectId && !p.archived)
      if (remaining.length > 0) {
        handleSwitchProject(remaining[0].id)
      }
    }
  }, [activeProjectId, projects, handleSwitchProject])

  const handleRestoreProject = useCallback(async (projectId) => {
    await persist.restoreProject(projectId)
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, archived: false, updatedAt: Date.now() } : p))
    )
  }, [])

  const handleUpdateOutputNotes = useCallback(async (outputId, notes) => {
    let updatedOutput = null
    setOutputs((prev) =>
      prev.map((output) => {
        if (output.id !== outputId) return output
        const updated = { ...output, notes }
        updatedOutput = updated
        return updated
      })
    )
    if (updatedOutput && activeProjectId && activeSessionId) {
      await persist.saveOutput(activeProjectId, activeSessionId, updatedOutput)
    }
  }, [activeProjectId, activeSessionId])

  const handleUpdateFeedbackNotes = useCallback(async (outputId, notesKeep, notesFix, originals) => {
    // Auto-derive feedback from which fields have content
    const hasKeep = notesKeep && notesKeep.trim().length > 0
    const hasFix = notesFix && notesFix.trim().length > 0
    const feedback = hasKeep && !hasFix ? 'up' : hasFix && !hasKeep ? 'down' : hasKeep && hasFix ? 'down' : null

    let updatedOutput = null
    setOutputs((prev) =>
      prev.map((output) => {
        if (output.id !== outputId) return output
        const updated = { ...output, notesKeep: notesKeep || '', notesFix: notesFix || '', feedback }
        // Preserve original text on first cleanup (write-once)
        if (originals) {
          if (originals.notesKeep && !output.originalNotesKeep) updated.originalNotesKeep = originals.notesKeep
          if (originals.notesFix && !output.originalNotesFix) updated.originalNotesFix = originals.notesFix
        }
        updatedOutput = updated
        return updated
      })
    )
    if (updatedOutput && activeProjectId && activeSessionId) {
      await persist.saveOutput(activeProjectId, activeSessionId, updatedOutput)
    }
  }, [activeProjectId, activeSessionId])

  const handleUpdateBatchNotes = useCallback(async (batchCreatedAt, notesKeep, notesFix, originals) => {
    // Save batch notes to ALL outputs sharing the same createdAt
    const updatedOutputs = []
    setOutputs((prev) =>
      prev.map((output) => {
        if (output.createdAt !== batchCreatedAt) return output
        const updated = { ...output, batchNotesKeep: notesKeep || '', batchNotesFix: notesFix || '' }
        // Preserve original text on first cleanup (write-once)
        if (originals) {
          if (originals.batchNotesKeep && !output.originalBatchNotesKeep) updated.originalBatchNotesKeep = originals.batchNotesKeep
          if (originals.batchNotesFix && !output.originalBatchNotesFix) updated.originalBatchNotesFix = originals.batchNotesFix
        }
        updatedOutputs.push(updated)
        return updated
      })
    )
    if (activeProjectId && activeSessionId) {
      await Promise.all(
        updatedOutputs.map((o) => persist.saveOutput(activeProjectId, activeSessionId, o))
      )
    }
  }, [activeProjectId, activeSessionId])

  // --- Derived state ---

  const outputsById = useMemo(() => {
    const map = new Map()
    for (const output of outputs) map.set(output.id, output)
    return map
  }, [outputs])

  // Derive iteration carry-forward context from winners + linked outputs
  const iterationContext = useMemo(
    () => buildIterationContext(winners, outputsById),
    [winners, outputsById]
  )

  const outputDisplayIdMap = useMemo(
    () => buildOutputDisplayIdMap(projectOutputCatalog),
    [projectOutputCatalog]
  )

  const outputsWithDisplayIds = useMemo(
    () => outputs.map((output) => ({
      ...output,
      displayId: outputDisplayIdMap.get(output.id) || FALLBACK_OUTPUT_DISPLAY_ID,
    })),
    [outputs, outputDisplayIdMap]
  )

  const winnersWithDisplayIds = useMemo(
    () => winners.map((winner) => ({
      ...winner,
      displayId: outputDisplayIdMap.get(winner.outputId) || FALLBACK_OUTPUT_DISPLAY_ID,
    })),
    [winners, outputDisplayIdMap]
  )


  const handleAddRefs = useCallback(async (files) => {
    // Gemini supports these formats only
    const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
    // Gemini inline image limit: 20MB
    const MAX_SIZE = 20 * 1024 * 1024

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    const validRefs = []
    const errors = []

    for (const file of imageFiles) {
      // Format check
      if (!SUPPORTED_TYPES.has(file.type)) {
        errors.push(`${file.name}: unsupported format (use JPEG, PNG, WebP, HEIC, or HEIF)`)
        continue
      }
      // Size check
      if (file.size > MAX_SIZE) {
        errors.push(`${file.name}: too large (max 20MB)`)
        continue
      }
      // Verify image actually loads (catches corrupted/truncated files)
      const url = URL.createObjectURL(file)
      const valid = await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = url
      })
      if (!valid) {
        URL.revokeObjectURL(url)
        errors.push(`${file.name}: could not be read as a valid image`)
        continue
      }
      const ref = {
        id: crypto.randomUUID(),
        file,
        blob: file,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: url,
        send: true,
        createdAt: Date.now(),
      }
      if (activeSessionId) persist.saveRef(activeSessionId, ref)
      validRefs.push(ref)
    }

    if (errors.length > 0) alert(`Some images were rejected:\n\n${errors.join('\n')}`)
    if (validRefs.length > 0) setRefs((prev) => [...prev, ...validRefs])
  }, [activeSessionId])

  const handleToggleRefSend = useCallback((id) => {
    setRefs((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const updated = { ...r, send: !r.send }
        if (activeSessionId) persist.saveRef(activeSessionId, updated)
        return updated
      })
    )
  }, [activeSessionId])

  const handleToggleRefAnchor = useCallback((id) => {
    setRefs((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const updated = { ...r, anchor: !r.anchor }
        if (activeSessionId) persist.saveRef(activeSessionId, updated)
        return updated
      })
    )
  }, [activeSessionId])

  const handleUpdateRefNotes = useCallback((id, notes) => {
    setRefs((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const updated = { ...r, notes }
        if (activeSessionId) persist.saveRef(activeSessionId, updated)
        return updated
      })
    )
  }, [activeSessionId])

  const handleRemoveRef = useCallback((id) => {
    setRefs((prev) => {
      const target = prev.find((r) => r.id === id)
      if (target && target.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((r) => r.id !== id)
    })
    persist.deleteRef(id)
  }, [])

  const handleUpdateOutputFeedback = useCallback((outputId, feedback) => {
    setOutputs((prev) =>
      prev.map((output) => {
        if (output.id !== outputId) return output
        if (output.feedback === feedback) return output
        const updated = { ...output, feedback }
        if (activeProjectId && activeSessionId) {
          persist.saveOutput(activeProjectId, activeSessionId, updated)
        }
        return updated
      })
    )
  }, [activeProjectId, activeSessionId])

  // --- Loading state ---
  if (!hydrated) {
    return (
      <div className="app">
        <div style={{ padding: '40px 16px', textAlign: 'center' }}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <ReviewConsole
          outputs={outputsWithDisplayIds}
          winners={winnersWithDisplayIds}
          projects={projects}
          activeProjectId={activeProjectId}
          activeSessionId={activeSessionId}
          project={projects.find(p => p.id === activeProjectId)}
          session={{ goal, model, assembledPrompt: assembled, batchSize }}
          lockedElements={lockedElements}
          refs={refs}
          onAddRefs={handleAddRefs}
          onRemoveRef={handleRemoveRef}
          onToggleRefSend={handleToggleRefSend}
          onToggleRefAnchor={handleToggleRefAnchor}
          onUpdateRefNotes={handleUpdateRefNotes}
          iterationContext={iterationContext}
          onSync={handleSyncState}
          onUpdateOutputFeedback={handleUpdateOutputFeedback}
          onUpdateOutputNotes={handleUpdateOutputNotes}
          onUpdateFeedbackNotes={handleUpdateFeedbackNotes}
          onUpdateBatchNotes={handleUpdateBatchNotes}
          onSwitchProject={handleSwitchProject}
          onCreateProject={handleCreateProject}
          onRenameProject={handleRenameProject}
          onArchiveProject={handleArchiveProject}
          onRestoreProject={handleRestoreProject}
          onUpdateBatchSize={setBatchSize}
        />
    </div>
  )
}
