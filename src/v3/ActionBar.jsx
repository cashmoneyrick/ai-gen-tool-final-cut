import { useState, useCallback, useRef, useEffect } from 'react'

const ASPECT_RATIOS_FLASH = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1']
const ASPECT_RATIOS_PRO = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']

// Calculate visual rectangle dimensions for an aspect ratio string
function ratioToShape(ratio, maxSize = 28) {
  const [w, h] = ratio.split(':').map(Number)
  const scale = maxSize / Math.max(w, h)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

export default function ActionBar({
  dirty,
  imageCount,
  onImageCountChange,
  onRunNextAttempt,
  // Generation controls
  model,
  availableModels,
  imageSize,
  aspectRatio,
  thinkingLevel,
  googleSearch,
  imageSearch,
  onModelChange,
  onImageSizeChange,
  onAspectRatioChange,
  onThinkingLevelChange,
  onGoogleSearchChange,
  onImageSearchChange,
}) {
  const [handoffState, setHandoffState] = useState('idle') // idle | saving | saved | failed
  const [ratioPickerOpen, setRatioPickerOpen] = useState(false)
  const [ratioPickerPos, setRatioPickerPos] = useState(null)
  const ratioTriggerRef = useRef(null)
  const ratioPickerRef = useRef(null)

  const openRatioPicker = useCallback(() => {
    if (ratioTriggerRef.current) {
      const rect = ratioTriggerRef.current.getBoundingClientRect()
      setRatioPickerPos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 })
    }
    setRatioPickerOpen(true)
  }, [])

  // Close ratio picker on outside click
  useEffect(() => {
    if (!ratioPickerOpen) return
    const handler = (e) => {
      if (ratioPickerRef.current && !ratioPickerRef.current.contains(e.target) &&
          ratioTriggerRef.current && !ratioTriggerRef.current.contains(e.target)) {
        setRatioPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ratioPickerOpen])

  const handleRun = useCallback(async () => {
    setHandoffState('saving')
    try {
      await onRunNextAttempt()
      setHandoffState('saved')
      setTimeout(() => setHandoffState('idle'), 2500)
    } catch {
      setHandoffState('failed')
      setTimeout(() => setHandoffState('idle'), 3000)
    }
  }, [onRunNextAttempt])

  const buttonLabel = handoffState === 'saving'
    ? 'Saving...'
    : handoffState === 'saved'
    ? 'Handoff Saved!'
    : handoffState === 'failed'
    ? 'Failed - Retry'
    : 'Run Next Attempt'

  const isDisabled = (!dirty && handoffState === 'idle') || handoffState === 'saving'
  const showRunButton = typeof onRunNextAttempt === 'function'

  const isFlash = model?.includes('flash')
  const sizeOptions = isFlash ? ['512', '1K', '2K', '4K'] : ['1K', '2K', '4K']
  const ratioOptions = isFlash ? ASPECT_RATIOS_FLASH : ASPECT_RATIOS_PRO

  return (
    <div className="v3-control-panel">
      {/* All controls + run button in a single flat row */}
      <div className="v3-control-row">
        {/* Model */}
        <div className="v3-control-group">
          <span className="v3-control-label">Model</span>
          <select
            className="v3-control-select"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {(availableModels || []).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Image Size */}
        <div className="v3-control-group">
          <span className="v3-control-label">Size</span>
          <div className="v3-segment">
            {sizeOptions.map((s) => (
              <button
                key={s}
                className={`v3-segment-btn ${imageSize === s ? 'v3-segment-btn--active' : ''}`}
                onClick={() => onImageSizeChange(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio — visual picker */}
        <div className="v3-control-group">
          <span className="v3-control-label">Ratio</span>
          <button
            ref={ratioTriggerRef}
            className="v3-ratio-trigger"
            onClick={() => ratioPickerOpen ? setRatioPickerOpen(false) : openRatioPicker()}
          >
            <span
              className="v3-ratio-shape-preview"
              style={ratioToShape(aspectRatio, 14)}
            />
            <span className="v3-ratio-trigger-text">{aspectRatio}</span>
            <span className="v3-ratio-trigger-caret">▾</span>
          </button>
          {ratioPickerOpen && (
            <div
              ref={ratioPickerRef}
              className="v3-ratio-picker"
              style={{ left: ratioPickerPos?.left, bottom: ratioPickerPos?.bottom }}
            >
              <div className="v3-ratio-grid">
                {ratioOptions.map((r) => {
                  const shape = ratioToShape(r, 28)
                  const isActive = aspectRatio === r
                  return (
                    <button
                      key={r}
                      className={`v3-ratio-option ${isActive ? 'v3-ratio-option--active' : ''}`}
                      onClick={() => { onAspectRatioChange(r); setRatioPickerOpen(false) }}
                      title={r}
                    >
                      <span
                        className="v3-ratio-shape"
                        style={{ width: shape.width, height: shape.height }}
                      />
                      <span className="v3-ratio-label">{r}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Thinking Level — Flash only */}
        {isFlash && (
          <div className="v3-control-group">
            <span className="v3-control-label">Think</span>
            <div className="v3-segment">
              <button
                className={`v3-segment-btn ${thinkingLevel === 'minimal' ? 'v3-segment-btn--active' : ''}`}
                onClick={() => onThinkingLevelChange('minimal')}
              >
                Min
              </button>
              <button
                className={`v3-segment-btn ${thinkingLevel === 'High' ? 'v3-segment-btn--active' : ''}`}
                onClick={() => onThinkingLevelChange('High')}
              >
                High
              </button>
            </div>
          </div>
        )}

        {/* Search toggles */}
        <div className="v3-control-group">
          <span className="v3-control-label">Search</span>
          <div className="v3-toggle">
            <label className="v3-toggle-item">
              <input
                type="checkbox"
                checked={googleSearch}
                onChange={(e) => {
                  onGoogleSearchChange(e.target.checked)
                  if (!e.target.checked) onImageSearchChange(false)
                }}
              />
              <span>Web</span>
            </label>
            <label className={`v3-toggle-item ${!isFlash || !googleSearch ? 'v3-toggle-item--disabled' : ''}`}>
              <input
                type="checkbox"
                checked={imageSearch}
                disabled={!isFlash || !googleSearch}
                onChange={(e) => onImageSearchChange(e.target.checked)}
              />
              <span>Img</span>
            </label>
          </div>
        </div>

        {showRunButton && <div className="v3-control-divider" />}

        {/* Image count */}
        <div className="v3-control-group">
          <span className="v3-control-label">Images</span>
          <select
            className="v3-control-select"
            value={imageCount}
            onChange={(e) => onImageCountChange(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* Run button — only shown when onRunNextAttempt is provided */}
        {showRunButton && (
          <button
            className={`v3-run-btn ${isDisabled ? 'v3-run-btn-disabled' : ''} ${handoffState === 'saved' ? 'v3-run-btn-success' : ''}`}
            onClick={handleRun}
            disabled={isDisabled}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    </div>
  )
}
