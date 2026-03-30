import { useState, useMemo } from 'react'
import { summarizeIterationContext } from '../../planning/iterationContext'

export default function RunNextAttempt({
  session,
  lockedElements,
  refs,
  iterationContext,
  outputs,
  winners,
}) {
  const [intent, setIntent] = useState('')
  const [reason, setReason] = useState('')
  const [modelOverride, setModelOverride] = useState('')
  const [copied, setCopied] = useState(null) // 'json' | 'cmd' | null
  const [saved, setSaved] = useState(false) // handoff file saved to disk

  const enabledLocked = (lockedElements || []).filter((el) => el.enabled)
  const activeRefs = (refs || []).filter((r) => r.send)
  const carryForwardSummary = summarizeIterationContext(iterationContext)

  // Build preserve/change lists for display
  const preserveItems = iterationContext?.preserve || []
  const changeItems = iterationContext?.change || []

  // Recent feedback summary
  const recentFeedback = useMemo(() => {
    if (!outputs || outputs.length === 0) return []
    return outputs
      .filter((o) => o.feedback)
      .slice(0, 3)
      .map((o) => ({
        id: o.displayId || o.id.slice(0, 8),
        feedback: o.feedback,
        prompt: (o.finalPromptSent || '').slice(0, 60),
      }))
  }, [outputs])

  // Build the decision file payload — minimal, only overrides + metadata
  const decisionPayload = useMemo(() => {
    const payload = {}
    if (intent.trim()) payload.intent = intent.trim()
    if (reason.trim()) payload.reason = reason.trim()
    if (modelOverride.trim()) payload.model = modelOverride.trim()
    return payload
  }, [intent, reason, modelOverride])

  const decisionJson = JSON.stringify(decisionPayload, null, 2)

  // CLI command using the real handoff file path
  const fileCommand = 'node --env-file=.env operator/run.js --decision-file data/handoff.json'
  const plainCommand = 'node --env-file=.env operator/run.js'

  // Save handoff JSON to data/handoff.json via API
  const handleSaveHandoff = async () => {
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decisionPayload),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (err) {
      console.error('Failed to save handoff:', err)
    }
  }

  const handleCopy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  const getModelShortName = (model) => {
    if (!model) return 'Not set'
    if (model.includes('pro')) return 'Imagen Pro'
    if (model.includes('flash')) return 'Flash'
    return model
  }

  const hasDecisionContent = Object.keys(decisionPayload).length > 0

  return (
    <div className="op-next-attempt">
      <div className="op-next-attempt-title">Run Next Attempt</div>

      {/* Current state summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Left: what operator/run.js will use automatically */}
        <div style={{ fontSize: '12px' }}>
          <div style={{
            fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: '8px'
          }}>
            Auto-included by run.js
          </div>

          <div style={{ marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Model: </span>
            <span style={{ color: 'var(--text-primary)' }}>
              {getModelShortName(session?.model)}
            </span>
          </div>

          <div style={{ marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Prompt: </span>
            <span style={{
              color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
              fontSize: '11px'
            }}>
              {session?.assembledPrompt
                ? (session.assembledPrompt.length > 80
                  ? session.assembledPrompt.slice(0, 80) + '...'
                  : session.assembledPrompt)
                : 'None'}
            </span>
          </div>

          {enabledLocked.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Locked: </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {enabledLocked.map((el) => el.text).join('; ')}
              </span>
            </div>
          )}

          {activeRefs.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Refs: </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {activeRefs.length} image{activeRefs.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right: carry-forward context */}
        <div style={{ fontSize: '12px' }}>
          <div style={{
            fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: '8px'
          }}>
            Iteration Context
          </div>

          {preserveItems.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: 'var(--success)' }}>Keep: </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {preserveItems
                  .slice(0, 4)
                  .map((p) => p.source === 'bucket' ? p.bucket : `"${p.text.slice(0, 40)}"`)
                  .join(', ')}
              </span>
            </div>
          )}

          {changeItems.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <span style={{ color: 'var(--danger)' }}>Fix: </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {changeItems
                  .slice(0, 3)
                  .map((c) => c.text.slice(0, 50))
                  .join('; ')}
              </span>
            </div>
          )}

          {preserveItems.length === 0 && changeItems.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No carry-forward signals yet
            </div>
          )}

          {recentFeedback.length > 0 && (
            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-light)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Recent: </span>
              {recentFeedback.map((f) => (
                <span key={f.id} style={{ marginRight: '6px', fontSize: '11px' }}>
                  {f.feedback === 'up' ? '👍' : '👎'} {f.id}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />

      {/* Decision fields */}
      <div style={{
        fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
        color: 'var(--text-muted)', marginBottom: '6px'
      }}>
        Decision (optional overrides for run.js)
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
            Intent
          </label>
          <input
            type="text"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="What you're trying..."
            style={{
              width: '100%', boxSizing: 'border-box',
              fontFamily: 'var(--font)', fontSize: '12px',
              color: 'var(--text-primary)', background: 'var(--bg-input)',
              border: '1px solid var(--border-light)', borderRadius: '4px',
              padding: '6px 8px',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
            Reason
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this attempt..."
            style={{
              width: '100%', boxSizing: 'border-box',
              fontFamily: 'var(--font)', fontSize: '12px',
              color: 'var(--text-primary)', background: 'var(--bg-input)',
              border: '1px solid var(--border-light)', borderRadius: '4px',
              padding: '6px 8px',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: '4px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
          Model override (blank = use session default: {getModelShortName(session?.model)})
        </label>
        <input
          type="text"
          value={modelOverride}
          onChange={(e) => setModelOverride(e.target.value)}
          placeholder="e.g. gemini-3-pro-image-preview"
          style={{
            width: '100%', boxSizing: 'border-box',
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            color: 'var(--text-primary)', background: 'var(--bg-input)',
            border: '1px solid var(--border-light)', borderRadius: '4px',
            padding: '6px 8px',
          }}
        />
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />

      {/* Decision JSON + Save */}
      {hasDecisionContent && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Decision JSON
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleCopy(decisionJson, 'json')}
                style={{ fontSize: '11px' }}
              >
                {copied === 'json' ? 'Copied!' : 'Copy'}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSaveHandoff}
                style={{ fontSize: '11px' }}
              >
                {saved ? 'Saved!' : 'Save to data/handoff.json'}
              </button>
            </div>
          </div>
          <pre style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            color: 'var(--text-secondary)', background: 'var(--bg-input)',
            border: '1px solid var(--border-light)', borderRadius: '4px',
            padding: '8px 10px', margin: 0, whiteSpace: 'pre-wrap',
            lineHeight: '1.4',
          }}>
            {decisionJson}
          </pre>
        </div>
      )}

      {/* CLI Command */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {hasDecisionContent ? 'Run with decision file' : 'Run (uses session state)'}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleCopy(hasDecisionContent ? fileCommand : plainCommand, 'cmd')}
            style={{ fontSize: '11px' }}
          >
            {copied === 'cmd' ? 'Copied!' : 'Copy Command'}
          </button>
        </div>
        <pre style={{
          fontFamily: 'var(--font-mono)', fontSize: '11px',
          color: 'var(--accent)', background: 'var(--bg-input)',
          border: '1px solid var(--border-light)', borderRadius: '4px',
          padding: '8px 10px', margin: 0, whiteSpace: 'pre-wrap',
          lineHeight: '1.4',
        }}>
          {hasDecisionContent ? fileCommand : plainCommand}
        </pre>
        {hasDecisionContent && !saved && (
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
            Click "Save to data/handoff.json" above first, then run the command.
          </div>
        )}
      </div>
    </div>
  )
}
