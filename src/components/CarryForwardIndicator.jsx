import { useState } from 'react'
import { summarizeIterationContext, formatIterationContextForGeneration } from '../planning/iterationContext'

/**
 * CarryForwardIndicator — compact chip showing what will be carried forward
 * from winners into the next plan/generation cycle.
 * Only renders when there is actionable iteration context.
 */
export default function CarryForwardIndicator({ iterationContext }) {
  const [expanded, setExpanded] = useState(false)
  const summary = summarizeIterationContext(iterationContext)
  if (!summary) return null

  const preserveCount = iterationContext.preserve.length
  const changeCount = iterationContext.change.length
  const genResult = formatIterationContextForGeneration(iterationContext)

  return (
    <div className="carry-forward">
      <div className="cf-main" onClick={() => genResult && setExpanded((v) => !v)}>
        <span className="cf-label">Carrying forward</span>
        <span className="cf-summary">{summary}</span>
        <span className="cf-counts">
          {preserveCount > 0 && (
            <span className="cf-preserve-count">{preserveCount} keep</span>
          )}
          {changeCount > 0 && (
            <span className="cf-change-count">{changeCount} fix</span>
          )}
        </span>
        {genResult && (
          <span className="cf-gen-badge">gen</span>
        )}
      </div>
      {expanded && genResult && (
        <div className="cf-detail">
          <span className="cf-detail-label">Generation preamble:</span>
          <span className="cf-detail-text">{genResult.preamble}</span>
        </div>
      )}
    </div>
  )
}
