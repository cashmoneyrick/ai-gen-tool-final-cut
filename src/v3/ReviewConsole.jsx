import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ImageViewer from './ImageViewer'
import ThumbnailStrip from './ThumbnailStrip'
import ProjectPickerModal from './ProjectPickerModal'
import HiddenMenu from './HiddenMenu'
import UpscaleQueue from './UpscaleQueue'
import StudioIntelligencePanel from './StudioIntelligencePanel'
import { formatCost } from './costUtils'
import { getImageUrl } from '../utils/imageUrl.js'
import { normalizeFeedback } from '../reviewFeedback.js'
import './ReviewConsole.css'
import ActionBar from './ActionBar'
import { AVAILABLE_IMAGE_MODELS } from '../modelConfig'

function formatSyncTimestamp(ts) {
  if (!ts) return 'Waiting for activity'
  const diffMs = Date.now() - ts
  if (diffMs < 10_000) return 'Updated just now'
  if (diffMs < 60_000) return `Updated ${Math.floor(diffMs / 1000)}s ago`
  if (diffMs < 3_600_000) return `Updated ${Math.floor(diffMs / 60_000)}m ago`
  return `Updated ${new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function formatStoreLabel(store) {
  if (!store) return 'Watching project data'
  const labels = {
    meta: 'project switch',
    outputs: 'outputs',
    winners: 'winners',
    refs: 'references',
    folders: 'folders',
    folderItems: 'folder saves',
    projects: 'project settings',
    sessions: 'session settings',
  }
  return `Last change: ${labels[store] || store}`
}

function average(values) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function groupOutputsByBatch(outputs) {
  if (!outputs?.length) return []
  const groups = []
  let current = { createdAt: outputs[0]?.createdAt, items: [outputs[0]] }

  for (let index = 1; index < outputs.length; index += 1) {
    const item = outputs[index]
    if (item.createdAt === current.createdAt) {
      current.items.push(item)
    } else {
      groups.push(current)
      current = { createdAt: item.createdAt, items: [item] }
    }
  }

  groups.push(current)
  return groups
}

function isPromptPreviewOutput(output) {
  return output?.outputKind === 'prompt-preview'
}

export default function ReviewConsole({
  outputs,
  stripOutputs,
  winners,
  stripWinners,
  projects,
  activeProjectId,
  activeSessionId,
  project,
  requestedOutputId,
  onConsumeRequestedOutputId,
  onOpenOutput,
  refs,
  onAddRefs,
  onUseAsRef,
  onRemoveRef,
  onToggleRefSend,
  onUpdateRefMode,
  onReorderRefs,
  onUpdateRefNotes,
  onUpdateOutputFeedback,
  onUpdateFeedbackNotes,
  onSwitchProject,
  onCreateProject,
  onRenameProject,
  onArchiveProject,
  onRestoreProject,
  onMarkWinner,
  liveSync,
  trustSignal,
  workflowSummary,
  iterationContext,
  memoryStatus,
  projectBrief,
  promptPreviewMode,
  onTogglePromptPreview,
  onUpdatePromptPreviewText,
  onUsePromptPreviewAsBase,
  // Generation settings
  model,
  imageSize,
  aspectRatio,
  thinkingLevel,
  googleSearch,
  imageSearch,
  imageCount,
  onModelChange,
  onImageSizeChange,
  onAspectRatioChange,
  onThinkingLevelChange,
  onGoogleSearchChange,
  onImageSearchChange,
  onImageCountChange,
}) {
  const orderedOutputs = useMemo(() => outputs || [], [outputs])
  const orderedStripOutputs = useMemo(
    () => (stripOutputs || []).filter((output) => !isPromptPreviewOutput(output)),
    [stripOutputs]
  )
  const reviewableOutputs = useMemo(
    () => orderedOutputs.filter((output) => !isPromptPreviewOutput(output)),
    [orderedOutputs]
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  const [rotations, setRotations] = useState({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [projectCost, setProjectCost] = useState(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [upscaleOpen, setUpscaleOpen] = useState(false)
  const upscaleRef = useRef(null)

  // Theme
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('v3-dark') === '1')

  useEffect(() => {
    if (!activeProjectId) return
    fetch('/api/project-stats')
      .then(r => r.json())
      .then(stats => {
        const mine = stats[activeProjectId]
        if (mine) setProjectCost(mine.totalCost)
      })
      .catch(() => {})
  }, [activeProjectId, orderedOutputs.length]) // re-fetch when outputs change

  const safeCurrentIndex = orderedOutputs.length
    ? Math.min(currentIndex, orderedOutputs.length - 1)
    : 0

  const currentOutput = orderedOutputs[safeCurrentIndex] || null

  useEffect(() => {
    if (!requestedOutputId || !orderedOutputs.length) return
    const nextIndex = orderedOutputs.findIndex((output) => output.id === requestedOutputId)
    if (nextIndex >= 0) {
      setCurrentIndex(nextIndex)
      onConsumeRequestedOutputId?.()
    }
  }, [requestedOutputId, orderedOutputs, onConsumeRequestedOutputId])

  const isCurrentWinner = useMemo(() => {
    if (!currentOutput || !winners) return false
    return winners.some((w) => w.outputId === currentOutput.id)
  }, [currentOutput, winners])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft' && safeCurrentIndex > 0) setCurrentIndex((i) => i - 1)
      else if (e.key === 'ArrowRight' && safeCurrentIndex < orderedOutputs.length - 1) setCurrentIndex((i) => i + 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [safeCurrentIndex, orderedOutputs.length])

  const handleOutputSignal = useCallback(async (outputId, signalType) => {
    try {
      const res = await fetch(`/api/store/outputs/${outputId}`)
      const output = await res.json()
      const signals = output.signals || []
      signals.push({ type: signalType, timestamp: Date.now() })
      await fetch('/api/store/outputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...output, signals }),
      })
    } catch (e) {
      console.error('[signal]', e)
    }
  }, [])

  const handleCorrectAnnotation = useCallback(async (outputId) => {
    try {
      await fetch('/api/operator/annotation-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputId, corrected: false }),
      })
    } catch {
      // non-fatal
    }
  }, [])

  const handleEndSession = useCallback(async () => {
    if (sessionEnded) return
    try {
      const endMarker = {
        projectId: activeProjectId,
        sessionId: activeSessionId,
        endedAt: Date.now(),
        outputCount: orderedOutputs.length,
      }
      await fetch('/api/session-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endMarker),
      })
      setSessionEnded(true)
      setTimeout(() => setSessionEnded(false), 3000)
    } catch (e) {
      console.error('[end-session]', e)
    }
  }, [activeProjectId, activeSessionId, orderedOutputs.length, sessionEnded])

  const projectName = project?.name || 'Untitled'
  const liveConnection = liveSync?.connection || 'idle'
  const liveTone = liveConnection === 'live' ? 'live'
    : liveConnection === 'reconnecting' || liveConnection === 'connecting' ? 'pending'
    : 'error'
  const liveLabel = liveConnection === 'live' ? 'Live sync on'
    : liveConnection === 'reconnecting' ? 'Reconnecting'
    : liveConnection === 'connecting' ? 'Connecting'
    : liveConnection === 'error' ? 'Sync issue'
    : 'Sync idle'
  const lastSyncLabel = formatSyncTimestamp(liveSync?.lastSyncAt || liveSync?.lastEventAt)
  const lastStoreLabel = formatStoreLabel(liveSync?.lastStore)
  const compactStatusLabel = `${workflowSummary?.outputCount || 0} outputs`
    + (workflowSummary?.winnerCount ? ` · ${workflowSummary.winnerCount} winners` : '')
  const projectCostLabel = projectCost !== null && projectCost > 0 ? formatCost(projectCost) : null
  const hasOutputs = orderedOutputs.length > 0
  const hasStripOutputs = orderedStripOutputs.length > 0
  const sessionDecision = useMemo(() => {
    if (!reviewableOutputs.length) return null

    const reviewed = reviewableOutputs
      .map((output) => normalizeFeedback(output.feedback))
      .filter((value) => value !== null)
    const batches = groupOutputsByBatch(reviewableOutputs)
    const currentBatch = batches[0]?.items || []
    const previousBatch = batches[1]?.items || []
    const currentBatchRatings = currentBatch
      .map((output) => normalizeFeedback(output.feedback))
      .filter((value) => value !== null)
    const previousBatchRatings = previousBatch
      .map((output) => normalizeFeedback(output.feedback))
      .filter((value) => value !== null)
    const currentAverage = average(currentBatchRatings)
    const previousAverage = average(previousBatchRatings)
    const currentBest = currentBatchRatings.length ? Math.max(...currentBatchRatings) : null
    const winnerCount = winners.length

    let tone = 'pending'
    let title = 'Review still open'
    let detail = 'Finish rating this batch before deciding whether to continue, pivot, or stop.'
    const pills = []

    if (winnerCount > 0 && currentBest !== null && currentBest >= 4) {
      tone = 'stop'
      title = 'Stop on a winner'
      detail = 'You have a confirmed winner and the latest batch includes a strong candidate worth treating as a stopping point.'
    } else if (currentAverage !== null && previousAverage !== null && currentAverage >= previousAverage + 0.5) {
      tone = 'continue'
      title = 'Keep pushing this direction'
      detail = 'The latest reviewed batch is stronger than the prior one, so another iteration on the same path is justified.'
    } else if (currentAverage !== null && previousAverage !== null && currentAverage <= previousAverage - 0.5 && reviewed.length >= 3) {
      tone = 'pivot'
      title = 'Change course'
      detail = 'The latest batch is reviewing weaker than the prior direction, so a pivot is more justified than another small push.'
    } else if (currentBest !== null && currentBest >= 4 && winnerCount === 0) {
      tone = 'continue'
      title = 'One more pass could land it'
      detail = 'The batch has an almost-there candidate, but not a locked winner yet.'
    }

    if (winnerCount > 0) pills.push(`${winnerCount} winner${winnerCount === 1 ? '' : 's'}`)
    if (currentBatchRatings.length > 0) pills.push(`${currentBatchRatings.length}/${currentBatch.length} latest rated`)
    if (currentAverage !== null) pills.push(`${currentAverage.toFixed(1)} latest avg`)
    if (previousAverage !== null) pills.push(`${previousAverage.toFixed(1)} prior avg`)

    return { tone, title, detail, pills }
  }, [reviewableOutputs, winners])

  return (
    <div className={`v3-root ${darkMode ? 'v3-root--dark' : ''}`}>
      <header className="v3-header">
        <div className="v3-header-left">
          <HiddenMenu
            darkMode={darkMode}
            onToggleDark={() => { setDarkMode((d) => { localStorage.setItem('v3-dark', d ? '0' : '1'); return !d }) }}
            onClearRestrictions={() => {
              fetch('/api/restrictions', { method: 'DELETE' }).catch(() => {})
            }}
            onPreviewLoading={() => setLoadingPreview(true)}
          />
          <button
            className={`v3-project-picker-btn${pickerOpen ? ' v3-project-picker-btn--open' : ''}`}
            onClick={() => setPickerOpen(true)}
          >
            <span className="v3-project-picker-icon">◆</span>
            <span className="v3-project-picker-name">{projectName}</span>
            <svg className="v3-project-picker-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="v3-header-right">
          {onTogglePromptPreview && (
            <button
              className={`v3-prompt-preview-toggle ${promptPreviewMode ? 'v3-prompt-preview-toggle--active' : ''}`}
              onClick={onTogglePromptPreview}
              title={promptPreviewMode ? 'Prompt Preview stays on until you turn it off' : 'Turn on sticky Prompt Preview mode'}
            >
              <span className="v3-prompt-preview-toggle-kicker">Mode</span>
              <span className="v3-prompt-preview-toggle-label">Prompt Preview</span>
            </button>
          )}
          <button
            className={`v3-end-session-btn ${sessionEnded ? 'v3-end-session-btn--done' : ''}`}
            onClick={handleEndSession}
            title="End this generation session"
          >
            {sessionEnded ? 'Session Ended' : 'End Session'}
          </button>
          <div ref={upscaleRef} style={{ position: 'relative' }}>
            <button className="v3-tb-btn" onClick={() => setUpscaleOpen(v => !v)} title="Upscale queue">
              <span>Upscale Queue</span>
            </button>
            <UpscaleQueue open={upscaleOpen} onClose={() => setUpscaleOpen(false)} anchorRef={upscaleRef} />
          </div>
        </div>
      </header>

      <ActionBar
        imageCount={imageCount}
        onImageCountChange={onImageCountChange}
        model={model}
        availableModels={AVAILABLE_IMAGE_MODELS}
        imageSize={imageSize}
        aspectRatio={aspectRatio}
        thinkingLevel={thinkingLevel}
        googleSearch={googleSearch}
        imageSearch={imageSearch}
        onModelChange={onModelChange}
        onImageSizeChange={onImageSizeChange}
        onAspectRatioChange={onAspectRatioChange}
        onThinkingLevelChange={onThinkingLevelChange}
        onGoogleSearchChange={onGoogleSearchChange}
        onImageSearchChange={onImageSearchChange}
      />

      <div className="v3-body-row">
        {/* Main content area */}
        <div className="v3-main">
          <div className="v3-review-layout">
            {hasStripOutputs && (
              <ThumbnailStrip
                outputs={orderedStripOutputs}
                currentOutputId={currentOutput?.id || null}
                onNavigate={(output) => {
                  const localIndex = orderedOutputs.findIndex((item) => item.id === output.id)
                  if (localIndex >= 0) {
                    setCurrentIndex(localIndex)
                    return
                  }
                  onOpenOutput?.(output)
                }}
                winners={stripWinners || winners}
              />
            )}

            <ImageViewer
              key={currentOutput?.id || 'empty-output'}
              output={currentOutput}
              rotation={rotations[currentOutput?.id] ?? 0}
              onRotate={(id) => setRotations((prev) => ({ ...prev, [id]: ((prev[id] ?? 0) + 90) % 360 }))}
              outputs={orderedOutputs}
              currentIndex={safeCurrentIndex}
              totalCount={orderedOutputs.length}
              onNavigate={setCurrentIndex}
              onUpdateFeedback={onUpdateOutputFeedback}
              onUpdateFeedbackNotes={onUpdateFeedbackNotes}
              onMarkWinner={onMarkWinner}
              onCorrectAnnotation={handleCorrectAnnotation}
              isWinner={isCurrentWinner}
              onUseAsRef={onUseAsRef ? onUseAsRef : onAddRefs ? (output) => {
                const refImgUrl = getImageUrl(output)
                if (!refImgUrl) return
                fetch(refImgUrl)
                  .then((r) => r.blob())
                  .then((blob) => {
                    const ext = blob.type === 'image/png' ? 'png' : 'jpg'
                    const name = `from-${output.displayId || 'Output'}-${output.id.slice(0, 8)}.${ext}`
                    const file = new File([blob], name, { type: blob.type })
                    const dt = new DataTransfer()
                    dt.items.add(file)
                    onAddRefs(dt.files)
                  })
                  .catch(() => {})
              } : undefined}
              refs={refs}
              onAddRefs={onAddRefs}
              onRemoveRef={onRemoveRef}
              onToggleRefSend={onToggleRefSend}
              onUpdateRefMode={onUpdateRefMode}
              onReorderRefs={onReorderRefs}
              onUpdateRefNotes={onUpdateRefNotes}
              activeProjectId={activeProjectId}
              onOutputSignal={handleOutputSignal}
              onUpdatePromptPreviewText={onUpdatePromptPreviewText}
              onUsePromptPreviewAsBase={onUsePromptPreviewAsBase}
              reviewDockStatus={{
                projectName,
                liveTone,
                liveLabel,
                compactStatusLabel,
                lastSyncLabel,
                lastStoreLabel,
                trustSignal,
                projectCostLabel,
                promptPreviewMode,
              }}
              insightsTitle={sessionDecision ? sessionDecision.title : 'Open strategy and session context'}
              insightsMeta={sessionDecision?.pills?.slice(0, 2) || []}
              insightsContent={(
                <>
                  {sessionDecision && (
                    <div className={`v3-session-decision v3-session-decision--${sessionDecision.tone}`}>
                      <div className="v3-session-decision-copy">
                        <span className="v3-session-decision-kicker">Session Decision</span>
                        <span className="v3-session-decision-title">{sessionDecision.title}</span>
                        <span className="v3-session-decision-detail">{sessionDecision.detail}</span>
                      </div>
                      <div className="v3-session-decision-meta">
                        {sessionDecision.pills.map((pill) => (
                          <span key={pill} className="v3-session-decision-pill">{pill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <StudioIntelligencePanel
                    currentOutput={currentOutput}
                    iterationContext={iterationContext}
                    refs={refs}
                    memoryStatus={memoryStatus}
                    brief={projectBrief}
                  />
                </>
              )}
            />
          </div>
        </div>
      </div>

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

      {loadingPreview && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: '#080809',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'pointer',
            fontFamily: '"SF Mono", Menlo, Monaco, monospace',
            WebkitFontSmoothing: 'antialiased',
            overflow: 'hidden',
          }}
          onClick={() => setLoadingPreview(false)}
          title="Click to dismiss"
        >
          <style>{`
            @keyframes ls-cell { 0%,100%{opacity:.25} 50%{opacity:1} }
            @keyframes ls-sweep { 0%{transform:translateX(-100%)} 100%{transform:translateX(100vw)} }
            @keyframes ls-fade { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
          `}</style>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(10,132,255,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', animation: 'ls-fade 0.4s ease both' }}>
            {[0,1,2,3].map((i) => (
              <div key={i} style={{
                width: '22px', height: '22px', borderRadius: '3px',
                background: '#0a84ff', opacity: 0.25,
                animation: `ls-cell 1.6s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
          <div style={{
            marginTop: '22px', fontSize: '9px', letterSpacing: '0.22em',
            color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
            animation: 'ls-fade 0.5s 0.1s ease both', userSelect: 'none',
          }}>GEN</div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px', overflow: 'hidden' }}>
            <div style={{
              height: '1px', width: '30%',
              background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.6), transparent)',
              animation: 'ls-sweep 1.8s ease-in-out infinite',
            }} />
          </div>
        </div>
      )}
    </div>
  )
}
