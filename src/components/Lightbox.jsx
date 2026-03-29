import { useState, useEffect, useRef, useCallback } from 'react'

function OutputFeedbackButtons({ feedback, onChange }) {
  return (
    <div className="feedback-toggle-group lightbox-feedback-group">
      <button
        className={`feedback-toggle-btn ${feedback === 'up' ? 'feedback-toggle-btn-active feedback-toggle-btn-up' : ''}`}
        onClick={() => onChange(feedback === 'up' ? null : 'up')}
        title={feedback === 'up' ? 'Clear thumbs up' : 'Thumbs up'}
        aria-label="Thumbs up"
      >
        👍
      </button>
      <button
        className={`feedback-toggle-btn ${feedback == null ? 'feedback-toggle-btn-active feedback-toggle-btn-neutral' : ''}`}
        onClick={() => onChange(null)}
        title="Neutral"
        aria-label="Neutral"
      >
        ○
      </button>
      <button
        className={`feedback-toggle-btn ${feedback === 'down' ? 'feedback-toggle-btn-active feedback-toggle-btn-down' : ''}`}
        onClick={() => onChange(feedback === 'down' ? null : 'down')}
        title={feedback === 'down' ? 'Clear thumbs down' : 'Thumbs down'}
        aria-label="Thumbs down"
      >
        👎
      </button>
    </div>
  )
}

export default function Lightbox({
  images,        // full outputs array
  activeIndex,   // which image to show
  onClose,
  onNavigate,    // (newIndex) => void
  winners,
  onSaveWinner,
  onUpdateOutputFeedback,
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [entering, setEntering] = useState(true)
  const [showInfo, setShowInfo] = useState(false)
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const canPrev = activeIndex > 0
  const canNext = activeIndex < images.length - 1

  // Enter animation
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntering(false))
    return () => cancelAnimationFrame(t)
  }, [])

  const navigateTo = useCallback((nextIndex) => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    onNavigate(nextIndex)
  }, [onNavigate])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && canPrev) navigateTo(activeIndex - 1)
      else if (e.key === 'ArrowRight' && canNext) navigateTo(activeIndex + 1)
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.5, 5))
      else if (e.key === '-') setZoom((z) => Math.max(z - 0.5, 0.5))
      else if (e.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }) }
      else if (e.key === 'i') setShowInfo((v) => !v)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeIndex, canPrev, canNext, navigateTo, onClose])

  // Scroll to zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setZoom((z) => {
      const next = Math.min(Math.max(z + delta, 0.5), 5)
      if (next <= 1) setPan({ x: 0, y: 0 })
      return next
    })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (el) el.addEventListener('wheel', handleWheel, { passive: false })
    return () => { if (el) el.removeEventListener('wheel', handleWheel) }
  }, [handleWheel])

  // Drag to pan (only when zoomed)
  const handleMouseDown = (e) => {
    if (zoom <= 1) return
    if (e.button !== 0) return
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setPanStart({ ...pan })
  }

  const handleMouseMove = (e) => {
    if (!dragging) return
    setPan({
      x: panStart.x + (e.clientX - dragStart.x),
      y: panStart.y + (e.clientY - dragStart.y),
    })
  }

  const handleMouseUp = () => {
    setDragging(false)
  }

  // Double-click to toggle zoom
  const handleDoubleClick = (e) => {
    e.stopPropagation()
    if (zoom > 1) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    } else {
      setZoom(2.5)
    }
  }

  // Click backdrop to close (not on image area)
  const handleBackdropClick = (e) => {
    if (e.target === containerRef.current) {
      onClose()
    }
  }

  const current = images[activeIndex]
  if (!current) return null

  const savedOutputIds = new Set(winners.map((w) => w.outputId))
  const isSaved = savedOutputIds.has(current.id)
  const zoomPercent = Math.round(zoom * 100)

  return (
    <div
      className={`lightbox-overlay ${entering ? 'lightbox-entering' : 'lightbox-active'}`}
      ref={containerRef}
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="lightbox-display-id">
        {current.displayId || 'Output —'}
      </div>

      {/* Top bar */}
      <div className="lightbox-topbar">
        <div className="lightbox-counter">
          {activeIndex + 1} / {images.length}
        </div>
        <div className="lightbox-controls">
          <OutputFeedbackButtons
            feedback={current.feedback ?? null}
            onChange={(nextFeedback) => onUpdateOutputFeedback(current.id, nextFeedback)}
          />
          <button
            className="lightbox-btn"
            onClick={() => setShowInfo((v) => !v)}
            title="Toggle info (I)"
          >
            {showInfo ? 'Hide Info' : 'Info'}
          </button>
          {!isSaved ? (
            <button
              className="lightbox-btn lightbox-btn-save"
              onClick={() => onSaveWinner(current.id)}
            >
              Save to Winners
            </button>
          ) : (
            <span className="lightbox-saved-badge">Saved</span>
          )}
          <button
            className="lightbox-btn lightbox-btn-close"
            onClick={onClose}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>
      </div>

      {/* Nav arrows */}
      {canPrev && (
        <button
          className="lightbox-nav lightbox-nav-prev"
          onClick={(e) => { e.stopPropagation(); navigateTo(activeIndex - 1) }}
          title="Previous (←)"
        >
          ‹
        </button>
      )}
      {canNext && (
        <button
          className="lightbox-nav lightbox-nav-next"
          onClick={(e) => { e.stopPropagation(); navigateTo(activeIndex + 1) }}
          title="Next (→)"
        >
          ›
        </button>
      )}

      {/* Image */}
      <div
        className="lightbox-image-wrap"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        <img
          ref={imgRef}
          className="lightbox-image"
          src={current.dataUrl}
          alt="Generated output"
          draggable={false}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        />
      </div>

      {/* Bottom zoom bar */}
      <div className="lightbox-bottombar">
        <div className="lightbox-zoom-controls">
          <button
            className="lightbox-zoom-btn"
            onClick={() => setZoom((z) => Math.max(z - 0.5, 0.5))}
            disabled={zoom <= 0.5}
          >
            −
          </button>
          <span className="lightbox-zoom-level">{zoomPercent}%</span>
          <button
            className="lightbox-zoom-btn"
            onClick={() => setZoom((z) => Math.min(z + 0.5, 5))}
            disabled={zoom >= 5}
          >
            +
          </button>
          {zoom !== 1 && (
            <button
              className="lightbox-zoom-btn lightbox-zoom-reset"
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
            >
              Reset
            </button>
          )}
        </div>
        <div className="lightbox-hint">
          Scroll to zoom · Double-click to toggle · Drag to pan
        </div>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div className="lightbox-info" onClick={(e) => e.stopPropagation()}>
          {/* Generation metadata */}
          {current.metadata && (
            <div className="lightbox-meta-grid">
              <div className="lightbox-meta-item">
                <span className="lightbox-meta-key">Model</span>
                <span className="lightbox-meta-val">{current.metadata.model}</span>
              </div>
              <div className="lightbox-meta-item">
                <span className="lightbox-meta-key">Duration</span>
                <span className="lightbox-meta-val">{(current.metadata.durationMs / 1000).toFixed(1)}s</span>
              </div>
              {current.metadata.tokenUsage && current.metadata.tokenUsage.total != null && (
                <>
                  <div className="lightbox-meta-item">
                    <span className="lightbox-meta-key">Tokens In</span>
                    <span className="lightbox-meta-val">{current.metadata.tokenUsage.prompt?.toLocaleString() ?? '—'}</span>
                  </div>
                  <div className="lightbox-meta-item">
                    <span className="lightbox-meta-key">Tokens Out</span>
                    <span className="lightbox-meta-val">{current.metadata.tokenUsage.output?.toLocaleString() ?? '—'}</span>
                  </div>
                  <div className="lightbox-meta-item">
                    <span className="lightbox-meta-key">Total Tokens</span>
                    <span className="lightbox-meta-val">{current.metadata.tokenUsage.total?.toLocaleString() ?? '—'}</span>
                  </div>
                </>
              )}
              {current.metadata.finishReason && (
                <div className="lightbox-meta-item">
                  <span className="lightbox-meta-key">Finish</span>
                  <span className="lightbox-meta-val">{current.metadata.finishReason}</span>
                </div>
              )}
            </div>
          )}

          <div className="lightbox-info-label" style={{ marginTop: current.metadata ? 12 : 0 }}>Prompt</div>
          <div className="lightbox-info-value">{current.prompt}</div>
          {current.sentRefs && current.sentRefs.length > 0 && (
            <>
              <div className="lightbox-info-label" style={{ marginTop: 10 }}>
                References Sent ({current.sentRefs.length})
              </div>
              <div className="lightbox-info-refs">
                {current.sentRefs.map((ref) => (
                  <span className="lightbox-info-ref" key={ref.id}>
                    {ref.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
