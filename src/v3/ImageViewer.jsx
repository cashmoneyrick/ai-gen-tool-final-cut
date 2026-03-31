import { useRef, useState, useCallback, useMemo } from 'react'
import HoverZoom from './HoverZoom'
import { MetadataBadge, MetadataPopover } from './MetadataPanel'

export default function ImageViewer({ output, currentIndex, totalCount, onNavigate, onUpdateFeedback }) {
  const containerRef = useRef(null)
  const [hoverActive, setHoverActive] = useState(false)
  const [mousePos, setMousePos] = useState(null)
  const [containerRect, setContainerRect] = useState(null)
  const [zoomEnabled, setZoomEnabled] = useState(false)

  const handleMouseEnter = useCallback(() => {
    if (containerRef.current) {
      setContainerRect(containerRef.current.getBoundingClientRect())
    }
    setHoverActive(true)
  }, [])

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY })
    if (containerRef.current) {
      setContainerRect(containerRef.current.getBoundingClientRect())
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoverActive(false)
    setMousePos(null)
  }, [])

  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < totalCount - 1

  const displayId = output?.displayId || `Output ${String(currentIndex + 1).padStart(3, '0')}`
  const seqNum = displayId.match(/(\d+)$/)?.[1] ? parseInt(displayId.match(/(\d+)$/)[1], 10) : currentIndex + 1
  const time = output?.createdAt ? new Date(output.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''

  const [copyState, setCopyState] = useState('idle') // 'idle' | 'copied' | 'error'
  const [metaOpen, setMetaOpen] = useState(false)
  const infoWrapRef = useRef(null)

  const handleDownload = useCallback(() => {
    if (!output?.dataUrl) return
    const ext = output.mimeType === 'image/png' ? 'png' : 'jpg'
    const filename = `${displayId.replace(/\s+/g, '-')}-${output.id.slice(0, 8)}.${ext}`
    const link = document.createElement('a')
    link.href = output.dataUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [output, displayId])

  const handleCopy = useCallback(async () => {
    if (!output?.dataUrl) return
    try {
      // ClipboardItem accepts a Promise<Blob> — this preserves the user gesture
      // context through the async image conversion, which is required for
      // clipboard.write() on localhost/HTTP
      const pngBlobPromise = new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          canvas.getContext('2d').drawImage(img, 0, 0)
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png')
        }
        img.onerror = () => reject(new Error('Image load failed'))
        img.src = output.dataUrl
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlobPromise })])
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1800)
    } catch (err) {
      console.error('[copy]', err)
      setCopyState('error')
      setTimeout(() => setCopyState('idle'), 1800)
    }
  }, [output])

  const handleDragStart = useCallback((e) => {
    if (!output?.dataUrl) return
    e.dataTransfer.effectAllowed = 'copy'
    // Let browser use the image as the drag preview naturally
  }, [output])

  if (!output) {
    return (
      <div className="v3-viewer">
        <div className="v3-viewer-empty">
          <div className="v3-viewer-empty-text">No outputs yet</div>
          <div className="v3-viewer-empty-sub">Generate images from Claude Code, then sync to see them here.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="v3-viewer">
      <div className="v3-viewer-stage">
        <div
          className="v3-viewer-image-area"
          ref={containerRef}
          onMouseEnter={handleMouseEnter}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {output.dataUrl && (
            <img
              src={output.dataUrl}
              alt={displayId}
              className="v3-viewer-img"
              draggable={true}
              onDragStart={handleDragStart}
            />
          )}
          {zoomEnabled && hoverActive && output.dataUrl && (
            <HoverZoom
              imageUrl={output.dataUrl}
              containerRect={containerRect}
              mousePos={mousePos}
            />
          )}
          {hasPrev && (
            <button className="v3-viewer-arrow v3-viewer-arrow-left" onClick={() => onNavigate(currentIndex - 1)}>
              &#8249;
            </button>
          )}
          {hasNext && (
            <button className="v3-viewer-arrow v3-viewer-arrow-right" onClick={() => onNavigate(currentIndex + 1)}>
              &#8250;
            </button>
          )}
        </div>
      </div>
      <div className="v3-toolbar">
        <div className="v3-toolbar-left">
          <span className="v3-toolbar-id">{displayId}</span>
          <span className="v3-toolbar-sep">·</span>
          <span className="v3-toolbar-pos">{seqNum}/{totalCount}</span>
          {time && (
            <>
              <span className="v3-toolbar-sep">·</span>
              <span className="v3-toolbar-time">{time}</span>
            </>
          )}
          <span className="v3-toolbar-sep">·</span>
          <MetadataBadge output={output} />
        </div>

        <div className="v3-toolbar-right">
          {/* Zoom */}
          <button
            className={`v3-tb-btn v3-tb-zoom ${zoomEnabled ? 'v3-tb-zoom--on' : ''}`}
            onClick={() => setZoomEnabled((v) => !v)}
            title={zoomEnabled ? 'Disable zoom lens' : 'Enable zoom lens'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>{zoomEnabled ? 'Zoom On' : 'Zoom'}</span>
          </button>

          <div className="v3-toolbar-div" />

          {/* Reactions */}
          {onUpdateFeedback && (
            <>
              <button
                className={`v3-tb-btn v3-tb-react ${output.feedback === 'up' ? 'v3-tb-react--up' : ''}`}
                onClick={() => onUpdateFeedback(output.id, output.feedback === 'up' ? null : 'up')}
                title="Good"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill={output.feedback === 'up' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                </svg>
              </button>
              <button
                className={`v3-tb-btn v3-tb-react ${output.feedback === 'down' ? 'v3-tb-react--down' : ''}`}
                onClick={() => onUpdateFeedback(output.id, output.feedback === 'down' ? null : 'down')}
                title="Needs work"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill={output.feedback === 'down' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                </svg>
              </button>

              <div className="v3-toolbar-div" />
            </>
          )}

          {/* Copy + Save */}
          <button className={`v3-tb-btn ${copyState === 'copied' ? 'v3-tb-btn--success' : ''}`} onClick={handleCopy} title="Copy to clipboard">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {copyState === 'copied' ? (
                <polyline points="20 6 9 17 4 12" />
              ) : (
                <>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 0 2 2v1" />
                </>
              )}
            </svg>
            <span>{copyState === 'copied' ? 'Copied' : 'Copy'}</span>
          </button>
          <button className="v3-tb-btn" onClick={handleDownload} title="Save to disk">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Save</span>
          </button>

          <div className="v3-toolbar-div" />

          {/* Info popover trigger */}
          <div className="v3-tb-info-wrap" ref={infoWrapRef}>
            <button
              className={`v3-tb-btn v3-tb-info ${metaOpen ? 'v3-tb-info--open' : ''}`}
              onClick={() => setMetaOpen((v) => !v)}
              title="Generation details"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Info</span>
            </button>
            <MetadataPopover output={output} open={metaOpen} onClose={() => setMetaOpen(false)} anchorRef={infoWrapRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
