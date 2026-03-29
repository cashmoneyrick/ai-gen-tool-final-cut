import { useState } from 'react'

const MEMORY_TYPES = [
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'correction', label: 'Correction' },
  { value: 'preference', label: 'Preference' },
  { value: 'warning', label: 'Warning' },
]

function SuggestionEditForm({ suggestion, onConfirm, onCancel }) {
  const [type, setType] = useState(suggestion.suggestedType)
  const [text, setText] = useState(suggestion.text)

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

export default function SuggestedMemories({ suggestions, onAccept, onDismiss }) {
  const [editingId, setEditingId] = useState(null)

  if (suggestions.length === 0) return null

  return (
    <section className="section">
      <div className="section-title">
        Suggested Memories
        <span className="memory-count"> ({suggestions.length})</span>
      </div>
      <div className="suggestion-list">
        {suggestions.map((s) => (
          <div className="suggestion-card" key={s.id}>
            {editingId === s.id ? (
              <SuggestionEditForm
                suggestion={s}
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
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
