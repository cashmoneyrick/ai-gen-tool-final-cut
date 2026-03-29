import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import ProjectBar from './components/ProjectBar'
import SessionHeader from './components/SessionHeader'
import WorkArea from './components/WorkArea'
import Outputs from './components/Outputs'
import Winners from './components/Winners'
import SuggestedMemories from './components/SuggestedMemories'
import PlanHistory from './components/PlanHistory'
import SystemMemoryStatus from './components/SystemMemoryStatus'
import SystemInspector from './components/SystemInspector'
import CarryForwardIndicator from './components/CarryForwardIndicator'
import OperatorConsole from './console/OperatorConsole'
import useSystemMemory from './hooks/useSystemMemory'
import { buildIterationContext, formatIterationContextForPlan, formatIterationContextForGeneration } from './planning/iterationContext'
import { analyzePatterns } from './analysis/patternEngine'
import { generateImages, prepareRefs, fetchConfig } from './api/gemini'
import { generatePlan } from './api/plan'
import * as persist from './storage/session'
import { buildAllSourceLists, buildPlanPayload, buildSourceSnapshot } from './planning/sourcePipeline'
import { STARTER_ENTRIES } from './knowledge/starterEntries'
import { deriveTaskContext, getRelevantKnowledge, getKnowledgeForPlanning } from './knowledge/retrieval'
import { getEffectiveFeedback, feedbackToPreferenceType } from './reviewFeedback'

const EMPTY_BUCKETS = {
  subject: '',
  style: '',
  lighting: '',
  composition: '',
  technical: '',
}

const FALLBACK_OUTPUT_DISPLAY_ID = 'Output —'

function assembleBuckets(buckets) {
  return ['subject', 'style', 'lighting', 'composition', 'technical']
    .map((key) => buckets[key])
    .filter(Boolean)
    .join('. ')
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

function deriveSuggestionFromWinner(winner, output) {
  const hasNotes = winner.notes && winner.notes.trim().length > 10
  // Conservative: require substantial notes for any suggestion
  // Bare thumbs without notes are too vague — skip them
  if (!hasNotes) return null

  const feedback = getEffectiveFeedback(output, winner)
  let suggestedType, text, reason

  if (feedback === 'up') {
    suggestedType = 'success'
    text = winner.notes.trim()
    reason = 'Winner notes linked to thumbs-up feedback'
  } else if (feedback === 'down') {
    suggestedType = 'failure'
    text = winner.notes.trim()
    reason = 'Winner notes linked to thumbs-down feedback'
  } else {
    suggestedType = 'correction'
    text = winner.notes.trim()
    reason = 'Detailed notes on winner'
  }

  return { suggestedType, text, reason }
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
  const [plan, setPlan] = useState(null)
  const [planStatus, setPlanStatus] = useState('idle')
  const [planError, setPlanError] = useState(null)
  const [buckets, setBuckets] = useState({ ...EMPTY_BUCKETS })
  const [assembled, setAssembled] = useState('')
  const [assembledDirty, setAssembledDirty] = useState(false)
  const [refs, setRefs] = useState([])
  const refsRef = useRef(refs)
  refsRef.current = refs

  // Generation state
  const [genJobs, setGenJobs] = useState([])
  const [batchSize, setBatchSize] = useState(1)
  const [outputs, setOutputs] = useState([])
  const [projectOutputCatalog, setProjectOutputCatalog] = useState([])

  // Winners state
  const [winners, setWinners] = useState([])

  // Locked elements state
  const [lockedElements, setLockedElements] = useState([])

  // System memory (memories, docs, shared knowledge, lessons, overrides)
  const systemMemory = useSystemMemory({ activeProjectId, activeSessionId })

  // Suggested memories + pattern insights state
  const [suggestions, setSuggestions] = useState([])
  const [analyzingPatterns, setAnalyzingPatterns] = useState(false)

  // System inspector drawer state
  const [inspectorOpen, setInspectorOpen] = useState(false)

  // Operator console toggle state
  const [consoleOpen, setConsoleOpen] = useState(false)

  // Model selection state
  const [model, setModel] = useState('gemini-3.1-flash-image-preview')
  const [availableModels, setAvailableModels] = useState([])

  // Derived generation state
  const isGenerating = genJobs.some((j) => j.status === 'queued' || j.status === 'generating')

  // Goal dirty tracking
  const [goalDirtyAfterApproval, setGoalDirtyAfterApproval] = useState(false)

  // Per-run plan source overrides (ephemeral, typed keys like "memory:<id>")
  const [planExcludedKeys, setPlanExcludedKeys] = useState(new Set())
  const [planSourceSnapshot, setPlanSourceSnapshot] = useState(null)

  // Plan history + outcome linkage state
  const [planRuns, setPlanRuns] = useState([])
  const [activePlanRunId, setActivePlanRunId] = useState(null)

  // (Project lessons and knowledge overrides are managed by systemMemory hook)

  // --- Helper: apply loaded state to all React state ---
  const applyState = useCallback((state) => {
    setActiveSessionId(state.sessionId)
    setGoal(state.goal)
    setGoalDirtyAfterApproval(state.goalDirtyAfterApproval)
    setPlan(state.plan)
    setPlanStatus(state.planStatus === 'generating' ? 'idle' : state.planStatus)
    setPlanError(null)
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
    setSuggestions(state.suggestions || [])
    setPlanExcludedKeys(new Set())
    setPlanSourceSnapshot(null)
    setPlanRuns(state.planRuns || [])
    setActivePlanRunId(null)
    setGenJobs([])
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
          persist.listProjects(),
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

  // --- Fetch available models on mount ---
  useEffect(() => {
    fetchConfig()
      .then(({ defaultModel, availableModels: models }) => {
        if (!hydrated) setModel(defaultModel)
        setAvailableModels(models)
      })
      .catch(() => {
        setAvailableModels([
          { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2' },
          { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro' },
        ])
      })
  }, [hydrated])

  // --- Revoke preview URLs on unmount ---
  useEffect(() => {
    return () => revokeRefUrls()
  }, [revokeRefUrls])

  // --- Auto-sync assembled from buckets when not dirty ---
  useEffect(() => {
    if (!assembledDirty) {
      setAssembled(assembleBuckets(buckets))
    }
  }, [buckets, assembledDirty])

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
        goalDirtyAfterApproval,
        planStatus,
        approvedPlan: plan,
        buckets,
        assembledPrompt: assembled,
        assembledPromptDirty: assembledDirty,
        model,
        batchSize,
      })
    })
  }, [hydrated, activeSessionId, goal, goalDirtyAfterApproval, planStatus, plan, buckets, assembled, assembledDirty, model, batchSize, debouncedSave])

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

  const handleRenameProject = useCallback(async (projectId, name) => {
    await persist.renameProject(projectId, name)
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, name, updatedAt: Date.now() } : p))
    )
  }, [])

  // --- Session handlers ---

  const handleGoalChange = useCallback((value) => {
    setGoal(value)
    if (planStatus === 'approved') {
      setGoalDirtyAfterApproval(true)
    }
  }, [planStatus])

  const handleResetSession = useCallback(() => {
    setPlan(null)
    setPlanStatus('idle')
    setPlanError(null)
    setBuckets({ ...EMPTY_BUCKETS })
    setAssembled('')
    setAssembledDirty(false)
    revokeRefUrls()
    setRefs([])
    setOutputs([])
    setProjectOutputCatalog((prev) =>
      prev.filter((output) => !outputs.some((current) => current.id === output.id))
    )
    setGenJobs([])
    setWinners([])
    setLockedElements([])
    setGoalDirtyAfterApproval(false)
    setPlanExcludedKeys(new Set())
    setPlanSourceSnapshot(null)
    setActivePlanRunId(null)
    if (activeSessionId) persist.clearSession(activeSessionId)
  }, [activeSessionId, outputs, revokeRefUrls])

  const handleDismissGoalWarning = useCallback(() => {
    setGoalDirtyAfterApproval(false)
  }, [])

  const handleTogglePlanExclude = useCallback((key) => {
    setPlanExcludedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleClearPlanExcludes = useCallback(() => {
    setPlanExcludedKeys(new Set())
  }, [])

  // Active source sets for planning (from system memory boundary)
  const { memories: activePlanMemories, docs: activePlanDocs, sharedMemories: activePlanSharedMemories, sharedDocs: activePlanSharedDocs } = systemMemory.active
  const outputsById = useMemo(() => {
    const map = new Map()
    for (const output of outputs) map.set(output.id, output)
    return map
  }, [outputs])

  // Derive task context and relevant starter knowledge (pure, no persistence)
  const taskContext = useMemo(
    () => deriveTaskContext({ goal, refs, buckets, outputs, winners }),
    [goal, refs, buckets, outputs, winners]
  )

  const relevantKnowledge = useMemo(
    () => getRelevantKnowledge(STARTER_ENTRIES, taskContext, { overrides: systemMemory.data.knowledgeOverrides }),
    [taskContext, systemMemory.data.knowledgeOverrides]
  )

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

  const handleGeneratePlan = useCallback(async () => {
    setPlanStatus('generating')
    setPlanError(null)

    const projectName = projects.find((p) => p.id === activeProjectId)?.name || 'Default Project'

    // Only pass approved plan as prior context
    const priorPlan = planStatus === 'approved' ? plan : null

    // Cap outputs to last 8
    const recentOutputs = outputs.slice(0, 8).map((o) => ({
      model: o.model,
      finalPromptSent: o.finalPromptSent?.slice(0, 200) || null,
      finishReason: o.metadata?.finishReason || null,
      createdAt: o.createdAt,
    }))

    // Cap winners to 8, prioritize ones with feedback/notes
    const sortedWinners = [...winners]
      .sort((a, b) => {
        const aScore = (getEffectiveFeedback(outputsById.get(a.outputId), a) ? 2 : 0) + (a.notes ? 1 : 0)
        const bScore = (getEffectiveFeedback(outputsById.get(b.outputId), b) ? 2 : 0) + (b.notes ? 1 : 0)
        return bScore - aScore
      })
      .slice(0, 8)
      .map((w) => ({
        finalPromptSent: w.finalPromptSent?.slice(0, 200) || null,
        feedback: getEffectiveFeedback(outputsById.get(w.outputId), w),
        notes: w.notes?.slice(0, 150) || '',
        model: w.model,
      }))

    // Build source lists using shared pipeline (same logic as PlanSources inspector)
    const sourceLists = buildAllSourceLists({
      memories: activePlanMemories,
      docs: activePlanDocs,
      sharedMemories: activePlanSharedMemories,
      sharedDocs: activePlanSharedDocs,
      excludedKeys: planExcludedKeys,
    })

    // Build trimmed payload for API
    const sourcePayload = buildPlanPayload(sourceLists)

    // Capture snapshot of what we're sending (for post-plan display)
    const snapshot = buildSourceSnapshot(sourceLists, planExcludedKeys.size)

    // Retrieve relevant starter knowledge for this task context (with project overrides applied)
    const planKnowledge = getKnowledgeForPlanning(STARTER_ENTRIES, taskContext, systemMemory.data.knowledgeOverrides)

    const context = {
      goal,
      projectName,
      approvedPlan: priorPlan ? { summary: priorPlan.summary, buckets: priorPlan.buckets } : null,
      buckets,
      assembledPrompt: assembled?.slice(0, 500) || '',
      lockedElements: lockedElements.filter((el) => el.enabled).map((el) => el.text),
      refs: refs.map((r) => ({ name: r.name, type: r.type, size: r.size })),
      outputs: recentOutputs,
      winners: sortedWinners,
      ...sourcePayload,
      starterKnowledge: planKnowledge,
      iterationContext: iterationContext ? formatIterationContextForPlan(iterationContext) : null,
    }

    try {
      const newPlan = await generatePlan(context)
      setPlan(newPlan)
      setPlanSourceSnapshot(snapshot)
      setPlanStatus('generated')

      // Create planRun record
      const planRun = {
        id: crypto.randomUUID(),
        projectId: activeProjectId,
        sessionId: activeSessionId,
        createdAt: Date.now(),
        approvedAt: null,
        status: 'generated',
        planModel: newPlan.planMeta?.model || null,
        durationMs: newPlan.planMeta?.durationMs || null,
        goalSnapshot: goal,
        planData: newPlan,
        sourceSnapshot: snapshot,
        contextSummary: newPlan.contextUsed || null,
        outputIds: [],
        winnerIds: [],
        note: '',
      }
      persist.savePlanRun(planRun)
      setPlanRuns((prev) => [planRun, ...prev])
      setActivePlanRunId(planRun.id)
    } catch (err) {
      setPlanError(err.message)
      setPlanStatus('idle')
    }
  }, [goal, projects, activeProjectId, activeSessionId, planStatus, plan, buckets, assembled, lockedElements, refs, outputs, winners, activePlanMemories, activePlanDocs, activePlanSharedMemories, activePlanSharedDocs, planExcludedKeys, taskContext, systemMemory.data.knowledgeOverrides, outputsById, iterationContext])

  const handleApprovePlan = useCallback(() => {
    if (plan) {
      setBuckets({ ...plan.buckets })
      setPlanStatus('approved')
      setPlanError(null)
      if (activePlanRunId) {
        const updates = { status: 'approved', approvedAt: Date.now() }
        persist.updatePlanRun(activePlanRunId, updates)
        setPlanRuns((prev) => prev.map((r) =>
          r.id === activePlanRunId ? { ...r, ...updates } : r
        ))
      }
    }
  }, [plan, activePlanRunId])

  const handleDismissPlan = useCallback(() => {
    setPlan(null)
    setPlanStatus('idle')
    setPlanError(null)
    setActivePlanRunId(null)
  }, [])

  const handleAddRefs = useCallback((files) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    const newRefs = imageFiles.map((file) => {
      const ref = {
        id: crypto.randomUUID(),
        file,
        blob: file,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: URL.createObjectURL(file),
        send: true,
        createdAt: Date.now(),
      }
      if (activeSessionId) persist.saveRef(activeSessionId, ref)
      return ref
    })
    setRefs((prev) => [...prev, ...newRefs])
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

  const handleRemoveRef = useCallback((id) => {
    setRefs((prev) => {
      const target = prev.find((r) => r.id === id)
      if (target && target.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((r) => r.id !== id)
    })
    persist.deleteRef(id)
  }, [])

  const handleAddLocked = useCallback((text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const el = {
      id: crypto.randomUUID(),
      text: trimmed,
      enabled: true,
      createdAt: Date.now(),
    }
    if (activeSessionId) persist.saveLockedElement(activeSessionId, el)
    setLockedElements((prev) => [...prev, el])
  }, [activeSessionId])

  const handleRemoveLocked = useCallback((id) => {
    setLockedElements((prev) => prev.filter((el) => el.id !== id))
    persist.deleteLockedElement(id)
  }, [])

  const handleToggleLocked = useCallback((id) => {
    setLockedElements((prev) =>
      prev.map((el) => {
        if (el.id !== id) return el
        const updated = { ...el, enabled: !el.enabled }
        if (activeSessionId) persist.saveLockedElement(activeSessionId, updated)
        return updated
      })
    )
  }, [activeSessionId])

  const handleAssembledChange = useCallback((value) => {
    setAssembled(value)
    setAssembledDirty(true)
  }, [])

  const handleResync = useCallback(() => {
    setAssembled(assembleBuckets(buckets))
    setAssembledDirty(false)
  }, [buckets])

  // --- Small helpers for planRun linkage updates ---
  // Derive next IDs deterministically, then use same value for state + persist
  const planRunsRef = useRef(planRuns)
  planRunsRef.current = planRuns

  const appendPlanRunOutputIds = useCallback((planRunId, newIds) => {
    const run = planRunsRef.current.find((r) => r.id === planRunId)
    if (!run) return
    const nextOutputIds = [...(run.outputIds || []), ...newIds]
    setPlanRuns((prev) => prev.map((r) =>
      r.id === planRunId ? { ...r, outputIds: nextOutputIds } : r
    ))
    persist.updatePlanRun(planRunId, { outputIds: nextOutputIds })
  }, [])

  const appendPlanRunWinnerIds = useCallback((planRunId, newId) => {
    const run = planRunsRef.current.find((r) => r.id === planRunId)
    if (!run) return
    const nextWinnerIds = [...(run.winnerIds || []), newId]
    setPlanRuns((prev) => prev.map((r) =>
      r.id === planRunId ? { ...r, winnerIds: nextWinnerIds } : r
    ))
    persist.updatePlanRun(planRunId, { winnerIds: nextWinnerIds })
  }, [])

  const handleUpdatePlanRunNote = useCallback((runId, note) => {
    persist.updatePlanRun(runId, { note })
    setPlanRuns((prev) => prev.map((r) =>
      r.id === runId ? { ...r, note } : r
    ))
  }, [])

  // (Lesson, override, memory, doc, and shared knowledge handlers are managed by systemMemory hook)

  const handleGenerate = useCallback(async (assembledPrompt) => {
    if (!assembledPrompt.trim()) return

    const activeLockedElements = lockedElements.filter((el) => el.enabled)
    const activeLockedTexts = activeLockedElements.map((el) => el.text)

    // Build carry-forward preamble from iteration context (if any)
    const genCarryForward = formatIterationContextForGeneration(iterationContext)

    // Prompt order: locked elements (highest priority) → iteration guidance → assembled prompt
    const parts = [...activeLockedTexts]
    if (genCarryForward) parts.push(genCarryForward.preamble)
    if (assembledPrompt.trim()) parts.push(assembledPrompt.trim())
    const finalPrompt = parts.join('\n\n')

    const sendingRefs = refsRef.current.filter((r) => r.send)
    const sentRefIds = new Set(sendingRefs.map((r) => r.id))
    const sentRefsMeta = sendingRefs.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      size: r.size,
    }))

    // Snapshot context for output records
    const currentPlanRunId = planStatus === 'approved' && activePlanRunId ? activePlanRunId : null
    const outputContext = {
      provider: 'gemini',
      model,
      sessionGoal: goal,
      approvedPlanSnapshot: plan,
      bucketSnapshot: { ...buckets },
      assembledPromptSnapshot: assembledPrompt,
      activeLockedElementsSnapshot: activeLockedElements.map((el) => el.text),
      finalPromptSent: finalPrompt,
      sentRefs: sentRefsMeta,
      prompt: finalPrompt,
      planRunId: currentPlanRunId,
      iterationPreamble: genCarryForward?.preamble || null,
      iterationSnapshot: genCarryForward?.snapshot || null,
    }

    // Convert refs once for all jobs (avoid redundant base64 encoding)
    const convertStart = Date.now()
    const refPayloads = sendingRefs.length > 0 ? await prepareRefs(sendingRefs) : []
    if (sendingRefs.length > 0) {
      console.log(`[gen] refs converted (${sendingRefs.length}) in ${Date.now() - convertStart}ms`)
    }

    // Create job objects (store retry context so failed jobs can be re-fired)
    const retryContext = { finalPrompt, refPayloads, model: model, outputContext }
    const jobs = Array.from({ length: batchSize }, () => ({
      id: crypto.randomUUID(),
      status: 'queued',
      startedAt: null,
      endedAt: null,
      elapsed: null,
      error: null,
      errorCode: null,
      retryable: false,
      _retryContext: retryContext,
    }))
    setGenJobs(jobs)

    // Elapsed time ticker — updates every second while jobs are active
    const intervalId = setInterval(() => {
      setGenJobs((prev) =>
        prev.map((j) =>
          j.status === 'generating' && j.startedAt
            ? { ...j, elapsed: Date.now() - j.startedAt }
            : j
        )
      )
    }, 1000)

    // Helper to update a single job by id
    const updateJob = (jobId, updates) => {
      setGenJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, ...updates } : j))
      )
    }

    const batchStart = Date.now()
    let firstImageLogged = false

    // Fire all jobs in parallel
    const promises = jobs.map(async (job, jobIndex) => {
      const now = Date.now()
      console.log(`[gen] job ${jobIndex + 1}/${batchSize} request sent at ${now}`)
      updateJob(job.id, { status: 'generating', startedAt: now, elapsed: 0 })

      try {
        const result = await generateImages(finalPrompt, refPayloads, model)
        const endedAt = Date.now()
        console.log(`[gen] job ${jobIndex + 1}/${batchSize} completed in ${endedAt - now}ms`)
        if (!firstImageLogged) {
          firstImageLogged = true
          console.log(`[gen] first image rendered at +${endedAt - batchStart}ms`)
        }
        const newOutputs = result.images.map((img) => {
          const output = {
            id: crypto.randomUUID(),
            dataUrl: img.dataUrl,
            mimeType: img.mimeType,
            createdAt: endedAt,
            feedback: null,
            status: 'succeeded',
            errorCode: null,
            errorMessage: null,
            ...outputContext,
            metadata: result.metadata || null,
          }
          if (activeProjectId && activeSessionId) {
            persist.saveOutput(activeProjectId, activeSessionId, output)
          }
          return output
        })
        setProjectOutputCatalog((prev) => [...prev, ...newOutputs])
        setOutputs((prev) => [...newOutputs, ...prev])
        updateJob(job.id, {
          status: 'succeeded',
          endedAt,
          elapsed: endedAt - now,
        })
        return { status: 'succeeded', outputIds: newOutputs.map((o) => o.id) }
      } catch (err) {
        const endedAt = Date.now()
        console.error(`[gen] job ${jobIndex + 1}/${batchSize} failed: ${err.code || 'UNKNOWN'} — ${err.message}${err.detail ? ` (${err.detail})` : ''}`)
        const isRateLimited = err.status === 429 || err.code === 'RATE_LIMITED'
        updateJob(job.id, {
          status: isRateLimited ? 'rate_limited' : 'failed',
          endedAt,
          elapsed: endedAt - now,
          error: err.message,
          errorCode: err.code || 'UNKNOWN',
          retryable: err.retryable ?? !isRateLimited,
        })
        return { status: isRateLimited ? 'rate_limited' : 'failed' }
      }
    })

    // Wait for all to settle, then stamp refs and clean up timer
    const results = await Promise.all(promises)
    clearInterval(intervalId)
    console.log(`[gen] batch complete: ${results.filter((r) => r.status === 'succeeded').length}/${batchSize} succeeded in ${Date.now() - batchStart}ms`)

    // Link output IDs to active planRun (only when plan is approved)
    if (currentPlanRunId) {
      const allNewOutputIds = results.flatMap((r) => r.outputIds || [])
      if (allNewOutputIds.length > 0) {
        appendPlanRunOutputIds(currentPlanRunId, allNewOutputIds)
      }
    }

    const anySucceeded = results.some((r) => r.status === 'succeeded')
    const stampStatus = anySucceeded ? 'sent' : 'failed'
    const stampNow = Date.now()
    setRefs((prev) =>
      prev.map((r) => {
        if (!sentRefIds.has(r.id)) return r
        const updated = { ...r, lastRequestStatus: stampStatus, lastRequestAt: stampNow }
        if (activeSessionId) persist.saveRef(activeSessionId, updated)
        return updated
      })
    )
  }, [lockedElements, model, goal, plan, planStatus, activePlanRunId, buckets, batchSize, activeProjectId, activeSessionId, appendPlanRunOutputIds, iterationContext])

  const handleRetryJob = useCallback(async (jobId) => {
    const job = genJobs.find((j) => j.id === jobId)
    if (!job || !job._retryContext) return
    const { finalPrompt, refPayloads, model: jobModel, outputContext } = job._retryContext

    // Reset job to generating state
    const now = Date.now()
    setGenJobs((prev) =>
      prev.map((j) => j.id !== jobId ? j : {
        ...j, status: 'generating', startedAt: now, endedAt: null,
        elapsed: 0, error: null, errorCode: null, retryable: false,
      })
    )

    // Elapsed ticker for this single retry
    const intervalId = setInterval(() => {
      setGenJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.status === 'generating' && j.startedAt
            ? { ...j, elapsed: Date.now() - j.startedAt }
            : j
        )
      )
    }, 1000)

    try {
      console.log(`[gen] retry job ${jobId} request sent at ${Date.now()}`)
      const result = await generateImages(finalPrompt, refPayloads, jobModel)
      const endedAt = Date.now()
      console.log(`[gen] retry job succeeded in ${endedAt - now}ms`)
      const newOutputs = result.images.map((img) => {
        const output = {
          id: crypto.randomUUID(),
          dataUrl: img.dataUrl,
          mimeType: img.mimeType,
          createdAt: endedAt,
          feedback: null,
          status: 'succeeded',
          errorCode: null,
          errorMessage: null,
          ...outputContext,
          metadata: result.metadata || null,
        }
        if (activeProjectId && activeSessionId) {
          persist.saveOutput(activeProjectId, activeSessionId, output)
        }
        return output
      })
      setProjectOutputCatalog((prev) => [...prev, ...newOutputs])
      setOutputs((prev) => [...newOutputs, ...prev])
      setGenJobs((prev) =>
        prev.map((j) => j.id !== jobId ? j : {
          ...j, status: 'succeeded', endedAt, elapsed: endedAt - now,
        })
      )
    } catch (err) {
      const endedAt = Date.now()
      console.error(`[gen] retry failed: ${err.code || 'UNKNOWN'} — ${err.message}`)
      const isRateLimited = err.status === 429 || err.code === 'RATE_LIMITED'
      setGenJobs((prev) =>
        prev.map((j) => j.id !== jobId ? j : {
          ...j,
          status: isRateLimited ? 'rate_limited' : 'failed',
          endedAt, elapsed: endedAt - now,
          error: err.message, errorCode: err.code || 'UNKNOWN',
          retryable: err.retryable ?? true,
        })
      )
    } finally {
      clearInterval(intervalId)
    }
  }, [genJobs, activeProjectId, activeSessionId])

  const handleSaveWinner = useCallback((outputId) => {
    setWinners((prevWinners) => {
      if (prevWinners.some((w) => w.outputId === outputId)) return prevWinners

      const output = outputs.find((o) => o.id === outputId)
      if (!output) return prevWinners

      const winner = {
        id: crypto.randomUUID(),
        outputId: output.id,
        dataUrl: output.dataUrl,
        mimeType: output.mimeType,
        createdAt: Date.now(),
        provider: output.provider || 'gemini',
        model: output.model || (output.metadata?.model) || null,
        finalPromptSent: output.finalPromptSent || output.prompt,
        sentRefs: output.sentRefs || [],
        metadata: output.metadata || null,
        prompt: output.prompt,
        feedback: output.feedback ?? null,
        notes: '',
        planRunId: output.planRunId || null,
      }
      if (activeProjectId && activeSessionId) {
        persist.saveWinner(activeProjectId, activeSessionId, winner)
      }
      // Link winner to planRun if output had one
      if (output.planRunId) {
        appendPlanRunWinnerIds(output.planRunId, winner.id)
      }
      return [...prevWinners, winner]
    })
  }, [outputs, activeProjectId, activeSessionId, appendPlanRunWinnerIds])

  const maybeCreateSuggestion = useCallback(async (winner, outputOverride = null) => {
    const derived = deriveSuggestionFromWinner(
      winner,
      outputOverride || outputsById.get(winner.outputId)
    )
    const existing = await persist.getSuggestionByWinnerId(winner.id)

    if (existing) {
      if (!derived) {
        // Notes removed or too short — dismiss the pending suggestion
        await persist.updateSuggestion(existing.id, { status: 'dismissed' })
        setSuggestions((prev) => prev.filter((s) => s.id !== existing.id))
        return
      }
      // Update existing pending suggestion
      const updates = { suggestedType: derived.suggestedType, text: derived.text, reason: derived.reason }
      await persist.updateSuggestion(existing.id, updates)
      setSuggestions((prev) => prev.map((s) => (s.id === existing.id ? { ...s, ...updates } : s)))
      return
    }

    if (!derived) return

    const suggestion = {
      id: crypto.randomUUID(),
      projectId: activeProjectId,
      sessionId: activeSessionId || null,
      outputId: winner.outputId || null,
      winnerId: winner.id,
      createdAt: Date.now(),
      suggestedType: derived.suggestedType,
      text: derived.text,
      reason: derived.reason,
      source: 'derived',
      status: 'pending',
    }
    await persist.saveSuggestion(suggestion)
    setSuggestions((prev) => [suggestion, ...prev])
  }, [activeProjectId, activeSessionId, outputsById])

  const handleUpdateOutputFeedback = useCallback((outputId, feedback) => {
    let updatedOutput = null
    setOutputs((prev) =>
      prev.map((output) => {
        if (output.id !== outputId) return output
        if (output.feedback === feedback) return output
        const updated = { ...output, feedback }
        updatedOutput = updated
        if (activeProjectId && activeSessionId) {
          persist.saveOutput(activeProjectId, activeSessionId, updated)
        }
        return updated
      })
    )

    if (!updatedOutput) return
    const linkedWinners = winners.filter((winner) => winner.outputId === outputId)
    for (const winner of linkedWinners) {
      maybeCreateSuggestion(winner, updatedOutput)
    }
  }, [activeProjectId, activeSessionId, maybeCreateSuggestion, winners])

  const handleUpdateWinner = useCallback((winnerId, updates) => {
    setWinners((prev) => {
      const newWinners = prev.map((w) => {
        if (w.id !== winnerId) return w
        const updated = { ...w, ...updates }
        if (activeProjectId && activeSessionId) {
          persist.saveWinner(activeProjectId, activeSessionId, updated)
        }
        return updated
      })

      if ('notes' in updates) {
        const updatedWinner = newWinners.find((w) => w.id === winnerId)
        if (updatedWinner) {
          debouncedSave(`suggestion-${winnerId}`, () => {
            maybeCreateSuggestion(updatedWinner)
          }, 1500)
        }
      }

      return newWinners
    })
  }, [activeProjectId, activeSessionId, debouncedSave, maybeCreateSuggestion])

  const handleRemoveWinner = useCallback((winnerId) => {
    setWinners((prev) => prev.filter((w) => w.id !== winnerId))
    persist.deleteWinner(winnerId)
  }, [])

  // (Memory CRUD handlers are managed by systemMemory hook)

  const handlePromoteWinnerToMemory = useCallback((winnerId) => {
    const w = winners.find((win) => win.id === winnerId)
    if (!w) return
    const type = feedbackToPreferenceType(getEffectiveFeedback(outputsById.get(w.outputId), w))
    const textParts = []
    if (w.notes) textParts.push(w.notes)
    if (w.finalPromptSent) textParts.push(`Prompt: ${w.finalPromptSent.slice(0, 150)}`)
    systemMemory.setMemoryDraft({
      type,
      text: textParts.join('\n'),
      winnerId: w.id,
      outputId: w.outputId || null,
    })
  }, [outputsById, winners, systemMemory.setMemoryDraft])

  // (Doc CRUD handlers are managed by systemMemory hook)

  // (Shared knowledge handlers are managed by systemMemory hook)

  // --- Suggestion handlers ---

  const handleAcceptSuggestion = useCallback((suggestionId, editedData) => {
    const suggestion = suggestions.find((s) => s.id === suggestionId)
    if (!suggestion) return

    systemMemory.handlers.addMemory({
      type: editedData?.type || suggestion.suggestedType,
      text: editedData?.text || suggestion.text,
      winnerId: suggestion.winnerId,
      outputId: suggestion.outputId,
      source: 'derived',
    })

    persist.updateSuggestion(suggestionId, { status: 'accepted' })
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId))
  }, [suggestions, systemMemory.handlers.addMemory])

  const handleDismissSuggestion = useCallback((suggestionId) => {
    persist.updateSuggestion(suggestionId, { status: 'dismissed' })
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId))
  }, [])

  // --- Pattern analysis handler ---

  const handleAnalyzePatterns = useCallback(async () => {
    if (!activeProjectId) return
    setAnalyzingPatterns(true)
    try {
      const { outputs: allOutputs, winners: allWinners } =
        await persist.loadAllProjectOutputsAndWinners(activeProjectId)
      const allSuggestions = await persist.getAllSuggestionsForProject(activeProjectId)

      const insights = analyzePatterns({
        outputs: allOutputs,
        winners: allWinners,
        existingSuggestions: allSuggestions,
      })

      const newSuggestions = []
      for (const insight of insights) {
        const suggestion = {
          id: crypto.randomUUID(),
          projectId: activeProjectId,
          sessionId: null,
          outputId: null,
          winnerId: null,
          createdAt: Date.now(),
          suggestedType: insight.suggestedType,
          text: insight.text,
          reason: insight.reason,
          source: 'derived',
          status: 'pending',
          kind: 'pattern',
          fingerprint: insight.fingerprint,
          evidence: insight.evidence,
        }
        await persist.saveSuggestion(suggestion)
        newSuggestions.push(suggestion)
      }

      if (newSuggestions.length > 0) {
        setSuggestions((prev) => [...newSuggestions, ...prev])
      }
    } finally {
      setAnalyzingPatterns(false)
    }
  }, [activeProjectId])

  // --- Derived: split suggestions by kind ---

  const singleWinnerSuggestions = suggestions.filter((s) => s.kind !== 'pattern')
  const patternInsights = suggestions.filter((s) => s.kind === 'pattern')

  // Auto-open inspector when a memory draft is set (e.g. from "Save as Memory" on Winners)
  useEffect(() => {
    if (systemMemory.memoryDraft) setInspectorOpen(true)
  }, [systemMemory.memoryDraft])

  // --- Loading state ---
  if (!hydrated) {
    return (
      <div className="app">
        <header className="app-header">
          Studio <span>v1</span>
        </header>
        <div className="project-screen">
          <div className="empty-state" style={{ padding: '40px 16px' }}>
            Loading...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>Studio <span>v1</span></div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setConsoleOpen(!consoleOpen)}
          style={{ marginLeft: 'auto' }}
        >
          {consoleOpen ? '← Studio' : 'Console'}
        </button>
      </header>
      {consoleOpen ? (
        <OperatorConsole onClose={() => setConsoleOpen(false)} />
      ) : (
        <>
      <ProjectBar
        projects={projects}
        activeProjectId={activeProjectId}
        onSwitchProject={handleSwitchProject}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
      />
      <div className="project-screen">
        <SessionHeader
          goal={goal}
          onGoalChange={handleGoalChange}
          plan={plan}
          planStatus={planStatus}
          planError={planError}
          onGeneratePlan={handleGeneratePlan}
          onApprovePlan={handleApprovePlan}
          onDismissPlan={handleDismissPlan}
          goalDirtyAfterApproval={goalDirtyAfterApproval}
          onResetSession={handleResetSession}
          onDismissGoalWarning={handleDismissGoalWarning}
          memories={activePlanMemories}
          docs={activePlanDocs}
          sharedMemories={activePlanSharedMemories}
          sharedDocs={activePlanSharedDocs}
          planExcludedKeys={planExcludedKeys}
          onToggleExclude={handleTogglePlanExclude}
          onClearExcludes={handleClearPlanExcludes}
          planSourceSnapshot={planSourceSnapshot}
        />
        <WorkArea
          buckets={buckets}
          setBuckets={setBuckets}
          assembled={assembled}
          assembledDirty={assembledDirty}
          onAssembledChange={handleAssembledChange}
          onResync={handleResync}
          refs={refs}
          onAddRefs={handleAddRefs}
          onRemoveRef={handleRemoveRef}
          onToggleRefSend={handleToggleRefSend}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          lockedElements={lockedElements}
          onAddLocked={handleAddLocked}
          onRemoveLocked={handleRemoveLocked}
          onToggleLocked={handleToggleLocked}
          model={model}
          availableModels={availableModels}
          onModelChange={setModel}
          batchSize={batchSize}
          onBatchSizeChange={setBatchSize}
        />
        <Outputs
          outputs={outputsWithDisplayIds}
          genJobs={genJobs}
          winners={winnersWithDisplayIds}
          onSaveWinner={handleSaveWinner}
          onUpdateOutputFeedback={handleUpdateOutputFeedback}
          onRetryJob={handleRetryJob}
        />
        <Winners
          winners={winnersWithDisplayIds}
          onUpdateWinner={handleUpdateWinner}
          onRemoveWinner={handleRemoveWinner}
          onPromoteToMemory={handlePromoteWinnerToMemory}
          outputsById={outputsById}
        />
        <CarryForwardIndicator iterationContext={iterationContext} />
        {singleWinnerSuggestions.length > 0 && (
          <SuggestedMemories
            suggestions={singleWinnerSuggestions}
            onAccept={handleAcceptSuggestion}
            onDismiss={handleDismissSuggestion}
          />
        )}
        <SystemMemoryStatus
          status={systemMemory.status}
          onInspect={() => setInspectorOpen(true)}
        />
        <PlanHistory
          planRuns={planRuns}
          winners={winnersWithDisplayIds}
          outputs={outputsWithDisplayIds}
          onUpdateNote={handleUpdatePlanRunNote}
          onSaveLesson={systemMemory.handlers.saveLesson}
        />
      </div>
      <SystemInspector
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        data={systemMemory.data}
        handlers={systemMemory.handlers}
        memoryDraft={systemMemory.memoryDraft}
        onClearDraft={systemMemory.clearDraft}
        relevantKnowledge={relevantKnowledge}
        onAnalyzePatterns={handleAnalyzePatterns}
        analyzingPatterns={analyzingPatterns}
        patternInsights={patternInsights}
        onAcceptSuggestion={handleAcceptSuggestion}
        onDismissSuggestion={handleDismissSuggestion}
      />
      </>
      )}
    </div>
  )
}
