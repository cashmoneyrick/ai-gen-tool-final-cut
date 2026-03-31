import { useState, useEffect, useRef, useCallback } from 'react'
import SaveIndicator from './SaveIndicator'

export default function NoteBox({ output, onUpdateNotes }) {
  const [draft, setDraft] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const timerRef = useRef(null)
  const currentIdRef = useRef(null)
  const draftRef = useRef(draft)
  draftRef.current = draft

  // Sync draft when output changes
  useEffect(() => {
    // Flush pending save for previous output
    if (timerRef.current && currentIdRef.current && currentIdRef.current !== output?.id) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      // Save previous output's draft
      const prevId = currentIdRef.current
      const prevDraft = draftRef.current
      onUpdateNotes(prevId, prevDraft).catch(() => {})
    }
    currentIdRef.current = output?.id || null
    setDraft(output?.notes || '')
    setSaveState('idle')
  }, [output?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((e) => {
    const value = e.target.value
    setDraft(value)

    // Clear existing timer
    if (timerRef.current) clearTimeout(timerRef.current)

    // Debounce save at 1 second
    timerRef.current = setTimeout(async () => {
      timerRef.current = null
      if (!output?.id) return
      setSaveState('saving')
      try {
        await onUpdateNotes(output.id, value)
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => s === 'saved' ? 'idle' : s), 2000)
      } catch {
        setSaveState('failed')
      }
    }, 1000)
  }, [output?.id, onUpdateNotes])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!output) return null

  return (
    <div className="v3-notebox">
      <textarea
        className="v3-notebox-input"
        value={draft}
        onChange={handleChange}
        placeholder="Add notes about this output..."
        rows={2}
      />
      <SaveIndicator state={saveState} />
    </div>
  )
}
