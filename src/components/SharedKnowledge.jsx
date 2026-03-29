import { useState } from 'react'

function SharedMemoryCard({ item, onToggle, onPin, onRemove }) {
  return (
    <div className={`shared-card ${item.activeInProject ? '' : 'shared-card-inactive'}`}>
      <div className="shared-card-header">
        <span className={`memory-type-badge memory-type-${item.type}`}>{item.type}</span>
        {item.pinned && <span className="memory-pin-indicator">pinned</span>}
        <div className="shared-card-actions">
          <button
            className={`btn btn-ghost btn-sm ${item.activeInProject ? 'shared-active-btn' : ''}`}
            onClick={() => onToggle(item.id, 'memory')}
            title={item.activeInProject ? 'Deactivate for this project' : 'Activate for this project'}
          >
            {item.activeInProject ? 'On' : 'Off'}
          </button>
          <button
            className={`btn btn-ghost btn-sm memory-pin-btn ${item.pinned ? 'memory-pinned' : ''}`}
            onClick={() => onPin(item.id, { pinned: !item.pinned })}
            title={item.pinned ? 'Unpin' : 'Pin'}
          >
            {item.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            className="btn btn-ghost btn-sm shared-remove-btn"
            onClick={() => onRemove(item.id)}
            title="Delete from all projects"
          >
            &times;
          </button>
        </div>
      </div>
      <div className="shared-card-text">{item.text}</div>
    </div>
  )
}

function SharedDocCard({ item, onToggle, onPin, onRemove }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`shared-card ${item.activeInProject ? '' : 'shared-card-inactive'}`}>
      <div className="shared-card-header">
        <span className="shared-card-title">{item.title}</span>
        <span className="doc-type-badge">{item.type}</span>
        {item.pinned && <span className="doc-pin-indicator">pinned</span>}
        <div className="shared-card-actions">
          <button
            className={`btn btn-ghost btn-sm ${item.activeInProject ? 'shared-active-btn' : ''}`}
            onClick={() => onToggle(item.id, 'doc')}
            title={item.activeInProject ? 'Deactivate for this project' : 'Activate for this project'}
          >
            {item.activeInProject ? 'On' : 'Off'}
          </button>
          <button
            className={`btn btn-ghost btn-sm doc-pin-btn ${item.pinned ? 'doc-pinned' : ''}`}
            onClick={() => onPin(item.id, { pinned: !item.pinned })}
            title={item.pinned ? 'Unpin' : 'Pin'}
          >
            {item.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            className="btn btn-ghost btn-sm shared-remove-btn"
            onClick={() => onRemove(item.id)}
            title="Delete from all projects"
          >
            &times;
          </button>
        </div>
      </div>
      <div
        className={`shared-card-text ${!expanded ? 'shared-card-text-truncated' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        {item.text}
      </div>
    </div>
  )
}

export default function SharedKnowledge({
  sharedMemories,
  sharedDocs,
  onToggleActivation,
  onUpdateSharedMemory,
  onUpdateSharedDoc,
  onRemoveSharedMemory,
  onRemoveSharedDoc,
}) {
  const totalCount = sharedMemories.length + sharedDocs.length
  const activeMemCount = sharedMemories.filter((m) => m.activeInProject).length
  const activeDocCount = sharedDocs.filter((d) => d.activeInProject).length

  const handleRemoveMemory = (id) => {
    if (!confirm('Delete this shared memory from ALL projects?')) return
    onRemoveSharedMemory(id)
  }

  const handleRemoveDoc = (id) => {
    if (!confirm('Delete this shared doc from ALL projects?')) return
    onRemoveSharedDoc(id)
  }

  return (
    <section className="section">
      <div className="section-title">
        Shared Knowledge
        {totalCount > 0 && (
          <span className="shared-count">
            {' '}&mdash; {activeMemCount + activeDocCount} active in this project
          </span>
        )}
      </div>

      {totalCount === 0 && (
        <div className="empty-state" style={{ marginTop: 8 }}>
          Promote project memories or docs to share across projects
        </div>
      )}

      {sharedMemories.length > 0 && (
        <>
          <div className="shared-subsection-title">
            Shared Memories ({sharedMemories.length})
          </div>
          <div className="shared-list">
            {sharedMemories.map((m) => (
              <SharedMemoryCard
                key={m.id}
                item={m}
                onToggle={onToggleActivation}
                onPin={onUpdateSharedMemory}
                onRemove={handleRemoveMemory}
              />
            ))}
          </div>
        </>
      )}

      {sharedDocs.length > 0 && (
        <>
          <div className="shared-subsection-title">
            Shared Docs ({sharedDocs.length})
          </div>
          <div className="shared-list">
            {sharedDocs.map((d) => (
              <SharedDocCard
                key={d.id}
                item={d}
                onToggle={onToggleActivation}
                onPin={onUpdateSharedDoc}
                onRemove={handleRemoveDoc}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
