import { useRef, useState } from 'react'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function RefLifecycleBadge({ refData, isGenerating }) {
  // During active generation: refs toggled ON show "Sending..."
  if (isGenerating && refData.send) {
    return <span className="ref-lifecycle ref-lifecycle-sending">Sending...</span>
  }

  // Excluded refs — no lifecycle badge
  if (!refData.send) {
    return null
  }

  // After generation: show last request result
  if (refData.lastRequestStatus === 'sent') {
    return <span className="ref-lifecycle ref-lifecycle-sent">Sent in last request</span>
  }
  if (refData.lastRequestStatus === 'failed') {
    return <span className="ref-lifecycle ref-lifecycle-failed">Last request failed</span>
  }

  // Default: toggled on, no request yet
  return <span className="ref-lifecycle ref-lifecycle-ready">Will send</span>
}

export default function RefsArea({ refs, onAddRefs, onRemoveRef, onToggleRefSend, isGenerating }) {
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) {
      onAddRefs(e.dataTransfer.files)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleFileChange = (e) => {
    if (e.target.files.length) {
      onAddRefs(e.target.files)
      e.target.value = ''
    }
  }

  const sendingCount = refs.filter((r) => r.send).length
  const excludedCount = refs.length - sendingCount

  return (
    <div className="sub-area">
      <div className="sub-area-title">
        Reference Images
        {refs.length > 0 && (
          <span className="refs-count">
            {' '}&mdash; {sendingCount} will send{excludedCount > 0 ? `, ${excludedCount} excluded` : ''}
          </span>
        )}
      </div>

      <div
        className={`drop-zone ${dragOver ? 'drop-zone-active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        Drop images here or click to browse
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFileChange}
        />
      </div>

      {refs.length > 0 && (
        <div className="ref-grid">
          {refs.map((ref) => (
            <div
              className={`ref-thumb ${ref.send ? '' : 'ref-thumb-off'}`}
              key={ref.id}
            >
              <img
                className="ref-thumb-img"
                src={ref.previewUrl}
                alt={ref.name}
              />
              <button
                className="ref-thumb-remove"
                onClick={() => onRemoveRef(ref.id)}
                title="Remove reference"
              >
                &times;
              </button>
              <div className="ref-thumb-info">
                <span className="ref-thumb-name" title={ref.name}>
                  {ref.name}
                </span>
                <span className="ref-thumb-size">{formatSize(ref.size)}</span>
              </div>
              <button
                className={`ref-send-toggle ${ref.send ? 'ref-send-on' : 'ref-send-off'}`}
                onClick={() => onToggleRefSend(ref.id)}
                title={ref.send ? 'Will be sent — click to exclude' : 'Excluded — click to include'}
              >
                {ref.send ? '✓ Will send' : '○ Excluded'}
              </button>
              <RefLifecycleBadge refData={ref} isGenerating={isGenerating} />
            </div>
          ))}
        </div>
      )}

      {refs.length === 0 && (
        <div className="refs-empty">
          No references attached — images added here will be sent with generation
        </div>
      )}
    </div>
  )
}
