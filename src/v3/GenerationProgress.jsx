import { useState, useEffect, useRef } from 'react'

/**
 * GenerationProgress — Live activity log overlay shown during image generation.
 * Renders in the main content area as a centered card with accumulated step entries.
 * Each phase from the operator appears as a new line with elapsed time and status.
 */

const PHASE_LABELS = {
  handoff: 'Saving generation config',
  context: 'Loading project context',
  prompt: 'Assembling prompt',
  sending: 'Sending to Gemini API',
  waiting: 'Waiting for image response',
  retrying: 'Retrying failed requests',
  saving: 'Saving outputs to project',
  done: 'Generation complete',
  failed: 'Generation failed',
}

const PHASE_ICONS = {
  handoff: '↑',
  context: '◎',
  prompt: '≡',
  sending: '→',
  waiting: '◇',
  retrying: '↻',
  saving: '↓',
  done: '✓',
  failed: '✗',
}

export default function GenerationProgress({ steps, visible, onDismiss }) {
  const [dismissed, setDismissed] = useState(false)
  const [fadeClass, setFadeClass] = useState('')
  const logRef = useRef(null)
  const dismissTimer = useRef(null)

  // Auto-scroll to bottom when new steps appear
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [steps.length])

  // Auto-dismiss 2.5s after completion
  useEffect(() => {
    const lastStep = steps[steps.length - 1]
    if (lastStep && (lastStep.phase === 'done' || lastStep.phase === 'failed')) {
      dismissTimer.current = setTimeout(() => {
        setFadeClass('v3-gp-fade-out')
        setTimeout(() => {
          setDismissed(true)
          onDismiss?.()
        }, 500)
      }, 2500)
    }
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current) }
  }, [steps, onDismiss])

  // Reset dismissed state when new generation starts
  useEffect(() => {
    if (visible && steps.length > 0 && steps[0].phase === 'handoff') {
      setDismissed(false)
      setFadeClass('')
    }
  }, [visible, steps])

  if (!visible || dismissed || steps.length === 0) return null

  const startTs = steps[0]?.ts || Date.now()
  const lastStep = steps[steps.length - 1]
  const isComplete = lastStep?.phase === 'done'
  const isFailed = lastStep?.phase === 'failed'

  return (
    <div className={`v3-gp-overlay ${fadeClass}`}>
      <div className="v3-gp-card">
        <div className="v3-gp-header">
          <div className="v3-gp-header-left">
            {!isComplete && !isFailed && <span className="v3-gp-spinner" />}
            {isComplete && <span className="v3-gp-header-icon v3-gp-icon-done">✓</span>}
            {isFailed && <span className="v3-gp-header-icon v3-gp-icon-fail">✗</span>}
            <span className="v3-gp-title">
              {isComplete ? 'Generation Complete' : isFailed ? 'Generation Failed' : 'Generating'}
            </span>
          </div>
          <span className="v3-gp-elapsed">
            <ElapsedTime startTs={startTs} running={!isComplete && !isFailed} />
          </span>
        </div>

        <div className="v3-gp-log" ref={logRef}>
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1
            const isActive = isLast && !isComplete && !isFailed
            const elapsed = ((step.ts - startTs) / 1000).toFixed(1)

            return (
              <div
                key={`${step.phase}-${i}`}
                className={`v3-gp-step ${isActive ? 'v3-gp-step-active' : ''} ${step.phase === 'done' ? 'v3-gp-step-done' : ''} ${step.phase === 'failed' ? 'v3-gp-step-fail' : ''} v3-gp-step-enter`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <span className="v3-gp-step-time">{elapsed}s</span>
                <span className={`v3-gp-step-icon ${isActive ? 'v3-gp-step-icon-pulse' : ''}`}>
                  {PHASE_ICONS[step.phase] || '·'}
                </span>
                <span className="v3-gp-step-label">
                  {PHASE_LABELS[step.phase] || step.phase}
                </span>
                {step.detail && (
                  <span className="v3-gp-step-detail">{step.detail}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Live elapsed timer that ticks every 100ms */
function ElapsedTime({ startTs, running }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [running])

  const secs = ((now - startTs) / 1000).toFixed(1)
  return <>{secs}s</>
}
