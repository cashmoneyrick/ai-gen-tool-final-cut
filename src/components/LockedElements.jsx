import { useState } from 'react'

export default function LockedElements({ lockedElements, onAdd, onRemove, onToggle }) {
  const [input, setInput] = useState('')

  const handleAdd = () => {
    if (input.trim()) {
      onAdd(input)
      setInput('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="locked-strip">
      <div className="section-title">Locked Elements</div>

      {lockedElements.length === 0 ? (
        <div className="locked-empty">
          No locked elements yet — lock parts of your prompt to keep them across iterations
        </div>
      ) : (
        <div className="locked-chips">
          {lockedElements.map((el) => (
            <div
              className={`locked-chip ${el.enabled ? '' : 'locked-chip-disabled'}`}
              key={el.id}
            >
              <button
                className="locked-chip-toggle"
                onClick={() => onToggle(el.id)}
                title={el.enabled ? 'Disable for generation' : 'Enable for generation'}
              >
                {el.enabled ? '✓' : '○'}
              </button>
              <span className="locked-chip-text" title={el.text}>
                {el.text}
              </span>
              <button
                className="locked-chip-remove"
                onClick={() => onRemove(el.id)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="locked-add-row">
        <input
          type="text"
          className="locked-add-input"
          placeholder="Type a prompt element to lock..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn btn-sm locked-add-btn"
          onClick={handleAdd}
          disabled={!input.trim()}
        >
          Lock
        </button>
      </div>
    </div>
  )
}
