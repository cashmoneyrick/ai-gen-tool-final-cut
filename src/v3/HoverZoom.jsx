export default function HoverZoom({ imageUrl, containerRect, mousePos, zoom = 2.5, lensSize = 320 }) {
  if (!containerRect || !mousePos || !imageUrl) return null

  const fracX = (mousePos.x - containerRect.left) / containerRect.width
  const fracY = (mousePos.y - containerRect.top) / containerRect.height

  const bgW = containerRect.width * zoom
  const bgH = containerRect.height * zoom
  const bgX = -(fracX * bgW - lensSize / 2)
  const bgY = -(fracY * bgH - lensSize / 2)

  // Position lens centered on cursor, clamped inside container
  const lensX = mousePos.x - containerRect.left - lensSize / 2
  const lensY = mousePos.y - containerRect.top - lensSize / 2

  return (
    <div
      className="v3-hover-zoom"
      style={{
        width: lensSize,
        height: lensSize,
        left: lensX,
        top: lensY,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}
