export default function LastRunReceipt({ output }) {
  if (!output) return null

  const isOperator = output.operatorDecision?.operatorMode === true
  const decision = output.operatorDecision

  const getModelShortName = (model) => {
    if (!model) return '?'
    if (model.includes('pro')) return 'Imagen Pro'
    if (model.includes('flash')) return 'Flash'
    return model
  }

  const getRelativeTime = (timestamp) => {
    const diff = Date.now() - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (seconds < 60) return `${seconds}s ago`
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return new Date(timestamp).toLocaleString()
  }

  const duration = output.metadata?.durationMs
    ? `${(output.metadata.durationMs / 1000).toFixed(1)}s`
    : null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '8px 14px',
      background: isOperator ? 'rgba(90, 170, 106, 0.08)' : 'rgba(143, 155, 174, 0.08)',
      border: `1px solid ${isOperator ? 'rgba(90, 170, 106, 0.2)' : 'var(--border-light)'}`,
      borderRadius: 'var(--radius)',
      fontSize: '12px',
      flexWrap: 'wrap',
    }}>
      {/* Source + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className={`op-badge ${isOperator ? 'op-badge-operator' : 'op-badge-ui'}`}
          style={{ fontSize: '10px', padding: '2px 7px' }}>
          {isOperator ? 'Operator' : 'UI'}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          {getRelativeTime(output.createdAt)}
        </span>
      </div>

      {/* Model + duration */}
      <div style={{ color: 'var(--text-secondary)' }}>
        {getModelShortName(output.model)}
        {duration && <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>({duration})</span>}
      </div>

      {/* Output ID */}
      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
        {output.displayId || output.id.slice(0, 8)}
      </div>

      {/* Intent (if operator) */}
      {isOperator && decision?.intent && (
        <div style={{
          color: 'var(--text-secondary)',
          flex: '1 1 100%',
          marginTop: '2px',
          paddingTop: '4px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Intent: </span>
          {decision.intent}
          {decision.reason && (
            <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
              — {decision.reason}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
