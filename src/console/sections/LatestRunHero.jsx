export default function LatestRunHero({ output, iterationContext }) {
  if (!output) {
    return (
      <div className="op-hero" style={{ gridTemplateColumns: '1fr' }}>
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No outputs yet. Generate an image in Studio to see it here.
        </div>
      </div>
    )
  }

  const getModelShortName = (model) => {
    if (!model) return 'Unknown'
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

  // Derive context indicators from real data
  const isOperator = output.operatorDecision?.operatorMode === true
  const lockedCount =
    output.activeLockedElementsSnapshot?.length ??
    output.operatorDecision?.contextSnapshot?.lockedCount ??
    0
  const refsCount = output.sentRefs?.length ?? 0
  const hasCarryForward = iterationContext != null || output.iterationPreamble != null

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
            <span>{output.displayId || 'Latest Output'}</span>
          </div>
          <div className="op-hero-subtitle">{getRelativeTime(output.createdAt)}</div>
        </div>

        {/* Source badge — Operator vs UI */}
        <div className="op-hero-meta-row">
          <div className="op-hero-meta-label">Source</div>
          {isOperator ? (
            <span className="op-badge op-badge-operator">Operator</span>
          ) : (
            <span className="op-badge op-badge-ui">UI</span>
          )}
        </div>

        {/* Intent/Reason — only for operator-generated outputs */}
        {isOperator && output.operatorDecision.intent && (
          <div className="op-hero-meta-row">
            <div className="op-hero-meta-label">Intent</div>
            <div className="op-hero-meta-value">{output.operatorDecision.intent}</div>
          </div>
        )}

        {isOperator && output.operatorDecision.reason && (
          <div className="op-hero-meta-row">
            <div className="op-hero-meta-label">Reason</div>
            <div className="op-hero-meta-value">{output.operatorDecision.reason}</div>
          </div>
        )}

        <div className="op-hero-meta-row">
          <div className="op-hero-meta-label">Model</div>
          <span className="op-badge op-badge-model">{getModelShortName(output.model)}</span>
        </div>

        <div className="op-hero-meta-row">
          <div className="op-hero-meta-label">Prompt</div>
          <div className="op-hero-prompt">{output.finalPromptSent}</div>
        </div>

        {output.metadata?.durationMs && (
          <div className="op-hero-meta-row">
            <div className="op-hero-meta-label">Duration</div>
            <div className="op-hero-meta-value">
              {(output.metadata.durationMs / 1000).toFixed(1)}s
            </div>
          </div>
        )}

        {(lockedCount > 0 || refsCount > 0 || hasCarryForward) && (
          <div className="op-hero-meta-row">
            <div className="op-hero-meta-label">Context</div>
            <div className="op-hero-indicators">
              {hasCarryForward && <div className="op-indicator-chip">🔄 Carry</div>}
              {lockedCount > 0 && (
                <div className="op-indicator-chip">
                  🔒 <strong>{lockedCount}</strong> locked
                </div>
              )}
              {refsCount > 0 && (
                <div className="op-indicator-chip">
                  📎 <strong>{refsCount}</strong> ref{refsCount > 1 ? 's' : ''}
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
