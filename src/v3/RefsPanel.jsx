import { useRef, useState, useCallback } from 'react'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/* ── Ref type badge metadata ── */
const REF_TYPE_LABELS = {
  winner:    { label: '★ Winner',   color: '#c8a84b' },
  'on-hand': { label: '📷 On-hand', color: '#5b8c5a' },
  general:   { label: 'Ref',        color: '#666' },
}

/* ── Ref influence modes ── */
export const REF_MODES = [
  { id: 'reference', label: 'None', short: '—', description: 'Send image with your notes only' },
  { id: 'match', label: 'Match', short: 'Match', description: 'Closely replicate this image' },
  { id: 'style', label: 'Style', short: 'Style', description: 'Use the style and mood' },
  { id: 'palette', label: 'Colors', short: 'Colors', description: 'Use the color palette' },
  { id: 'inspire', label: 'Inspire', short: 'Inspire', description: 'Loose inspiration only' },
]

/* ── Icons ── */

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const ImageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
)

const EyeOpenIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeClosedIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const GripIcon = () => (
  <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" opacity="0.4">
    <circle cx="2" cy="2" r="1.2" />
    <circle cx="6" cy="2" r="1.2" />
    <circle cx="2" cy="7" r="1.2" />
    <circle cx="6" cy="7" r="1.2" />
    <circle cx="2" cy="12" r="1.2" />
    <circle cx="6" cy="12" r="1.2" />
  </svg>
)

/* ── Ref Lightbox ── */

function RefLightbox({ refData, onClose }) {
  return (
    <div className="v3-ref-lightbox-backdrop" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <img
        className="v3-ref-lightbox-img"
        src={refData.previewUrl}
        alt={refData.name}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      <button className="v3-ref-lightbox-close" onClick={onClose} title="Close">
        <CloseIcon />
      </button>
    </div>
  )
}

/* ── Single ref row ── */

function RefRow({ refData, onRemoveRef, onToggleRefSend, onUpdateRefMode, onUpdateRefNotes, onOpenLightbox, onDragStart, onDragOver, onDrop }) {
  const [notesDraft, setNotesDraft] = useState(refData.notes || '')
  const [notesFocused, setNotesFocused] = useState(false)
  const notesRef = useRef(null)

  const mode = refData.mode || 'reference'
  const isIncluded = refData.send !== false

  const handleNotesCommit = useCallback(() => {
    onUpdateRefNotes(refData.id, notesDraft.trim())
    setNotesFocused(false)
  }, [notesDraft, refData.id, onUpdateRefNotes])

  const modeInfo = REF_MODES.find((m) => m.id === mode) || REF_MODES[0]
  const hasNotes = notesDraft.trim().length > 0
  const showHint = mode === 'reference' && !hasNotes

  return (
    <div
      className={`v3-ref-row ${!isIncluded ? 'v3-ref-row--excluded' : ''} ${mode !== 'reference' ? 'v3-ref-row--moded' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, refData.id)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, refData.id)}
    >
      {/* Row 1: grip + thumbnail + name/size */}
      <div className="v3-ref-row-top">
        <span className="v3-ref-grip" title="Drag to reorder">
          <GripIcon />
        </span>
        <button
          className="v3-ref-thumb-btn"
          onClick={() => onOpenLightbox(refData)}
          title="View full size"
        >
          <img className="v3-ref-thumb" src={refData.previewUrl} alt={refData.name} />
        </button>
        <div className="v3-ref-details">
          <span className="v3-ref-name" title={refData.name}>{refData.name}</span>
          <span className="v3-ref-meta">
            {refData.refType && refData.refType !== 'general' && REF_TYPE_LABELS[refData.refType] && (
              <span style={{
                fontSize: '9px',
                fontWeight: 600,
                letterSpacing: '0.03em',
                color: REF_TYPE_LABELS[refData.refType].color,
                textTransform: 'uppercase',
                marginRight: 4,
              }}>
                {REF_TYPE_LABELS[refData.refType].label}
              </span>
            )}
            <span className="v3-ref-size">{formatSize(refData.size)}</span>
          </span>
        </div>
      </div>

      {/* Row 2: include toggle + mode selector + remove */}
      <div className="v3-ref-actions">
        <button
          className={`v3-ref-include ${isIncluded ? 'v3-ref-include--on' : 'v3-ref-include--off'}`}
          onClick={() => onToggleRefSend(refData.id)}
          title={isIncluded ? 'Included in generation. Click to exclude.' : 'Excluded from generation. Click to include.'}
        >
          {isIncluded ? <EyeOpenIcon /> : <EyeClosedIcon />}
          <span>{isIncluded ? 'Include' : 'Exclude'}</span>
        </button>
        <select
          className={`v3-ref-mode-select ${mode !== 'reference' ? 'v3-ref-mode-select--active' : ''}`}
          value={mode}
          onChange={(e) => onUpdateRefMode(refData.id, e.target.value)}
          title={modeInfo.description}
        >
          {REF_MODES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <button
          className="v3-ref-delete"
          onClick={() => onRemoveRef(refData.id)}
          title="Remove reference"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Row 3: notes */}
      <div className="v3-ref-notes-wrap">
        <textarea
          ref={notesRef}
          className="v3-ref-notes"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onFocus={() => setNotesFocused(true)}
          onBlur={handleNotesCommit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setNotesDraft(refData.notes || '')
              notesRef.current?.blur()
            }
          }}
          placeholder={mode === 'reference' ? 'Tell Gemini what to use from this image...' : `${modeInfo.description} — add extra notes (optional)`}
          rows={notesFocused || notesDraft.length > 0 ? 2 : 1}
        />
        {showHint && (
          <div className="v3-ref-hint">Choose a mode or add notes to guide how this ref is used</div>
        )}
      </div>
    </div>
  )
}

/* ── Panel ── */

export default function RefsPanel({ refs, onAddRefs, onRemoveRef, onToggleRefSend, onUpdateRefMode, onUpdateRefNotes, onReorderRefs, onAddOnHandRefs }) {
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [lightboxRef, setLightboxRef] = useState(null)
  const dragItemId = useRef(null)

  const handleFileDrop = (e) => {
    e.preventDefault()
    setDragOver(false)

    // Handle file drops (from desktop or file picker)
    if (e.dataTransfer.files.length) {
      onAddRefs(e.dataTransfer.files)
      return
    }

    // Handle image dragged from the viewer (data URL or regular URL)
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url && (url.startsWith('data:image/') || url.startsWith('blob:'))) {
      fetch(url)
        .then((r) => r.blob())
        .then((blob) => {
          const file = new File([blob], `dragged-ref-${Date.now()}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, { type: blob.type })
          const dt = new DataTransfer()
          dt.items.add(file)
          onAddRefs(dt.files)
        })
        .catch(() => {})
      return
    }

    // Handle img element drag (browser puts the src in text/html)
    const html = e.dataTransfer.getData('text/html')
    if (html) {
      const match = html.match(/src="(data:image\/[^"]+)"/)
      if (match) {
        fetch(match[1])
          .then((r) => r.blob())
          .then((blob) => {
            const file = new File([blob], `dragged-ref-${Date.now()}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, { type: blob.type })
            const dt = new DataTransfer()
            dt.items.add(file)
            onAddRefs(dt.files)
          })
          .catch(() => {})
      }
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files.length) {
      onAddRefs(e.target.files)
      e.target.value = ''
    }
  }

  // Drag-to-reorder handlers
  const handleReorderDragStart = useCallback((e, id) => {
    dragItemId.current = id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id) // Required for Firefox
  }, [])

  const handleReorderDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleReorderDrop = useCallback((e, targetId) => {
    e.preventDefault()
    e.stopPropagation()
    const sourceId = dragItemId.current
    if (!sourceId || sourceId === targetId || !onReorderRefs) return

    const currentIds = refs.map((r) => r.id)
    const sourceIdx = currentIds.indexOf(sourceId)
    const targetIdx = currentIds.indexOf(targetId)
    if (sourceIdx === -1 || targetIdx === -1) return

    const newOrder = [...currentIds]
    newOrder.splice(sourceIdx, 1)
    newOrder.splice(targetIdx, 0, sourceId)
    onReorderRefs(newOrder)
    dragItemId.current = null
  }, [refs, onReorderRefs])

  const includedCount = refs.filter((r) => r.send !== false).length
  const hasRefs = refs.length > 0

  return (
    <div
      className={`v3-refs-panel ${dragOver ? 'v3-refs-panel--dragover' : ''}`}
      onDrop={handleFileDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
    >
      {/* Ref count summary */}
      {hasRefs && (
        <div className="v3-refs-summary">
          {includedCount} of {refs.length} included
        </div>
      )}

      {/* Ref list */}
      {hasRefs && (
        <div className="v3-refs-list">
          {refs.map((ref) => (
            <RefRow
              key={ref.id}
              refData={ref}
              onRemoveRef={onRemoveRef}
              onToggleRefSend={onToggleRefSend}
              onUpdateRefMode={onUpdateRefMode}
              onUpdateRefNotes={onUpdateRefNotes}
              onOpenLightbox={setLightboxRef}
              onDragStart={handleReorderDragStart}
              onDragOver={handleReorderDragOver}
              onDrop={handleReorderDrop}
            />
          ))}
        </div>
      )}

      {/* Empty / drop zone */}
      {!hasRefs && (
        <div
          className={`v3-refs-dropzone ${dragOver ? 'v3-refs-dropzone--active' : ''}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon />
          <span className="v3-refs-dropzone-text">Drop reference images or click to browse</span>
          <span className="v3-refs-dropzone-hint">Guide the AI with visual examples</span>
        </div>
      )}

      {/* Add button */}
      {hasRefs && (
        <button
          className={`v3-refs-add ${dragOver ? 'v3-refs-add--dragover' : ''}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <PlusIcon />
          <span>{dragOver ? 'Drop to add' : 'Add or drop image'}</span>
        </button>
      )}

      {/* On-hand photo upload */}
      {onAddOnHandRefs && (
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#5b8c5a', marginTop: 6, padding: '0 2px' }}>
          <PlusIcon />
          Add on-hand photo
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) {
                onAddOnHandRefs(e.target.files)
                e.target.value = ''
              }
            }}
          />
        </label>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleFileChange}
      />

      {lightboxRef && (
        <RefLightbox refData={lightboxRef} onClose={() => setLightboxRef(null)} />
      )}
    </div>
  )
}
