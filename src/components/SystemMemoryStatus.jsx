/**
 * SystemMemoryStatus — compact one-line status bar for system memory.
 * Shows active counts and provides access to the full inspector drawer.
 */
export default function SystemMemoryStatus({ status, onInspect }) {
  const parts = []

  if (status.memoriesCount.total > 0) {
    let s = `${status.memoriesCount.active} memor${status.memoriesCount.active === 1 ? 'y' : 'ies'}`
    if (status.memoriesCount.pinned > 0) s += ` (${status.memoriesCount.pinned} pinned)`
    parts.push(s)
  }

  if (status.docsCount.total > 0) {
    parts.push(`${status.docsCount.active} doc${status.docsCount.active === 1 ? '' : 's'}`)
  }

  const sharedTotal = status.sharedCount.memories + status.sharedCount.docs
  if (sharedTotal > 0) {
    parts.push(`${sharedTotal} shared`)
  }

  if (status.lessonsCount > 0) {
    parts.push(`${status.lessonsCount} lesson${status.lessonsCount === 1 ? '' : 's'}`)
  }

  if (status.overridesCount.total > 0) {
    parts.push(`${status.overridesCount.active}/${status.overridesCount.total} overrides`)
  }

  const summary = parts.length > 0 ? parts.join(' \u00b7 ') : 'No active knowledge'

  return (
    <div className="system-memory-status">
      <span className="sms-label">System Memory</span>
      <span className="sms-summary">{summary}</span>
      <button className="sms-inspect-btn" onClick={onInspect}>
        Inspect
      </button>
    </div>
  )
}
