import { getEffectiveFeedback, getFeedbackDisplay } from '../reviewFeedback'

function WinnerFeedbackBadge({ winner, output }) {
  const feedback = getEffectiveFeedback(output, winner)
  const { label, icon, tone } = getFeedbackDisplay(feedback)

  return (
    <div
      className={`winner-feedback-badge winner-feedback-badge-${tone}`}
      title={label}
      aria-label={label}
    >
      <span className="winner-feedback-icon">{icon}</span>
      <span>{label}</span>
    </div>
  )
}

export default function Winners({ winners, outputsById, onUpdateWinner, onRemoveWinner, onPromoteToMemory }) {
  if (winners.length === 0) {
    return (
      <section className="section" style={{ padding: '12px 16px' }}>
        <div className="section-title">Winners</div>
        <div className="empty-state-compact">
          Save your best outputs here with notes and linked review status
        </div>
      </section>
    )
  }

  return (
    <section className="section">
      <div className="section-title">
        Winners
        <span className="outputs-count"> ({winners.length})</span>
      </div>

      <div className="winners-list">
        {winners.map((w) => (
          <div className="winner-card" key={w.id}>
            <img
              className="winner-card-img"
              src={w.dataUrl}
              alt="Winner"
            />
            <div className="winner-card-body">
              <div className="winner-card-prompt" title={w.prompt}>
                {w.prompt}
              </div>
              <div className="winner-card-display-id">
                {w.displayId || 'Output —'}
              </div>
              <WinnerFeedbackBadge winner={w} output={outputsById?.get(w.outputId)} />
              <textarea
                className="winner-card-notes"
                rows={2}
                placeholder="Add notes..."
                value={w.notes}
                onChange={(e) => onUpdateWinner(w.id, { notes: e.target.value })}
              />
              <div className="winner-card-actions">
                {onPromoteToMemory && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onPromoteToMemory(w.id)}
                  >
                    Save as Memory
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm winner-remove"
                  onClick={() => onRemoveWinner(w.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
