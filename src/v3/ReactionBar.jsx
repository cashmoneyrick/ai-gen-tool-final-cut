import { useState, useCallback } from 'react'
import SaveIndicator from './SaveIndicator'

export default function ReactionBar({ output, onUpdateFeedback }) {
  const [saveState, setSaveState] = useState('idle')

  const handleFeedback = useCallback((value) => {
    if (!output) return
    // Toggle off if clicking same value
    const newValue = output.feedback === value ? null : value
    onUpdateFeedback(output.id, newValue)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }, [output, onUpdateFeedback])

  if (!output) return null

  const fb = output.feedback

  return (
    <div className="v3-reactions">
      <div className="v3-reaction-buttons">
        <button
          className={`v3-reaction-btn v3-reaction-up ${fb === 'up' ? 'v3-reaction-active' : ''}`}
          onClick={() => handleFeedback('up')}
          title="Good"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
          </svg>
        </button>
        <button
          className={`v3-reaction-btn v3-reaction-neutral ${fb === null || fb === undefined ? 'v3-reaction-active' : ''}`}
          onClick={() => handleFeedback(null)}
          title="Neutral"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
        <button
          className={`v3-reaction-btn v3-reaction-down ${fb === 'down' ? 'v3-reaction-active' : ''}`}
          onClick={() => handleFeedback('down')}
          title="Needs work"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
          </svg>
        </button>
      </div>
      <SaveIndicator state={saveState} />
    </div>
  )
}
