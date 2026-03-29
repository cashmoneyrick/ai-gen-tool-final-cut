export default function LatestRunHero({ output }) {
  if (!output) {
    return <div className="section" style={{ padding: '40px 16px' }}>No output available</div>
  }

  const getModelShortName = (model) => {
    if (model.includes('pro')) return 'Imagen Pro'
    if (model.includes('flash')) return 'Flash'
    return 'Imagen'
  }

  const getRelativeTime = (timestamp) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  const contextSnapshot = output.operatorDecision?.contextSnapshot || {
    lockedCount: 0,
    refsCount: 0,
    carryForwardSummary: null,
  }

  return (
    <div className="op-hero">
      <div className="op-hero-image">
        <img src={output.dataUrl} alt="Latest output" />
      </div>

      <div className="op-hero-metadata">
        <div className="op-hero-header">
          <div className="op-hero-title">
            {output.feedback === 'up' && '👍'}
            {output.feedback === 'down' && '👎'}
            {!output.feedback && '○'}
            <span>Latest Output</span>
          </div>
          <div className="op-hero-subtitle">{getRelativeTime(output.createdAt)}</div>
        </div>

        {output.operatorDecision?.operatorMode && (
          <>
            <div className="op-hero-meta-row">
              <div className="op-hero-meta-label">Source</div>
              <span className="op-badge op-badge-operator">Operator</span>
            </div>

            {output.operatorDecision.intent && (
              <div className="op-hero-meta-row">
                <div className="op-hero-meta-label">Intent</div>
                <div className="op-hero-meta-value">{output.operatorDecision.intent}</div>
              </div>
            )}

            {output.operatorDecision.reason && (
              <div className="op-hero-meta-row">
                <div className="op-hero-meta-label">Reason</div>
                <div className="op-hero-meta-value">{output.operatorDecision.reason}</div>
              </div>
            )}
          </>
        )}

        <div className="op-hero-meta-row">
          <div className="op-hero-meta-label">Model</div>
          <span className="op-badge op-badge-model">{getModelShortName(output.model)}</span>
        </div>

        <div className="op-hero-meta-row">
          <div className="op-hero-meta-label">Prompt</div>
          <div className="op-hero-prompt">{output.finalPromptSent}</div>
        </div>

        <div className="op-hero-meta-row">
          <div className="op-hero-meta-label">Duration</div>
          <div className="op-hero-meta-value">{output.metadata?.durationMs}ms</div>
        </div>

        {(contextSnapshot.lockedCount > 0 ||
          contextSnapshot.refsCount > 0 ||
          contextSnapshot.carryForwardSummary) && (
          <div className="op-hero-meta-row">
            <div className="op-hero-meta-label">Context</div>
            <div className="op-hero-indicators">
              {contextSnapshot.carryForwardSummary && (
                <div className="op-indicator-chip">🔄 Carry</div>
              )}
              {contextSnapshot.lockedCount > 0 && (
                <div className="op-indicator-chip">
                  🔒 <strong>{contextSnapshot.lockedCount}</strong> locked
                </div>
              )}
              {contextSnapshot.refsCount > 0 && (
                <div className="op-indicator-chip">
                  📎 <strong>{contextSnapshot.refsCount}</strong> refs
                </div>
              )}
            </div>
          </div>
        )}

        {output.iterationPreamble && (
          <div className="op-hero-preamble">{output.iterationPreamble}</div>
        )}
      </div>
    </div>
  )
}
