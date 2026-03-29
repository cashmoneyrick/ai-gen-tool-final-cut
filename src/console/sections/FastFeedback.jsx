import { useState } from 'react'

export default function FastFeedback({ output }) {
  const [feedback, setFeedback] = useState(output?.feedback || null)
  const [keepChips, setKeepChips] = useState(new Set())
  const [fixChips, setFixChips] = useState(new Set())
  const [note, setNote] = useState('')

  const toggleChip = (chip, set, setSetter) => {
    const newSet = new Set(set)
    if (newSet.has(chip)) {
      newSet.delete(chip)
    } else {
      newSet.add(chip)
    }
    setSetter(newSet)
  }

  const keepOptions = ['Color palette', 'Composition', 'Lighting', 'Mood']
  const fixOptions = ['Foreground detail', 'Sharpness', 'Background', 'Framing']

  return (
    <div className="op-feedback-bar">
      {/* Thumbs feedback */}
      <div className="op-feedback-row">
        <div className="op-feedback-row-label">Feedback</div>
        <div className="feedback-toggle-group" style={{ display: 'inline-flex' }}>
          <button
            className={`feedback-toggle-btn feedback-toggle-btn-up ${
              feedback === 'up' ? 'feedback-toggle-btn-active' : ''
            }`}
            onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
            title="Thumbs up"
          >
            👍
          </button>
          <button
            className={`feedback-toggle-btn feedback-toggle-btn-down ${
              feedback === 'down' ? 'feedback-toggle-btn-active' : ''
            }`}
            onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
            title="Thumbs down"
          >
            👎
          </button>
          <button
            className={`feedback-toggle-btn feedback-toggle-btn-neutral ${
              feedback === null ? 'feedback-toggle-btn-active' : ''
            }`}
            onClick={() => setFeedback(null)}
            title="Neutral"
          >
            ○
          </button>
        </div>
      </div>

      {/* Keep chips */}
      <div className="op-feedback-row">
        <div className="op-feedback-row-label">Keep</div>
        <div className="op-feedback-controls">
          {keepOptions.map((chip) => (
            <button
              key={chip}
              className={`op-chip ${keepChips.has(chip) ? 'op-chip-active' : ''}`}
              onClick={() => toggleChip(chip, keepChips, setKeepChips)}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Fix chips */}
      <div className="op-feedback-row">
        <div className="op-feedback-row-label">Fix</div>
        <div className="op-feedback-controls">
          {fixOptions.map((chip) => (
            <button
              key={chip}
              className={`op-chip ${fixChips.has(chip) ? 'op-chip-active' : ''}`}
              onClick={() => toggleChip(chip, fixChips, setFixChips)}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Note textarea */}
      <div className="op-feedback-row">
        <div className="op-feedback-row-label">Note</div>
        <textarea
          className="op-note-textarea"
          placeholder="Quick note on this output..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* Action buttons */}
      <div className="op-feedback-row">
        <div className="op-feedback-row-label"></div>
        <div className="op-feedback-controls">
          <button className="btn btn-primary btn-sm">Save as Winner</button>
        </div>
      </div>
    </div>
  )
}
