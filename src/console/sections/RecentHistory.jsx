export default function RecentHistory({ outputs, winners, currentOutputId }) {
  const getModelShortName = (model) => {
    if (model.includes('pro')) return 'Pro'
    if (model.includes('flash')) return 'Flash'
    return 'Img'
  }

  const getRelativeTime = (timestamp) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const winnerIds = new Set(winners?.map((w) => w.outputId) || [])
  const isCurrent = (outputId) => outputId === currentOutputId

  return (
    <div className="op-history section">
      <div className="section-title">Recent History</div>
      <div className="op-history-strip">
        {outputs.map((output) => (
          <div
            key={output.id}
            className={`op-history-thumb ${
              isCurrent(output.id) ? 'op-history-thumb-current' : ''
            } ${winnerIds.has(output.id) ? 'op-history-thumb-winner' : ''}`}
          >
            <img src={output.dataUrl} alt={`Output ${output.id}`} />

            {output.feedback && (
              <div className="op-history-feedback">
                {output.feedback === 'up' && '👍'}
                {output.feedback === 'down' && '👎'}
              </div>
            )}

            {winnerIds.has(output.id) && <div className="op-history-badge">⭐</div>}
          </div>
        ))}
      </div>

      <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
          {outputs.map((output) => (
            <div key={output.id} style={{ borderTop: '1px solid var(--border-light)', paddingTop: '6px' }}>
              <div className="op-history-meta">
                <span>{getModelShortName(output.model)}</span>
                <span>{getRelativeTime(output.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
