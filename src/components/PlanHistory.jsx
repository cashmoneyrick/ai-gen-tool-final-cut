import { useState, useMemo, useEffect, useRef } from 'react'
import { getEffectiveFeedback } from '../reviewFeedback'

function relativeTime(ts) {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatCount(count, singular) {
  return `${count} ${singular}${count !== 1 ? 's' : ''}`
}

function deriveSignalChips(outcome) {
  if (outcome.outputCount === 0 && outcome.winnerCount === 0) {
    return [{ label: 'No linked outputs', tone: 'empty' }]
  }

  const chips = []

  if (outcome.outputCount > 0) {
    chips.push({ label: formatCount(outcome.outputCount, 'output'), tone: 'neutral' })
  }
  if (outcome.winnerCount > 0) {
    chips.push({ label: formatCount(outcome.winnerCount, 'winner'), tone: 'winner' })
  }
  if (outcome.thumbsUp > 0) {
    chips.push({ label: `👍 ${outcome.thumbsUp}`, tone: 'up' })
  }
  if (outcome.thumbsDown > 0) {
    chips.push({ label: `👎 ${outcome.thumbsDown}`, tone: 'down' })
  }
  if (outcome.winnerCount === 0 && outcome.thumbsUp === 0 && outcome.thumbsDown === 0) {
    chips.push({ label: 'No winner or feedback yet', tone: 'empty' })
  }

  return chips
}

/**
 * Derive outcome summary from resolved linked records.
 * Only counts outputs/winners that actually exist in the current data.
 */
function deriveOutcome(run, outputsById, winnersById, winnersByOutputId) {
  const linkedOutputIds = new Set(run.outputIds || [])

  let winnerCount = 0
  const winnerPreviews = []

  for (const wid of (run.winnerIds || [])) {
    const w = winnersById.get(wid)
    if (!w) continue
    winnerCount++
    if (w.outputId) linkedOutputIds.add(w.outputId)
    if (w.dataUrl) {
      winnerPreviews.push({
        id: w.id,
        dataUrl: w.dataUrl,
        displayId: w.displayId || 'Output —',
      })
    }
  }

  let outputCount = 0
  let thumbsUp = 0
  let thumbsDown = 0
  let unrated = 0

  for (const oid of linkedOutputIds) {
    const output = outputsById.get(oid)
    if (!output) continue
    outputCount++

    const feedback = getEffectiveFeedback(output, winnersByOutputId.get(oid))
    if (feedback === 'up') thumbsUp++
    else if (feedback === 'down') thumbsDown++
    else unrated++
  }

  const outcome = { outputCount, winnerCount, thumbsUp, thumbsDown, unrated, winnerPreviews }
  return { ...outcome, signalChips: deriveSignalChips(outcome) }
}

function formatOutcomeLine(outcome) {
  if (outcome.outputCount === 0 && outcome.winnerCount === 0) return 'No outcomes yet'
  const parts = []
  if (outcome.outputCount > 0) parts.push(formatCount(outcome.outputCount, 'output'))
  if (outcome.winnerCount > 0) parts.push(formatCount(outcome.winnerCount, 'winner'))
  if (outcome.thumbsUp > 0) parts.push(`${outcome.thumbsUp} up`)
  if (outcome.thumbsDown > 0) parts.push(`${outcome.thumbsDown} down`)
  return parts.join(' \u00b7 ')
}

function PlanRunCard({ run, expanded, onToggle, outcome, onUpdateNote, onSaveLesson }) {
  const goalTruncated = run.goalSnapshot?.length > 60
    ? run.goalSnapshot.slice(0, 60) + '...'
    : run.goalSnapshot || ''

  // Lifted note draft state (from former PlanRunNote)
  const [noteDraft, setNoteDraft] = useState(run.note || '')
  const noteTimerRef = useRef(null)

  // Sync draft if run.note changes externally
  useEffect(() => {
    setNoteDraft(run.note || '')
  }, [run.note])

  const handleNoteChange = (e) => {
    const value = e.target.value
    setNoteDraft(value)
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
    noteTimerRef.current = setTimeout(() => {
      onUpdateNote(run.id, value)
    }, 600)
  }

  // Double-submit guard for save-as-lesson
  const [savingLesson, setSavingLesson] = useState(null) // 'up' | 'down' | null
  const cooldownRef = useRef(null)

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
      if (cooldownRef.current) clearTimeout(cooldownRef.current)
    }
  }, [])

  const handleSaveLesson = (signal) => {
    const trimmed = noteDraft.trim()
    if (!trimmed || savingLesson) return
    setSavingLesson(signal)
    onSaveLesson(trimmed, signal, run.id)
    // Brief cooldown then reset
    cooldownRef.current = setTimeout(() => setSavingLesson(null), 800)
  }

  const hasNoteText = noteDraft.trim().length > 0

  return (
    <div className={`plan-run-card ${expanded ? 'plan-run-card-expanded' : ''}`}>
      <div className="plan-run-card-header" onClick={onToggle}>
        <span className={`plan-run-status plan-run-status-${run.status}`}>
          {run.status}
        </span>
        <span className="plan-run-time">{relativeTime(run.createdAt)}</span>
        {run.planModel && (
          <span className="plan-run-model">{run.planModel}</span>
        )}
        <span className="plan-run-chevron">{expanded ? '▾' : '▸'}</span>
      </div>
      <div className="plan-run-card-summary">
        <span className="plan-run-goal">{goalTruncated}</span>
        <div className="plan-run-signal-list" title={formatOutcomeLine(outcome)}>
          {outcome.signalChips.map((chip) => (
            <span
              key={`${run.id}-${chip.label}`}
              className={`plan-run-signal-chip plan-run-signal-chip-${chip.tone}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </div>
      {expanded && (
        <div className="plan-run-detail">
          {run.planData?.summary && (
            <div className="plan-run-detail-section">
              <span className="plan-run-detail-label">Summary</span>
              <p className="plan-run-detail-text">{run.planData.summary}</p>
            </div>
          )}
          {run.planData?.preserve?.length > 0 && (
            <div className="plan-run-detail-section">
              <span className="plan-run-detail-label">Preserve</span>
              <ul className="plan-run-detail-list">
                {run.planData.preserve.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          {run.planData?.change?.length > 0 && (
            <div className="plan-run-detail-section">
              <span className="plan-run-detail-label">Change</span>
              <ul className="plan-run-detail-list">
                {run.planData.change.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          {run.sourceSnapshot && (
            <div className="plan-run-detail-section">
              <span className="plan-run-detail-label">Sources</span>
              <span className="plan-run-detail-meta">
                {[
                  run.sourceSnapshot.memories?.length > 0 && `${run.sourceSnapshot.memories.length} memories`,
                  run.sourceSnapshot.docs?.length > 0 && `${run.sourceSnapshot.docs.length} docs`,
                  run.sourceSnapshot.sharedMemories?.length > 0 && `${run.sourceSnapshot.sharedMemories.length} shared mem`,
                  run.sourceSnapshot.sharedDocs?.length > 0 && `${run.sourceSnapshot.sharedDocs.length} shared docs`,
                  run.sourceSnapshot.excludedCount > 0 && `${run.sourceSnapshot.excludedCount} excluded`,
                ].filter(Boolean).join(' \u00b7 ')}
              </span>
            </div>
          )}

          {/* Outcome detail section */}
          {(outcome.outputCount > 0 || outcome.winnerCount > 0) && (
            <div className="plan-run-detail-section plan-run-outcome-detail">
              <span className="plan-run-detail-label">Outcomes</span>
              <div className="plan-run-feedback-breakdown">
                <span>{outcome.outputCount} output{outcome.outputCount !== 1 ? 's' : ''}</span>
                <span>{outcome.winnerCount} winner{outcome.winnerCount !== 1 ? 's' : ''}</span>
                {outcome.thumbsUp > 0 && <span className="plan-run-fb-up">{outcome.thumbsUp} thumbs up</span>}
                {outcome.thumbsDown > 0 && <span className="plan-run-fb-down">{outcome.thumbsDown} thumbs down</span>}
                {outcome.unrated > 0 && <span>{outcome.unrated} unrated</span>}
              </div>
              {outcome.winnerPreviews.length > 0 && (
                <div className="plan-run-winner-strip">
                  {outcome.winnerPreviews.slice(0, 8).map((wp) => (
                    <div key={wp.id} className="plan-run-winner-thumb-wrap">
                      <img
                        src={wp.dataUrl}
                        alt=""
                        className="plan-run-winner-thumb"
                      />
                      <span className="plan-run-winner-display-id">{wp.displayId}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {run.durationMs && (
            <div className="plan-run-detail-meta">
              {(run.durationMs / 1000).toFixed(1)}s
              {run.approvedAt && ` \u00b7 approved ${relativeTime(run.approvedAt)}`}
            </div>
          )}

          {/* Manual note (lifted draft state) */}
          <div className="plan-run-detail-section plan-run-note">
            <span className="plan-run-detail-label">Note</span>
            <textarea
              className="plan-run-note-input"
              placeholder="Add a note..."
              value={noteDraft}
              rows={2}
              maxLength={200}
              onChange={handleNoteChange}
            />
            {hasNoteText && (
              <div className="plan-run-lesson-actions">
                <button
                  className="btn btn-ghost btn-sm plan-run-lesson-btn"
                  disabled={!!savingLesson}
                  onClick={() => handleSaveLesson('up')}
                >
                  {savingLesson === 'up' ? 'Saved' : 'Save as \ud83d\udc4d lesson'}
                </button>
                <button
                  className="btn btn-ghost btn-sm plan-run-lesson-btn"
                  disabled={!!savingLesson}
                  onClick={() => handleSaveLesson('down')}
                >
                  {savingLesson === 'down' ? 'Saved' : 'Save as \ud83d\udc4e lesson'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const MAX_DISPLAY = 20

export default function PlanHistory({ planRuns, winners, outputs, onUpdateNote, onSaveLesson }) {
  const [expandedId, setExpandedId] = useState(null)

  // Build O(1) lookup maps, memoized on source arrays
  const outputsById = useMemo(() => {
    const m = new Map()
    for (const o of (outputs || [])) m.set(o.id, o)
    return m
  }, [outputs])

  const winnersById = useMemo(() => {
    const m = new Map()
    for (const w of (winners || [])) m.set(w.id, w)
    return m
  }, [winners])

  const winnersByOutputId = useMemo(() => {
    const m = new Map()
    for (const w of (winners || [])) {
      if (!w.outputId || m.has(w.outputId)) continue
      m.set(w.outputId, w)
    }
    return m
  }, [winners])

  if (!planRuns || planRuns.length === 0) {
    return (
      <section className="section">
        <div className="section-title">Plan History</div>
        <div className="plan-history-empty">
          Plan runs will appear here after generating plans.
        </div>
      </section>
    )
  }

  const displayRuns = planRuns.slice(0, MAX_DISPLAY)

  return (
    <section className="section">
      <div className="section-title">
        Plan History
        <span className="plan-history-count">{planRuns.length}</span>
      </div>
      <div className="plan-history-list">
        {displayRuns.map((run) => {
          const outcome = deriveOutcome(run, outputsById, winnersById, winnersByOutputId)
          return (
            <PlanRunCard
              key={run.id}
              run={run}
              expanded={expandedId === run.id}
              onToggle={() => setExpandedId(expandedId === run.id ? null : run.id)}
              outcome={outcome}
              onUpdateNote={onUpdateNote}
              onSaveLesson={onSaveLesson}
            />
          )
        })}
      </div>
      {planRuns.length > MAX_DISPLAY && (
        <div className="plan-history-overflow">
          {planRuns.length - MAX_DISPLAY} older runs not shown
        </div>
      )}
    </section>
  )
}
