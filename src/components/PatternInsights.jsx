import { useState } from 'react'

const MEMORY_TYPES = [
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'correction', label: 'Correction' },
  { value: 'preference', label: 'Preference' },
  { value: 'warning', label: 'Warning' },
]

function formatEvidence(evidence) {
  if (!evidence?.details) return null
  const d = evidence.details

  switch (evidence.rule) {
    case 'model-winner-rate':
      return Object.entries(d)
        .map(([model, info]) => `${model}: ${info.winners}/${info.outputs} winners (${info.rate}%)`)
        .join(' · ')
    case 'ref-impact':
      return `With refs: ${d.withRefs.winners}/${d.withRefs.outputs} (${d.withRefs.rate}%) · Without: ${d.withoutRefs.winners}/${d.withoutRefs.outputs} (${d.withoutRefs.rate}%)`
    case 'locked-impact':
      return `With locked: ${d.withLocked.winners}/${d.withLocked.outputs} (${d.withLocked.rate}%) · Without: ${d.withoutLocked.winners}/${d.withoutLocked.outputs} (${d.withoutLocked.rate}%)`
    case 'feedback-skew':
      return `${d.thumbsUp} thumbs up, ${d.thumbsDown} thumbs down out of ${d.total} rated`
    case 'model-feedback':
      return `${d.model}: ${d.thumbsDown}/${d.total} negative (${d.downPct}%)`
    default:
      return null
  }
}

function PatternEditForm({ insight, onConfirm, onCancel }) {
  const [type, setType] = useState(insight.suggestedType)
  const [text, setText] = useState(insight.text)

  return (
    <div className="suggestion-edit-form">
      <div className="memory-form-row">
        <select
          className="memory-type-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {MEMORY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <textarea
        className="memory-form-text"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="memory-form-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onConfirm({ type, text: text.trim() })}
          disabled={!text.trim()}
        >
          Confirm
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function PatternInsights({ onAnalyze, analyzing, insights, onAccept, onDismiss }) {
  const [editingId, setEditingId] = useState(null)

  return (
    <section className="section">
      <div className="section-title">
        Pattern Insights
        {insights.length > 0 && (
          <span className="memory-count"> ({insights.length})</span>
        )}
      </div>

      <div className="pattern-controls">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onAnalyze}
          disabled={analyzing}
        >
          {analyzing ? 'Analyzing...' : 'Analyze Patterns'}
        </button>
        {insights.length === 0 && !analyzing && (
          <span className="pattern-empty">
            Analyze project outcomes to find repeated patterns
          </span>
        )}
      </div>

      {insights.length > 0 && (
        <div className="suggestion-list">
          {insights.map((s) => (
            <div className="suggestion-card pattern-card" key={s.id}>
              {editingId === s.id ? (
                <PatternEditForm
                  insight={s}
                  onConfirm={(edited) => {
                    onAccept(s.id, edited)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="suggestion-card-header">
                    <span className={`memory-type-badge memory-type-${s.suggestedType}`}>
                      {s.suggestedType}
                    </span>
                    <span className="suggestion-reason">{s.reason}</span>
                    <div className="suggestion-card-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setEditingId(s.id)}
                      >
                        Accept
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => onDismiss(s.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                  <div className="memory-card-text">{s.text}</div>
                  {s.evidence && (
                    <div className="pattern-evidence">
                      {formatEvidence(s.evidence)}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
