import { Fragment, useRef, useEffect, useMemo } from 'react'
import { normalizeFeedback } from '../reviewFeedback.js'
import { getImageUrl } from '../utils/imageUrl.js'

// Rainbow palette — each entry is an RGB triplet string for use in rgba()
// Cycles through distinct, vibrant hues so every batch is unmistakable
const BATCH_COLORS = [
  '0, 122, 255',     // blue
  '255, 59, 48',     // red
  '52, 199, 89',     // green
  '255, 149, 0',     // orange
  '175, 82, 222',    // purple
  '0, 199, 190',     // teal
  '255, 45, 85',     // pink
  '90, 200, 250',    // cyan
  '255, 204, 0',     // yellow
  '88, 86, 214',     // indigo
  '255, 112, 67',    // deep orange
  '76, 217, 100',    // lime
]

function isPromptPreviewOutput(output) {
  return output?.outputKind === 'prompt-preview'
}

export default function ThumbnailStrip({ outputs, currentOutputId, onNavigate, winners }) {
  const stripRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    const thumb = activeRef.current
    const strip = stripRef.current
    if (!thumb || !strip) return
    // Scroll only within the strip — never bubble to the page
    const isHorizontal = strip.scrollWidth > strip.clientWidth && strip.scrollHeight <= strip.clientHeight + 4
    if (isHorizontal) {
      const center = thumb.offsetLeft - strip.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2
      strip.scrollTo({ left: Math.max(0, center), behavior: 'smooth' })
    } else {
      const center = thumb.offsetTop - strip.offsetTop - (strip.clientHeight - thumb.offsetHeight) / 2
      strip.scrollTo({ top: Math.max(0, center), behavior: 'smooth' })
    }
  }, [currentOutputId])

  // Build batch groups with metadata
  const batchGroups = useMemo(() => {
    if (!outputs || outputs.length === 0) return []

    const groups = []
    let current = { createdAt: outputs[0]?.createdAt, items: [] }

    for (const o of outputs) {
      if (o.createdAt === current.createdAt) {
        current.items.push(o)
      } else {
        groups.push(current)
        current = { createdAt: o.createdAt, items: [o] }
      }
    }
    groups.push(current)

    const total = groups.length

    const enriched = groups.map((g, i) => {
      return {
        ...g,
        batchNum: total - i,
        isNewest: i === 0,
        age: i,
        color: BATCH_COLORS[i % BATCH_COLORS.length],
      }
    })

    return enriched
  }, [outputs])

  if (!outputs || outputs.length === 0) return null

  // Opacity: newest=1, drops fast — older batches fade out aggressively
  const opacityForAge = (age) => {
    if (age === 0) return 1
    if (age === 1) return 0.7
    if (age === 2) return 0.5
    return Math.max(0.35, 1 - age * 0.2)
  }

  return (
    <div className="v3-thumbstrip" ref={stripRef}>
      {batchGroups.map((group, groupIdx) => (
        <Fragment key={group.createdAt}>
          {/* Separator bar before this group (not before the first group) */}
          {groupIdx > 0 && (
            <div
              className="v3-batch-sep"
              style={{ '--sep-color': group.color }}
            />
          )}

          {/* Batch region with color-coded background + opacity fade */}
          <div
            className={`v3-batch-region ${group.isNewest ? 'v3-batch-region--newest' : ''}`}
            style={{
              '--batch-color': group.color,
              opacity: opacityForAge(group.age),
            }}
          >
            {group.items.map((output) => {
              const isActive = output.id === currentOutputId
              return (
                <button
                  key={output.id}
                  ref={isActive ? activeRef : null}
                  className={`v3-thumb ${isActive ? 'v3-thumb-active' : ''} ${winners?.some((w) => w.outputId === output.id) ? 'v3-thumb--winner' : ''}`}
                  onClick={() => onNavigate(output)}
                >
                  {isPromptPreviewOutput(output) ? (
                    <div className="v3-thumb-prompt-preview">
                      <span className="v3-thumb-prompt-kicker">Prompt</span>
                      <span className="v3-thumb-prompt-line">
                        {(output.promptPreviewText || output.finalPromptSent || '').slice(0, 32) || 'Preview'}
                      </span>
                    </div>
                  ) : getImageUrl(output) ? (
                    <img src={getImageUrl(output)} alt="" draggable={false} />
                  ) : (
                    <div className="v3-thumb-placeholder" />
                  )}
                  {winners?.some((w) => w.outputId === output.id) && (
                    <span className="v3-thumb-trophy" aria-label="Winner">
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </span>
                  )}
                  {(() => {
                    const rating = normalizeFeedback(output.feedback)
                    if (rating !== null) {
                      const ratingTone = rating <= 2 ? 'low' : rating === 3 ? 'mid' : 'high'
                      return (
                        <span className={`v3-thumb-rating v3-thumb-rating--${ratingTone}`}>
                          {rating}
                        </span>
                      )
                    }
                    return null
                  })()}
                  {(output.notesKeep?.trim() || output.notesFix?.trim()) && (
                    <span className={`v3-thumb-badge ${output.notesKeep?.trim() && output.notesFix?.trim() ? 'v3-thumb-badge-mixed' : output.notesKeep?.trim() ? 'v3-thumb-badge-up' : 'v3-thumb-badge-down'}`}>
                      {output.notesKeep?.trim() && output.notesFix?.trim() ? '\u2215' : output.notesKeep?.trim() ? '\u2713' : '\u2717'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Fragment>
      ))}
    </div>
  )
}
