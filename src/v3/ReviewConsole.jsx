import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ImageViewer from './ImageViewer'
import ThumbnailStrip from './ThumbnailStrip'
import SidePanel from './SidePanel'
import ProjectPickerModal from './ProjectPickerModal'
import InsightsModal from './InsightsModal'
import HiddenMenu from './HiddenMenu'
import { estimateBatchCost, formatCost } from './costUtils'
import { rewriteBatch } from '../api/rewrite'
import './ReviewConsole.css'

// Build a snapshot string for dirty tracking — captures per-output review state + gen settings
function buildReviewSnapshot(outputs, imageCount, genSettings = {}) {
  const data = outputs.map((o) => [o.id, o.feedback || null, o.notesKeep || '', o.notesFix || '', o.batchNotesKeep || '', o.batchNotesFix || ''])
  return JSON.stringify({ feedback: data, imageCount, ...genSettings })
}

export default function ReviewConsole({
  outputs,
  winners,
  projects,
  activeProjectId,
  activeSessionId,
  project,
  session,
  lockedElements,
  refs,
  onAddRefs,
  onRemoveRef,
  onToggleRefSend,
  onToggleRefAnchor,
  onUpdateRefNotes,
  iterationContext,
  onSync,
  onUpdateOutputFeedback,
  onUpdateOutputNotes,
  onUpdateFeedbackNotes,
  onUpdateBatchNotes,
  onSwitchProject,
  onCreateProject,
  onRenameProject,
  onArchiveProject,
  onRestoreProject,
  onSetViewMode,
  onUpdateBatchSize,
}) {
  const orderedOutputs = outputs || []

  const [currentIndex, setCurrentIndex] = useState(0)
  const [imageCount, setImageCount] = useState(session?.batchSize || 1)
  const [selectedModel, setSelectedModel] = useState(session?.model || 'gemini-3.1-flash-image-preview')
  const [imageSize, setImageSize] = useState('1K')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [thinkingLevel, setThinkingLevel] = useState('minimal')
  const [googleSearch, setGoogleSearch] = useState(false)
  const [imageSearch, setImageSearch] = useState(false)
  const [syncState, setSyncState] = useState('idle')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)

  // Theme
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('v3-dark') === '1')

  // Side panel state
  const [sidePanelOpen, setSidePanelOpen] = useState(true)

  // Persisted handoff baseline
  const [handoffBaseline, setHandoffBaseline] = useState(null)
  const baselineLoadedForProject = useRef(null)
  const [initialSnapshot, setInitialSnapshot] = useState(null)

  useEffect(() => {
    if (!activeProjectId || baselineLoadedForProject.current === activeProjectId) return
    baselineLoadedForProject.current = activeProjectId
    setHandoffBaseline(null)
    setInitialSnapshot(null)
    fetch(`/api/handoff/baseline/${activeProjectId}`)
      .then((r) => r.json())
      .then((snapshot) => { if (snapshot) setHandoffBaseline(snapshot) })
      .catch(() => {})
  }, [activeProjectId])

  useEffect(() => {
    setImageCount(session?.batchSize || 1)
  }, [activeProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const genSettings = useMemo(() => ({
    model: selectedModel, imageSize, aspectRatio, thinkingLevel, googleSearch, imageSearch,
  }), [selectedModel, imageSize, aspectRatio, thinkingLevel, googleSearch, imageSearch])

  useEffect(() => {
    if (orderedOutputs.length > 0 && initialSnapshot === null) {
      setInitialSnapshot(buildReviewSnapshot(orderedOutputs, imageCount, genSettings))
    }
  }, [orderedOutputs, initialSnapshot, imageCount, genSettings])

  const effectiveBaseline = handoffBaseline ?? initialSnapshot
  const currentSnapshot = useMemo(
    () => buildReviewSnapshot(orderedOutputs, imageCount, genSettings),
    [orderedOutputs, imageCount, genSettings]
  )
  const isDirty = effectiveBaseline !== null && currentSnapshot !== effectiveBaseline

  useEffect(() => {
    if (currentIndex >= orderedOutputs.length && orderedOutputs.length > 0) {
      setCurrentIndex(orderedOutputs.length - 1)
    }
  }, [orderedOutputs.length, currentIndex])

  const currentOutput = orderedOutputs[currentIndex] || null

  const batches = useMemo(() => {
    if (!orderedOutputs.length) return []
    const groups = []
    let current = { createdAt: orderedOutputs[0]?.createdAt, outputs: [] }
    for (const o of orderedOutputs) {
      if (o.createdAt === current.createdAt) {
        current.outputs.push(o)
      } else {
        groups.push(current)
        current = { createdAt: o.createdAt, outputs: [o] }
      }
    }
    groups.push(current)
    return groups.map((g, i) => ({ ...g, number: groups.length - i }))
  }, [orderedOutputs])

  const currentBatch = useMemo(() => {
    if (!currentOutput) return null
    return batches.find((b) => b.createdAt === currentOutput.createdAt) || null
  }, [currentOutput, batches])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft' && currentIndex > 0) setCurrentIndex((i) => i - 1)
      else if (e.key === 'ArrowRight' && currentIndex < orderedOutputs.length - 1) setCurrentIndex((i) => i + 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentIndex, orderedOutputs.length])

  const handleImageCountChange = useCallback((count) => {
    setImageCount(count)
    if (onUpdateBatchSize) onUpdateBatchSize(count)
  }, [onUpdateBatchSize])

  const handleSync = useCallback(async () => {
    setSyncState('syncing')
    try {
      await onSync()
      setSyncState('synced')
      setTimeout(() => setSyncState('idle'), 2500)
    } catch {
      setSyncState('failed')
      setTimeout(() => setSyncState('idle'), 3000)
    }
  }, [onSync])

  const [handoffState, setHandoffState] = useState('idle')

  // Save handoff (called after cleanup decision)
  const saveHandoff = useCallback(async () => {
    setHandoffState('saving')
    try {
      const snapshot = buildReviewSnapshot(orderedOutputs, imageCount, genSettings)
      const payload = {
        projectId: activeProjectId,
        sessionId: activeSessionId,
        imageCount,
        model: selectedModel,
        imageSize,
        aspectRatio,
        thinkingLevel,
        googleSearch,
        imageSearch,
        reviewSnapshot: snapshot,
        timestamp: Date.now(),
      }
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Handoff save failed')
      setHandoffBaseline(snapshot)
      setHandoffState('saved')
      setTimeout(() => setHandoffState('idle'), 2500)
    } catch {
      setHandoffState('failed')
      setTimeout(() => setHandoffState('idle'), 3000)
    }
  }, [imageCount, orderedOutputs, activeProjectId, activeSessionId, selectedModel, imageSize, aspectRatio, thinkingLevel, googleSearch, imageSearch, genSettings])

  const handleRunNextAttempt = useCallback(async () => {
    // Build a lookup of baseline note values to detect what changed
    const baselineNotes = new Map() // key → text
    if (effectiveBaseline) {
      try {
        const parsed = JSON.parse(effectiveBaseline)
        if (parsed.feedback) {
          for (const [id, , notesKeep, notesFix, batchKeep, batchFix] of parsed.feedback) {
            if (notesKeep) baselineNotes.set(`${id}:notesKeep`, notesKeep)
            if (notesFix) baselineNotes.set(`${id}:notesFix`, notesFix)
            if (batchKeep) baselineNotes.set(`${id}:batchNotesKeep`, batchKeep)
            if (batchFix) baselineNotes.set(`${id}:batchNotesFix`, batchFix)
          }
        }
      } catch {}
    }

    // Only collect notes that are new or changed since baseline
    const notesToClean = []
    const seenBatchKeys = new Set()

    for (const o of orderedOutputs) {
      // Per-image notes — only if changed from baseline
      if (o.notesKeep?.trim().length > 5 && o.notesKeep.trim() !== baselineNotes.get(`${o.id}:notesKeep`)) {
        notesToClean.push({ text: o.notesKeep.trim(), type: 'keep', source: 'image', outputId: o.id, field: 'notesKeep', label: `Keep — ${o.displayId || o.id.slice(0, 8)}` })
      }
      if (o.notesFix?.trim().length > 5 && o.notesFix.trim() !== baselineNotes.get(`${o.id}:notesFix`)) {
        notesToClean.push({ text: o.notesFix.trim(), type: 'fix', source: 'image', outputId: o.id, field: 'notesFix', label: `Fix — ${o.displayId || o.id.slice(0, 8)}` })
      }
      // Batch notes (deduplicate + only if changed)
      if (o.batchNotesKeep?.trim().length > 5) {
        const key = `keep:${o.createdAt}`
        if (!seenBatchKeys.has(key) && o.batchNotesKeep.trim() !== baselineNotes.get(`${o.id}:batchNotesKeep`)) {
          seenBatchKeys.add(key)
          notesToClean.push({ text: o.batchNotesKeep.trim(), type: 'keep', source: 'batch', batchKey: o.createdAt, field: 'batchNotesKeep', label: 'Batch Keep' })
        }
      }
      if (o.batchNotesFix?.trim().length > 5) {
        const key = `fix:${o.createdAt}`
        if (!seenBatchKeys.has(key) && o.batchNotesFix.trim() !== baselineNotes.get(`${o.id}:batchNotesFix`)) {
          seenBatchKeys.add(key)
          notesToClean.push({ text: o.batchNotesFix.trim(), type: 'fix', source: 'batch', batchKey: o.createdAt, field: 'batchNotesFix', label: 'Batch Fix' })
        }
      }
    }

    // No changed notes? Skip cleanup, go straight to handoff
    if (notesToClean.length === 0) {
      await saveHandoff()
      return
    }

    // Build rich context for the cleanup model
    const activeLockedTexts = (lockedElements || []).filter((el) => el.enabled).map((el) => el.text)
    const activeRefNotes = (refs || [])
      .filter((r) => r.send !== false && r.notes?.trim())
      .map((r) => r.notes.trim())
    const carryForwardSummary = iterationContext
      ? [
          ...(iterationContext.preserve || []).slice(0, 4).map((p) => `keep: ${p.text.slice(0, 150)}`),
          ...(iterationContext.change || []).slice(0, 4).map((c) => `fix: ${c.text.slice(0, 150)}`),
        ].join('; ')
      : ''
    const context = {
      projectName: project?.name || '',
      sessionGoal: session?.goal?.slice(0, 200) || '',
      lockedElements: activeLockedTexts,
      currentPrompt: session?.assembledPrompt?.slice(0, 300) || '',
      refNotes: activeRefNotes,
      priorDirection: carryForwardSummary,
    }

    setHandoffState('cleaning')
    try {
      const apiNotes = notesToClean.map((n) => ({ text: n.text, type: n.type, source: n.source }))
      const results = await rewriteBatch(apiNotes, context)

      // Merge API results back with our metadata
      const merged = notesToClean.map((n, i) => ({
        ...n,
        original: n.text,
        cleaned: results[i]?.cleaned || n.text,
      }))

      // Write all cleaned text back at once, preserving originals for diagnostics
      const writes = []
      for (const note of merged) {
        if (note.cleaned === note.original) continue
        if (note.source === 'image' && note.outputId) {
          const output = orderedOutputs.find((o) => o.id === note.outputId)
          if (!output) continue
          const keep = note.field === 'notesKeep' ? note.cleaned : (output.notesKeep || '')
          const fix = note.field === 'notesFix' ? note.cleaned : (output.notesFix || '')
          // Pass originals so App.jsx can preserve the user's raw text (write-once)
          const originals = {
            notesKeep: note.field === 'notesKeep' ? note.original : undefined,
            notesFix: note.field === 'notesFix' ? note.original : undefined,
          }
          writes.push(onUpdateFeedbackNotes(note.outputId, keep, fix, originals))
        } else if (note.source === 'batch' && note.batchKey) {
          const batchOutput = orderedOutputs.find((o) => o.createdAt === note.batchKey)
          if (!batchOutput) continue
          const keep = note.field === 'batchNotesKeep' ? note.cleaned : (batchOutput.batchNotesKeep || '')
          const fix = note.field === 'batchNotesFix' ? note.cleaned : (batchOutput.batchNotesFix || '')
          const originals = {
            batchNotesKeep: note.field === 'batchNotesKeep' ? note.original : undefined,
            batchNotesFix: note.field === 'batchNotesFix' ? note.original : undefined,
          }
          writes.push(onUpdateBatchNotes(note.batchKey, keep, fix, originals))
        }
      }
      // Wait for all writes to finish, then save handoff
      await Promise.all(writes)
      await new Promise((r) => setTimeout(r, 200))
      await saveHandoff()
    } catch (err) {
      console.error('[cleanup] Failed:', err)
      // Cleanup failed — proceed with originals, reset state first
      setHandoffState('idle')
      await saveHandoff()
    }
  }, [orderedOutputs, lockedElements, project, session, refs, iterationContext, effectiveBaseline, saveHandoff, onUpdateFeedbackNotes, onUpdateBatchNotes])


  const syncLabel = syncState === 'syncing' ? 'Syncing...' : syncState === 'synced' ? 'Synced' : syncState === 'failed' ? 'Failed' : 'Sync'
  const sessionCost = useMemo(() => estimateBatchCost(orderedOutputs), [orderedOutputs])
  const projectName = project?.name || 'Untitled'

  const runLabel = handoffState === 'cleaning' ? 'Sharpening...' : handoffState === 'saving' ? 'Saving...' : handoffState === 'saved' ? 'Saved!' : handoffState === 'failed' ? 'Retry' : 'Run Next Attempt'
  const runDisabled = (!isDirty && handoffState === 'idle') || handoffState === 'saving' || handoffState === 'cleaning'

  return (
    <div className={`v3-root ${darkMode ? 'v3-root--dark' : ''}`}>
      <header className="v3-header">
        <HiddenMenu
          onSetViewMode={onSetViewMode}
          darkMode={darkMode}
          onToggleDark={() => { setDarkMode((d) => { localStorage.setItem('v3-dark', d ? '0' : '1'); return !d }) }}
          onOpenInsights={() => setInsightsOpen(true)}
        />
        <button className="v3-project-picker-btn" onClick={() => setPickerOpen(true)}>
          <span className="v3-project-picker-name">{projectName}</span>
          <span className="v3-project-picker-caret">&#9662;</span>
        </button>
        <div className="v3-header-right">
          {sessionCost.total > 0 && (
            <span className="v3-session-cost" title={`${sessionCost.count} images · avg ${formatCost(sessionCost.perImage)}/img`}>
              {formatCost(sessionCost.total)}
              <span className="v3-session-cost-label">spent</span>
            </span>
          )}
          <button
            className={`v3-sync-btn ${syncState !== 'idle' ? `v3-sync-${syncState}` : ''}`}
            onClick={handleSync}
            disabled={syncState === 'syncing'}
          >
            {syncLabel}
          </button>
        </div>
      </header>

      <div className="v3-body-row">
        {/* Main content area */}
        <div className="v3-main">
          <ImageViewer
            output={currentOutput}
            currentIndex={currentIndex}
            totalCount={orderedOutputs.length}
            onNavigate={setCurrentIndex}
            onUpdateFeedback={onUpdateOutputFeedback}
          />

          <ThumbnailStrip
            outputs={orderedOutputs}
            currentIndex={currentIndex}
            onNavigate={setCurrentIndex}
          />
        </div>

        {/* Side panel */}
        <SidePanel
          expanded={sidePanelOpen}
          onToggle={setSidePanelOpen}
          output={currentOutput}
          onUpdateFeedbackNotes={onUpdateFeedbackNotes}
          batch={currentBatch}
          onUpdateBatchNotes={onUpdateBatchNotes}
          refs={refs}
          onAddRefs={onAddRefs}
          onRemoveRef={onRemoveRef}
          onToggleRefSend={onToggleRefSend}
          onToggleRefAnchor={onToggleRefAnchor}
          onUpdateRefNotes={onUpdateRefNotes}
          model={selectedModel}
          onModelChange={setSelectedModel}
          imageSize={imageSize}
          onImageSizeChange={setImageSize}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          thinkingLevel={thinkingLevel}
          onThinkingLevelChange={setThinkingLevel}
          googleSearch={googleSearch}
          onGoogleSearchChange={setGoogleSearch}
          imageSearch={imageSearch}
          onImageSearchChange={setImageSearch}
          imageCount={imageCount}
          onImageCountChange={handleImageCountChange}
          runLabel={runLabel}
          runDisabled={runDisabled}
          onRunNextAttempt={handleRunNextAttempt}
        />
      </div>

      {/* HiddenMenu moved to header */}

      {pickerOpen && (
        <ProjectPickerModal
          projects={projects}
          activeProjectId={activeProjectId}
          onSwitchProject={onSwitchProject}
          onCreateProject={onCreateProject}
          onRenameProject={onRenameProject}
          onArchiveProject={onArchiveProject}
          onRestoreProject={onRestoreProject}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {insightsOpen && (
        <InsightsModal onClose={() => setInsightsOpen(false)} />
      )}
    </div>
  )
}
