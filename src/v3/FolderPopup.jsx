import { useState, useRef, useEffect, useCallback } from 'react'
import { createId } from '../utils/id'

export default function FolderPopup({ open, onClose, anchorRef, output, activeProjectId }) {
  const popRef = useRef(null)
  const [folders, setFolders] = useState([])
  const [folderItems, setFolderItems] = useState([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [pos, setPos] = useState(null)
  const inputRef = useRef(null)

  // Position below anchor
  useEffect(() => {
    if (!open || !anchorRef?.current) { setPos(null); return }
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
  }, [open, anchorRef])

  // Load folders and items for this output when opened
  useEffect(() => {
    if (!open || !activeProjectId) return
    Promise.all([
      fetch(`/api/store/folders/by/projectId/${activeProjectId}`).then(r => r.json()),
      output?.id ? fetch(`/api/store/folderItems/by/outputId/${output.id}`).then(r => r.json()) : Promise.resolve([])
    ]).then(([f, fi]) => {
      setFolders(f || [])
      setFolderItems(fi || [])
    }).catch(() => {})
  }, [open, activeProjectId, output?.id])

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

  // Focus input when creating
  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus()
  }, [creating])

  const isInFolder = useCallback((folderId) => {
    return folderItems.some(fi => fi.folderId === folderId)
  }, [folderItems])

  const toggleFolder = useCallback(async (folderId) => {
    if (!output?.id) return
    const existing = folderItems.find(fi => fi.folderId === folderId)
    if (existing) {
      // Remove from folder
      await fetch(`/api/store/folderItems/${existing.id}`, { method: 'DELETE' })
      setFolderItems(prev => prev.filter(fi => fi.id !== existing.id))
    } else {
      // Add to folder
      const item = {
        id: createId(),
        folderId,
        outputId: output.id,
        addedAt: Date.now(),
      }
      await fetch('/api/store/folderItems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      setFolderItems(prev => [...prev, item])
    }
  }, [output?.id, folderItems])

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
    setFolders(prev => [...prev, folder])
    setNewName('')
    setCreating(false)
    // Auto-add current output to the new folder
    if (output?.id) {
      const item = {
        id: createId(),
        folderId: folder.id,
        outputId: output.id,
        addedAt: Date.now(),
      }
      await fetch('/api/store/folderItems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      setFolderItems(prev => [...prev, item])
    }
  }, [newName, activeProjectId, output?.id])

  if (!open || !pos) return null

  return (
    <div className="v3-folder-popup" ref={popRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000 }}>
      <div className="v3-folder-popup-head">
        <span className="v3-folder-popup-title">Save to Folder</span>
        <button className="v3-folder-popup-x" onClick={onClose}>&times;</button>
      </div>
      <div className="v3-folder-popup-body">
        {folders.length === 0 && !creating && (
          <div className="v3-folder-popup-empty">No folders yet</div>
        )}
        {folders.map(f => (
          <button
            key={f.id}
            className={`v3-folder-popup-item ${isInFolder(f.id) ? 'v3-folder-popup-item--active' : ''}`}
            onClick={() => toggleFolder(f.id)}
          >
            <span className="v3-folder-popup-check">{isInFolder(f.id) ? '\u2713' : ''}</span>
            <span className="v3-folder-popup-name">{f.name}</span>
          </button>
        ))}
        {creating ? (
          <div className="v3-folder-popup-create">
            <input
              ref={inputRef}
              className="v3-folder-popup-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
              placeholder="Folder name..."
              maxLength={60}
            />
            <button className="v3-folder-popup-create-btn" onClick={createFolder} disabled={!newName.trim()}>Add</button>
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
