import { useState, useEffect, useRef, useCallback } from 'react'
import SaveIndicator from './SaveIndicator'
import { getFeedbackDisplay } from '../reviewFeedback.js'

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

export default function FeedbackNotes({ output, onUpdateFeedbackNotes, compareLabel = null, notePrompt = null }) {
  const [keepDraft, setKeepDraft] = useState(() => output?.notesKeep || '')
  const [fixDraft, setFixDraft] = useState(() => output?.notesFix || '')
  const [saveState, setSaveState] = useState('idle')
  const keepRef = useRef(keepDraft)
  const fixRef = useRef(fixDraft)
  const outputSnapshotRef = useRef({
    keep: output?.notesKeep || '',
    fix: output?.notesFix || '',
  })
  const lastPersistedRef = useRef({
    keep: output?.notesKeep || '',
    fix: output?.notesFix || '',
  })
  const saveInFlightRef = useRef(null)
  const saveQueuedRef = useRef(false)
  const outputIdRef = useRef(output?.id || null)

  useEffect(() => {
    keepRef.current = keepDraft
    fixRef.current = fixDraft
  }, [keepDraft, fixDraft])

  outputSnapshotRef.current = {
    keep: output?.notesKeep || '',
    fix: output?.notesFix || '',
  }

  useEffect(() => {
    const initialSnapshot = outputSnapshotRef.current
    outputIdRef.current = output?.id || null
    lastPersistedRef.current = {
      keep: initialSnapshot.keep,
      fix: initialSnapshot.fix,
    }
    saveQueuedRef.current = false
    saveInFlightRef.current = null
    setKeepDraft(initialSnapshot.keep)
    setFixDraft(initialSnapshot.fix)
    setSaveState('idle')
  }, [output?.id])

  const persistLatest = useCallback(async () => {
    if (!outputIdRef.current) return

    const currentSnapshot = {
      keep: keepRef.current || '',
      fix: fixRef.current || '',
    }
    if (
      currentSnapshot.keep === lastPersistedRef.current.keep &&
      currentSnapshot.fix === lastPersistedRef.current.fix
    ) {
      return
    }

    if (saveInFlightRef.current) {
      saveQueuedRef.current = true
      setSaveState('saving')
      return saveInFlightRef.current
    }

    const run = (async () => {
      setSaveState('saving')
      try {
        do {
          saveQueuedRef.current = false
          const nextSnapshot = {
            keep: keepRef.current || '',
            fix: fixRef.current || '',
          }

          await onUpdateFeedbackNotes(outputIdRef.current, nextSnapshot.keep, nextSnapshot.fix)
          lastPersistedRef.current = nextSnapshot
        } while (
          saveQueuedRef.current ||
          lastPersistedRef.current.keep !== (keepRef.current || '') ||
          lastPersistedRef.current.fix !== (fixRef.current || '')
        )

        setSaveState('saved')
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000)
      } catch {
        setSaveState('failed')
        throw new Error('output notes save failed')
      } finally {
        saveInFlightRef.current = null
      }
    })()

    saveInFlightRef.current = run
    return run
  }, [onUpdateFeedbackNotes])

  const handleKeepChange = useCallback((e) => {
    const nextValue = e.target.value
    keepRef.current = nextValue
    setKeepDraft(nextValue)
    void persistLatest()
  }, [persistLatest])

  const handleFixChange = useCallback((e) => {
    const nextValue = e.target.value
    fixRef.current = nextValue
    setFixDraft(nextValue)
    void persistLatest()
  }, [persistLatest])

  useEffect(() => {
    return () => {
      if (!outputIdRef.current) return
      const latest = {
        keep: keepRef.current || '',
        fix: fixRef.current || '',
      }
      if (
        latest.keep !== lastPersistedRef.current.keep ||
        latest.fix !== lastPersistedRef.current.fix
      ) {
        onUpdateFeedbackNotes(outputIdRef.current, latest.keep, latest.fix).catch(() => {})
      }
    }
  }, [onUpdateFeedbackNotes])

  if (!output) return null

  // Derive signal indicator
  const hasKeep = keepDraft.trim().length > 0
  const hasFix = fixDraft.trim().length > 0
  const signal = hasKeep && hasFix ? 'mixed' : hasKeep ? 'positive' : hasFix ? 'negative' : null
  const ratingLabel = getFeedbackDisplay(output.feedback).label
  const guidance = notePrompt || 'Optional capture for the next operator pass.'

  return (
    <div className="v3-feedback-notes">
      <div className="v3-feedback-head">
        <div className="v3-feedback-head-copy">
          <span className="v3-feedback-guidance-title">Operator notes</span>
          <span className="v3-feedback-guidance-line">{guidance}</span>
          <span className="v3-feedback-guidance-line">
            Optional. Current rating: {ratingLabel}{compareLabel ? ` · ${compareLabel}` : ''}
          </span>
        </div>
        <div className="v3-feedback-head-meta">
          {signal && (
            <span className={`v3-feedback-signal v3-feedback-signal-${signal}`}>
              {signal === 'positive' ? 'Positive' : signal === 'negative' ? 'Needs work' : 'Mixed'}
            </span>
          )}
          <SaveIndicator state={saveState} />
        </div>
      </div>

      <div className="v3-feedback-grid">
        <div className="v3-feedback-box v3-feedback-keep">
          <div className="v3-feedback-box-header">
            <span className="v3-feedback-box-icon v3-feedback-keep-icon">&#10003;</span>
            <span className="v3-feedback-box-label">Carry Forward</span>
          </div>
          <div className="v3-feedback-box-hint">Name the exact element the next pass should preserve.</div>
          <textarea
            className="v3-feedback-box-input v3-feedback-keep-input"
            value={keepDraft}
            onChange={handleKeepChange}
            onBlur={() => { void persistLatest() }}
            placeholder="Keep the exact shape, lighting, palette, framing, or texture that should survive..."
            rows={2}
          />
          <CharCounter value={keepDraft} max={150} />
        </div>

        <div className="v3-feedback-box v3-feedback-fix">
          <div className="v3-feedback-box-header">
            <span className="v3-feedback-box-icon v3-feedback-fix-icon">&#10005;</span>
            <span className="v3-feedback-box-label">Change Next</span>
          </div>
          <div className="v3-feedback-box-hint">Call out the one issue that should change on the next pass.</div>
          <textarea
            className="v3-feedback-box-input v3-feedback-fix-input"
            value={fixDraft}
            onChange={handleFixChange}
            onBlur={() => { void persistLatest() }}
            placeholder="Change the specific proportion, material, spacing, lighting, or detail that is off..."
            rows={2}
          />
          <CharCounter value={fixDraft} max={150} />
        </div>
      </div>
    </div>
  )
}
