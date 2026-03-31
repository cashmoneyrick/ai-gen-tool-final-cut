import { useState, useRef, useEffect, useCallback } from 'react'
import { formatCost } from './costUtils'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

/* ── Tiny icon components ── */

const PencilIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
)

const ArchiveIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
)

const RestoreIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
)

export default function ProjectPickerModal({
  projects,
  activeProjectId,
  onSwitchProject,
  onCreateProject,
  onRenameProject,
  onArchiveProject,
  onRestoreProject,
  onClose,
}) {
  const [filter, setFilter] = useState('active')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [projectStats, setProjectStats] = useState({})
  const editRef = useRef(null)

  useEffect(() => {
    if (editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingId])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Fetch all project stats in a single lightweight call (no base64 transferred)
  useEffect(() => {
    let cancelled = false
    fetch('/api/project-stats')
      .then((r) => r.json())
      .then((stats) => { if (!cancelled) setProjectStats(stats) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projects])

  const filtered = projects.filter((p) => {
    if (filter === 'active') return !p.archived
    if (filter === 'archived') return p.archived
    return true
  })

  const startRename = useCallback((p) => {
    setEditingId(p.id)
    setEditName(p.name)
  }, [])

  const commitRename = useCallback(() => {
    if (editingId && editName.trim()) {
      onRenameProject(editingId, editName.trim())
    }
    setEditingId(null)
  }, [editingId, editName, onRenameProject])

  const handleCreate = useCallback(async () => {
    await onCreateProject()
    onClose()
  }, [onCreateProject, onClose])

  // Running totals
  const filteredStats = filtered.reduce((acc, p) => {
    const s = projectStats[p.id]
    if (s) { acc.images += s.outputCount; acc.cost += s.totalCost }
    return acc
  }, { images: 0, cost: 0 })

  const filters = ['active', 'archived', 'all']

  return (
    <div className="v3-modal-backdrop" onClick={onClose}>
      <div className="v3-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v3-modal-header">
          <span className="v3-modal-title">Projects</span>
          <button className="v3-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="v3-segment-bar">
          {filters.map((f) => (
            <button
              key={f}
              className={`v3-segment-btn ${filter === f ? 'v3-segment-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="v3-project-list">
          {filtered.length === 0 && (
            <div className="v3-project-list-empty">
              {filter === 'archived' ? 'No archived projects' : 'No projects yet'}
            </div>
          )}
          {filtered.map((p) => {
            const isActive = p.id === activeProjectId
            const stats = projectStats[p.id]
            return (
              <div
                key={p.id}
                className={`v3-project-row ${isActive ? 'v3-project-row-active' : ''}`}
              >
                {isActive && <div className="v3-project-active-bar" />}
                {editingId === p.id ? (
                  <input
                    ref={editRef}
                    className="v3-project-rename-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                ) : (
                  <button
                    className="v3-project-name-btn"
                    onClick={() => { onSwitchProject(p.id); onClose() }}
                    onDoubleClick={() => startRename(p)}
                  >
                    <div className="v3-project-info">
                      <span className="v3-project-name">{p.name}</span>
                      <span className="v3-project-meta">
                        <span className="v3-project-time">{timeAgo(p.updatedAt)}</span>
                        {stats && stats.outputCount > 0 && (
                          <>
                            <span className="v3-project-meta-dot">·</span>
                            <span className="v3-project-images">{stats.outputCount} img</span>
                            <span className="v3-project-meta-dot">·</span>
                            <span className="v3-project-cost">{formatCost(stats.totalCost)}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </button>
                )}
                <div className="v3-project-actions">
                  {!p.archived && (
                    <button
                      className="v3-project-icon-btn"
                      onClick={() => startRename(p)}
                      title="Rename"
                    >
                      <PencilIcon />
                    </button>
                  )}
                  <button
                    className="v3-project-icon-btn"
                    onClick={() => p.archived ? onRestoreProject(p.id) : onArchiveProject(p.id)}
                    title={p.archived ? 'Restore' : 'Archive'}
                  >
                    {p.archived ? <RestoreIcon /> : <ArchiveIcon />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="v3-modal-footer">
          {filteredStats.images > 0 && (
            <div className="v3-project-totals">
              <span>{filteredStats.images} images total</span>
              <span className="v3-project-totals-cost">{formatCost(filteredStats.cost)}</span>
            </div>
          )}
          <button className="v3-create-btn" onClick={handleCreate}>
            + New Project
          </button>
        </div>
      </div>
    </div>
  )
}
