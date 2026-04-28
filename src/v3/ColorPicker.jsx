import { useState, useRef, useEffect, useCallback } from 'react'

export default function ColorPicker({ open, onClose, anchorRef, activeProjectId }) {
  const popRef = useRef(null)
  const [colors, setColors] = useState([])
  const [hex, setHex] = useState('#000000')
  const [name, setName] = useState('')
  const [pos, setPos] = useState(null)
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [editingIdx, setEditingIdx] = useState(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    if (!open || !anchorRef?.current) { setPos(null); return }
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
  }, [open, anchorRef])

  useEffect(() => {
    if (!open || !activeProjectId) return
    fetch(`/api/store/projects/${activeProjectId}`)
      .then(r => r.json())
      .then(project => setColors(project?.savedColors || []))
      .catch(() => {})
  }, [open, activeProjectId])

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

  const saveColors = useCallback(async (updated) => {
    const res = await fetch(`/api/store/projects/${activeProjectId}`)
    const project = await res.json()
    await fetch('/api/store/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, savedColors: updated }),
    })
    setColors(updated)
  }, [activeProjectId])

  const addColor = useCallback(async () => {
    if (!hex || !activeProjectId) return
    const colorName = name.trim() || hex
    await saveColors([...colors, { hex, name: colorName, addedAt: Date.now() }])
    setName('')
  }, [hex, name, colors, activeProjectId, saveColors])

  const removeColor = useCallback(async (index) => {
    await saveColors(colors.filter((_, i) => i !== index))
  }, [colors, saveColors])

  const renameColor = useCallback(async (index, newName) => {
    const updated = colors.map((c, i) => i === index ? { ...c, name: newName.trim() || c.hex } : c)
    await saveColors(updated)
    setEditingIdx(null)
  }, [colors, saveColors])

  const copyHex = useCallback((hexVal, idx) => {
    navigator.clipboard.writeText(hexVal)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1200)
  }, [])

  if (!open || !pos) return null

  return (
    <div className="v3-color-picker" ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000 }}>
      {/* Add color row: swatch picker + hex + label + add */}
      <div className="v3-cp-input">
        <input
          type="color"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          className="v3-cp-swatch-input"
          title="Pick a color"
        />
        <div className="v3-cp-fields">
          <input
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="v3-cp-hex"
            placeholder="#000000"
            maxLength={7}
            onKeyDown={(e) => { if (e.key === 'Enter') addColor() }}
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addColor() }}
            className="v3-cp-name"
            placeholder="Label"
            maxLength={40}
          />
        </div>
        <button className="v3-cp-add" onClick={addColor} disabled={!hex} title="Add color (Enter)">+</button>
      </div>

      {/* Saved colors */}
      {colors.length > 0 ? (
        <div className="v3-cp-list">
          {colors.map((c, i) => (
            <div key={i} className="v3-cp-item">
              <div
                className={`v3-cp-dot ${copiedIdx === i ? 'v3-cp-dot--copied' : ''}`}
                style={{ background: c.hex }}
                onClick={() => copyHex(c.hex, i)}
                title="Click to copy hex"
              />
              {editingIdx === i ? (
                <input
                  className="v3-cp-edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') renameColor(i, editName); if (e.key === 'Escape') setEditingIdx(null) }}
                  onBlur={() => renameColor(i, editName)}
                  autoFocus
                />
              ) : (
                <span
                  className="v3-cp-item-label"
                  onDoubleClick={() => { setEditingIdx(i); setEditName(c.name) }}
                  title="Double-click to rename"
                >
                  {c.name !== c.hex ? c.name : ''}
                </span>
              )}
              <span className="v3-cp-item-hex" onClick={() => copyHex(c.hex, i)}>{c.hex}</span>
              <button className="v3-cp-item-x" onClick={() => removeColor(i)} title="Remove">&times;</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="v3-cp-empty">Pick a color and hit Enter</div>
      )}
    </div>
  )
}
