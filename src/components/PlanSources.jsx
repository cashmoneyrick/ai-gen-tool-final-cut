import { useState, useMemo } from 'react'
import { buildAllSourceLists } from '../planning/sourcePipeline'

const GROUP_CONFIG = [
  { key: 'memory', label: 'Project Memories', prefix: 'memory' },
  { key: 'doc', label: 'Project Docs', prefix: 'doc' },
  { key: 'sharedMemory', label: 'Shared Memories', prefix: 'sharedMemory' },
  { key: 'sharedDoc', label: 'Shared Docs', prefix: 'sharedDoc' },
]

function SourceItem({ item, prefix, isExcluded, isOverCap, onToggle }) {
  const key = `${prefix}:${item.id}`
  const label = item.title || item.text?.slice(0, 50) || '(empty)'
  const typeLabel = item.type || ''

  return (
    <label
      className={`plan-sources-item ${isExcluded ? 'plan-sources-item-excluded' : ''} ${isOverCap ? 'plan-sources-item-overcap' : ''}`}
    >
      <input
        type="checkbox"
        className="plan-sources-item-checkbox"
        checked={!isExcluded && !isOverCap}
        disabled={isOverCap}
        onChange={() => onToggle(key)}
      />
      <span className={`memory-type-badge memory-type-${typeLabel}`}>{typeLabel}</span>
      <span className="plan-sources-item-text">
        {label}
        {item.pinned && <span className="plan-sources-pin"> (pinned)</span>}
      </span>
      {isOverCap && <span className="plan-sources-overcap-label">over cap</span>}
    </label>
  )
}

function SourceGroup({ config, sourceList, excludedKeys, onToggle }) {
  const [open, setOpen] = useState(false)
  const { included, excluded, overCap, cap } = sourceList
  const totalActive = included.length + excluded.length + overCap.length
  const willSend = included.length

  if (totalActive === 0) return null

  const pinnedCount = included.filter((i) => i.pinned).length

  return (
    <div className="plan-sources-group">
      <div className="plan-sources-group-header" onClick={() => setOpen(!open)}>
        <span className="plan-sources-chevron">{open ? '▾' : '▸'}</span>
        <span className="plan-sources-group-label">{config.label}</span>
        <span className="plan-sources-group-count">
          {willSend} of {totalActive} included
          {pinnedCount > 0 && `, ${pinnedCount} pinned`}
          {overCap.length > 0 && ` (cap ${cap})`}
          {excluded.length > 0 && ` · ${excluded.length} excluded`}
        </span>
      </div>
      {open && (
        <div className="plan-sources-group-items">
          {included.map((item) => (
            <SourceItem
              key={item.id}
              item={item}
              prefix={config.prefix}
              isExcluded={false}
              isOverCap={false}
              onToggle={onToggle}
            />
          ))}
          {overCap.map((item) => (
            <SourceItem
              key={item.id}
              item={item}
              prefix={config.prefix}
              isExcluded={false}
              isOverCap={true}
              onToggle={onToggle}
            />
          ))}
          {excluded.map((item) => (
            <SourceItem
              key={item.id}
              item={item}
              prefix={config.prefix}
              isExcluded={true}
              isOverCap={false}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlanSources({
  memories,
  docs,
  sharedMemories,
  sharedDocs,
  excludedKeys,
  onToggleExclude,
  onClearExcludes,
}) {
  const [expanded, setExpanded] = useState(false)

  const sourceLists = useMemo(
    () => buildAllSourceLists({ memories, docs, sharedMemories, sharedDocs, excludedKeys }),
    [memories, docs, sharedMemories, sharedDocs, excludedKeys]
  )

  // Summary counts
  const counts = GROUP_CONFIG.map(({ key, label }) => {
    const sl = sourceLists[key]
    return { key, label, sending: sl.included.length, total: sl.included.length + sl.excluded.length + sl.overCap.length }
  }).filter((c) => c.total > 0)

  const totalSending = counts.reduce((s, c) => s + c.sending, 0)
  const totalSources = counts.reduce((s, c) => s + c.total, 0)
  const excludeCount = excludedKeys.size

  if (totalSources === 0) return null

  const summaryParts = counts.map((c) => `${c.sending} ${c.label.toLowerCase().replace('project ', '')}`)

  return (
    <div className="plan-sources">
      <div className="plan-sources-header" onClick={() => setExpanded(!expanded)}>
        <span className="plan-sources-chevron">{expanded ? '▾' : '▸'}</span>
        <span className="plan-sources-summary">
          Sources: {summaryParts.join(', ')}
          {excludeCount > 0 && ` (${excludeCount} excluded)`}
        </span>
        {excludeCount > 0 && (
          <button
            className="btn btn-ghost btn-sm plan-sources-clear"
            onClick={(e) => {
              e.stopPropagation()
              onClearExcludes()
            }}
          >
            Clear
          </button>
        )}
      </div>
      {expanded && (
        <div className="plan-sources-body">
          {GROUP_CONFIG.map((config) => (
            <SourceGroup
              key={config.key}
              config={config}
              sourceList={sourceLists[config.key]}
              excludedKeys={excludedKeys}
              onToggle={onToggleExclude}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Post-plan source detail: shows what was actually used for a specific plan run.
 */
export function PlanSourceDetail({ snapshot }) {
  if (!snapshot) return null

  const groups = [
    { label: 'Memories', items: snapshot.memories },
    { label: 'Docs', items: snapshot.docs },
    { label: 'Shared Memories', items: snapshot.sharedMemories },
    { label: 'Shared Docs', items: snapshot.sharedDocs },
  ].filter((g) => g.items.length > 0)

  if (groups.length === 0 && !snapshot.excludedCount) return null

  return (
    <div className="plan-source-detail">
      <div className="plan-source-detail-header">Sources used:</div>
      {groups.map((g) => {
        const pinned = g.items.filter((i) => i.pinned).length
        const titles = g.items
          .map((i) => i.title || `[${i.type}] ${i.text || ''}`)
          .slice(0, 4)
        return (
          <div className="plan-source-detail-group" key={g.label}>
            <span className="plan-source-detail-count">
              {g.items.length} {g.label.toLowerCase()}{pinned > 0 ? ` (${pinned} pinned)` : ''}
            </span>
            {titles.length > 0 && (
              <span className="plan-source-detail-titles">
                {' — '}{titles.join(', ')}{g.items.length > 4 ? '...' : ''}
              </span>
            )}
          </div>
        )
      })}
      {snapshot.excludedCount > 0 && (
        <div className="plan-source-detail-excluded">
          {snapshot.excludedCount} source(s) excluded by override
        </div>
      )}
    </div>
  )
}
