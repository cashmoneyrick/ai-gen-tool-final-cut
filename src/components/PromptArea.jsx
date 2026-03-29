import { useState, useRef } from 'react'

const BUCKETS = [
  { key: 'subject', label: 'Subject' },
  { key: 'style', label: 'Style' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'composition', label: 'Composition' },
  { key: 'technical', label: 'Technical Refinements' },
]

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function buildFinalPrompt(lockedElements, assembledPrompt) {
  const activeLockedTexts = lockedElements
    .filter((el) => el.enabled)
    .map((el) => el.text)

  const parts = [...activeLockedTexts]
  if (assembledPrompt.trim()) parts.push(assembledPrompt.trim())
  return parts.join('\n\n')
}

export default function PromptArea({
  buckets, setBuckets, refs,
  assembled, assembledDirty, onAssembledChange, onResync,
  onGenerate, isGenerating,
  lockedElements, onAddLocked,
  model, availableModels, onModelChange,
  batchSize, onBatchSizeChange,
}) {
  const [showPayload, setShowPayload] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const assembledRef = useRef(null)

  // Track text selection in the assembled prompt textarea
  const handleSelect = () => {
    const el = assembledRef.current
    if (el) {
      const selected = el.value.substring(el.selectionStart, el.selectionEnd).trim()
      setHasSelection(selected.length > 0)
    }
  }

  const handleLockSelection = () => {
    const el = assembledRef.current
    if (!el) return
    const selected = el.value.substring(el.selectionStart, el.selectionEnd).trim()
    if (selected && onAddLocked) {
      onAddLocked(selected)
      setHasSelection(false)
      el.selectionStart = el.selectionEnd
    }
  }

  const updateBucket = (key, value) => {
    setBuckets((prev) => ({ ...prev, [key]: value }))
  }

  const handleAssembledChange = (e) => {
    onAssembledChange(e.target.value)
  }

  const handleGenerate = () => {
    if (assembled.trim() && onGenerate) {
      onGenerate(assembled)
    }
  }

  const canGenerate = assembled.trim().length > 0 && !isGenerating
  const finalPrompt = buildFinalPrompt(lockedElements, assembled)
  const activeLockedCount = lockedElements.filter((el) => el.enabled).length
  const disabledLockedCount = lockedElements.length - activeLockedCount

  return (
    <div className="sub-area">
      <div className="sub-area-title">Prompt</div>

      {BUCKETS.map(({ key, label }) => (
        <div className="form-group" key={key}>
          <label>{label}</label>
          <textarea
            rows={2}
            placeholder={`Describe ${label.toLowerCase()}...`}
            value={buckets[key]}
            onChange={(e) => updateBucket(key, e.target.value)}
          />
        </div>
      ))}

      <div className="form-group" style={{ marginTop: 12 }}>
        <div className="assembled-header">
          <label>Assembled Prompt</label>
          <div className="assembled-actions">
            {hasSelection && (
              <button className="btn btn-ghost btn-sm" onClick={handleLockSelection}>
                Lock selected text
              </button>
            )}
            {assembledDirty && (
              <button className="btn btn-ghost btn-sm" onClick={onResync}>
                Resync from buckets
              </button>
            )}
          </div>
        </div>
        <textarea
          ref={assembledRef}
          className="prompt-text"
          rows={4}
          placeholder="Assembled prompt will appear here — or type your own"
          value={assembled}
          onChange={handleAssembledChange}
          onSelect={handleSelect}
          onBlur={() => setTimeout(() => setHasSelection(false), 200)}
        />
      </div>

      <div className="generate-row">
        <button
          className="btn btn-primary"
          disabled={!canGenerate}
          onClick={handleGenerate}
        >
          {isGenerating
            ? 'Generating...'
            : batchSize > 1
              ? `Generate ×${batchSize}`
              : 'Generate'}
        </button>
        <div className="batch-selector">
          <button
            className="btn btn-ghost btn-sm batch-btn"
            disabled={batchSize <= 1 || isGenerating}
            onClick={() => onBatchSizeChange(batchSize - 1)}
          >
            −
          </button>
          <span className="batch-label">{batchSize}×</span>
          <button
            className="btn btn-ghost btn-sm batch-btn"
            disabled={batchSize >= 4 || isGenerating}
            onClick={() => onBatchSizeChange(batchSize + 1)}
          >
            +
          </button>
        </div>
        {availableModels.length > 0 && (
          <select
            className="model-selector"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={isGenerating}
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}
        {refs.length > 0 && (() => {
          const sendingCount = refs.filter((r) => r.send).length
          return (
            <span className="generate-ref-note">
              + {sendingCount}/{refs.length} ref{refs.length !== 1 ? 's' : ''} sending
            </span>
          )
        })()}
        {activeLockedCount > 0 && (
          <span className="generate-ref-note">
            + {activeLockedCount} locked
          </span>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowPayload((v) => !v)}
          style={{ marginLeft: 'auto' }}
        >
          {showPayload ? 'Hide' : 'Show'} Payload Preview
        </button>
      </div>

      {showPayload && (
        <div className="payload-preview">
          {lockedElements.length > 0 && (
            <div className="payload-section">
              <div className="payload-label">
                Locked Elements ({activeLockedCount} active{disabledLockedCount > 0 ? `, ${disabledLockedCount} off` : ''})
              </div>
              <div className="payload-locked-list">
                {lockedElements.map((el) => (
                  <div
                    className={`payload-locked-item ${el.enabled ? '' : 'payload-locked-off'}`}
                    key={el.id}
                  >
                    <span className="payload-locked-status">
                      {el.enabled ? '✓' : '○'}
                    </span>
                    <span>{el.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="payload-section">
            <div className="payload-label">Assembled Prompt</div>
            <div className="payload-value">
              {assembled || <span className="payload-empty">(empty)</span>}
            </div>
          </div>
          <div className="payload-section">
            <div className="payload-label">Final Prompt (sent to model)</div>
            <div className="payload-value payload-final">
              {finalPrompt || <span className="payload-empty">(empty)</span>}
            </div>
          </div>
          <div className="payload-section">
            {(() => {
              const sendingRefs = refs.filter((r) => r.send)
              const excludedRefs = refs.filter((r) => !r.send)
              const sentInLastRequest = refs.filter((r) => r.lastRequestStatus === 'sent')
              const lastRequestFailed = refs.filter((r) => r.lastRequestStatus === 'failed')
              return (
                <>
                  <div className="payload-label">
                    Will send next ({sendingRefs.length})
                  </div>
                  {sendingRefs.length > 0 ? (
                    <div className="payload-refs-list">
                      {sendingRefs.map((ref, i) => (
                        <div className="payload-ref-item" key={ref.id}>
                          <span className="payload-ref-index">{i + 1}.</span>
                          <span className="payload-ref-name">{ref.name}</span>
                          <span className="payload-ref-meta">{ref.type} &middot; {formatSize(ref.size)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="payload-empty">No references will be sent</div>
                  )}
                  {sentInLastRequest.length > 0 && (
                    <>
                      <div className="payload-label" style={{ marginTop: 8 }}>
                        Sent in last request ({sentInLastRequest.length})
                      </div>
                      <div className="payload-refs-list">
                        {sentInLastRequest.map((ref) => (
                          <div className="payload-ref-item payload-ref-sent" key={ref.id}>
                            <span className="payload-ref-name">{ref.name}</span>
                            <span className="payload-ref-meta">sent</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {lastRequestFailed.length > 0 && (
                    <>
                      <div className="payload-label payload-label-failed" style={{ marginTop: 8 }}>
                        Last request failed ({lastRequestFailed.length})
                      </div>
                      <div className="payload-refs-list">
                        {lastRequestFailed.map((ref) => (
                          <div className="payload-ref-item payload-ref-failed" key={ref.id}>
                            <span className="payload-ref-name">{ref.name}</span>
                            <span className="payload-ref-meta">failed</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {excludedRefs.length > 0 && (
                    <>
                      <div className="payload-label" style={{ marginTop: 8 }}>
                        Excluded ({excludedRefs.length})
                      </div>
                      <div className="payload-refs-list">
                        {excludedRefs.map((ref) => (
                          <div className="payload-ref-item payload-ref-off" key={ref.id}>
                            <span className="payload-ref-name">{ref.name}</span>
                            <span className="payload-ref-meta">{ref.type} &middot; {formatSize(ref.size)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
