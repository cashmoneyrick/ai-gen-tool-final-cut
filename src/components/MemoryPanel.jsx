import { useState, useEffect } from 'react'

const MEMORY_TYPES = [
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'correction', label: 'Correction' },
  { value: 'preference', label: 'Preference' },
  { value: 'warning', label: 'Warning' },
]

function MemoryTypeBadge({ type }) {
  return <span className={`memory-type-badge memory-type-${type}`}>{type}</span>
}

function MemoryAddForm({ initial, onSave, onCancel }) {
  const [type, setType] = useState(initial?.type || 'preference')
  const [text, setText] = useState(initial?.text || '')

  useEffect(() => {
    if (initial) {
      setType(initial.type || 'preference')
      setText(initial.text || '')
    }
  }, [initial])

  const handleSave = () => {
    if (!text.trim()) return
    onSave({
      type,
      text: text.trim(),
      winnerId: initial?.winnerId || null,
      outputId: initial?.outputId || null,
    })
    setText('')
    setType('preference')
  }

  return (
    <div className="memory-add-form">
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
        rows={3}
        placeholder="What did you learn? What should you remember?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="memory-form-actions">
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!text.trim()}>
          Save Memory
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function MemoryPanel({
  memories,
  onAddMemory,
  onUpdateMemory,
  onRemoveMemory,
  memoryDraft,
  onClearDraft,
  onShare,
}) {
  const [showForm, setShowForm] = useState(false)

  // Auto-open form when a draft arrives (from "Save as Memory" on winner)
  useEffect(() => {
    if (memoryDraft) setShowForm(true)
  }, [memoryDraft])

  const handleSave = (data) => {
    onAddMemory(data)
    setShowForm(false)
    if (onClearDraft) onClearDraft()
  }

  const handleCancel = () => {
    setShowForm(false)
    if (onClearDraft) onClearDraft()
  }

  const activeCount = memories.filter((m) => m.active).length
  const pinnedCount = memories.filter((m) => m.pinned).length

  return (
    <section className="section">
      <div className="section-title">
        Project Memory
        {memories.length > 0 && (
          <span className="memory-count">
            {' '}&mdash; {activeCount} active{pinnedCount > 0 ? `, ${pinnedCount} pinned` : ''}
          </span>
        )}
      </div>

      {!showForm && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            if (onClearDraft) onClearDraft()
            setShowForm(true)
          }}
        >
          + Add Memory
        </button>
      )}

      {showForm && (
        <MemoryAddForm
          initial={memoryDraft}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {memories.length === 0 && !showForm && (
        <div className="empty-state" style={{ marginTop: 8 }}>
          Save lessons, preferences, and corrections for this project
        </div>
      )}

      {memories.length > 0 && (
        <div className="memory-list">
          {memories.map((m) => (
            <div
              className={`memory-card ${m.active ? '' : 'memory-card-inactive'}`}
              key={m.id}
            >
              <div className="memory-card-header">
                <MemoryTypeBadge type={m.type} />
                {m.pinned && <span className="memory-pin-indicator">pinned</span>}
                {m.source === 'derived' && (
                  <span className="memory-source-badge">suggested</span>
                )}
                <div className="memory-card-actions">
                  <button
                    className={`btn btn-ghost btn-sm memory-pin-btn ${m.pinned ? 'memory-pinned' : ''}`}
                    onClick={() => onUpdateMemory(m.id, { pinned: !m.pinned })}
                    title={m.pinned ? 'Unpin' : 'Pin'}
                  >
                    {m.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onUpdateMemory(m.id, { active: !m.active })}
                    title={m.active ? 'Deactivate' : 'Activate'}
                  >
                    {m.active ? 'Active' : 'Off'}
                  </button>
                  {onShare && (
                    <button
                      className="btn btn-ghost btn-sm memory-share-btn"
                      onClick={() => onShare(m.id)}
                      title="Share across projects"
                    >
                      Share
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm memory-remove-btn"
                    onClick={() => onRemoveMemory(m.id)}
                    title="Delete memory"
                  >
                    &times;
                  </button>
                </div>
              </div>
              <div className="memory-card-text">{m.text}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
