import { useRef, useState, useEffect } from 'react'
import RefsPanel from './RefsPanel'

export default function RefsPopover({ open, onClose, anchorRef, refs, onAddRefs, onAddOnHandRefs, onRemoveRef, onToggleRefSend, onUpdateRefMode, onReorderRefs, onUpdateRefNotes }) {
  const popRef = useRef(null)

  // Position above the anchor button
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!open || !anchorRef?.current) { setPos(null); return }
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
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

  if (!open || !pos) return null

  return (
    <div className="v3-refs-popover" ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000 }}>
      <div className="v3-refs-popover-head">
        <span className="v3-refs-popover-title">Reference Images</span>
        <button className="v3-refs-popover-x" onClick={onClose}>&times;</button>
      </div>
      <div className="v3-refs-popover-body">
        <RefsPanel
          refs={refs}
          onAddRefs={onAddRefs}
          onAddOnHandRefs={onAddOnHandRefs}
          onRemoveRef={onRemoveRef}
          onToggleRefSend={onToggleRefSend}
          onUpdateRefMode={onUpdateRefMode}
          onReorderRefs={onReorderRefs}
          onUpdateRefNotes={onUpdateRefNotes}
        />
      </div>
    </div>
  )
}
