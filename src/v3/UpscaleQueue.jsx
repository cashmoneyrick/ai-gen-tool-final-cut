import { useState, useRef, useEffect, useCallback } from 'react'

export default function UpscaleQueue({ open, onClose, anchorRef }) {
  const popRef = useRef(null)
  const [queue, setQueue] = useState([])
  const [pos, setPos] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    if (!open || !anchorRef?.current) { setPos(null); return }
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    fetch('/api/upscale-queue')
      .then(r => r.json())
      .then(q => setQueue(q || []))
      .catch(() => {})
  }, [open])

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

  const copyPrompt = useCallback((item) => {
    const parts = [`Model: ${item.model}`]
    if (item.imageSize) parts.push(`Size: ${item.imageSize}`)
    if (item.aspectRatio) parts.push(`Aspect Ratio: ${item.aspectRatio}`)
    parts.push('', '--- PROMPT ---', item.prompt)
    navigator.clipboard.writeText(parts.join('\n')).then(() => {
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }, [])

  const removeItem = useCallback(async (id) => {
    const updated = queue.filter(q => q.id !== id)
    await fetch('/api/upscale-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    setQueue(updated)
  }, [queue])

  if (!open || !pos) return null

  return (
    <div className="v3-upscale-queue" ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000 }}>
      <div className="v3-upscale-queue-head">
        <span className="v3-upscale-queue-title">Upscale Queue ({queue.length})</span>
        <button className="v3-upscale-queue-x" onClick={onClose}>&times;</button>
      </div>
      <div className="v3-upscale-queue-body">
        {queue.length === 0 && (
          <div className="v3-upscale-queue-empty">No recipes queued for upscale</div>
        )}
        {queue.map(item => (
          <div key={item.id} className="v3-upscale-queue-item">
            <div className="v3-upscale-queue-item-info">
              <span className="v3-upscale-queue-item-name">{item.name}</span>
              <span className="v3-upscale-queue-item-model">{item.model}</span>
            </div>
            <div className="v3-upscale-queue-item-prompt">{item.prompt.slice(0, 80)}...</div>
            <div className="v3-upscale-queue-item-actions">
              <button className="v3-upscale-queue-copy" onClick={() => copyPrompt(item)}>
                {copiedId === item.id ? 'Copied!' : 'Copy'}
              </button>
              <button className="v3-upscale-queue-done" onClick={() => removeItem(item.id)}>Done</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
