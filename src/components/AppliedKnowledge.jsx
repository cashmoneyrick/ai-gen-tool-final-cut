import { useState, useMemo } from 'react'

const KIND_ORDER = ['rule', 'workflow', 'pattern', 'lesson', 'preference']
const KIND_LABELS = {
  rule: 'Rule',
  workflow: 'Workflow',
  pattern: 'Pattern',
  lesson: 'Lesson',
  preference: 'Preference',
}

const OVERRIDE_BADGE = {
  prefer: 'boosted',
  replace: 'overridden',
  add: 'project',
}

function EntryRow({ entry }) {
  const [expanded, setExpanded] = useState(false)
  // For replaced entries, show replacement body
  const displayBody = entry._replacement?.body || entry.body
  const displayTitle = entry._replacement?.title || entry.title
  const truncatedBody = displayBody.length > 100 ? displayBody.slice(0, 97) + '...' : displayBody

  return (
    <div className="ak-entry" onClick={() => setExpanded(!expanded)}>
      <div className="ak-entry-header">
        <span className={`ak-kind-badge ak-kind-${entry.kind}`}>
          {KIND_LABELS[entry.kind]}
        </span>
        {entry._overrideAction && OVERRIDE_BADGE[entry._overrideAction] && (
          <span className={`ak-override-badge ak-override-${entry._overrideAction}`}>
            {OVERRIDE_BADGE[entry._overrideAction]}
          </span>
        )}
        <span className="ak-entry-title">{displayTitle}</span>
        <span className="ak-entry-score" title="Relevance score">
          {entry._score.toFixed(1)}
        </span>
      </div>
      {!expanded && (
        <div className="ak-entry-preview">{truncatedBody}</div>
      )}
      {expanded && (
        <div className="ak-entry-detail">
          <div className="ak-entry-body">{displayBody}</div>
          {entry._overrideNote && (
            <div className="ak-override-note">Override note: {entry._overrideNote}</div>
          )}
          <div className="ak-entry-meta">
            <span className="ak-meta-label">Matched:</span>
            {entry._matchReasons.map((r, i) => (
              <span key={i} className="ak-match-tag">{r}</span>
            ))}
          </div>
          {entry.antiPatterns && entry.antiPatterns.length > 0 && (
            <div className="ak-anti-patterns">
              <span className="ak-meta-label">Avoid:</span>
              {entry.antiPatterns.map((ap, i) => (
                <span key={i} className="ak-anti-tag">{ap}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AppliedKnowledge({ entries }) {
  const [collapsed, setCollapsed] = useState(true)

  // Group by kind in display order
  const grouped = useMemo(() => {
    const groups = {}
    for (const entry of entries || []) {
      if (!groups[entry.kind]) groups[entry.kind] = []
      groups[entry.kind].push(entry)
    }
    return KIND_ORDER.filter((k) => groups[k]).map((k) => ({
      kind: k,
      label: KIND_LABELS[k],
      entries: groups[k],
    }))
  }, [entries])

  const count = entries?.length || 0

  if (count === 0) {
    return (
      <section className="section">
        <div className="section-title">Applied Knowledge</div>
        <div className="ak-empty">
          No matching starter knowledge for current context.
        </div>
      </section>
    )
  }

  return (
    <section className="section">
      <div className="section-title">
        Applied Knowledge
        <span className="project-lessons-count">{count}</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setCollapsed(!collapsed)}
          style={{ marginLeft: 8, fontSize: '11px' }}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>
      {!collapsed && (
        <div className="ak-list">
          {grouped.map((group) => (
            <div key={group.kind} className="ak-group">
              <div className="ak-group-label">
                {group.label}s
                <span className="ak-group-count">{group.entries.length}</span>
              </div>
              {group.entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
