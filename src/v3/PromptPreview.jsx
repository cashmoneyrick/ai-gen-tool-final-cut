import { useState, useMemo } from 'react'
import { REF_MODES } from './RefsPanel'

/**
 * Client-side prompt preview showing how refs and locked elements
 * will translate into the generation prompt. Approximation only —
 * the actual prompt is assembled in operator/run.js.
 */

function buildRefDirectivePreview(ref) {
  const mode = ref.mode || 'reference'
  const notes = (ref.notes || '').trim()
  const name = ref.name || 'reference'

  switch (mode) {
    case 'match':
      return `[CRITICAL REF "${name}"]: Closely replicate the composition, style, colors, and details shown in this reference image.${notes ? ` ${notes}` : ''}`
    case 'style':
      return `[STYLE REF "${name}"]: Adopt the artistic style, mood, and visual treatment from this reference.${notes ? ` ${notes}` : ''}`
    case 'palette':
      return `[Ref "${name}" — color reference]: Use the color palette from this image only.${notes ? ` ${notes}` : ''}`
    case 'inspire':
      return `[Ref "${name}" — inspiration]: This image is loose inspiration — borrow elements freely but do not copy directly.${notes ? ` ${notes}` : ''}`
    case 'reference':
    default:
      return notes ? `[Ref "${name}"]: ${notes}` : null
  }
}

export default function PromptPreview({ lockedElements, refs, assembledPrompt }) {
  const [expanded, setExpanded] = useState(false)

  const preview = useMemo(() => {
    const parts = []

    // Locked elements
    const activeLocked = (lockedElements || []).filter((el) => el.enabled)
    if (activeLocked.length > 0) {
      parts.push({ label: 'Locked', items: activeLocked.map((el) => el.text) })
    }

    // High-priority ref directives (match, style)
    const sendingRefs = (refs || []).filter((r) => r.send !== false)
    const highRefs = sendingRefs
      .filter((r) => (r.mode === 'match' || r.mode === 'style'))
      .map((r) => buildRefDirectivePreview(r))
      .filter(Boolean)
    if (highRefs.length > 0) {
      parts.push({ label: 'Ref Constraints', items: highRefs })
    }

    // Carry-forward placeholder
    parts.push({ label: 'Carry-Forward', items: ['(auto-generated from your feedback)'], dimmed: true })

    // Low-priority ref directives
    const lowRefs = sendingRefs
      .filter((r) => r.mode !== 'match' && r.mode !== 'style')
      .map((r) => buildRefDirectivePreview(r))
      .filter(Boolean)
    if (lowRefs.length > 0) {
      parts.push({ label: 'Ref Notes', items: lowRefs })
    }

    // Assembled prompt
    if (assembledPrompt?.trim()) {
      parts.push({ label: 'Prompt', items: [assembledPrompt.trim().slice(0, 300) + (assembledPrompt.length > 300 ? '...' : '')] })
    }

    // Image count
    const imgCount = sendingRefs.filter((r) => r.blobBase64 || r.previewUrl).length
    if (imgCount > 0) {
      parts.push({ label: 'Images', items: [`${imgCount} reference image${imgCount !== 1 ? 's' : ''} attached`], dimmed: true })
    }

    return parts
  }, [lockedElements, refs, assembledPrompt])

  if (preview.length === 0) return null

  return (
    <div className="v3-prompt-preview">
      <button className="v3-prompt-preview-toggle" onClick={() => setExpanded(!expanded)}>
        <span className="v3-prompt-preview-label">Prompt Preview</span>
        <span className="v3-prompt-preview-caret">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="v3-prompt-preview-body">
          {preview.map((section, i) => (
            <div key={i} className={`v3-prompt-preview-section ${section.dimmed ? 'v3-prompt-preview-section--dim' : ''}`}>
              <span className="v3-prompt-preview-section-label">{section.label}</span>
              {section.items.map((item, j) => (
                <div key={j} className="v3-prompt-preview-item">{item}</div>
              ))}
            </div>
          ))}
          <div className="v3-prompt-preview-note">
            Approximate — actual prompt includes carry-forward, memories, and cross-session context
          </div>
        </div>
      )}
    </div>
  )
}
