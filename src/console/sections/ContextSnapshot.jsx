import { summarizeIterationContext } from '../../planning/iterationContext'

export default function ContextSnapshot({ project, session, lockedElements, refs, iterationContext }) {
  const enabledLocked = lockedElements?.filter((el) => el.enabled) || []
  const activeRefs = refs?.filter((r) => r.send) || []
  const carryForwardSummary = summarizeIterationContext(iterationContext)

  return (
    <div className="op-context">
      {/* Project & Goal */}
      <div className="op-context-card">
        <div className="op-context-label">Project</div>
        <div className="op-context-value">{project?.name || 'No project'}</div>

        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '8px' }}>
          <div className="op-context-label">Goal</div>
          <div className="op-context-value op-context-value-goal">
            {session?.goal || 'No goal set'}
          </div>
        </div>
      </div>

      {/* Locked Elements & Refs */}
      <div className="op-context-card">
        <div className="op-context-label">Active Constraints</div>
        {enabledLocked.length > 0 ? (
          <div className="op-context-chips">
            {enabledLocked.map((el) => (
              <div key={el.id} className="op-context-chip">
                🔒 {el.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="op-context-value" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No locked elements
          </div>
        )}

        <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '8px' }}>
          <div className="op-context-label">Refs</div>
          <div className="op-context-value">
            {activeRefs.length > 0
              ? `${activeRefs.length} reference image${activeRefs.length > 1 ? 's' : ''} selected`
              : 'None'}
          </div>
        </div>
      </div>

      {/* Carry-forward context */}
      {carryForwardSummary && (
        <div className="op-context-card" style={{ gridColumn: '1 / -1' }}>
          <div className="op-context-label">Iteration Guidance</div>
          <div className="op-context-preamble">{carryForwardSummary}</div>
        </div>
      )}
    </div>
  )
}
