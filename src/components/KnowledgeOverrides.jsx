import { useState } from 'react'
import { STARTER_ENTRIES, SYSTEMS, TASK_TYPES, ENTRY_KINDS } from '../knowledge/starterEntries'

const ACTION_LABELS = {
  prefer: 'Boost',
  suppress: 'Suppress',
  replace: 'Replace',
  add: 'Add',
}

const ACTION_DESCRIPTIONS = {
  prefer: 'Boost a starter entry for this project',
  suppress: 'Remove a starter entry from this project',
  replace: 'Replace a starter entry with custom content',
  add: 'Add a new project-specific entry',
}

function OverrideRow({ override, onUpdate, onRemove }) {
  const targetEntry = override.targetEntryId
    ? STARTER_ENTRIES.find((e) => e.id === override.targetEntryId)
    : null

  return (
    <div className={`ko-row ${override.isActive ? '' : 'ko-row-inactive'}`}>
      <div className="ko-row-header">
        <span className={`ko-action-badge ko-action-${override.action}`}>
          {ACTION_LABELS[override.action]}
        </span>
        <span className="ko-row-title">
          {override.action === 'add' ? override.title : (targetEntry?.title || override.targetEntryId || 'Unknown')}
        </span>
        <div className="ko-row-actions">
          <button
            className={`btn btn-ghost btn-sm ${override.isActive ? 'ko-active-btn' : ''}`}
            onClick={() => onUpdate(override.id, { isActive: !override.isActive })}
            title={override.isActive ? 'Deactivate' : 'Activate'}
          >
            {override.isActive ? 'On' : 'Off'}
          </button>
          <button
            className="btn btn-ghost btn-sm ko-delete-btn"
            onClick={() => onRemove(override.id)}
            title="Delete override"
          >
            &times;
          </button>
        </div>
      </div>
      {override.notes && (
        <div className="ko-row-notes">{override.notes}</div>
      )}
      {override.action === 'add' && override.body && (
        <div className="ko-row-body">{override.body.length > 120 ? override.body.slice(0, 117) + '...' : override.body}</div>
      )}
      {override.action === 'replace' && override.body && (
        <div className="ko-row-body">Replacement: {override.body.length > 100 ? override.body.slice(0, 97) + '...' : override.body}</div>
      )}
    </div>
  )
}

function AddOverrideForm({ onAdd, onCancel }) {
  const [action, setAction] = useState('prefer')
  const [targetEntryId, setTargetEntryId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState('rule')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState(2)

  const needsTarget = action === 'prefer' || action === 'suppress' || action === 'replace'
  const needsBody = action === 'replace' || action === 'add'
  const needsTitle = action === 'add'
  const needsKind = action === 'add'

  const canSave = needsTarget ? !!targetEntryId : !!title.trim()

  function handleSave() {
    const data = { action, notes, priority }
    if (needsTarget) data.targetEntryId = targetEntryId
    if (needsBody) data.body = body
    if (needsTitle) data.title = title
    if (needsKind) data.kind = kind
    // For prefer/suppress, copy title from target for display
    if (needsTarget && !needsTitle) {
      const target = STARTER_ENTRIES.find((e) => e.id === targetEntryId)
      data.title = target?.title || targetEntryId
      data.kind = target?.kind || 'rule'
    }
    onAdd(data)
    onCancel()
  }

  return (
    <div className="ko-add-form">
      <div className="ko-form-row">
        <label className="ko-form-label">Action</label>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="ko-form-select">
          {Object.entries(ACTION_DESCRIPTIONS).map(([k, desc]) => (
            <option key={k} value={k}>{ACTION_LABELS[k]} — {desc}</option>
          ))}
        </select>
      </div>

      {needsTarget && (
        <div className="ko-form-row">
          <label className="ko-form-label">Target entry</label>
          <select value={targetEntryId} onChange={(e) => setTargetEntryId(e.target.value)} className="ko-form-select">
            <option value="">Select a starter entry...</option>
            {STARTER_ENTRIES.map((e) => (
              <option key={e.id} value={e.id}>[{e.kind}] {e.title}</option>
            ))}
          </select>
        </div>
      )}

      {needsKind && (
        <div className="ko-form-row">
          <label className="ko-form-label">Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="ko-form-select">
            {ENTRY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}

      {needsTitle && (
        <div className="ko-form-row">
          <label className="ko-form-label">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title..."
            className="ko-form-input"
          />
        </div>
      )}

      {needsBody && (
        <div className="ko-form-row">
          <label className="ko-form-label">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={action === 'replace' ? 'Replacement content...' : 'Entry content...'}
            className="ko-form-textarea"
            rows={3}
          />
        </div>
      )}

      <div className="ko-form-row">
        <label className="ko-form-label">Priority</label>
        <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="ko-form-select">
          <option value={1}>1 — Low</option>
          <option value={2}>2 — Medium</option>
          <option value={3}>3 — High</option>
        </select>
      </div>

      <div className="ko-form-row">
        <label className="ko-form-label">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why this override exists..."
          className="ko-form-input"
        />
      </div>

      <div className="ko-form-actions">
        <button className="btn btn-sm" onClick={handleSave} disabled={!canSave}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function KnowledgeOverrides({ overrides, onAdd, onUpdate, onRemove }) {
  const [showForm, setShowForm] = useState(false)

  const count = overrides?.length || 0
  const activeCount = overrides?.filter((o) => o.isActive).length || 0

  return (
    <section className="section">
      <div className="section-title">
        Knowledge Overrides
        {count > 0 && (
          <span className="project-lessons-count">{activeCount}/{count}</span>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowForm(!showForm)}
          style={{ marginLeft: 8, fontSize: '11px' }}
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showForm && (
        <AddOverrideForm onAdd={onAdd} onCancel={() => setShowForm(false)} />
      )}

      {count === 0 && !showForm && (
        <div className="ko-empty">No overrides for this project.</div>
      )}

      {count > 0 && (
        <div className="ko-list">
          {overrides.map((override) => (
            <OverrideRow
              key={override.id}
              override={override}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </section>
  )
}
