import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import ReviewConsole from './v3/ReviewConsole'
import useSystemMemory from './hooks/useSystemMemory'
import useLiveSync from './hooks/useLiveSync'
import { buildIterationContext } from './planning/iterationContext'
import * as persist from './storage/session'
import { normalizePromptSections, parseStructuredPrompt, renderStructuredPrompt } from './prompt/structuredPrompt'
import { DEFAULT_IMAGE_MODEL, resolveImageModel } from './modelConfig'
import { createId } from './utils/id'

function AppLoadingScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#080809',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"SF Mono", Menlo, Monaco, monospace',
      WebkitFontSmoothing: 'antialiased',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes ls-cell { 0%,100%{opacity:.25} 50%{opacity:1} }
        @keyframes ls-sweep { 0%{transform:translateX(-100%)} 100%{transform:translateX(100vw)} }
        @keyframes ls-fade { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(10,132,255,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* 2×2 grid icon — cells pulse sequentially */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', animation: 'ls-fade 0.4s ease both' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            width: '22px', height: '22px',
            borderRadius: '3px',
            background: '#0a84ff',
            opacity: 0.25,
            animation: `ls-cell 1.6s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>

      {/* Wordmark */}
      <div style={{
        marginTop: '22px',
        fontSize: '9px',
        letterSpacing: '0.22em',
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        animation: 'ls-fade 0.5s 0.1s ease both',
        userSelect: 'none',
      }}>
        GEN
      </div>

      {/* Sweep line at bottom */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', overflow: 'hidden' }}>
        <div style={{
          height: '1px', width: '30%',
          background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.6), transparent)',
          animation: 'ls-sweep 1.8s ease-in-out infinite',
        }} />
      </div>
    </div>
  )
}

const EMPTY_BUCKETS = {
  subject: '',
  style: '',
  lighting: '',
  composition: '',
  technical: '',
}

const FALLBACK_OUTPUT_DISPLAY_ID = 'Output —'
let pendingSessionSaveTimer = null

function isPromptPreviewOutput(output) {
  return output?.outputKind === 'prompt-preview'
}

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

function buildNextProjectName(projects) {
  const existingNames = new Set((projects || []).map((project) => String(project?.name || '').trim().toLowerCase()))
  if (!existingNames.has('new project')) return 'New Project'

  let counter = 2
  while (existingNames.has(`new project ${counter}`)) {
    counter += 1
  }
  return `New Project ${counter}`
}


export default function App() {
  // --- Hydration flag ---
  const [hydrated, setHydrated] = useState(false)
  const [trustSignal, setTrustSignal] = useState(null)
  const trustSignalTimerRef = useRef(null)

  // --- Project state ---
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [projects, setProjects] = useState([])

  // --- Session state ---
  const [goal, setGoal] = useState('')
  const [buckets, setBuckets] = useState({ ...EMPTY_BUCKETS })
  const [assembled, setAssembled] = useState('')
  const [assembledDirty, setAssembledDirty] = useState(false)
  const [promptPreviewMode, setPromptPreviewMode] = useState(false)
  const [refs, setRefs] = useState([])
  const refsRef = useRef(refs)
  const outputsRef = useRef([])

  const [batchSize, setBatchSize] = useState(1)
  const [outputs, setOutputs] = useState([])
  const [projectOutputCatalog, setProjectOutputCatalog] = useState([])
  const [sitewideOutputCatalog, setSitewideOutputCatalog] = useState([])
  const [sitewideWinners, setSitewideWinners] = useState([])
  const [projectBrief, setProjectBrief] = useState(null)
  const [requestedOutputId, setRequestedOutputId] = useState(null)

  // Winners state
  const [winners, setWinners] = useState([])

  // Locked elements state
  const [lockedElements, setLockedElements] = useState([])

  // System memory (memories, docs, shared knowledge, lessons, overrides)
  const systemMemory = useSystemMemory({ activeProjectId, activeSessionId })

  // Model selection state
  const [model, setModel] = useState(DEFAULT_IMAGE_MODEL)
  const loadRequestRef = useRef(0)

  const publishTrustSignal = useCallback((signal) => {
    if (trustSignalTimerRef.current) {
      clearTimeout(trustSignalTimerRef.current)
    }
    setTrustSignal({ ...signal, at: Date.now() })
    trustSignalTimerRef.current = setTimeout(() => {
      setTrustSignal(null)
      trustSignalTimerRef.current = null
    }, 6000)
  }, [])

  // --- Helper: apply loaded state to all React state ---
  const applyState = useCallback((state) => {
    setActiveSessionId(state.sessionId)
    setGoal(state.goal)
    setBuckets(state.buckets)
    setAssembled(state.assembled)
    setAssembledDirty(state.assembledDirty)
    setPromptPreviewMode(state.promptPreviewMode || false)
    setModel(resolveImageModel(state.model))
    setBatchSize(state.batchSize || 1)
    setRefs(state.refs)
    setLockedElements(state.lockedElements)
    setOutputs(state.outputs)
    setWinners(state.winners)
    systemMemory.hydrate(state)
  }, [systemMemory])

  // --- Helper: revoke current ref preview URLs ---
  const revokeRefUrls = useCallback(() => {
    refsRef.current.forEach((r) => {
      if (r.previewUrl) URL.revokeObjectURL(r.previewUrl)
    })
  }, [])

  const revokeRefListUrls = useCallback((refList) => {
    ;(refList || []).forEach((ref) => {
      if (ref?.previewUrl) URL.revokeObjectURL(ref.previewUrl)
    })
  }, [])

  const flushPendingSessionSave = useCallback(async () => {
    if (!activeSessionId) return
    if (pendingSessionSaveTimer) {
      clearTimeout(pendingSessionSaveTimer)
      pendingSessionSaveTimer = null
    }
    await persist.saveSessionFields(activeSessionId, {
      goal,
      buckets,
      assembledPrompt: assembled,
      assembledPromptDirty: assembledDirty,
      promptPreviewMode,
      model,
      batchSize,
    })
  }, [activeSessionId, goal, buckets, assembled, assembledDirty, promptPreviewMode, model, batchSize])

  const loadProjectIntoState = useCallback(async (projectId, { setAsActive = false, nextProjects = null } = {}) => {
    const requestId = ++loadRequestRef.current
    const [projectData, sitewideData, state, projectList] = await Promise.all([
      persist.loadAllProjectOutputsAndWinners(projectId),
      persist.loadAllSiteOutputsAndWinners(),
      persist.loadProjectState(projectId),
      nextProjects ? Promise.resolve(nextProjects) : persist.listAllProjects(),
    ])

    if (requestId !== loadRequestRef.current) {
      revokeRefListUrls(state.refs)
      return false
    }

    if (setAsActive) setActiveProjectId(projectId)
    setProjects(projectList)
    setProjectOutputCatalog(projectData.outputs)
    setSitewideOutputCatalog(sitewideData.outputs)
    setSitewideWinners(sitewideData.winners)
    applyState(state)
    return true
  }, [applyState, revokeRefListUrls])

  // --- Hydrate from IndexedDB on mount ---
  useEffect(() => {
    async function init() {
      try {
        const projectId = await persist.getActiveProjectId()
        await loadProjectIntoState(projectId, { setAsActive: true })
      } catch (err) {
        console.error('Failed to hydrate from IndexedDB:', err)
      }
      setHydrated(true)
    }
    init()
  }, [loadProjectIntoState])

  // --- Revoke preview URLs on unmount ---
  useEffect(() => {
    refsRef.current = refs
  }, [refs])

  useEffect(() => {
    outputsRef.current = outputs
  }, [outputs])

  // --- Revoke preview URLs on unmount ---
  useEffect(() => {
    return () => revokeRefUrls()
  }, [revokeRefUrls])

  useEffect(() => {
    return () => {
      if (trustSignalTimerRef.current) {
        clearTimeout(trustSignalTimerRef.current)
        trustSignalTimerRef.current = null
      }
    }
  }, [])

  // --- Persistence effects (only after hydration) ---

  // Save session-level fields (debounced)
  useEffect(() => {
    if (!hydrated || !activeSessionId) return
    const sid = activeSessionId
    if (pendingSessionSaveTimer) clearTimeout(pendingSessionSaveTimer)
    pendingSessionSaveTimer = setTimeout(() => {
      persist.saveSessionFields(sid, {
        goal,
        buckets,
        assembledPrompt: assembled,
        assembledPromptDirty: assembledDirty,
        promptPreviewMode,
        model,
        batchSize,
      })
      pendingSessionSaveTimer = null
    }, 500)

    return () => {
      if (pendingSessionSaveTimer) {
        clearTimeout(pendingSessionSaveTimer)
        pendingSessionSaveTimer = null
      }
    }
  }, [hydrated, activeSessionId, goal, buckets, assembled, assembledDirty, promptPreviewMode, model, batchSize])

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
    const nextName = buildNextProjectName(projects)
    const { projectId, project } = await persist.createProject(nextName)
    await persist.setActiveProjectId(projectId)
    revokeRefUrls()
    const nextProjects = [project, ...projects]
    await loadProjectIntoState(projectId, { setAsActive: true, nextProjects })
    return { projectId, project }
  }, [loadProjectIntoState, projects, revokeRefUrls])

  const handleSwitchProject = useCallback(async (projectId) => {
    if (projectId === activeProjectId) return
    await flushPendingSessionSave().catch((err) => {
      console.warn('[session] failed to flush before project switch', err)
    })
    if (pendingSessionSaveTimer) {
      clearTimeout(pendingSessionSaveTimer)
      pendingSessionSaveTimer = null
    }

    await persist.setActiveProjectId(projectId)
    revokeRefUrls()
    await loadProjectIntoState(projectId, { setAsActive: true, nextProjects: projects })
  }, [activeProjectId, flushPendingSessionSave, loadProjectIntoState, projects, revokeRefUrls])

  const handleOpenOutput = useCallback(async (output) => {
    if (!output?.id) return

    setRequestedOutputId(output.id)

    if (output.projectId === activeProjectId) {
      return
    }

    await flushPendingSessionSave().catch((err) => {
      console.warn('[session] failed to flush before output switch', err)
    })
    if (pendingSessionSaveTimer) {
      clearTimeout(pendingSessionSaveTimer)
      pendingSessionSaveTimer = null
    }

    if (output.projectId) {
      await persist.setActiveProjectId(output.projectId)
      revokeRefUrls()
      await loadProjectIntoState(output.projectId, { setAsActive: true, nextProjects: projects })
    }
  }, [activeProjectId, flushPendingSessionSave, loadProjectIntoState, projects, revokeRefUrls])

  // Re-read all shared JSON state from disk for the current project
  const handleSyncState = useCallback(async () => {
    const pid = activeProjectId
    if (!pid) return
    await loadProjectIntoState(pid, { nextProjects: projects })
  }, [activeProjectId, loadProjectIntoState, projects])

  // Auto-sync when data files change on disk (from CLI operator, etc.)
  const liveSync = useLiveSync(handleSyncState, hydrated)

  const recoverFromPersistenceError = useCallback(async (label, error) => {
    console.warn(`[studio] ${label} failed; re-syncing from disk`, error)
    await handleSyncState().then(() => {
      publishTrustSignal({
        tone: 'recovered',
        label: 'Recovered from save issue',
        detail: `${label} was restored from disk state.`,
      })
    }).catch((syncError) => {
      console.error('[studio] failed to recover from persistence error', syncError)
      publishTrustSignal({
        tone: 'error',
        label: 'Sync needs attention',
        detail: 'Automatic recovery failed. Refresh if the view looks stale.',
      })
    })
  }, [handleSyncState, publishTrustSignal])

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

  // --- Derived state ---

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

  const outputsById = useMemo(() => {
    const map = new Map()
    for (const output of outputs) {
      if (isPromptPreviewOutput(output)) continue
      map.set(output.id, output)
    }
    return map
  }, [outputs])

  const iterationContext = useMemo(
    () => buildIterationContext(winners, outputsById),
    [winners, outputsById]
  )

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId]
  )

  const workflowSummary = useMemo(() => ({
    outputCount: outputs.length,
    winnerCount: winners.length,
    refCount: refs.length,
    activeRefCount: refs.filter((ref) => ref.send !== false).length,
  }), [outputs, winners, refs])

  useEffect(() => {
    if (!activeProjectId) return

    let cancelled = false
    fetch(`/api/briefs/${activeProjectId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((brief) => {
        if (cancelled) return
        setProjectBrief(brief || null)
      })
      .catch(() => {
        if (!cancelled) setProjectBrief(null)
      })

    return () => {
      cancelled = true
    }
  }, [activeProjectId, outputs.length, winners.length])


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
        id: createId(),
        file,
        blob: file,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: url,
        send: true,
        createdAt: Date.now(),
      }
      if (activeSessionId) {
        try {
          await persist.saveRef(activeSessionId, { ...ref, refType: ref.refType || 'general' }, activeProjectId)
        } catch (error) {
          URL.revokeObjectURL(url)
          errors.push(`${file.name}: failed to save in the current session`)
          console.warn('[refs] failed to persist ref', error)
          continue
        }
      }
      validRefs.push(ref)
    }

    if (errors.length > 0) alert(`Some images were rejected:\n\n${errors.join('\n')}`)
    if (validRefs.length > 0) setRefs((prev) => [...prev, ...validRefs])
  }, [activeSessionId, activeProjectId])

  const handleUseOutputAsRef = useCallback(async (output) => {
    if (!activeSessionId || !activeProjectId) return
    const ref = {
      id: `ref-winner-${output.id}`,
      name: `Winner ${output.displayId || output.id.slice(0, 8)}`,
      refType: 'winner',
      sourceOutputId: output.id,
      imagePath: output.imagePath,
      send: false,
      createdAt: Date.now(),
      type: output.mimeType || 'image/jpeg',
      size: 0,
    }
    try {
      await persist.saveRef(activeSessionId, ref, activeProjectId)
      setRefs((prev) => {
        if (prev.some(r => r.sourceOutputId === output.id)) return prev
        const previewUrl = output.imagePath
          ? `/api/images/${output.id}`
          : null
        return [...prev, { ...ref, previewUrl }]
      })
    } catch (err) {
      console.warn('[refs] failed to save winner ref', err)
    }
  }, [activeSessionId, activeProjectId])

  const handleToggleRefSend = useCallback((id) => {
    setRefs((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const updated = { ...r, send: !r.send }
        if (activeSessionId) {
          persist.saveRef(activeSessionId, updated, activeProjectId).catch((error) => {
            recoverFromPersistenceError('ref include toggle', error)
          })
        }
        return updated
      })
    )
  }, [activeSessionId, activeProjectId, recoverFromPersistenceError])

  const handleUpdateRefMode = useCallback((id, mode) => {
    setRefs((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        // Map mode to anchor for backward compat with operator prompt assembly
        const anchor = mode === 'match' || mode === 'style'
        const updated = { ...r, mode, anchor }
        if (activeSessionId) {
          persist.saveRef(activeSessionId, updated, activeProjectId).catch((error) => {
            recoverFromPersistenceError('ref mode update', error)
          })
        }
        return updated
      })
    )
  }, [activeSessionId, activeProjectId, recoverFromPersistenceError])

  const handleReorderRefs = useCallback((newOrder) => {
    setRefs((prev) => {
      const refMap = new Map(prev.map((r) => [r.id, r]))
      return newOrder.map((id) => refMap.get(id)).filter(Boolean)
    })
    // Persist the new order via session refIds
    if (activeSessionId) {
      persist.updateRefIds?.(activeSessionId, newOrder).catch((error) => {
        recoverFromPersistenceError('ref reorder', error)
      })
    }
  }, [activeSessionId, recoverFromPersistenceError])

  const handleUpdateRefNotes = useCallback((id, notes) => {
    setRefs((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const updated = { ...r, notes }
        if (activeSessionId) {
          persist.saveRef(activeSessionId, updated, activeProjectId).catch((error) => {
            recoverFromPersistenceError('ref notes update', error)
          })
        }
        return updated
      })
    )
  }, [activeSessionId, activeProjectId, recoverFromPersistenceError])

  const handleRemoveRef = useCallback((id) => {
    setRefs((prev) => {
      const target = prev.find((r) => r.id === id)
      if (target && target.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((r) => r.id !== id)
    })
    persist.deleteRef(id).catch((error) => {
      recoverFromPersistenceError('ref removal', error)
    })
  }, [recoverFromPersistenceError])

  const handleMarkWinner = useCallback(async (output) => {
    if (!output || !activeProjectId || !activeSessionId) return
    const existingIdx = winners.findIndex((w) => w.outputId === output.id)
    if (existingIdx >= 0) {
      // Remove winner
      const winnerId = winners[existingIdx].id
      const next = winners.filter((w) => w.id !== winnerId)
      setWinners(next)
      persist.deleteWinner(winnerId).catch((error) => {
        recoverFromPersistenceError('winner removal', error)
      })
      handleUpdateOutputFeedback(output.id, null)
    } else {
      // Add winner
      const winner = {
        id: createId(),
        sessionId: activeSessionId,
        outputId: output.id,
        feedback: output.feedback,
        recipe: {
          prompt: output.finalPromptSent || output.prompt || '',
          model: output.model,
        },
        createdAt: Date.now(),
      }
      setWinners((prev) => [...prev, winner])
      persist.saveWinner(activeProjectId, activeSessionId, winner).catch((error) => {
        recoverFromPersistenceError('winner save', error)
      })

      // Auto-rate 5 when marking winner
      if (output.feedback !== 5) {
        handleUpdateOutputFeedback(output.id, 5)
      }

      // Auto-add recipe to upscale queue
      try {
        const queueItem = {
          id: createId(),
          outputId: output.id,
          name: output.model || 'Image',
          model: output.model || '',
          prompt: output.finalPromptSent || output.prompt || '',
          imageSize: output.metadata?.imageSize || '',
          aspectRatio: output.metadata?.aspectRatio || '',
          status: 'pending',
          createdAt: Date.now(),
        }
        const res = await fetch('/api/upscale-queue')
        const queue = res.ok ? await res.json() : []
        // Don't duplicate if already queued
        if (!queue.some((q) => q.outputId === output.id)) {
          queue.push(queueItem)
          await fetch('/api/upscale-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queue),
          })
        }
      } catch (error) {
        console.warn('[winner-upscale-sync] failed to queue upscale recipe', error)
      }
    }
  }, [activeProjectId, activeSessionId, winners, recoverFromPersistenceError])

  const handleUpdateOutputFeedback = useCallback((outputId, feedback) => {
    setOutputs((prev) =>
      prev.map((output) => {
        if (output.id !== outputId) return output
        if (output.feedback === feedback) return output
        const updated = { ...output, feedback }
        if (activeProjectId && activeSessionId) {
          persist.saveOutput(activeProjectId, activeSessionId, updated).catch((error) => {
            recoverFromPersistenceError('output feedback save', error)
          })
        }
        return updated
      })
    )
  }, [activeProjectId, activeSessionId, recoverFromPersistenceError])

  const handleUpdateOutputNotes = useCallback(async (outputId, notesKeep, notesFix) => {
    const existingOutput = outputsRef.current.find((output) => output.id === outputId)
    if (!existingOutput || !activeProjectId || !activeSessionId) return

    const updatedOutput = {
      ...existingOutput,
      notesKeep: notesKeep || '',
      notesFix: notesFix || '',
    }

    setOutputs((prev) =>
      prev.map((output) => (output.id === outputId ? updatedOutput : output))
    )

    try {
      await persist.saveOutput(activeProjectId, activeSessionId, updatedOutput)
    } catch (error) {
      await recoverFromPersistenceError('output notes save', error)
      throw error
    }
  }, [activeProjectId, activeSessionId, recoverFromPersistenceError])

  const handleUpdatePromptPreviewText = useCallback(async (outputId, promptSections, promptText) => {
    const existingOutput = outputsRef.current.find((output) => output.id === outputId)
    if (!existingOutput || !activeProjectId || !activeSessionId) return

    const sections = normalizePromptSections(
      promptSections || existingOutput.promptPreviewSections || parseStructuredPrompt(promptText || existingOutput.promptPreviewText || '')
    )
    const nextPromptText = promptText || renderStructuredPrompt(sections)

    const updatedOutput = {
      ...existingOutput,
      promptPreviewSections: sections,
      promptPreviewText: nextPromptText,
    }

    setOutputs((prev) =>
      prev.map((output) => (output.id === outputId ? updatedOutput : output))
    )

    try {
      await persist.saveOutput(activeProjectId, activeSessionId, updatedOutput)
    } catch (error) {
      await recoverFromPersistenceError('prompt preview edit save', error)
      throw error
    }
  }, [activeProjectId, activeSessionId, recoverFromPersistenceError])

  const handleUsePromptPreviewAsBase = useCallback(async (outputId, promptSections, promptText) => {
    if (!activeSessionId) return
    const sections = normalizePromptSections(promptSections || parseStructuredPrompt(promptText || ''))
    const nextPromptText = promptText || renderStructuredPrompt(sections)
    setBuckets(sections)
    setAssembled(nextPromptText)
    setAssembledDirty(true)
    try {
      await persist.saveSessionFields(activeSessionId, {
        buckets: sections,
        assembledPrompt: nextPromptText,
        assembledPromptDirty: true,
      })
    } catch (error) {
      await recoverFromPersistenceError('prompt preview base apply', error)
      throw error
    }
  }, [activeSessionId, recoverFromPersistenceError])

  const handleTogglePromptPreview = useCallback(() => {
    const nextValue = !promptPreviewMode
    setPromptPreviewMode(nextValue)
    if (activeSessionId) {
      persist.saveSessionFields(activeSessionId, {
        promptPreviewMode: nextValue,
      }).catch((error) => {
        recoverFromPersistenceError('prompt preview mode save', error)
      })
    }
  }, [activeSessionId, promptPreviewMode, recoverFromPersistenceError])

  // --- Loading state ---
  if (!hydrated) {
    return <AppLoadingScreen />
  }

  return (
    <div className="app">
      <ReviewConsole
          outputs={outputsWithDisplayIds}
          stripOutputs={sitewideOutputCatalog}
          winners={winnersWithDisplayIds}
          stripWinners={sitewideWinners}
          projects={projects}
          activeProjectId={activeProjectId}
          activeSessionId={activeSessionId}
          project={activeProject}
          requestedOutputId={requestedOutputId}
          onConsumeRequestedOutputId={() => setRequestedOutputId(null)}
          onOpenOutput={handleOpenOutput}
          refs={refs}
          onAddRefs={handleAddRefs}
          onUseAsRef={handleUseOutputAsRef}
          onRemoveRef={handleRemoveRef}
          onToggleRefSend={handleToggleRefSend}
          onUpdateRefMode={handleUpdateRefMode}
          onReorderRefs={handleReorderRefs}
          onUpdateRefNotes={handleUpdateRefNotes}
          onUpdateOutputFeedback={handleUpdateOutputFeedback}
          onUpdateFeedbackNotes={handleUpdateOutputNotes}
          onSwitchProject={handleSwitchProject}
          onCreateProject={handleCreateProject}
          onRenameProject={handleRenameProject}
          onArchiveProject={handleArchiveProject}
          onRestoreProject={handleRestoreProject}
          onMarkWinner={handleMarkWinner}
          liveSync={liveSync}
          trustSignal={trustSignal}
          workflowSummary={workflowSummary}
          iterationContext={iterationContext}
          memoryStatus={systemMemory.status}
          projectBrief={projectBrief}
          promptPreviewMode={promptPreviewMode}
          onTogglePromptPreview={handleTogglePromptPreview}
          onUpdatePromptPreviewText={handleUpdatePromptPreviewText}
          onUsePromptPreviewAsBase={handleUsePromptPreviewAsBase}
        />
    </div>
  )
}
