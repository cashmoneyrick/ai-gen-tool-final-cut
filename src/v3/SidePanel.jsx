import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import SaveIndicator from './SaveIndicator'
import RefsPanel from './RefsPanel'
import { estimateCost, estimateBatchCost, formatCost } from './costUtils'

const AVAILABLE_MODELS = [
  { id: 'gemini-3.1-flash-image-preview', label: 'Flash' },
  { id: 'gemini-3-pro-image-preview', label: 'Pro' },
]

const ASPECT_RATIOS_FLASH = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1']
const ASPECT_RATIOS_PRO = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']

function ratioToShape(ratio, maxSize = 20) {
  const [w, h] = ratio.split(':').map(Number)
  const scale = maxSize / Math.max(w, h)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

/* ── Character counter ── */
function CharCounter({ value, max }) {
  const len = (value || '').trim().length
  if (len === 0) return null
  const over = len > max
  const near = len > max * 0.8
  const tooShort = len > 0 && len <= 5
  return (
    <div className={`v3-char-counter ${over ? 'v3-char-counter--over' : near ? 'v3-char-counter--near' : ''} ${tooShort ? 'v3-char-counter--short' : ''}`}>
      {tooShort ? <span>too short to count</span> : <span>{len}<span className="v3-char-counter-sep">/</span>{max}{over && ' — will be cut'}</span>}
    </div>
  )
}

/* ── Feedback textarea (keep or fix) ── */
function FeedbackBox({ type, value, onChange, placeholder }) {
  const isKeep = type === 'keep'
  return (
    <div className={`v3-sp-feedback-box ${isKeep ? 'v3-sp-fb-keep' : 'v3-sp-fb-fix'}`}>
      <div className="v3-sp-fb-header">
        <span className={`v3-sp-fb-icon ${isKeep ? 'v3-sp-fb-icon-keep' : 'v3-sp-fb-icon-fix'}`}>
          {isKeep ? '✓' : '✕'}
        </span>
        <span className="v3-sp-fb-label">{isKeep ? 'What works' : 'What needs fixing'}</span>
      </div>
      <textarea
        className="v3-sp-fb-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={3}
      />
      <div className="v3-sp-fb-footer">
        <CharCounter value={value} max={250} />
      </div>
    </div>
  )
}

/* ── Section separator ── */
function SectionSep({ label, hint, variant }) {
  return (
    <div className={`v3-sp-sep ${variant ? `v3-sp-sep--${variant}` : ''}`}>
      <span className="v3-sp-sep-line" />
      <span className="v3-sp-sep-label">{label}</span>
      {hint && <span className="v3-sp-sep-hint">{hint}</span>}
    </div>
  )
}

/* ── Metadata tag helper ── */
function getModelShort(model) {
  if (!model) return null
  if (model.includes('pro')) return 'Pro'
  if (model.includes('flash')) return 'Flash'
  return model
}

function formatDuration(ms) {
  if (!ms) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/* ═══════════════════════════════════════
   SECTION: Feedback (per-image)
   ═══════════════════════════════════════ */
function FeedbackSection({ output, onUpdateFeedbackNotes }) {
  const [keepDraft, setKeepDraft] = useState('')
  const [fixDraft, setFixDraft] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const timerRef = useRef(null)
  const currentIdRef = useRef(null)
  const keepRef = useRef(keepDraft)
  const fixRef = useRef(fixDraft)
  keepRef.current = keepDraft
  fixRef.current = fixDraft

  useEffect(() => {
    if (timerRef.current && currentIdRef.current && currentIdRef.current !== output?.id) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      onUpdateFeedbackNotes(currentIdRef.current, keepRef.current, fixRef.current).catch(() => {})
    }
    currentIdRef.current = output?.id || null
    setKeepDraft(output?.notesKeep || '')
    setFixDraft(output?.notesFix || '')
    setSaveState('idle')
  }, [output?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      timerRef.current = null
      if (!output?.id) return
      setSaveState('saving')
      try {
        await onUpdateFeedbackNotes(output.id, keepRef.current, fixRef.current)
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => s === 'saved' ? 'idle' : s), 2000)
      } catch {
        setSaveState('failed')
      }
    }, 1000)
  }, [output?.id, onUpdateFeedbackNotes])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  if (!output) return <div className="v3-sp-empty">Select an output to add notes</div>

  const displayId = output.displayId || 'Output'
  const meta = output.metadata || {}
  const cost = estimateCost(output)
  const metaTags = [
    getModelShort(output.model),
    formatDuration(meta.durationMs),
    cost !== null ? formatCost(cost) : null,
  ].filter(Boolean)

  return (
    <div className="v3-sp-section-body v3-sp-section--image">
      <div className="v3-sp-section-header">
        <span className="v3-sp-section-title">{displayId}</span>
        <SaveIndicator state={saveState} />
      </div>
      {metaTags.length > 0 && (
        <div className="v3-sp-meta-tags">
          {metaTags.map((tag, i) => (
            <span key={i} className="v3-sp-meta-tag">{tag}</span>
          ))}
        </div>
      )}
      <FeedbackBox
        type="keep"
        value={keepDraft}
        onChange={(e) => { setKeepDraft(e.target.value); scheduleSave() }}
        placeholder="What's good about this output..."
      />
      <FeedbackBox
        type="fix"
        value={fixDraft}
        onChange={(e) => { setFixDraft(e.target.value); scheduleSave() }}
        placeholder="What should change..."
      />
    </div>
  )
}

/* ═══════════════════════════════════════
   SECTION: Batch
   ═══════════════════════════════════════ */
function BatchSection({ batch, onUpdateBatchNotes }) {
  const [keepDraft, setKeepDraft] = useState('')
  const [fixDraft, setFixDraft] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const [downloadState, setDownloadState] = useState('idle')
  const timerRef = useRef(null)
  const batchKeyRef = useRef(null)
  const keepRef = useRef(keepDraft)
  const fixRef = useRef(fixDraft)
  keepRef.current = keepDraft
  fixRef.current = fixDraft

  const batchKey = batch?.createdAt || null

  useEffect(() => {
    if (timerRef.current && batchKeyRef.current && batchKeyRef.current !== batchKey) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      onUpdateBatchNotes(batchKeyRef.current, keepRef.current, fixRef.current).catch(() => {})
    }
    batchKeyRef.current = batchKey
    setKeepDraft(batch?.outputs[0]?.batchNotesKeep || '')
    setFixDraft(batch?.outputs[0]?.batchNotesFix || '')
    setSaveState('idle')
  }, [batchKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      timerRef.current = null
      if (!batchKey) return
      setSaveState('saving')
      try {
        await onUpdateBatchNotes(batchKey, keepRef.current, fixRef.current)
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => s === 'saved' ? 'idle' : s), 2000)
      } catch {
        setSaveState('failed')
      }
    }, 1000)
  }, [batchKey, onUpdateBatchNotes])

  const handleSaveAll = useCallback(async () => {
    if (!batch || downloadState === 'downloading') return
    setDownloadState('downloading')
    for (let i = 0; i < batch.outputs.length; i++) {
      const o = batch.outputs[i]
      if (!o.dataUrl) continue
      const ext = o.mimeType === 'image/png' ? 'png' : 'jpg'
      const filename = `Batch-${batch.number}-${i + 1}of${batch.outputs.length}-${o.id.slice(0, 8)}.${ext}`
      const link = document.createElement('a')
      link.href = o.dataUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      if (i < batch.outputs.length - 1) await new Promise((r) => setTimeout(r, 150))
    }
    setDownloadState('done')
    setTimeout(() => setDownloadState('idle'), 2500)
  }, [batch, downloadState])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const batchCost = useMemo(
    () => batch ? estimateBatchCost(batch.outputs) : { total: 0, count: 0 },
    [batch]
  )

  if (!batch) return <div className="v3-sp-empty">No batch selected</div>

  const time = new Date(batch.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const count = batch.outputs.length

  return (
    <div className="v3-sp-section-body v3-sp-section--batch">
      <div className="v3-sp-section-header">
        <span className="v3-sp-section-title">
          Batch {batch.number} <span className="v3-sp-section-meta">{count} img{count !== 1 ? 's' : ''} · {time}</span>
        </span>
        <div className="v3-sp-section-actions">
          <SaveIndicator state={saveState} />
          <button className="v3-sp-save-all" onClick={handleSaveAll} disabled={downloadState === 'downloading'}>
            {downloadState === 'downloading' ? 'Saving...' : downloadState === 'done' ? 'Saved!' : `Save All`}
          </button>
        </div>
      </div>
      {batchCost.total > 0 && (
        <div className="v3-sp-meta-tags">
          <span className="v3-sp-meta-tag">{count} image{count !== 1 ? 's' : ''}</span>
          <span className="v3-sp-meta-tag">{formatCost(batchCost.total)}</span>
        </div>
      )}
      <FeedbackBox
        type="keep"
        value={keepDraft}
        onChange={(e) => { setKeepDraft(e.target.value); scheduleSave() }}
        placeholder="What worked across this batch..."
      />
      <FeedbackBox
        type="fix"
        value={fixDraft}
        onChange={(e) => { setFixDraft(e.target.value); scheduleSave() }}
        placeholder="What should change for the next batch..."
      />
    </div>
  )
}

/* ═══════════════════════════════════════
   SECTION: Settings
   ═══════════════════════════════════════ */
function SettingsSection({
  model, onModelChange,
  imageSize, onImageSizeChange,
  aspectRatio, onAspectRatioChange,
  thinkingLevel, onThinkingLevelChange,
  googleSearch, onGoogleSearchChange,
  imageSearch, onImageSearchChange,
}) {
  const isFlash = model?.includes('flash')
  const sizeOptions = isFlash ? ['512', '1K', '2K', '4K'] : ['1K', '2K', '4K']
  const ratioOptions = isFlash ? ASPECT_RATIOS_FLASH : ASPECT_RATIOS_PRO

  return (
    <div className="v3-sp-section-body">
      <div className="v3-sp-setting">
        <span className="v3-sp-setting-label">Model</span>
        <select className="v3-sp-select" value={model} onChange={(e) => onModelChange(e.target.value)}>
          {AVAILABLE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <div className="v3-sp-setting">
        <span className="v3-sp-setting-label">Size</span>
        <div className="v3-sp-segment">
          {sizeOptions.map((s) => (
            <button key={s} className={`v3-sp-seg-btn ${imageSize === s ? 'v3-sp-seg-btn--on' : ''}`} onClick={() => onImageSizeChange(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div className="v3-sp-setting">
        <span className="v3-sp-setting-label">Ratio</span>
        <div className="v3-sp-ratio-grid">
          {ratioOptions.map((r) => {
            const shape = ratioToShape(r)
            return (
              <button
                key={r}
                className={`v3-sp-ratio-btn ${aspectRatio === r ? 'v3-sp-ratio-btn--on' : ''}`}
                onClick={() => onAspectRatioChange(r)}
                title={r}
              >
                <span className="v3-sp-ratio-shape" style={{ width: shape.width, height: shape.height }} />
                <span className="v3-sp-ratio-label">{r}</span>
              </button>
            )
          })}
        </div>
      </div>

      {isFlash && (
        <div className="v3-sp-setting">
          <span className="v3-sp-setting-label">Thinking</span>
          <div className="v3-sp-segment">
            <button className={`v3-sp-seg-btn ${thinkingLevel === 'minimal' ? 'v3-sp-seg-btn--on' : ''}`} onClick={() => onThinkingLevelChange('minimal')}>Min</button>
            <button className={`v3-sp-seg-btn ${thinkingLevel === 'High' ? 'v3-sp-seg-btn--on' : ''}`} onClick={() => onThinkingLevelChange('High')}>High</button>
          </div>
        </div>
      )}

      <div className="v3-sp-setting">
        <span className="v3-sp-setting-label">Search</span>
        <div className="v3-sp-toggles">
          <label className="v3-sp-toggle-item">
            <input type="checkbox" checked={googleSearch} onChange={(e) => { onGoogleSearchChange(e.target.checked); if (!e.target.checked) onImageSearchChange(false) }} />
            <span>Web</span>
          </label>
          <label className={`v3-sp-toggle-item ${!isFlash || !googleSearch ? 'v3-sp-toggle-disabled' : ''}`}>
            <input type="checkbox" checked={imageSearch} disabled={!isFlash || !googleSearch} onChange={(e) => onImageSearchChange(e.target.checked)} />
            <span>Images</span>
          </label>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════
   MAIN SIDE PANEL
   ═══════════════════════════════════════ */
export default function SidePanel({
  expanded, onToggle,
  // Feedback
  output, onUpdateFeedbackNotes,
  // Batch
  batch, onUpdateBatchNotes,
  // Refs
  refs, onAddRefs, onRemoveRef, onToggleRefSend, onToggleRefAnchor, onUpdateRefNotes,
  // Settings
  model, onModelChange,
  imageSize, onImageSizeChange,
  aspectRatio, onAspectRatioChange,
  thinkingLevel, onThinkingLevelChange,
  googleSearch, onGoogleSearchChange,
  imageSearch, onImageSearchChange,
  // Run bar
  imageCount, onImageCountChange,
  runLabel, runDisabled, onRunNextAttempt,
}) {
  return (
    <div className={`v3-side-panel ${expanded ? 'v3-side-panel--open' : ''}`}>

      {/* Toggle strip — always visible on the left edge of the panel */}
      <div className="v3-sp-toggle-strip">
        <button
          className="v3-sp-toggle-btn"
          onClick={() => onToggle(!expanded)}
          title={expanded ? 'Collapse panel' : 'Expand panel'}
        >
          {expanded ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          )}
        </button>
      </div>

      {/* Panel body — only visible when expanded */}
      {expanded && (
        <div className="v3-sp-inner">

          {/* Scrollable content */}
          <div className="v3-sp-scroll">

            {batch?.outputs?.length > 1 && (
              <>
                <SectionSep label="Image Notes" hint="6 notes · 250 chars" variant="image" />
                <FeedbackSection output={output} onUpdateFeedbackNotes={onUpdateFeedbackNotes} />
              </>
            )}

            <SectionSep label={batch?.outputs?.length > 1 ? 'Batch Notes' : 'Notes'} hint={batch?.outputs?.length > 1 ? '3 notes · 250 chars' : '6 notes · 250 chars'} variant="batch" />
            <BatchSection batch={batch} onUpdateBatchNotes={onUpdateBatchNotes} />

            <SectionSep label="Reference Images" variant="refs" />
            <div className="v3-sp-refs-wrap">
              <RefsPanel
                refs={refs || []}
                onAddRefs={onAddRefs}
                onRemoveRef={onRemoveRef}
                onToggleRefSend={onToggleRefSend}
                onToggleRefAnchor={onToggleRefAnchor}
                onUpdateRefNotes={onUpdateRefNotes}
                inSidebar
              />
            </div>

            <SectionSep label="Generation" variant="settings" />
            <SettingsSection
              model={model} onModelChange={onModelChange}
              imageSize={imageSize} onImageSizeChange={onImageSizeChange}
              aspectRatio={aspectRatio} onAspectRatioChange={onAspectRatioChange}
              thinkingLevel={thinkingLevel} onThinkingLevelChange={onThinkingLevelChange}
              googleSearch={googleSearch} onGoogleSearchChange={onGoogleSearchChange}
              imageSearch={imageSearch} onImageSearchChange={onImageSearchChange}
            />

            {/* Bottom padding so last section isn't hidden behind run bar */}
            <div style={{ height: 16 }} />
          </div>

          {/* Pinned run bar */}
          <div className="v3-sp-run-bar">
            <div className="v3-sp-run-bar-left">
              <span className="v3-sp-run-count-label">Images</span>
              <select
                className="v3-sp-run-count-select"
                value={imageCount}
                onChange={(e) => onImageCountChange(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <button
              className={`v3-run-btn ${runDisabled ? 'v3-run-btn-disabled' : ''} ${runLabel === 'Saved!' ? 'v3-run-btn-success' : ''}`}
              onClick={onRunNextAttempt}
              disabled={runDisabled}
            >
              {runLabel}
            </button>
          </div>

        </div>
      )}

    </div>
  )
}
