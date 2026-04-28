import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { estimateCost, formatCost } from './costUtils'
import {
  PROMPT_SECTION_ORDER,
  PROMPT_SECTION_LABELS,
  normalizePromptSections,
} from '../prompt/structuredPrompt'

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

// Section color palette — each section gets a distinct hue
const SECTION_META = {
  subject:     { color: '#0a84ff', label: 'Subject' },
  style:       { color: '#bf5af2', label: 'Style' },
  lighting:    { color: '#ff9f0a', label: 'Lighting' },
  composition: { color: '#30d158', label: 'Composition' },
  technical:   { color: '#ff6b6b', label: 'Technical' },
}

/**
 * Extract structured sections from an output object.
 * Prefers the raw sections object; falls back to parsing the flat rendered string.
 */
function getPromptSections(output) {
  // Best case: structured sections object is stored directly
  const raw = output?.promptPreviewSections || output?.promptSectionsSnapshot
  if (raw && typeof raw === 'object') {
    const sections = normalizePromptSections(raw)
    if (PROMPT_SECTION_ORDER.some((k) => sections[k]?.trim())) return sections
  }

  // Fallback: parse from the rendered flat string (Subject: ...\n\nStyle: ...)
  const flat =
    output?.promptPreviewText ||
    output?.finalPromptSent ||
    output?.prompt ||
    output?.assembledPromptSnapshot ||
    ''
  if (!flat) return null

  const parsed = {}
  // Match "Label: content" blocks separated by double newlines
  const headerRe = /(?:^|\n\n)(Subject|Style|Lighting|Composition|Technical Refinements?)\s*:\s*([\s\S]*?)(?=\n\n(?:Subject|Style|Lighting|Composition|Technical Refinements?)|\s*$)/gi
  let m
  while ((m = headerRe.exec('\n\n' + flat)) !== null) {
    const labelRaw = m[1].toLowerCase().trim()
    const key = labelRaw.startsWith('technical') ? 'technical'
      : labelRaw.replace(' refinements', '').replace(' ', '')
    parsed[key] = m[2].trim()
  }
  if (Object.keys(parsed).length > 0) return normalizePromptSections(parsed)

  return null
}

/** Render structured prompt as labeled section cards */
function PromptSections({ output }) {
  const sections = getPromptSections(output)

  if (!sections) {
    // Plain fallback for unstructured prompts
    const flat =
      output?.promptPreviewText ||
      output?.finalPromptSent ||
      output?.prompt ||
      output?.assembledPromptSnapshot || ''
    return <p className="v3-meta-prompt-flat">{flat || '—'}</p>
  }

  return (
    <div className="v3-meta-prompt-sections">
      {PROMPT_SECTION_ORDER.map((key) => {
        const text = sections[key]?.trim()
        if (!text) return null
        const { color, label } = SECTION_META[key] || { color: '#636366', label: key }
        return (
          <div key={key} className="v3-meta-prompt-block" style={{ '--sec': color }}>
            <span className="v3-meta-prompt-label">{label}</span>
            <p className="v3-meta-prompt-body">{text}</p>
          </div>
        )
      })}
    </div>
  )
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

  const classes = ['v3-meta-badge-model', 'v3-meta-badge-duration', 'v3-meta-badge-cost']
  return (
    <span className="v3-meta-badge">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="v3-meta-badge-dot">·</span>}
          <span className={classes[i] || ''}>{p}</span>
        </span>
      ))}
    </span>
  )
}

/**
 * MetadataPopover — floating detail panel anchored to toolbar button.
 */
export function MetadataPopover({ output, open, onClose, anchorRef }) {
  const popRef = useRef(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!open) setShowPrompt(false)
  }, [open, output?.id])

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) return

    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return

      const popWidth = Math.min(popRef.current?.offsetWidth || 360, window.innerWidth - 24)
      const popHeight = Math.min(popRef.current?.offsetHeight || 480, window.innerHeight - 24)
      const gap = 8
      const vp = 12

      let left = rect.left
      if (left + popWidth > window.innerWidth - vp) left = rect.right - popWidth
      left = Math.max(vp, Math.min(left, window.innerWidth - popWidth - vp))

      const belowTop = rect.bottom + gap
      const aboveTop = rect.top - popHeight - gap
      const fitsBelow = belowTop + popHeight <= window.innerHeight - vp
      const fitsAbove = aboveTop >= vp

      let top
      if (fitsBelow) top = belowTop
      else if (fitsAbove) top = aboveTop
      else top = Math.max(vp, Math.min(belowTop, window.innerHeight - popHeight - vp))

      setPos({ top, left, ready: true })
    }

    const frame = window.requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, anchorRef, showPrompt])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (
        popRef.current && !popRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, anchorRef])

  if (!open || !output) return null

  const meta = output.metadata || {}
  const op = output.operatorDecision || {}
  const tokens = meta.tokenUsage || {}
  const isOperator = op.operatorMode === true
  const cost = estimateCost(output)

  // Check if a structured prompt is available
  const hasPrompt = !!(
    output.promptPreviewSections ||
    output.promptSectionsSnapshot ||
    output.promptPreviewText ||
    output.finalPromptSent ||
    output.prompt ||
    output.assembledPromptSnapshot
  )

  const style = pos?.ready
    ? { top: pos.top, left: pos.left }
    : { top: -9999, left: -9999, visibility: 'hidden' }

  return createPortal(
    <div className="v3-meta-pop" ref={popRef} style={style}>

      {/* ── Header ── */}
      <div className="v3-meta-pop-head">
        <span className="v3-meta-pop-title">Generation Details</span>
        <button className="v3-meta-pop-x" onClick={onClose} aria-label="Close">&times;</button>
      </div>

      {/* ── Key stats ── */}
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

      {/* ── Secondary detail rows ── */}
      <div className="v3-meta-pop-details">
        <div className="v3-meta-pop-row">
          <span className="v3-meta-pop-k">Tokens in / out</span>
          <span className="v3-meta-pop-v">
            {tokens.prompt?.toLocaleString() || '--'} / {tokens.output?.toLocaleString() || '--'}
          </span>
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
          <span className="v3-meta-pop-v">{isOperator ? 'Operator' : 'Browser'}</span>
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
        {meta.imageSize && (
          <div className="v3-meta-pop-row">
            <span className="v3-meta-pop-k">Image size</span>
            <span className="v3-meta-pop-v">{meta.imageSize}</span>
          </div>
        )}
        {meta.aspectRatio && (
          <div className="v3-meta-pop-row">
            <span className="v3-meta-pop-k">Aspect ratio</span>
            <span className="v3-meta-pop-v">{meta.aspectRatio}</span>
          </div>
        )}
      </div>

      {/* ── Generation Prompt — structured section cards ── */}
      {hasPrompt && (
        <div className="v3-meta-pop-section">
          <button
            className="v3-meta-pop-toggle"
            onClick={() => setShowPrompt((v) => !v)}
          >
            <span>Generation prompt</span>
            <span className={`v3-meta-pop-toggle-icon${showPrompt ? ' v3-meta-pop-toggle-icon--open' : ''}`}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
          {showPrompt && (
            <div className="v3-meta-prompt-wrap">
              <PromptSections output={output} />
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  )
}

// Keep default export for backward compat
export default function MetadataPanel() {
  return null
}
