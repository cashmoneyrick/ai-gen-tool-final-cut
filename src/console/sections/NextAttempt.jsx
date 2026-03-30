export default function NextAttempt({ session, lockedCount }) {
  const getModelShortName = (model) => {
    if (!model) return 'Not set'
    if (model.includes('pro')) return 'Imagen Pro'
    if (model.includes('flash')) return 'Flash'
    return 'Imagen'
  }

  const hasPrompt = session?.assembledPrompt && session.assembledPrompt.trim()

  return (
    <div className="op-next-attempt">
      <div className="op-next-attempt-title">Next Attempt</div>

      <div className="op-next-model">
        <div className="op-next-model-label">Model</div>
        <span className="op-badge op-badge-model">{getModelShortName(session?.model)}</span>
      </div>

      <div>
        <div className="op-next-model-label">Prompt</div>
        {hasPrompt ? (
          <div className="op-next-prompt">{session.assembledPrompt}</div>
        ) : (
          <div className="op-next-prompt" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No prompt assembled yet. Set buckets or type a prompt in Studio.
          </div>
        )}
      </div>

      <div className="op-next-controls">
        <button className="btn btn-primary" disabled>Generate</button>
      </div>

      {lockedCount > 0 && (
        <div className="op-next-lock-summary">
          🔒 {lockedCount} element{lockedCount > 1 ? 's' : ''} locked for next run
        </div>
      )}
    </div>
  )
}
