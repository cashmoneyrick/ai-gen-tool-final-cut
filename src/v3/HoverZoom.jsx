import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * HoverZoom — full-res loupe with scroll-wheel zoom + level badge.
 *
 * Props:
 *   imageUrl      – full-res data URL or src
 *   containerRect – bounding rect of the image area
 *   mousePos      – { x, y } client coords
 *   zoom          – current zoom level (controlled)
 *   onZoomChange  – (newZoom) => void
 *   compareUrl    – optional second image URL for A/B (hold Shift)
 *   lensSize      – px diameter (default 280)
 */
export default function HoverZoom({
  imageUrl,
  containerRect,
  mousePos,
  zoom = 3,
  onZoomChange,
  compareUrl,
  lensSize = 280,
}) {
  const [imgNatural, setImgNatural] = useState(null)
  const [comparing, setComparing] = useState(false)
  const imgRef = useRef(null)

  // Measure native image dimensions once
  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.onload = () => setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = imageUrl
  }, [imageUrl])

  // Track Shift key for A/B compare
  useEffect(() => {
    const down = (e) => { if (e.key === 'Shift') setComparing(true) }
    const up = (e) => { if (e.key === 'Shift') setComparing(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  if (!containerRect || !mousePos || !imageUrl || !imgNatural) return null

  // Calculate actual displayed image dimensions within the container
  // (accounts for object-fit: contain letterboxing/pillarboxing)
  const containerAR = containerRect.width / containerRect.height
  const imageAR = imgNatural.w / imgNatural.h
  let displayW, displayH, offsetX, offsetY
  if (imageAR > containerAR) {
    // Image is wider than container — pillarboxed (bars top/bottom)
    displayW = containerRect.width
    displayH = containerRect.width / imageAR
    offsetX = 0
    offsetY = (containerRect.height - displayH) / 2
  } else {
    // Image is taller than container — letterboxed (bars left/right)
    displayH = containerRect.height
    displayW = containerRect.height * imageAR
    offsetX = (containerRect.width - displayW) / 2
    offsetY = 0
  }

  // Fractional position of cursor within the actual displayed image
  const fracX = Math.max(0, Math.min(1, (mousePos.x - containerRect.left - offsetX) / displayW))
  const fracY = Math.max(0, Math.min(1, (mousePos.y - containerRect.top - offsetY) / displayH))

  // Background size = displayed image dims × zoom (preserves aspect ratio)
  const bgW = displayW * zoom
  const bgH = displayH * zoom
  const bgX = -(fracX * bgW - lensSize / 2)
  const bgY = -(fracY * bgH - lensSize / 2)

  // Offset lens: position it 24px above and to the right of cursor
  const offset = 24
  let lensX = mousePos.x - containerRect.left + offset
  let lensY = mousePos.y - containerRect.top - lensSize - offset

  // Clamp to stay inside container
  if (lensX + lensSize > containerRect.width) lensX = mousePos.x - containerRect.left - lensSize - offset
  if (lensY < 0) lensY = mousePos.y - containerRect.top + offset

  const activeUrl = (comparing && compareUrl) ? compareUrl : imageUrl

  return (
    <>
      <div
        className="v3-hover-zoom"
        style={{
          width: lensSize,
          height: lensSize,
          left: lensX,
          top: lensY,
          backgroundImage: `url(${activeUrl})`,
          backgroundSize: `${bgW}px ${bgH}px`,
          backgroundPosition: `${bgX}px ${bgY}px`,
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Crosshair */}
        <div className="v3-zoom-crosshair v3-zoom-crosshair--h" />
        <div className="v3-zoom-crosshair v3-zoom-crosshair--v" />

        {/* Zoom level badge */}
        <div className="v3-zoom-badge">
          {zoom.toFixed(1)}×
        </div>

        {/* A/B indicator */}
        {comparing && compareUrl && (
          <div className="v3-zoom-compare-badge">A/B</div>
        )}
      </div>

      {/* Cursor dot on main image */}
      <div
        className="v3-zoom-cursor"
        style={{
          left: mousePos.x - containerRect.left,
          top: mousePos.y - containerRect.top,
        }}
      />
    </>
  )
}

/**
 * FullscreenZoom — click/double-click overlay for pannable full-res view.
 * Press Escape or click the backdrop to close.
 */
export function FullscreenZoom({ imageUrl, onClose }) {
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const lastPos = useRef(null)
  const containerRef = useRef(null)

  // Escape to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Scroll to zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    setZoom((z) => Math.max(0.5, Math.min(10, z + (e.deltaY > 0 ? -0.3 : 0.3))))
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    setDragging(true)
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !lastPos.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
    lastPos.current = null
  }, [])

  // Fit / 1:1 toggle on double-click
  const handleDoubleClick = useCallback(() => {
    if (Math.abs(zoom - 1) < 0.1) {
      setZoom(0.5)
      setPan({ x: 0, y: 0 })
    } else {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
  }, [zoom])

  if (!imageUrl) return null

  return (
    <div
      className="v3-fullscreen-zoom"
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <img
        src={imageUrl}
        alt="Full resolution"
        className="v3-fullscreen-zoom-img"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          cursor: dragging ? 'grabbing' : 'grab',
        }}
        draggable={false}
      />

      {/* HUD */}
      <div className="v3-fullscreen-hud">
        <span className="v3-fullscreen-hud-zoom">{Math.round(zoom * 100)}%</span>
        <span className="v3-fullscreen-hud-hint">Scroll to zoom · Drag to pan · Double-click to reset · Esc to close</span>
      </div>

      <button className="v3-fullscreen-close" onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
