import { useState } from 'react'

const DOC_TYPES = [
  { value: 'notes', label: 'Notes' },
  { value: 'brief', label: 'Brief' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: 'Text' },
]

function DocTypeBadge({ type }) {
  return <span className="doc-type-badge">{type}</span>
}

function DocForm({ initial, onSave, onCancel, isEdit }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [type, setType] = useState(initial?.type || 'notes')
  const [text, setText] = useState(initial?.text || '')

  const handleSave = () => {
    if (!text.trim()) return
    onSave({
      title: title.trim() || 'Untitled',
      type,
      text: text.trim(),
    })
    if (!isEdit) {
      setTitle('')
      setType('notes')
      setText('')
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setText(reader.result)
      if (!title) setTitle(file.name.replace(/\.(md|txt)$/, ''))
      if (file.name.endsWith('.md')) setType('markdown')
      else setType('text')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="doc-add-form">
      <div className="doc-form-row">
        <input
          className="doc-form-title"
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <select
          className="doc-type-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <textarea
        className="doc-form-text"
        rows={6}
        placeholder="Paste or type your document content..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="doc-form-actions">
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!text.trim()}>
          {isEdit ? 'Update' : 'Save Doc'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <label className="doc-upload-btn">
          Upload .md / .txt
          <input
            className="doc-upload-input"
            type="file"
            accept=".md,.txt"
            onChange={handleFileUpload}
          />
        </label>
      </div>
    </div>
  )
}

export default function DocsPanel({ docs, onAddDoc, onUpdateDoc, onRemoveDoc, onShare }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [expandedIds, setExpandedIds] = useState(new Set())

  const activeCount = docs.filter((d) => d.active).length
  const pinnedCount = docs.filter((d) => d.pinned).length

  const handleSaveNew = (data) => {
    onAddDoc(data)
    setShowForm(false)
  }

  const handleSaveEdit = (data) => {
    if (editingId) {
      onUpdateDoc(editingId, data)
      setEditingId(null)
    }
  }

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="section">
      <div className="section-title">
        Project Docs
        {docs.length > 0 && (
          <span className="doc-count">
            {' '}&mdash; {activeCount} active{pinnedCount > 0 ? `, ${pinnedCount} pinned` : ''}
          </span>
        )}
      </div>

      {!showForm && !editingId && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setShowForm(true)}
        >
          + Add Doc
        </button>
      )}

      {showForm && (
        <DocForm
          onSave={handleSaveNew}
          onCancel={() => setShowForm(false)}
        />
      )}

      {docs.length === 0 && !showForm && (
        <div className="empty-state" style={{ marginTop: 8 }}>
          Add project briefs, style guides, and reference notes
        </div>
      )}

      {docs.length > 0 && (
        <div className="doc-list">
          {docs.map((d) => (
            <div
              className={`doc-card ${d.active ? '' : 'doc-card-inactive'}`}
              key={d.id}
            >
              {editingId === d.id ? (
                <DocForm
                  initial={d}
                  isEdit
                  onSave={handleSaveEdit}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="doc-card-header">
                    <span className="doc-card-title">{d.title}</span>
                    <DocTypeBadge type={d.type} />
                    {d.pinned && <span className="doc-pin-indicator">pinned</span>}
                    <div className="doc-card-actions">
                      <button
                        className={`btn btn-ghost btn-sm doc-pin-btn ${d.pinned ? 'doc-pinned' : ''}`}
                        onClick={() => onUpdateDoc(d.id, { pinned: !d.pinned })}
                        title={d.pinned ? 'Unpin' : 'Pin'}
                      >
                        {d.pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => onUpdateDoc(d.id, { active: !d.active })}
                        title={d.active ? 'Deactivate' : 'Activate'}
                      >
                        {d.active ? 'Active' : 'Off'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditingId(d.id)}
                        title="Edit"
                      >
                        Edit
                      </button>
                      {onShare && (
                        <button
                          className="btn btn-ghost btn-sm doc-share-btn"
                          onClick={() => onShare(d.id)}
                          title="Share across projects"
                        >
                          Share
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm doc-remove-btn"
                        onClick={() => onRemoveDoc(d.id)}
                        title="Delete doc"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                  <div
                    className={`doc-card-text ${!expandedIds.has(d.id) ? 'doc-card-text-truncated' : ''}`}
                    onClick={() => toggleExpand(d.id)}
                  >
                    {d.text}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
