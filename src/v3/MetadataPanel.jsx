import { useState, useEffect, useRef } from 'react'
import { estimateCost, formatCost } from './costUtils'

function formatDuration(ms) {
  if (!ms) return '--'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function getModelShort(model) {
  if (!model) return '--'
  if (model.includes('pro')) return 'Pro'
  if (model.includes('flash')) return 'Flash'
  return model
}

/**
 * MetadataBadge — compact inline badge for the toolbar.
 */
export function MetadataBadge({ output }) {
  if (!output) return null
  const meta = output.metadata || {}
  const cost = estimateCost(output)
  const parts = [
    getModelShort(output.model),
    formatDuration(meta.durationMs),
    cost !== null ? formatCost(cost) : null,
  ].filter(Boolean)
  if (parts.length === 0) return null

  return (
    <span className="v3-meta-badge">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="v3-meta-badge-dot">·</span>}
          <span className={i === parts.length - 1 && cost !== null ? 'v3-meta-badge-cost' : ''}>{p}</span>
        </span>
      ))}
    </span>
  )
}

/**
 * MetadataPopover — redesigned as a clean, sectioned detail panel.
 */
export function MetadataPopover({ output, open, onClose, anchorRef }) {
  const popRef = useRef(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [pos, setPos] = useState(null)

  // Position the popover above the anchor button using fixed positioning
  useEffect(() => {
    if (!open || !anchorRef?.current) { setShowPrompt(false); setPos(null); return }
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right })
  }, [open, anchorRef])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (popRef.current && !popRef.current.contains(e.target) &&
          anchorRef?.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, anchorRef])

  if (!open || !output || !pos) return null

  const meta = output.metadata || {}
  const op = output.operatorDecision || {}
  const tokens = meta.tokenUsage || {}
  const isOperator = op.operatorMode === true
  const cost = estimateCost(output)

  return (
    <div className="v3-meta-pop" ref={popRef} style={{ bottom: pos.bottom, right: pos.right }}>
      {/* Header with close */}
      <div className="v3-meta-pop-head">
        <span className="v3-meta-pop-title">Generation Details</span>
        <button className="v3-meta-pop-x" onClick={onClose}>&times;</button>
      </div>

      {/* Key stats — the stuff you actually care about */}
      <div className="v3-meta-pop-stats">
        <div className="v3-meta-pop-stat">
          <span className="v3-meta-pop-stat-val">{getModelShort(output.model)}</span>
          <span className="v3-meta-pop-stat-label">Model</span>
        </div>
        <div className="v3-meta-pop-stat">
          <span className="v3-meta-pop-stat-val">{formatDuration(meta.durationMs)}</span>
          <span className="v3-meta-pop-stat-label">Duration</span>
        </div>
        <div className="v3-meta-pop-stat">
          <span className="v3-meta-pop-stat-val v3-meta-pop-stat-cost">{formatCost(cost)}</span>
          <span className="v3-meta-pop-stat-label">Cost</span>
        </div>
        <div className="v3-meta-pop-stat">
          <span className="v3-meta-pop-stat-val">{tokens.total?.toLocaleString() || '--'}</span>
          <span className="v3-meta-pop-stat-label">Tokens</span>
        </div>
      </div>

      {/* Secondary details */}
      <div className="v3-meta-pop-details">
        <div className="v3-meta-pop-row">
          <span className="v3-meta-pop-k">Tokens in / out</span>
          <span className="v3-meta-pop-v">{tokens.prompt?.toLocaleString() || '--'} / {tokens.output?.toLocaleString() || '--'}</span>
        </div>
        <div className="v3-meta-pop-row">
          <span className="v3-meta-pop-k">Finish</span>
          <span className="v3-meta-pop-v">{meta.finishReason || '--'}</span>
        </div>
        <div className="v3-meta-pop-row">
          <span className="v3-meta-pop-k">Created</span>
          <span className="v3-meta-pop-v">{formatTime(output.createdAt)}</span>
        </div>
        <div className="v3-meta-pop-row">
          <span className="v3-meta-pop-k">Source</span>
          <span className="v3-meta-pop-v">{isOperator ? 'Operator' : 'UI'}</span>
        </div>
        {isOperator && op.intent && (
          <div className="v3-meta-pop-row">
            <span className="v3-meta-pop-k">Intent</span>
            <span className="v3-meta-pop-v">{op.intent}</span>
          </div>
        )}
        {isOperator && op.reason && (
          <div className="v3-meta-pop-row">
            <span className="v3-meta-pop-k">Reason</span>
            <span className="v3-meta-pop-v">{op.reason}</span>
          </div>
        )}
        {output.sentRefs?.length > 0 && (
          <div className="v3-meta-pop-row">
            <span className="v3-meta-pop-k">Refs sent</span>
            <span className="v3-meta-pop-v">{output.sentRefs.length} image(s)</span>
          </div>
        )}
      </div>

      {/* Prompt — collapsible since it's long */}
      {output.prompt && (
        <div className="v3-meta-pop-section">
          <button className="v3-meta-pop-toggle" onClick={() => setShowPrompt((v) => !v)}>
            <span>Prompt Sent</span>
            <span className="v3-meta-pop-toggle-icon">{showPrompt ? '−' : '+'}</span>
          </button>
          {showPrompt && (
            <div className="v3-meta-pop-code">{output.prompt}</div>
          )}
        </div>
      )}
    </div>
  )
}

// Keep default export for backward compat
export default function MetadataPanel({ output }) {
  return null
}
