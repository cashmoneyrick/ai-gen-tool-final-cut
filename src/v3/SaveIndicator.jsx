export default function SaveIndicator({ state }) {
  if (state === 'idle') return null
  const label = state === 'saving' ? 'Saving...' : state === 'saved' ? 'Saved' : 'Failed'
  const cls = `v3-save-indicator v3-save-${state}`
  return <span className={cls}>{label}</span>
}
