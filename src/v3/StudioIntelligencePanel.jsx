import { useMemo } from 'react'
import { getFeedbackDisplay, normalizeFeedback } from '../reviewFeedback.js'

function trimText(text, max = 96) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function refModeLabel(mode) {
  switch (mode) {
    case 'match':
      return 'Match'
    case 'style':
      return 'Style'
    case 'palette':
      return 'Colors'
    case 'inspire':
      return 'Inspire'
    default:
      return 'Reference'
  }
}

function sourceLabel(source) {
  switch (source) {
    case 'batch-notes':
      return 'Batch'
    case 'rating':
      return 'Rating'
    case 'notes':
      return 'Review'
    case 'bucket':
      return 'Winner'
    default:
      return 'Signal'
  }
}

function pickTopSignals(items, limit = 2) {
  return (items || [])
    .slice()
    .sort((a, b) => (b.createdAt || b.batchCreatedAt || 0) - (a.createdAt || a.batchCreatedAt || 0))
    .slice(0, limit)
}

function scoreSignal(item) {
  const sourceWeight = {
    'batch-notes': 4,
    notes: 3,
    bucket: 2,
    rating: 1,
  }
  return (sourceWeight[item?.source] || 0) * 1_000_000 + (item?.createdAt || item?.batchCreatedAt || 0)
}

function pickPrioritySignals(items, limit = 3) {
  return (items || [])
    .slice()
    .sort((a, b) => scoreSignal(b) - scoreSignal(a))
    .slice(0, limit)
}

function trimSignalForAction(text, max = 72) {
  const cleaned = trimText(text, max)
  return cleaned.replace(/^[\s\-–—:,.]+/, '')
}

function collectBriefKeywords(list, limit = 2) {
  return (list || [])
    .map((item) => item?.keyword)
    .filter(Boolean)
    .slice(0, limit)
}

function buildCue(label, text) {
  if (!text) return null
  return `${label}: ${trimSignalForAction(text, 58)}`
}

function Section({ title, empty, children }) {
  return (
    <section className="v3-intel-section">
      <div className="v3-intel-section-title">{title}</div>
      {children || <div className="v3-intel-empty">{empty}</div>}
    </section>
  )
}

export default function StudioIntelligencePanel({
  currentOutput,
  iterationContext,
  refs,
  memoryStatus,
  brief,
}) {
  const carryForward = useMemo(() => ({
    preserve: pickTopSignals(iterationContext?.preserve, 2),
    change: pickTopSignals(iterationContext?.change, 2),
    priorityPreserve: pickPrioritySignals(iterationContext?.preserve, 3),
    priorityChange: pickPrioritySignals(iterationContext?.change, 3),
  }), [iterationContext])

  const activeRefs = useMemo(
    () => (refs || []).filter((ref) => ref.send !== false),
    [refs]
  )

  const refSignals = useMemo(
    () => activeRefs.slice(0, 3).map((ref) => ({
      id: ref.id,
      label: ref.name,
      meta: refModeLabel(ref.mode),
    })),
    [activeRefs]
  )

  const memorySignals = useMemo(() => {
    const activeProjectMemories = memoryStatus?.memoriesCount?.active || 0
    const activeSharedMemories = memoryStatus?.sharedCount?.memories || 0
    const activeSharedDocs = memoryStatus?.sharedCount?.docs || 0
    const lessons = memoryStatus?.lessonsCount || 0
    const items = []

    if (activeProjectMemories > 0) items.push({ label: `${activeProjectMemories} active memories`, meta: 'Project' })
    if (activeSharedMemories > 0) items.push({ label: `${activeSharedMemories} shared memories`, meta: 'Shared' })
    if (activeSharedDocs > 0) items.push({ label: `${activeSharedDocs} shared docs`, meta: 'Shared' })
    if (lessons > 0) items.push({ label: `${lessons} saved lessons`, meta: 'Project' })

    return items.slice(0, 3)
  }, [memoryStatus])

  const outputUsage = useMemo(() => {
    if (!currentOutput) return []

    const receipt = currentOutput.generationReceipt || {}
    const items = []

    if ((currentOutput.sentRefs?.length || receipt.refsUsed || 0) > 0) {
      items.push({
        label: `${currentOutput.sentRefs?.length || receipt.refsUsed || 0} refs sent`,
        meta: 'Refs',
      })
    }

    if ((currentOutput.memoriesUsed?.length || receipt.memoriesUsed?.count || 0) > 0) {
      items.push({
        label: `${currentOutput.memoriesUsed?.length || receipt.memoriesUsed?.count || 0} memories applied`,
        meta: 'Memory',
      })
    }

    const carryCount = (receipt.carryForwardUsed?.preserveCount || 0) + (receipt.carryForwardUsed?.changeCount || 0)
    if (carryCount > 0) {
      items.push({
        label: `${carryCount} prior signals used`,
        meta: 'Carry forward',
      })
    }

    if ((receipt.feedbackSourceIds?.length || currentOutput.feedbackSourceIds?.length || 0) > 0) {
      items.push({
        label: `${receipt.feedbackSourceIds?.length || currentOutput.feedbackSourceIds?.length || 0} reviewed outputs referenced`,
        meta: 'Feedback',
      })
    }

    return items
  }, [currentOutput])

  const direction = useMemo(() => {
    const rating = normalizeFeedback(currentOutput?.feedback)
    const works = collectBriefKeywords(brief?.whatWorks)
    const fails = collectBriefKeywords(brief?.whatFails)
    const dna = collectBriefKeywords(brief?.winnerDNA)

    let title = 'Direction is being tuned'
    let tone = 'neutral'
    const reasons = []

    if (currentOutput?.feedback != null) {
      const display = getFeedbackDisplay(currentOutput.feedback)
      reasons.push(`Current review signal: ${display.label}`)
    }

    if (currentOutput?.id && carryForward.change.length > 0 && (rating === null || rating <= 3)) {
      title = 'Direction is being corrected'
      tone = 'correct'
      reasons.push('Recent misses are still driving fixes')
    } else if ((currentOutput?.id && rating >= 4) || carryForward.preserve.length > 0) {
      title = 'Direction is being reinforced'
      tone = 'reinforce'
      reasons.push('Recent wins are being carried forward')
    }

    if (works.length > 0) reasons.push(`Project works: ${works.join(', ')}`)
    if (fails.length > 0 && tone !== 'reinforce') reasons.push(`Project misses: ${fails.join(', ')}`)
    if (dna.length > 0) reasons.push(`Winner DNA: ${dna.join(', ')}`)

    return { title, tone, reasons: reasons.slice(0, 3) }
  }, [currentOutput, carryForward, brief])

  const nextMove = useMemo(() => {
    const rating = normalizeFeedback(currentOutput?.feedback)
    const topPreserve = carryForward.priorityPreserve[0]
    const topChange = carryForward.priorityChange[0]
    const works = collectBriefKeywords(brief?.whatWorks)
    const fails = collectBriefKeywords(brief?.whatFails)
    const dna = collectBriefKeywords(brief?.winnerDNA)
    const activeRefModes = [...new Set(activeRefs.map((ref) => refModeLabel(ref.mode)))]

    let title = 'Run a focused variation'
    let tone = 'neutral'
    const steps = []
    const support = []

    if (rating !== null && rating <= 2) {
      title = 'Correct the weak point, then rerun'
      tone = 'correct'
    } else if (rating !== null && rating >= 4) {
      title = 'Reinforce what is already working'
      tone = 'reinforce'
    } else if (topChange && !topPreserve) {
      title = 'Correct before widening the search'
      tone = 'correct'
    } else if (topPreserve && !topChange) {
      title = 'Push the winning direction one step further'
      tone = 'reinforce'
    }

    if (tone === 'correct') {
      if (topChange) {
        steps.push(`Fix first: ${trimSignalForAction(topChange.text)}`)
      }
      if (topPreserve) {
        steps.push(`Keep intact: ${trimSignalForAction(topPreserve.text)}`)
      } else if (works.length > 0) {
        steps.push(`Keep the project strengths: ${works.join(', ')}`)
      }
    } else {
      if (topPreserve) {
        steps.push(`Carry forward: ${trimSignalForAction(topPreserve.text)}`)
      } else if (dna.length > 0) {
        steps.push(`Lean into winner DNA: ${dna.join(', ')}`)
      }
      if (topChange) {
        steps.push(`Tighten one issue only: ${trimSignalForAction(topChange.text)}`)
      } else if (fails.length > 0) {
        steps.push(`Avoid known misses: ${fails.join(', ')}`)
      }
    }

    if (activeRefs.length > 0) {
      const refSummary = activeRefModes.length > 0 ? activeRefModes.join(', ') : `${activeRefs.length} active refs`
      steps.push(`Use active refs to steer ${refSummary.toLowerCase()}`)
    } else if (memorySignals.length > 0) {
      steps.push('Lean on saved memory and prior lessons for continuity')
    }

    if (works.length > 0) support.push(`Works: ${works.join(', ')}`)
    if (fails.length > 0) support.push(`Watch for: ${fails.join(', ')}`)
    if (currentOutput?.feedback != null) {
      support.push(`Current rating: ${getFeedbackDisplay(currentOutput.feedback).label}`)
    }

    if (steps.length === 0) {
      steps.push('Use this pass to establish one clear keep signal or one clear fix signal before widening the search')
    }

    return {
      title,
      tone,
      steps: steps.filter(Boolean).slice(0, 3),
      support: support.slice(0, 2),
    }
  }, [activeRefs, brief, carryForward, currentOutput, memorySignals])

  const operatorHandoff = useMemo(() => {
    const topPreserve = carryForward.priorityPreserve[0]
    const topChange = carryForward.priorityChange[0]
    const works = collectBriefKeywords(brief?.whatWorks)
    const fails = collectBriefKeywords(brief?.whatFails)
    const dna = collectBriefKeywords(brief?.winnerDNA)
    const activeRefModes = [...new Set(activeRefs.map((ref) => refModeLabel(ref.mode).toLowerCase()))]

    const pushCue = buildCue(
      'Push',
      topPreserve?.text || (dna.length > 0 ? `winner DNA around ${dna.join(', ')}` : works[0] ? `project strength: ${works[0]}` : '')
    )
    const protectCue = buildCue(
      'Protect',
      activeRefModes.length > 0 ? `${activeRefModes.join(' + ')} refs as the steering anchor` : works[1] || works[0] || dna[0] || ''
    )
    const avoidCue = buildCue(
      'Avoid',
      topChange?.text || (fails.length > 0 ? fails.join(', ') : '')
    )

    const cues = [pushCue, protectCue, avoidCue].filter(Boolean).slice(0, 3)
    const pills = []

    if (pushCue) pills.push(pushCue)
    if (protectCue) pills.push(protectCue)
    if (avoidCue) pills.push(avoidCue)

    if (cues.length === 0) {
      cues.push('Push: establish one clear keep signal before expanding the next pass')
    }

    return {
      line: cues.join('  ·  '),
      pills: pills.slice(0, 3),
    }
  }, [activeRefs, brief, carryForward])

  return (
    <section className="v3-intel-panel">
      <div className="v3-intel-header">
        <div className="v3-intel-header-copy">
          <span className="v3-intel-kicker">Studio Intelligence</span>
          <span className={`v3-intel-headline v3-intel-headline--${direction.tone}`}>{direction.title}</span>
        </div>
        <div className="v3-intel-headline-reasons">
          {direction.reasons.map((reason, index) => (
            <span key={`${reason}-${index}`} className="v3-intel-reason-pill">{reason}</span>
          ))}
        </div>
      </div>

      <section className={`v3-intel-next-move v3-intel-next-move--${nextMove.tone}`}>
        <div className="v3-intel-next-move-copy">
          <span className="v3-intel-next-move-kicker">Next Move</span>
          <span className="v3-intel-next-move-title">{nextMove.title}</span>
        </div>
        <div className="v3-intel-handoff">
          <span className="v3-intel-handoff-label">Operator handoff</span>
          <div className="v3-intel-handoff-line">{operatorHandoff.line}</div>
        </div>
      </section>

      <details className="v3-intel-details">
        <summary className="v3-intel-details-summary">
          <span>Show signal detail</span>
          <span className="v3-intel-details-meta">
            {carryForward.preserve.length} keep · {carryForward.change.length} fix · {outputUsage.length} used
          </span>
        </summary>

        <div className="v3-intel-next-move-steps">
          {nextMove.steps.map((step, index) => (
            <div key={`${step}-${index}`} className="v3-intel-next-move-step">
              <span className="v3-intel-next-move-step-index">{index + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>

        {nextMove.support.length > 0 && (
          <div className="v3-intel-next-move-support">
            {nextMove.support.map((item, index) => (
              <span key={`${item}-${index}`} className="v3-intel-reason-pill">{item}</span>
            ))}
          </div>
        )}

        <div className="v3-intel-handoff-pills">
          {operatorHandoff.pills.map((item, index) => (
            <span key={`${item}-${index}`} className="v3-intel-handoff-pill">{item}</span>
          ))}
        </div>

        <div className="v3-intel-grid">
          <Section title="Carrying Forward" empty="No strong keep signals yet.">
            {carryForward.preserve.length > 0 && (
              <div className="v3-intel-list">
                {carryForward.preserve.map((item, index) => (
                  <div key={`${item.text}-${index}`} className="v3-intel-item">
                    <span className="v3-intel-item-badge">{sourceLabel(item.source)}</span>
                    <span className="v3-intel-item-text">{trimText(item.text)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Correcting" empty="No active correction signals right now.">
            {carryForward.change.length > 0 && (
              <div className="v3-intel-list">
                {carryForward.change.map((item, index) => (
                  <div key={`${item.text}-${index}`} className="v3-intel-item">
                    <span className="v3-intel-item-badge v3-intel-item-badge--warn">{sourceLabel(item.source)}</span>
                    <span className="v3-intel-item-text">{trimText(item.text)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Shaping Next Iteration" empty="No active refs or memories are shaping the next pass yet.">
            {(refSignals.length > 0 || memorySignals.length > 0) && (
              <div className="v3-intel-list">
                {refSignals.map((item) => (
                  <div key={item.id} className="v3-intel-item">
                    <span className="v3-intel-item-badge">Ref</span>
                    <span className="v3-intel-item-text">{trimText(item.label, 44)}</span>
                    <span className="v3-intel-item-meta">{item.meta}</span>
                  </div>
                ))}
                {memorySignals.map((item) => (
                  <div key={`${item.label}-${item.meta}`} className="v3-intel-item">
                    <span className="v3-intel-item-badge">Memory</span>
                    <span className="v3-intel-item-text">{item.label}</span>
                    <span className="v3-intel-item-meta">{item.meta}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="This Output Used" empty="No generation receipt is available for this output yet.">
            {outputUsage.length > 0 && (
              <div className="v3-intel-list">
                {outputUsage.map((item) => (
                  <div key={`${item.label}-${item.meta}`} className="v3-intel-item">
                    <span className="v3-intel-item-badge">Used</span>
                    <span className="v3-intel-item-text">{item.label}</span>
                    <span className="v3-intel-item-meta">{item.meta}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </details>
    </section>
  )
}
