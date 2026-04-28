import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import RefsPanel from './RefsPanel'
import { createId } from '../utils/id'

function StudioFolderPanel({ open, output, activeProjectId }) {
  const [folders, setFolders] = useState([])
  const [folderItems, setFolderItems] = useState([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef(null)

  const outputId = output?.id || null

  useEffect(() => {
    if (!open || !activeProjectId) return

    let cancelled = false

    Promise.all([
      fetch(`/api/store/folders/by/projectId/${activeProjectId}`).then((res) => (res.ok ? res.json() : [])),
      outputId
        ? fetch(`/api/store/folderItems/by/outputId/${outputId}`).then((res) => (res.ok ? res.json() : []))
        : Promise.resolve([]),
    ])
      .then(([folderData, folderItemsData]) => {
        if (cancelled) return
        setFolders(folderData || [])
        setFolderItems(folderItemsData || [])
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [open, activeProjectId, outputId])

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  const activeFolderIds = useMemo(
    () => new Set(folderItems.map((item) => item.folderId)),
    [folderItems]
  )

  const toggleFolder = useCallback(async (folderId) => {
    if (!outputId) return
    const existing = folderItems.find((item) => item.folderId === folderId)

    if (existing) {
      await fetch(`/api/store/folderItems/${existing.id}`, { method: 'DELETE' })
      setFolderItems((prev) => prev.filter((item) => item.id !== existing.id))
      return
    }

    const item = {
      id: createId(),
      folderId,
      outputId,
      addedAt: Date.now(),
    }

    await fetch('/api/store/folderItems', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
    setFolderItems((prev) => [...prev, item])
  }, [outputId, folderItems])

  const createFolder = useCallback(async () => {
    const name = newName.trim()
    if (!name || !activeProjectId) return

    const folder = {
      id: createId(),
      projectId: activeProjectId,
      name,
      createdAt: Date.now(),
    }

    await fetch('/api/store/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folder),
    })

    setFolders((prev) => [...prev, folder])
    setNewName('')
    setCreating(false)

    if (!outputId) return

    const item = {
      id: createId(),
      folderId: folder.id,
      outputId,
      addedAt: Date.now(),
    }

    await fetch('/api/store/folderItems', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
    setFolderItems((prev) => [...prev, item])
  }, [newName, activeProjectId, outputId])

  return (
    <div className="v3-studio-section">
      <div className="v3-studio-section-copy">
        <span className="v3-studio-section-title">Save Output</span>
        <span className="v3-studio-section-text">Keep this output in project folders so strong candidates stay easy to find.</span>
      </div>

      <div className="v3-studio-pill-row">
        <span className="v3-studio-pill">{activeFolderIds.size} saving this output</span>
        <span className="v3-studio-pill">{folders.length} project folders</span>
      </div>

      <div className="v3-folder-popup-body v3-folder-popup-body--embedded">
        {folders.length === 0 && !creating && (
          <div className="v3-folder-popup-empty">No folders yet. Create one and this output will be added immediately.</div>
        )}
        {folders.map((folder) => (
          <button
            key={folder.id}
            className={`v3-folder-popup-item ${activeFolderIds.has(folder.id) ? 'v3-folder-popup-item--active' : ''}`}
            onClick={() => toggleFolder(folder.id)}
          >
            <span className="v3-folder-popup-check">{activeFolderIds.has(folder.id) ? '\u2713' : ''}</span>
            <span className="v3-folder-popup-name">{folder.name}</span>
          </button>
        ))}
        {creating ? (
          <div className="v3-folder-popup-create">
            <input
              ref={inputRef}
              className="v3-folder-popup-input"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') createFolder()
                if (event.key === 'Escape') {
                  setCreating(false)
                  setNewName('')
                }
              }}
              placeholder="Folder name..."
              maxLength={60}
            />
            <button className="v3-folder-popup-create-btn" onClick={createFolder} disabled={!newName.trim()}>
              Add
            </button>
          </div>
        ) : (
          <button className="v3-folder-popup-new" onClick={() => setCreating(true)}>
            + New Folder
          </button>
        )}
      </div>
    </div>
  )
}

function StudioColorPanel({ open, activeProjectId }) {
  const [colors, setColors] = useState([])
  const [hex, setHex] = useState('#000000')
  const [name, setName] = useState('')
  const [copiedIdx, setCopiedIdx] = useState(null)
  const [editingIdx, setEditingIdx] = useState(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    if (!open || !activeProjectId) return

    let cancelled = false

    fetch(`/api/store/projects/${activeProjectId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((project) => {
        if (cancelled) return
        setColors(project?.savedColors || [])
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [open, activeProjectId])

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
    await saveColors(colors.filter((_, colorIndex) => colorIndex !== index))
  }, [colors, saveColors])

  const renameColor = useCallback(async (index, nextName) => {
    const updated = colors.map((color, colorIndex) => (
      colorIndex === index ? { ...color, name: nextName.trim() || color.hex } : color
    ))
    await saveColors(updated)
    setEditingIdx(null)
  }, [colors, saveColors])

  const copyHex = useCallback((hexValue, index) => {
    navigator.clipboard.writeText(hexValue)
    setCopiedIdx(index)
    setTimeout(() => setCopiedIdx(null), 1200)
  }, [])

  return (
    <div className="v3-studio-section">
      <div className="v3-studio-section-copy">
        <span className="v3-studio-section-title">Project Colors</span>
        <span className="v3-studio-section-text">Keep the project palette close to review so saved colors stay reusable across generations.</span>
      </div>

      <div className="v3-studio-pill-row">
        <span className="v3-studio-pill">{colors.length} saved colors</span>
        {colors.length > 0 && <span className="v3-studio-pill">Double-click a label to rename</span>}
      </div>

      <div className="v3-color-picker v3-color-picker--embedded">
        <div className="v3-cp-input">
          <input
            type="color"
            value={hex}
            onChange={(event) => setHex(event.target.value)}
            className="v3-cp-swatch-input"
            title="Pick a color"
          />
          <div className="v3-cp-fields">
            <input
              type="text"
              value={hex}
              onChange={(event) => setHex(event.target.value)}
              className="v3-cp-hex"
              placeholder="#000000"
              maxLength={7}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addColor()
              }}
            />
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addColor()
              }}
              className="v3-cp-name"
              placeholder="Label"
              maxLength={40}
            />
          </div>
          <button className="v3-cp-add" onClick={addColor} disabled={!hex} title="Add color">
            +
          </button>
        </div>

        {colors.length > 0 ? (
          <div className="v3-cp-list">
            {colors.map((color, index) => (
              <div key={`${color.hex}-${index}`} className="v3-cp-item">
                <div
                  className={`v3-cp-dot ${copiedIdx === index ? 'v3-cp-dot--copied' : ''}`}
                  style={{ background: color.hex }}
                  onClick={() => copyHex(color.hex, index)}
                  title="Click to copy hex"
                />
                {editingIdx === index ? (
                  <input
                    className="v3-cp-edit-name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') renameColor(index, editName)
                      if (event.key === 'Escape') setEditingIdx(null)
                    }}
                    onBlur={() => renameColor(index, editName)}
                    autoFocus
                  />
                ) : (
                  <span
                    className="v3-cp-item-label"
                    onDoubleClick={() => {
                      setEditingIdx(index)
                      setEditName(color.name)
                    }}
                    title="Double-click to rename"
                  >
                    {color.name !== color.hex ? color.name : ''}
                  </span>
                )}
                <span className="v3-cp-item-hex" onClick={() => copyHex(color.hex, index)}>
                  {color.hex}
                </span>
                <button className="v3-cp-item-x" onClick={() => removeColor(index)} title="Remove">
                  &times;
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="v3-cp-empty">Pick a color, name it if useful, then press Enter to save it to this project.</div>
        )}
      </div>
    </div>
  )
}

export default function StudioPopover({
  open,
  onClose,
  anchorRef,
  output,
  activeProjectId,
  refs,
  onAddRefs,
  onRemoveRef,
  onToggleRefSend,
  onUpdateRefMode,
  onReorderRefs,
  onUpdateRefNotes,
}) {
  const popRef = useRef(null)
  const [activeTab, setActiveTab] = useState('refs')
  const [pos, setPos] = useState(null)

  const includedRefCount = refs.filter((ref) => ref.send !== false).length
  const totalRefCount = refs.length
  const studioSubtitle = totalRefCount === 0
    ? 'No active refs yet for this project'
    : includedRefCount === totalRefCount
      ? `${includedRefCount} refs active for this project`
      : `${includedRefCount} of ${totalRefCount} refs active for this project`

  useEffect(() => {
    if (!open || !anchorRef?.current) return

    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos({ top: rect.bottom + 8, right: Math.max(16, window.innerWidth - rect.right) })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event) => {
      if (
        popRef.current &&
        !popRef.current.contains(event.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(event.target)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null

  const tabs = [
    { id: 'refs', label: 'Refs', count: refs.length },
    { id: 'save', label: 'Save', count: null },
    { id: 'colors', label: 'Colors', count: null },
  ]

  return (
    <div className="v3-studio-popover" ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000 }}>
      <div className="v3-studio-popover-head">
        <div className="v3-studio-popover-titles">
          <span className="v3-studio-popover-title">Studio</span>
          <span className="v3-studio-popover-subtitle">{studioSubtitle}</span>
        </div>
        <button className="v3-studio-popover-x" onClick={onClose} aria-label="Close studio tools">
          &times;
        </button>
      </div>

      <div className="v3-studio-tabs" role="tablist" aria-label="Studio tools">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`v3-studio-tab ${activeTab === tab.id ? 'v3-studio-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="v3-studio-tab-count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="v3-studio-popover-body">
        {activeTab === 'refs' && (
          <div className="v3-studio-tab-panel">
            <div className="v3-studio-section-copy">
              <span className="v3-studio-section-title">Reference Set</span>
              <span className="v3-studio-section-text">Add, tune, and reorder refs without leaving the review flow.</span>
            </div>
            <RefsPanel
              refs={refs}
              onAddRefs={onAddRefs}
              onRemoveRef={onRemoveRef}
              onToggleRefSend={onToggleRefSend}
              onUpdateRefMode={onUpdateRefMode}
              onReorderRefs={onReorderRefs}
              onUpdateRefNotes={onUpdateRefNotes}
            />
          </div>
        )}
        {activeTab === 'save' && (
          <div className="v3-studio-tab-panel">
            <StudioFolderPanel open={open} output={output} activeProjectId={activeProjectId} />
          </div>
        )}
        {activeTab === 'colors' && (
          <div className="v3-studio-tab-panel">
            <StudioColorPanel open={open} activeProjectId={activeProjectId} />
          </div>
        )}
      </div>
    </div>
  )
}
