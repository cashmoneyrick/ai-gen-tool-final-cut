import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import SaveIndicator from './SaveIndicator'
import { estimateBatchCost, formatCost } from './costUtils'

function CharCounter({ value, max }) {
  const len = (value || '').trim().length
  if (len === 0) return null
  const over = len > max
  const near = len > max * 0.8
  const tooShort = len > 0 && len <= 5
  return (
    <div className={`v3-char-counter ${over ? 'v3-char-counter--over' : near ? 'v3-char-counter--near' : ''} ${tooShort ? 'v3-char-counter--short' : ''}`}>
      {tooShort ? (
        <span>too short to count</span>
      ) : (
        <span>{len}<span className="v3-char-counter-sep">/</span>{max}{over && ' — will be cut'}</span>
      )}
    </div>
  )
}

export default function BatchBar({ batch, onUpdateBatchNotes }) {
  const [expanded, setExpanded] = useState(false)
  const [keepDraft, setKeepDraft] = useState('')
  const [fixDraft, setFixDraft] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const [downloadState, setDownloadState] = useState('idle') // idle | downloading | done
  const timerRef = useRef(null)
  const currentBatchKeyRef = useRef(null)
  const keepRef = useRef(keepDraft)
  const fixRef = useRef(fixDraft)
  keepRef.current = keepDraft
  fixRef.current = fixDraft

  const batchKey = batch?.createdAt || null

  // Sync drafts when batch changes — flush pending save for previous batch
  useEffect(() => {
    if (timerRef.current && currentBatchKeyRef.current && currentBatchKeyRef.current !== batchKey) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      onUpdateBatchNotes(currentBatchKeyRef.current, keepRef.current, fixRef.current).catch(() => {})
    }
    currentBatchKeyRef.current = batchKey
    // Read batch notes from the first output in the batch
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

  const handleKeepChange = useCallback((e) => {
    setKeepDraft(e.target.value)
    scheduleSave()
  }, [scheduleSave])

  const handleFixChange = useCallback((e) => {
    setFixDraft(e.target.value)
    scheduleSave()
  }, [scheduleSave])

  // Download all images in batch
  const handleSaveAll = useCallback(async () => {
    if (!batch || downloadState === 'downloading') return
    setDownloadState('downloading')
    const outputs = batch.outputs
    for (let i = 0; i < outputs.length; i++) {
      const o = outputs[i]
      if (!o.dataUrl) continue
      const ext = o.mimeType === 'image/png' ? 'png' : 'jpg'
      const filename = `Batch-${batch.number}-${i + 1}of${outputs.length}-${o.id.slice(0, 8)}.${ext}`
      const link = document.createElement('a')
      link.href = o.dataUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      // Stagger to avoid browser blocking
      if (i < outputs.length - 1) {
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    setDownloadState('done')
    setTimeout(() => setDownloadState('idle'), 2500)
  }, [batch, downloadState])

  // Cleanup
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Batch cost estimation
  const batchCost = useMemo(
    () => batch ? estimateBatchCost(batch.outputs) : { total: 0, count: 0, perImage: null },
    [batch]
  )

  if (!batch) return null

  const time = new Date(batch.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const count = batch.outputs.length
  const hasKeep = keepDraft.trim().length > 0
  const hasFix = fixDraft.trim().length > 0
  const hasNotes = hasKeep || hasFix

  return (
    <div className={`v3-batch-bar ${expanded ? 'v3-batch-bar-expanded' : ''}`}>
      <div className="v3-batch-bar-header">
        <button className="v3-batch-bar-toggle" onClick={() => setExpanded(!expanded)}>
          <span className="v3-batch-bar-arrow">{expanded ? '▾' : '▸'}</span>
          <span className="v3-batch-bar-label">
            Batch {batch.number}
          </span>
          <span className="v3-batch-bar-meta">
            {count} image{count !== 1 ? 's' : ''} · {time}
            {batchCost.total > 0 && (
              <span className="v3-batch-bar-cost"> · {formatCost(batchCost.total)}</span>
            )}
          </span>
          {hasNotes && !expanded && (
            <span className="v3-batch-bar-has-notes">noted</span>
          )}
        </button>
        <div className="v3-batch-bar-actions">
          <SaveIndicator state={saveState} />
          <button
            className={`v3-batch-save-all ${downloadState === 'done' ? 'v3-batch-save-all-done' : ''}`}
            onClick={handleSaveAll}
            disabled={downloadState === 'downloading'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {downloadState === 'downloading' ? 'Saving...' : downloadState === 'done' ? 'Saved!' : `Save All ${count}`}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="v3-batch-bar-notes">
          <div className="v3-batch-note-box v3-batch-note-keep">
            <div className="v3-batch-note-label">
              <span className="v3-batch-note-icon v3-batch-note-keep-icon">✓</span>
              Batch — what works
            </div>
            <textarea
              className="v3-batch-note-input v3-batch-note-keep-input"
              value={keepDraft}
              onChange={handleKeepChange}
              placeholder="What worked across this batch..."
              rows={2}
            />
            <CharCounter value={keepDraft} max={150} />
          </div>
          <div className="v3-batch-note-box v3-batch-note-fix">
            <div className="v3-batch-note-label">
              <span className="v3-batch-note-icon v3-batch-note-fix-icon">✗</span>
              Batch — what needs fixing
            </div>
            <textarea
              className="v3-batch-note-input v3-batch-note-fix-input"
              value={fixDraft}
              onChange={handleFixChange}
              placeholder="What should change for the next batch..."
              rows={2}
            />
            <CharCounter value={fixDraft} max={150} />
          </div>
        </div>
      )}
    </div>
  )
}
