import { useState, useEffect, useRef, useCallback } from 'react'
import SaveIndicator from './SaveIndicator'

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

export default function FeedbackNotes({ output, onUpdateFeedbackNotes }) {
  const [keepDraft, setKeepDraft] = useState('')
  const [fixDraft, setFixDraft] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const timerRef = useRef(null)
  const currentIdRef = useRef(null)
  const keepRef = useRef(keepDraft)
  const fixRef = useRef(fixDraft)
  keepRef.current = keepDraft
  fixRef.current = fixDraft

  // Sync drafts when output changes — flush pending save for previous output
  useEffect(() => {
    if (timerRef.current && currentIdRef.current && currentIdRef.current !== output?.id) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      const prevId = currentIdRef.current
      onUpdateFeedbackNotes(prevId, keepRef.current, fixRef.current).catch(() => {})
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

  const handleKeepChange = useCallback((e) => {
    setKeepDraft(e.target.value)
    scheduleSave()
  }, [scheduleSave])

  const handleFixChange = useCallback((e) => {
    setFixDraft(e.target.value)
    scheduleSave()
  }, [scheduleSave])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!output) return null

  // Derive signal indicator
  const hasKeep = keepDraft.trim().length > 0
  const hasFix = fixDraft.trim().length > 0
  const signal = hasKeep && hasFix ? 'mixed' : hasKeep ? 'positive' : hasFix ? 'negative' : null

  return (
    <div className="v3-feedback-notes">
      <div className="v3-feedback-box v3-feedback-keep">
        <div className="v3-feedback-box-header">
          <span className="v3-feedback-box-icon v3-feedback-keep-icon">&#10003;</span>
          <span className="v3-feedback-box-label">What works</span>
        </div>
        <textarea
          className="v3-feedback-box-input v3-feedback-keep-input"
          value={keepDraft}
          onChange={handleKeepChange}
          placeholder="What's good about this output..."
          rows={2}
        />
        <CharCounter value={keepDraft} max={150} />
      </div>
      <div className="v3-feedback-box v3-feedback-fix">
        <div className="v3-feedback-box-header">
          <span className="v3-feedback-box-icon v3-feedback-fix-icon">&#10005;</span>
          <span className="v3-feedback-box-label">What needs fixing</span>
        </div>
        <textarea
          className="v3-feedback-box-input v3-feedback-fix-input"
          value={fixDraft}
          onChange={handleFixChange}
          placeholder="What should change..."
          rows={2}
        />
        <CharCounter value={fixDraft} max={150} />
      </div>
      <div className="v3-feedback-status">
        {signal && (
          <span className={`v3-feedback-signal v3-feedback-signal-${signal}`}>
            {signal === 'positive' ? 'Positive' : signal === 'negative' ? 'Needs work' : 'Mixed'}
          </span>
        )}
        <SaveIndicator state={saveState} />
      </div>
    </div>
  )
}
