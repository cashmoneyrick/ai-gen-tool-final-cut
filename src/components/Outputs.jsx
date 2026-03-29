import { useState } from 'react'
import Lightbox from './Lightbox'

function formatElapsed(ms) {
  if (ms == null) return '0s'
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60) return totalSeconds + 's'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (seconds === 0) return minutes + 'm'
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function getJobStatusLabel(status) {
  if (status === 'queued') return 'Queued'
  if (status === 'generating') return 'Generating'
  if (status === 'succeeded') return 'Done'
  if (status === 'rate_limited') return 'Rate limited'
  return 'Failed'
}

function OutputFeedbackButtons({ feedback, onChange, className = '' }) {
  const handleClick = (event, nextFeedback) => {
    event.stopPropagation()
    onChange(nextFeedback)
  }

  return (
    <div className={`feedback-toggle-group ${className}`.trim()}>
      <button
        className={`feedback-toggle-btn ${feedback === 'up' ? 'feedback-toggle-btn-active feedback-toggle-btn-up' : ''}`}
        onClick={(event) => handleClick(event, feedback === 'up' ? null : 'up')}
        title={feedback === 'up' ? 'Clear thumbs up' : 'Thumbs up'}
        aria-label="Thumbs up"
      >
        👍
      </button>
      <button
        className={`feedback-toggle-btn ${feedback == null ? 'feedback-toggle-btn-active feedback-toggle-btn-neutral' : ''}`}
        onClick={(event) => handleClick(event, null)}
        title="Neutral"
        aria-label="Neutral"
      >
        ○
      </button>
      <button
        className={`feedback-toggle-btn ${feedback === 'down' ? 'feedback-toggle-btn-active feedback-toggle-btn-down' : ''}`}
        onClick={(event) => handleClick(event, feedback === 'down' ? null : 'down')}
        title={feedback === 'down' ? 'Clear thumbs down' : 'Thumbs down'}
        aria-label="Thumbs down"
      >
        👎
      </button>
    </div>
  )
}

export default function Outputs({ outputs, genJobs, winners, onSaveWinner, onUpdateOutputFeedback, onRetryJob }) {
  const savedOutputIds = new Set(winners.map((w) => w.outputId))
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const openLightbox = (index) => setLightboxIndex(index)
  const closeLightbox = () => setLightboxIndex(null)

  const activeJobs = genJobs.filter(
    (j) => j.status === 'queued' || j.status === 'generating'
  )
  const settledJobs = genJobs.filter(
    (j) => j.status !== 'queued' && j.status !== 'generating'
  )
  const isGenerating = activeJobs.length > 0
  const hasJobs = genJobs.length > 0

  // Summary line for settled batches
  const succeededCount = settledJobs.filter((j) => j.status === 'succeeded').length
  const failedCount = settledJobs.filter(
    (j) => j.status === 'failed' || j.status === 'rate_limited'
  ).length
  const showSummary = !isGenerating && hasJobs && genJobs.length > 1

  return (
    <section className="section">
      <div className="section-title">
        Outputs
        {outputs.length > 0 && (
          <span className="outputs-count"> ({outputs.length})</span>
        )}
      </div>

      {/* Per-job status slots */}
      {hasJobs && (
        <div className="job-slots">
          {genJobs.map((job, i) => (
            <div className={`job-slot job-slot-${job.status}`} key={job.id}>
              <div className="job-slot-body">
                <div className="job-slot-header">
                  <span className="job-slot-index">#{i + 1}</span>
                  {job.status === 'generating' && <div className="gen-spinner gen-spinner-sm" />}
                  <span className={`job-status-text job-status-pill job-text-${job.status}`}>
                    {getJobStatusLabel(job.status)}
                  </span>
                  {job.elapsed != null && (
                    <span className="job-elapsed" title={`${job.elapsed} ms`}>
                      {formatElapsed(job.elapsed)}
                    </span>
                  )}
                </div>

                {(job.status === 'failed' || job.status === 'rate_limited') && (
                  <div className="job-error-stack">
                    {job.errorCode && (
                      <span className="job-error-code">
                        {job.errorCode}
                      </span>
                    )}
                    {job.error && (
                      <p className="job-error-message" title={job.error}>
                        {job.error}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {job.status === 'failed' && job.retryable && onRetryJob && (
                <button
                  className="btn btn-sm job-retry-btn"
                  onClick={() => onRetryJob(job.id)}
                >
                  Retry
                </button>
              )}

              {job.status === 'rate_limited' && onRetryJob && (
                <button
                  className="btn btn-sm job-retry-btn"
                  onClick={() => onRetryJob(job.id)}
                >
                  Retry
                </button>
              )}
            </div>
          ))}
          {showSummary && (
            <span className="job-summary">
              {succeededCount}/{genJobs.length} succeeded
              {failedCount > 0 && `, ${failedCount} failed`}
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {outputs.length === 0 && !isGenerating && (
        <div className="empty-state">
          Generated images will appear here
        </div>
      )}

      {/* Output images */}
      {outputs.length > 0 && (
        <div className="output-grid">
          {outputs.map((out, index) => {
            const isSaved = savedOutputIds.has(out.id)
            return (
              <div className="output-thumb" key={out.id}>
                <OutputFeedbackButtons
                  feedback={out.feedback ?? null}
                  onChange={(nextFeedback) => onUpdateOutputFeedback(out.id, nextFeedback)}
                  className="output-thumb-feedback"
                />
                <img
                  className="output-thumb-img"
                  src={out.dataUrl}
                  alt="Generated output"
                  onClick={() => openLightbox(index)}
                  title="Click to view fullscreen"
                />
                <div className="output-thumb-display-id">
                  {out.displayId}
                </div>
                <div className="output-thumb-actions">
                  {isSaved ? (
                    <span className="output-saved-badge">Saved</span>
                  ) : (
                    <button
                      className="btn btn-sm output-save-btn"
                      onClick={() => onSaveWinner(out.id)}
                    >
                      Save
                    </button>
                  )}
                </div>
                <div className="output-thumb-zoom-hint">
                  <span>⤢</span>
                </div>
                {out.metadata?.model && (
                  <div className="output-thumb-model">
                    {out.metadata.model.includes('pro') ? 'NB Pro' : 'NB 2'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          images={outputs}
          activeIndex={lightboxIndex}
          onClose={closeLightbox}
          onNavigate={setLightboxIndex}
          winners={winners}
          onSaveWinner={onSaveWinner}
          onUpdateOutputFeedback={onUpdateOutputFeedback}
        />
      )}
    </section>
  )
}
