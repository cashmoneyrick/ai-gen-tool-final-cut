import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import HoverZoom, { FullscreenZoom } from './HoverZoom'
import { MetadataBadge, MetadataPopover } from './MetadataPanel'
import { getImageUrl } from '../utils/imageUrl.js'
import { getFeedbackDisplay, normalizeFeedback } from '../reviewFeedback.js'
import {
  PROMPT_SECTION_LABELS,
  PROMPT_SECTION_ORDER,
  normalizePromptSections,
  parseStructuredPrompt,
  renderStructuredPrompt,
} from '../prompt/structuredPrompt'

function isPromptPreviewOutput(output) {
  return output?.outputKind === 'prompt-preview'
}

/* ── Rating face SVGs (frown → smile) ── */
const RATING_FACES = [
  // 1 — Bad
  <svg key="1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 8.5l2.5 1.8" />
    <path d="M16 8.5l-2.5 1.8" />
    <circle cx="9.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
    <path d="M8 17Q12 13 16 17" />
  </svg>,
  // 2 — Weak
  <svg key="2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <path d="M9 16Q12 13.5 15 16" />
  </svg>,
  // 3 — OK
  <svg key="3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <line x1="9" y1="15.5" x2="15" y2="15.5" />
  </svg>,
  // 4 — Good
  <svg key="4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <path d="M9 14Q12 17.5 15 14" />
  </svg>,
  // 5 — Great
  <svg key="5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M7.5 10.5Q9.5 8.5 11.5 10.5" />
    <path d="M12.5 10.5Q14.5 8.5 16.5 10.5" />
    <path d="M7.5 14.5Q12 19.5 16.5 14.5" />
  </svg>,
]

const REVIEW_DOCK_PLACEMENT_KEY = 'v3-review-dock-placement'
const REVIEW_DOCK_POSITION_KEY = 'v3-review-dock-position'
const REVIEW_DOCK_FLOAT_MARGIN = 12

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function readStoredDockPlacement() {
  try {
    const stored = localStorage.getItem(REVIEW_DOCK_PLACEMENT_KEY)
    return stored === 'left' || stored === 'right' || stored === 'float' ? stored : 'right'
  } catch {
    return 'right'
  }
}

function readStoredDockPosition() {
  try {
    const stored = JSON.parse(localStorage.getItem(REVIEW_DOCK_POSITION_KEY) || 'null')
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
      return stored
    }
  } catch {}
  return null
}

async function copyTextWithFallback(text) {
  const value = text || ''

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch (error) {
      console.warn('[copy-text-fallback] clipboard.writeText failed, falling back', error)
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    const copied = document.execCommand('copy')
    if (!copied) {
      throw new Error('document.execCommand("copy") returned false')
    }
  } finally {
    document.body.removeChild(textarea)
  }
}

function average(values) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatSourceLabel(count) {
  if (count <= 0) return 'No reviewed sources'
  if (count === 1) return '1 reviewed source'
  return `${count} reviewed sources`
}

function scoreNearbyOutput(item) {
  const rating = normalizeFeedback(item?.feedback) || 0
  const keepWeight = item?.notesKeep?.trim() ? 0.2 : 0
  const winnerWeight = item?.isWinner ? 0.4 : 0
  return rating + keepWeight + winnerWeight
}

function groupOutputsByBatch(outputs) {
  if (!outputs?.length) return []
  const groups = []
  let current = { createdAt: outputs[0]?.createdAt, items: [outputs[0]] }

  for (let index = 1; index < outputs.length; index += 1) {
    const item = outputs[index]
    if (item.createdAt === current.createdAt) {
      current.items.push(item)
    } else {
      groups.push(current)
      current = { createdAt: item.createdAt, items: [item] }
    }
  }

  groups.push(current)
  return groups
}

export default function ImageViewer({
  output,
  currentIndex,
  totalCount,
  onNavigate,
  onUpdateFeedback,
  onUseAsRef,
  onMarkWinner,
  isWinner,
  outputs,
  refs,
  onAddRefs,
  onRemoveRef,
  onToggleRefSend,
  onUpdateRefMode,
  onReorderRefs,
  onUpdateRefNotes,
  activeProjectId,
  onOutputSignal,
  onUpdatePromptPreviewText,
  onUsePromptPreviewAsBase,
  reviewDockStatus,
  insightsTitle = 'Open strategy and session context',
  insightsMeta = [],
  insightsContent = null,
  rotation = 0,
  onCorrectAnnotation,
  onRotate,
}) {
  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const dockRef = useRef(null)
  const dockDragRef = useRef(null)
  const [hoverActive, setHoverActive] = useState(false)
  const [mousePos, setMousePos] = useState(null)
  const [containerRect, setContainerRect] = useState(null)
  const [zoomEnabled, setZoomEnabled] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(3)
  const [imageSizeMode, setImageSizeMode] = useState('fit')
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [dockPlacement, setDockPlacement] = useState(readStoredDockPlacement)
  const [dockPosition, setDockPosition] = useState(readStoredDockPosition)
  const [promptSectionsDraft, setPromptSectionsDraft] = useState(() =>
    normalizePromptSections(
      output?.promptPreviewSections
      || output?.promptSectionsSnapshot
      || parseStructuredPrompt(output?.promptPreviewText || output?.finalPromptSent || '')
    )
  )

  const isPromptPreview = isPromptPreviewOutput(output)
  const reviewOutputs = outputs?.filter((item) => !isPromptPreviewOutput(item)) || []
  const promptDraft = useMemo(
    () => renderStructuredPrompt(promptSectionsDraft),
    [promptSectionsDraft]
  )

  const handleMouseEnter = useCallback(() => {
    if (containerRef.current) {
      setContainerRect(containerRef.current.getBoundingClientRect())
    }
    setHoverActive(true)
  }, [])

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY })
    if (containerRef.current) {
      setContainerRect(containerRef.current.getBoundingClientRect())
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoverActive(false)
    setMousePos(null)
  }, [])

  // Scroll-wheel zoom level when zoom is enabled
  const handleWheel = useCallback((e) => {
    if (!zoomEnabled) return
    e.preventDefault()
    setZoomLevel((z) => Math.max(1.5, Math.min(8, z + (e.deltaY > 0 ? -0.4 : 0.4))))
  }, [zoomEnabled])

  const getDefaultDockPosition = useCallback(() => {
    const stageRect = stageRef.current?.getBoundingClientRect()
    const dockRect = dockRef.current?.getBoundingClientRect()
    const dockWidth = dockRect?.width || 248
    const x = stageRect
      ? Math.max(REVIEW_DOCK_FLOAT_MARGIN, stageRect.width - dockWidth - REVIEW_DOCK_FLOAT_MARGIN)
      : REVIEW_DOCK_FLOAT_MARGIN
    return { x, y: REVIEW_DOCK_FLOAT_MARGIN }
  }, [])

  const clampDockPosition = useCallback((position) => {
    const stageRect = stageRef.current?.getBoundingClientRect()
    const dockRect = dockRef.current?.getBoundingClientRect()
    if (!stageRect || !dockRect) {
      return position || { x: REVIEW_DOCK_FLOAT_MARGIN, y: REVIEW_DOCK_FLOAT_MARGIN }
    }

    const maxX = Math.max(REVIEW_DOCK_FLOAT_MARGIN, stageRect.width - dockRect.width - REVIEW_DOCK_FLOAT_MARGIN)
    const maxY = Math.max(REVIEW_DOCK_FLOAT_MARGIN, stageRect.height - dockRect.height - REVIEW_DOCK_FLOAT_MARGIN)
    const next = position || getDefaultDockPosition()
    return {
      x: clamp(next.x, REVIEW_DOCK_FLOAT_MARGIN, maxX),
      y: clamp(next.y, REVIEW_DOCK_FLOAT_MARGIN, maxY),
    }
  }, [getDefaultDockPosition])

  useEffect(() => {
    try {
      localStorage.setItem(REVIEW_DOCK_PLACEMENT_KEY, dockPlacement)
    } catch {}
  }, [dockPlacement])

  useEffect(() => {
    if (!dockPosition) return
    try {
      localStorage.setItem(REVIEW_DOCK_POSITION_KEY, JSON.stringify(dockPosition))
    } catch {}
  }, [dockPosition])

  useEffect(() => {
    if (dockPlacement !== 'float') return undefined

    const syncPosition = () => {
      setDockPosition((current) => clampDockPosition(current || getDefaultDockPosition()))
    }

    const frame = window.requestAnimationFrame(syncPosition)
    window.addEventListener('resize', syncPosition)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', syncPosition)
    }
  }, [clampDockPosition, dockPlacement, getDefaultDockPosition])


  // Z key toggles fullscreen, also toggle zoom with Z when not in fullscreen
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          setFullscreenOpen((v) => !v)
        } else {
          setZoomEnabled((v) => !v)
        }
      } else if (e.key === 'f' || e.key === 'F') {
        setImageSizeMode((mode) => (mode === 'fit' ? 'large' : 'fit'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (dockPlacement !== 'float') return undefined

    const handlePointerMove = (event) => {
      const drag = dockDragRef.current
      if (!drag) return
      setDockPosition(clampDockPosition({
        x: drag.origin.x + (event.clientX - drag.start.x),
        y: drag.origin.y + (event.clientY - drag.start.y),
      }))
    }

    const handlePointerUp = () => {
      dockDragRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [clampDockPosition, dockPlacement])

  // Get previous output for A/B compare
  const reviewIndex = isPromptPreview ? -1 : reviewOutputs.findIndex((item) => item.id === output?.id)
  const prevOutput = reviewIndex > 0 ? reviewOutputs[reviewIndex - 1] : null
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < totalCount - 1
  const prevRating = normalizeFeedback(prevOutput?.feedback)

  const displayId = output?.displayId || `Output ${String(currentIndex + 1).padStart(3, '0')}`
  const time = output?.createdAt ? new Date(output.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
  const loopCheck = (() => {
    if (!output || !reviewOutputs.length || isPromptPreview) return null

    const outputMap = new Map(reviewOutputs.map((item) => [item.id, item]))
    const receipt = output.generationReceipt || {}
    const sourceIds = output.feedbackSourceIds || receipt.feedbackSourceIds || []
    const sourceOutputs = sourceIds.map((id) => outputMap.get(id)).filter(Boolean)
    const sourceRatings = sourceOutputs
      .map((item) => normalizeFeedback(item.feedback))
      .filter((value) => value !== null)
    const currentRating = normalizeFeedback(output.feedback)
    const sourceAverage = average(sourceRatings)
    const preserveCount = output.iterationSnapshot?.preserveUsed?.length || receipt.carryForwardUsed?.preserveCount || 0
    const changeCount = output.iterationSnapshot?.changeUsed?.length || receipt.carryForwardUsed?.changeCount || 0
    const refsUsed = output.sentRefs?.length || receipt.refsUsed || 0
    const memoriesUsed = output.memoriesUsed?.length || receipt.memoriesUsed?.count || 0

    let tone = 'pending'
    let title = 'Waiting on review'
    let detail = 'Rate this pass to confirm whether the last handoff improved the iteration.'

    if (currentRating !== null && sourceAverage !== null) {
      if (currentRating >= sourceAverage + 0.5) {
        tone = 'improved'
        title = 'Outcome looks stronger'
        detail = `This pass is rating above the ${formatSourceLabel(sourceOutputs.length).toLowerCase()} that shaped it.`
      } else if (currentRating <= sourceAverage - 0.5) {
        tone = 'regressed'
        title = 'Outcome looks weaker'
        detail = `This pass is rating below the ${formatSourceLabel(sourceOutputs.length).toLowerCase()} that shaped it.`
      } else {
        tone = 'steady'
        title = 'Outcome is holding steady'
        detail = 'The result is close to the prior reviewed baseline, so the next pass should tighten one variable.'
      }
    } else if (sourceOutputs.length > 0) {
      title = 'Handoff was applied'
      detail = `This pass pulled from ${formatSourceLabel(sourceOutputs.length).toLowerCase()} and is ready for comparison.`
    }

    const sourceList = sourceOutputs.slice(0, 3).map((item) => item.displayId || item.id.slice(0, 8))
    const usage = [
      preserveCount > 0 ? `${preserveCount} keep` : null,
      changeCount > 0 ? `${changeCount} fix` : null,
      refsUsed > 0 ? `${refsUsed} refs` : null,
      memoriesUsed > 0 ? `${memoriesUsed} memories` : null,
    ].filter(Boolean)

    return {
      tone,
      title,
      detail,
      sourceLabel: formatSourceLabel(sourceOutputs.length),
      sourceList,
      usage,
      currentLabel: currentRating !== null ? getFeedbackDisplay(output.feedback).label : 'Unrated',
      baselineLabel: sourceAverage !== null ? `${sourceAverage.toFixed(1)}/5 baseline` : null,
    }
  })()
  const currentRating = normalizeFeedback(output?.feedback)
  const ratingContextLabel = (() => {
    if (isPromptPreview) {
      return 'Rate whether this structured prompt is worth carrying forward.'
    }
    if (prevOutput && prevRating !== null && currentRating !== null) {
      const diff = currentRating - prevRating
      if (diff > 0) return `Compared with ${prevOutput.displayId}: ${diff}-step stronger`
      if (diff < 0) return `Compared with ${prevOutput.displayId}: ${Math.abs(diff)}-step weaker`
      return `Compared with ${prevOutput.displayId}: same rating band`
    }
    if (prevOutput && prevRating !== null) {
      return `Previous pass ${prevOutput.displayId}: ${getFeedbackDisplay(prevOutput.feedback).label}`
    }
    return '3 = close · 4 = almost there · 5 = reuse now'
  })()
  const compareNearby = (() => {
    if (!output || !reviewOutputs.length || isPromptPreview) return null

    const sameBatch = reviewOutputs.filter((item) => item.createdAt === output.createdAt)
    const cluster = sameBatch.length > 1
      ? sameBatch
      : reviewOutputs.slice(Math.max(0, reviewIndex - 1), Math.min(reviewOutputs.length, reviewIndex + 2))

    if (cluster.length <= 1) return null

    const entries = cluster.map((item) => {
      const rating = normalizeFeedback(item.feedback)
      return {
        ...item,
        rating,
        isCurrent: item.id === output.id,
        isWinner: item.id === output.id ? isWinner : false,
      }
    })

    const rated = entries.filter((item) => item.rating !== null)
    const bestRated = rated.length > 0
      ? rated.slice().sort((a, b) => scoreNearbyOutput(b) - scoreNearbyOutput(a))[0]
      : null
    const closestTarget = entries.find((item) => item.isWinner)
      || rated.filter((item) => item.rating >= 4).sort((a, b) => scoreNearbyOutput(b) - scoreNearbyOutput(a))[0]
      || entries.find((item) => item.notesKeep?.trim())
      || bestRated

    let summary = 'Review these nearby passes together before locking ratings.'
    if (bestRated?.id === output.id) {
      summary = 'This looks strongest in the nearby cluster.'
    } else if (closestTarget?.id === output.id) {
      summary = 'This looks closest to target in the nearby cluster.'
    } else if (bestRated) {
      summary = `${bestRated.displayId || 'Another output'} currently leads this nearby cluster.`
    }

    return {
      batchEntries: sameBatch.length > 1 ? entries : [],
      entries,
      summary,
      bestRatedId: bestRated?.id || null,
      targetId: closestTarget?.id || null,
      label: sameBatch.length > 1 ? 'Compare This Batch' : 'Compare Nearby',
    }
  })()
  const batchSignal = (() => {
    const batchEntries = compareNearby?.batchEntries || []
    if (batchEntries.length <= 1) return null

    const scored = batchEntries
      .map((item) => ({
        ...item,
        score: scoreNearbyOutput(item),
      }))
      .sort((a, b) => b.score - a.score)

    const ratedCount = scored.filter((item) => item.rating !== null).length
    const leader = scored[0] || null
    const runnerUp = scored[1] || null
    const leadGap = leader && runnerUp ? leader.score - runnerUp.score : null

    let tone = 'pending'
    let title = 'No clear batch leader yet'
    let detail = 'Start by rating the strongest-looking pass, then compare the rest back to it.'

    if (ratedCount === 0) {
      detail = 'Fresh batch: rate one anchor candidate first so the rest are easier to judge.'
    } else if (!leader) {
      detail = 'Keep reviewing this batch until one candidate clearly stands above the rest.'
    } else if (leadGap !== null && leadGap < 0.75) {
      tone = 'tight'
      title = 'Batch is still tight'
      detail = `${leader.displayId || 'One output'} is slightly ahead, but this batch still needs operator judgment.`
    } else {
      tone = 'leader'
      title = leader.id === output.id ? 'Current output leads this batch' : `${leader.displayId || 'One output'} leads this batch`
      detail = leader.id === output.id
        ? 'If this is the one you would reuse first, it is a strong winner candidate.'
        : 'Jump to the current batch leader before locking a winner decision.'
    }

    return {
      tone,
      title,
      detail,
      leader,
      ratedCount,
      totalCount: batchEntries.length,
      isCurrentLeader: leader?.id === output.id,
    }
  })()
  const convergenceSignal = (() => {
    if (!output || !reviewOutputs.length || isPromptPreview) return null

    const batches = groupOutputsByBatch(reviewOutputs)
    const currentBatchIndex = batches.findIndex((batch) => batch.createdAt === output.createdAt)
    if (currentBatchIndex < 0) return null

    const currentBatch = batches[currentBatchIndex]
    const previousBatch = batches[currentBatchIndex + 1]
    if (!currentBatch || !previousBatch) return null

    const summarizeBatch = (items) => {
      const ratings = items.map((item) => normalizeFeedback(item.feedback)).filter((value) => value !== null)
      const best = items
        .map((item) => ({ ...item, score: scoreNearbyOutput(item) }))
        .sort((a, b) => b.score - a.score)[0] || null

      return {
        ratedCount: ratings.length,
        totalCount: items.length,
        averageRating: average(ratings),
        best,
      }
    }

    const currentSummary = summarizeBatch(currentBatch.items)
    const previousSummary = summarizeBatch(previousBatch.items)

    let tone = 'pending'
    let title = 'Convergence not confirmed yet'
    let detail = 'Rate this batch and the one before it to see whether the direction is actually tightening.'

    if (currentSummary.ratedCount === 0) {
      detail = 'Fresh batch: rate a couple of outputs before judging whether the direction improved.'
    } else if (currentSummary.averageRating !== null && previousSummary.averageRating !== null) {
      const delta = currentSummary.averageRating - previousSummary.averageRating
      if (delta >= 0.5) {
        tone = 'improving'
        title = 'Batch is converging'
        detail = `This batch is reviewing stronger than the prior batch on the same path.`
      } else if (delta <= -0.5) {
        tone = 'stalling'
        title = 'Batch is drifting off target'
        detail = 'The current batch is reviewing weaker than the prior direction, so another iteration should likely correct course.'
      } else {
        tone = 'steady'
        title = 'Batch is holding, not clearly improving'
        detail = 'This direction is still plausible, but the latest batch does not yet show a strong step forward.'
      }
    } else if (currentSummary.best && previousSummary.best) {
      const currentBestRating = normalizeFeedback(currentSummary.best.feedback)
      const previousBestRating = normalizeFeedback(previousSummary.best.feedback)
      if (currentBestRating !== null && previousBestRating !== null && currentBestRating > previousBestRating) {
        tone = 'improving'
        title = 'Best candidate improved'
        detail = 'The strongest reviewed output in this batch looks better than the prior batch leader.'
      } else {
        tone = 'pending'
        title = 'Need a little more review to call convergence'
        detail = 'The best candidate is visible, but the batch still needs enough ratings to judge the direction confidently.'
      }
    }

    return {
      tone,
      title,
      detail,
      currentRated: `${currentSummary.ratedCount}/${currentSummary.totalCount} rated`,
      previousRated: `${previousSummary.ratedCount}/${previousSummary.totalCount} prior rated`,
      currentAverage: currentSummary.averageRating,
      previousAverage: previousSummary.averageRating,
    }
  })()
  const reviewAidSummary = (() => {
    if (batchSignal?.isCurrentLeader) return 'Current output is leading this batch.'
    if (batchSignal?.leader && !batchSignal.isCurrentLeader) {
      return `${batchSignal.leader.displayId || 'Another output'} is leading this batch.`
    }
    if (convergenceSignal?.tone === 'improving') return 'Latest batch is moving closer to target.'
    if (convergenceSignal?.tone === 'stalling') return 'Latest batch is drifting off target.'
    if (loopCheck?.tone === 'improved') return 'This pass looks stronger than its reviewed baseline.'
    if (loopCheck?.tone === 'regressed') return 'This pass looks weaker than its reviewed baseline.'
    if (compareNearby?.summary) return compareNearby.summary
    return 'Open review aids when you need compare and loop context.'
  })()
  const reviewAidMeta = [
    convergenceSignal ? `Convergence: ${convergenceSignal.title}` : null,
    batchSignal ? `Batch: ${batchSignal.ratedCount}/${batchSignal.totalCount} rated` : null,
    loopCheck ? `Loop: ${loopCheck.currentLabel}` : null,
  ].filter(Boolean).slice(0, 2)
  const hasInsights = Boolean(insightsContent || convergenceSignal || batchSignal || compareNearby || loopCheck)
  const insightsPanel = hasInsights ? (
    <section className="v3-insights-panel v3-insights-panel--rail">
      <div className="v3-insights-panel-summary">
        <div className="v3-insights-panel-copy">
          <span className="v3-insights-panel-kicker">Insights</span>
          <span className="v3-insights-panel-title">
            {(convergenceSignal || batchSignal || compareNearby || loopCheck) ? reviewAidSummary : insightsTitle}
          </span>
        </div>
        <div className="v3-insights-panel-meta">
          {reviewAidMeta.map((item) => (
            <span key={item} className="v3-insights-panel-pill">{item}</span>
          ))}
          {insightsMeta.map((item) => (
            <span key={item} className="v3-insights-panel-pill">{item}</span>
          ))}
        </div>
      </div>

      {insightsContent}

      <div className="v3-review-aids-panel">
        {convergenceSignal && (
          <div className={`v3-convergence-signal v3-convergence-signal--${convergenceSignal.tone}`}>
            <div className="v3-convergence-signal-copy">
              <span className="v3-convergence-signal-kicker">Convergence</span>
              <span className="v3-convergence-signal-title">{convergenceSignal.title}</span>
              <span className="v3-convergence-signal-detail">{convergenceSignal.detail}</span>
            </div>
            <div className="v3-convergence-signal-meta">
              <span className="v3-convergence-signal-pill">{convergenceSignal.currentRated}</span>
              <span className="v3-convergence-signal-pill">{convergenceSignal.previousRated}</span>
              {convergenceSignal.currentAverage !== null && convergenceSignal.previousAverage !== null && (
                <span className="v3-convergence-signal-pill">
                  {convergenceSignal.currentAverage.toFixed(1)} vs {convergenceSignal.previousAverage.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        )}
        {batchSignal && (
          <div className={`v3-batch-signal v3-batch-signal--${batchSignal.tone}`}>
            <div className="v3-batch-signal-copy">
              <span className="v3-batch-signal-kicker">Batch Signal</span>
              <span className="v3-batch-signal-title">{batchSignal.title}</span>
              <span className="v3-batch-signal-detail">{batchSignal.detail}</span>
            </div>
            <div className="v3-batch-signal-meta">
              <span className="v3-batch-signal-pill">{batchSignal.ratedCount}/{batchSignal.totalCount} rated</span>
              {batchSignal.leader && (
                <button
                  className={`v3-batch-signal-pill v3-batch-signal-pill--action ${batchSignal.isCurrentLeader ? 'v3-batch-signal-pill--active' : ''}`}
                  onClick={() => {
                    const leaderIndex = outputs.findIndex((item) => item.id === batchSignal.leader.id)
                    if (leaderIndex >= 0) onNavigate(leaderIndex)
                  }}
                  title={`Jump to ${batchSignal.leader.displayId || 'batch leader'}`}
                >
                  {batchSignal.isCurrentLeader ? 'Likely winner candidate' : `View ${batchSignal.leader.displayId}`}
                </button>
              )}
            </div>
          </div>
        )}
        {compareNearby && (
          <div className="v3-nearby-compare">
            <div className="v3-nearby-compare-head">
              <div className="v3-nearby-compare-copy">
                <span className="v3-nearby-compare-kicker">{compareNearby.label}</span>
                <span className="v3-nearby-compare-summary">{compareNearby.summary}</span>
              </div>
              <div className="v3-nearby-compare-tip">Pick the strongest nearby pass first, then rate relative to that anchor.</div>
            </div>
            <div className="v3-nearby-compare-row">
              {compareNearby.entries.map((item) => {
                const ratingLabel = item.rating !== null ? getFeedbackDisplay(item.feedback).label : 'Unrated'
                const isBest = compareNearby.bestRatedId === item.id
                const isTarget = compareNearby.targetId === item.id
                return (
                  <button
                    key={item.id}
                    className={`v3-nearby-card ${item.isCurrent ? 'v3-nearby-card--current' : ''} ${isBest ? 'v3-nearby-card--best' : ''}`}
                    onClick={() => onNavigate(outputs.findIndex((entry) => entry.id === item.id))}
                    title={`Jump to ${item.displayId || item.id.slice(0, 8)}`}
                  >
                    <div className="v3-nearby-card-thumb">
                      {getImageUrl(item) ? (
                        <img src={getImageUrl(item)} alt={item.displayId || ''} draggable={false} />
                      ) : (
                        <div className="v3-nearby-card-thumb-placeholder" />
                      )}
                    </div>
                    <div className="v3-nearby-card-meta">
                      <span className="v3-nearby-card-id">{item.displayId || item.id.slice(0, 8)}</span>
                      <span className="v3-nearby-card-rating">{item.rating !== null ? `${item.rating}/5` : '—'} · {ratingLabel}</span>
                    </div>
                    <div className="v3-nearby-card-tags">
                      {item.isCurrent && <span className="v3-nearby-card-tag">Current</span>}
                      {isBest && <span className="v3-nearby-card-tag v3-nearby-card-tag--best">{compareNearby.label === 'Compare This Batch' ? 'Batch Lead' : 'Best Rated'}</span>}
                      {isTarget && <span className="v3-nearby-card-tag v3-nearby-card-tag--target">Closest</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {loopCheck && (
          <div className={`v3-loop-check v3-loop-check--${loopCheck.tone}`}>
            <div className="v3-loop-check-head">
              <div className="v3-loop-check-copy">
                <span className="v3-loop-check-kicker">Loop Check</span>
                <span className="v3-loop-check-title">{loopCheck.title}</span>
              </div>
              <div className="v3-loop-check-metrics">
                <span className="v3-loop-check-pill">{loopCheck.currentLabel}</span>
                {loopCheck.baselineLabel && (
                  <span className="v3-loop-check-pill">{loopCheck.baselineLabel}</span>
                )}
              </div>
            </div>
            <div className="v3-loop-check-detail">{loopCheck.detail}</div>
            <div className="v3-loop-check-meta">
              <span>{loopCheck.sourceLabel}</span>
              {loopCheck.sourceList.length > 0 && (
                <span className="v3-loop-check-meta-line">Based on {loopCheck.sourceList.join(', ')}</span>
              )}
              {loopCheck.usage.length > 0 && (
                <span className="v3-loop-check-meta-line">Applied {loopCheck.usage.join(' · ')}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  ) : null

  const [copyState, setCopyState] = useState('idle') // 'idle' | 'copied' | 'error'
  const [metaOpen, setMetaOpen] = useState(false)
  const infoWrapRef = useRef(null)

  const handlePromptSectionChange = (sectionKey, nextValue) => {
    const nextSections = {
      ...promptSectionsDraft,
      [sectionKey]: nextValue,
    }
    setPromptSectionsDraft(nextSections)
    if (isPromptPreview && onUpdatePromptPreviewText && output?.id) {
      Promise.resolve(onUpdatePromptPreviewText(output.id, nextSections, renderStructuredPrompt(nextSections))).catch(() => {})
    }
  }

  const handleDownload = useCallback(() => {
    if (isPromptPreview) return
    if (!getImageUrl(output)) return
    const ext = output.mimeType === 'image/png' ? 'png' : 'jpg'
    const filename = `${displayId.replace(/\s+/g, '-')}-${output.id.slice(0, 8)}.${ext}`
    const link = document.createElement('a')
    link.href = getImageUrl(output)
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    if (onOutputSignal) onOutputSignal(output.id, 'save')
  }, [displayId, isPromptPreview, onOutputSignal, output])

  const handleCopy = useCallback(async () => {
    if (isPromptPreview) {
      try {
        await copyTextWithFallback(promptDraft || '')
        setCopyState('copied')
        setTimeout(() => setCopyState('idle'), 1800)
      } catch (err) {
        console.error('[copy-prompt-preview]', err)
        setCopyState('error')
        setTimeout(() => setCopyState('idle'), 1800)
      }
      return
    }
    if (!getImageUrl(output)) return
    try {
      // ClipboardItem accepts a Promise<Blob> — this preserves the user gesture
      // context through the async image conversion, which is required for
      // clipboard.write() on localhost/HTTP
      const pngBlobPromise = new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          canvas.getContext('2d').drawImage(img, 0, 0)
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png')
        }
        img.onerror = () => reject(new Error('Image load failed'))
        img.crossOrigin = 'anonymous'
        img.src = getImageUrl(output)
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlobPromise })])
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1800)
      if (onOutputSignal) onOutputSignal(output.id, 'copy')
    } catch (err) {
      console.error('[copy]', err)
      setCopyState('error')
      setTimeout(() => setCopyState('idle'), 1800)
    }
  }, [isPromptPreview, onOutputSignal, output, promptDraft])

  const handleUsePromptPreviewBase = () => {
    if (!isPromptPreview || !onUsePromptPreviewAsBase || !output?.id) return
    Promise.resolve(onUsePromptPreviewAsBase(output.id, promptSectionsDraft, promptDraft)).catch(() => {})
  }

  const handleDockPlacementChange = (placement) => {
    setDockPlacement(placement)
    if (placement === 'float') {
      window.requestAnimationFrame(() => {
        setDockPosition((current) => clampDockPosition(current || getDefaultDockPosition()))
      })
    }
  }

  const handleDockDragStart = (event) => {
    if (dockPlacement !== 'float') return
    if (event.target.closest('button')) return
    event.preventDefault()
    dockDragRef.current = {
      start: { x: event.clientX, y: event.clientY },
      origin: dockPosition || getDefaultDockPosition(),
    }
  }

  const handleDragStart = useCallback((e) => {
    if (isPromptPreview) return
    if (!getImageUrl(output)) return
    e.dataTransfer.effectAllowed = 'copy'
    // Let browser use the image as the drag preview naturally
  }, [isPromptPreview, output])

  if (!output) {
    return (
      <div className="v3-viewer">
        <div className="v3-viewer-empty">
          <div className="v3-viewer-empty-text">No outputs yet</div>
          <div className="v3-viewer-empty-sub">Generate images from Claude Code, then sync to see them here.</div>
        </div>
      </div>
    )
  }

  const selectedRating = typeof output.feedback === 'number' ? output.feedback
    : output.feedback === 'up' ? 4
    : output.feedback === 'down' ? 2
    : null
  const dockStyle = dockPlacement === 'float' && dockPosition
    ? { left: `${dockPosition.x}px`, top: `${dockPosition.y}px` }
    : undefined
  const reviewDockTone = reviewDockStatus?.trustSignal?.tone === 'error'
    ? 'error'
    : reviewDockStatus?.liveTone || 'pending'

  return (
    <div className="v3-viewer">
      <div
        ref={stageRef}
        className={`v3-review-stage v3-review-stage--dock-${dockPlacement}`}
      >
        <div className="v3-viewer-stage">
          {isPromptPreview ? (
            <div className="v3-prompt-preview-stage">
              <div className="v3-prompt-preview-card">
                <div className="v3-prompt-preview-head">
                  <div className="v3-prompt-preview-copy">
                    <span className="v3-prompt-preview-kicker">Prompt Preview</span>
                    <span className="v3-prompt-preview-id">{displayId}{time ? ` · ${time}` : ''}</span>
                  </div>
                  <MetadataBadge output={output} />
                </div>
                <div className="v3-prompt-preview-workbench">
                  <div className="v3-prompt-preview-sections">
                    {PROMPT_SECTION_ORDER.map((sectionKey) => (
                      <label
                        key={sectionKey}
                        className={`v3-prompt-preview-section-card ${sectionKey === 'technical' ? 'v3-prompt-preview-section-card--wide' : ''}`}
                      >
                        <span className="v3-prompt-preview-section-label">{PROMPT_SECTION_LABELS[sectionKey]}</span>
                        <textarea
                          className="v3-prompt-preview-editor"
                          value={promptSectionsDraft[sectionKey] || ''}
                          onChange={(event) => handlePromptSectionChange(sectionKey, event.target.value)}
                          spellCheck={false}
                          rows={sectionKey === 'technical' ? 5 : 4}
                          aria-label={`${PROMPT_SECTION_LABELS[sectionKey]} section`}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="v3-prompt-preview-final">
                    <span className="v3-prompt-preview-final-label">Final Prompt</span>
                    <pre className="v3-prompt-preview-final-text">{promptDraft}</pre>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`v3-viewer-image-area v3-viewer-image-area--${imageSizeMode} ${zoomEnabled ? 'v3-viewer-image-area--zoom' : ''}`}
              ref={containerRef}
              onMouseEnter={handleMouseEnter}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onWheel={handleWheel}
              onDoubleClick={() => setFullscreenOpen(true)}
            >
              {getImageUrl(output) && (
                <img
                  src={getImageUrl(output)}
                  alt={displayId}
                  className="v3-viewer-img"
                  style={rotation ? { transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s ease' } : undefined}
                  draggable={true}
                  onDragStart={handleDragStart}
                />
              )}
              {zoomEnabled && hoverActive && getImageUrl(output) && (
                <HoverZoom
                  imageUrl={getImageUrl(output)}
                  containerRect={containerRect}
                  mousePos={mousePos}
                  zoom={zoomLevel}
                  onZoomChange={setZoomLevel}
                  compareUrl={getImageUrl(prevOutput)}
                />
              )}
              {hasPrev && (
                <button className="v3-viewer-arrow v3-viewer-arrow-left" onClick={() => onNavigate(currentIndex - 1)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}
              {hasNext && (
                <button className="v3-viewer-arrow v3-viewer-arrow-right" onClick={() => onNavigate(currentIndex + 1)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
              )}
              <div className="v3-image-meta-overlay">
                <span className="v3-toolbar-id">{displayId}</span>
                <span className="v3-toolbar-sep">·</span>
                {time && <><span className="v3-toolbar-time">{time}</span><span className="v3-toolbar-sep">·</span></>}
                <MetadataBadge output={output} />
              </div>
            </div>
          )}
        </div>
        {isPromptPreview ? (
          <div className="v3-toolbar v3-toolbar--prompt-preview">
            <div className="v3-toolbar-row v3-toolbar-row--prompt">
              <div className="v3-prompt-review-head">
                <div className="v3-prompt-review-copy">
                  <div className="v3-toolbar-section-label">Rate this prompt</div>
                  <div className="v3-prompt-review-helper">Judge whether this prompt is worth carrying forward before generating again.</div>
                </div>
                {hasInsights && (
                  <button
                    className={`v3-tb-btn v3-tb-insights ${insightsOpen ? 'v3-tb-info--open' : ''}`}
                    onClick={() => setInsightsOpen((value) => !value)}
                    title="Open review context and studio intelligence"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v4" />
                      <path d="M12 17v4" />
                      <path d="M4.93 4.93l2.83 2.83" />
                      <path d="M16.24 16.24l2.83 2.83" />
                      <path d="M3 12h4" />
                      <path d="M17 12h4" />
                      <path d="M4.93 19.07l2.83-2.83" />
                      <path d="M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span>Insights</span>
                    {insightsMeta.length > 0 && <span className="v3-toolbar-badge">{insightsMeta[0]}</span>}
                  </button>
                )}
              </div>

              {onUpdateFeedback && (
                <div className="v3-rating-stack v3-rating-stack--prompt">
                  <div className="v3-rating-faces v3-rating-faces--prompt">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const isExact = selectedRating === n
                      const labels = ['Bad', 'Weak', 'OK', 'Good', 'Great']
                      return (
                        <button
                          key={n}
                          className={`v3-rating-face v3-rating-face--tone-${n}${isExact ? ' v3-rating-face--selected' : ''}`}
                          onClick={() => onUpdateFeedback(output.id, selectedRating === n ? null : n)}
                          title={['Bad — reject this prompt', 'Weak — major issues', 'OK — usable but needs work', 'Good — close to ready', 'Great — ready to use'][n - 1]}
                          data-label={labels[n - 1]}
                        >
                          {RATING_FACES[n - 1]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {insightsOpen && insightsPanel}

              <div className="v3-prompt-review-actions">
                <button className={`v3-tb-btn v3-tb-copy ${copyState === 'copied' ? 'v3-tb-btn--success' : ''}`} onClick={handleCopy} title="Copy to clipboard">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {copyState === 'copied' ? (
                      <polyline points="20 6 9 17 4 12" />
                    ) : (
                      <>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 0 2 2v1" />
                      </>
                    )}
                  </svg>
                  <span>{copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy'}</span>
                </button>
                <button className="v3-tb-btn v3-tb-base" onClick={handleUsePromptPreviewBase} title="Use this prompt preview as the next generation base">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  <span>Use as Next Base</span>
                </button>
                <div className="v3-tb-info-wrap" ref={infoWrapRef}>
                  <button
                    className={`v3-tb-btn v3-tb-info ${metaOpen ? 'v3-tb-info--open' : ''}`}
                    onClick={() => setMetaOpen((v) => !v)}
                    title="Generation details"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>Metadata</span>
                  </button>
                  <MetadataPopover output={output} open={metaOpen} onClose={() => setMetaOpen(false)} anchorRef={infoWrapRef} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={dockRef}
            className={`v3-toolbar v3-toolbar--rail ${dockPlacement === 'float' ? 'v3-toolbar--rail-floating' : ''}`}
            style={dockStyle}
          >
            <div className="v3-toolbar-row v3-toolbar-row--rail">
              <div
                className={`v3-review-dock-head ${dockPlacement === 'float' ? 'v3-review-dock-head--draggable' : ''}`}
                onPointerDown={handleDockDragStart}
              >
                <div className="v3-review-dock-copy">
                  <span className="v3-review-dock-kicker">Review Dock</span>
                  <span className="v3-review-dock-project">{reviewDockStatus?.projectName || 'Current project'}</span>
                </div>
                <div className="v3-review-dock-placement" role="group" aria-label="Review dock position">
                  {[
                    ['left', 'Left'],
                    ['right', 'Right'],
                    ['float', 'Float'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`v3-review-dock-placement-btn ${dockPlacement === value ? 'v3-review-dock-placement-btn--active' : ''}`}
                      onClick={() => handleDockPlacementChange(value)}
                      type="button"
                      title={value === 'float' ? 'Float and drag this review dock' : `Dock review rail on the ${label.toLowerCase()}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`v3-review-dock-status v3-review-dock-status--${reviewDockTone}`}>
                <div className="v3-review-dock-status-top">
                  <span className="v3-review-dock-status-summary">{reviewDockStatus?.compactStatusLabel || 'No outputs yet'}</span>
                  {reviewDockStatus?.projectCostLabel && (
                    <span className="v3-review-dock-status-cost">{reviewDockStatus.projectCostLabel} spent</span>
                  )}
                </div>
                <div className="v3-review-dock-status-pills">
                  {reviewDockStatus?.liveLabel && (
                    <span className={`v3-review-dock-pill v3-review-dock-pill--${reviewDockStatus.liveTone || 'pending'}`}>
                      {reviewDockStatus.liveLabel}
                    </span>
                  )}
                  {reviewDockStatus?.lastSyncLabel && (
                    <span
                      className="v3-review-dock-pill"
                      title={reviewDockStatus.lastStoreLabel || reviewDockStatus.lastSyncLabel}
                    >
                      {reviewDockStatus.lastSyncLabel}
                    </span>
                  )}
                  {reviewDockStatus?.trustSignal?.label && (
                    <span
                      className={`v3-review-dock-pill v3-review-dock-pill--${reviewDockStatus.trustSignal.tone === 'error' ? 'error' : 'recovered'}`}
                      title={reviewDockStatus.trustSignal.detail}
                    >
                      {reviewDockStatus.trustSignal.label}
                    </span>
                  )}
                  {reviewDockStatus?.promptPreviewMode && (
                    <span className="v3-review-dock-pill v3-review-dock-pill--feature">Prompt Preview On</span>
                  )}
                </div>
              </div>
              <div className="v3-toolbar-primary v3-toolbar-primary--rail">
                {output.operatorAnnotation && !output.operatorAnnotation.pass && (
                  <div className="v3-annotation-flag">
                    <span className="v3-annotation-flag-text">
                      ⚠ Claude flagged: {output.operatorAnnotation.note}
                    </span>
                    {!output.annotationCorrection ? (
                      <button
                        className="v3-annotation-correct-btn"
                        onClick={() => onCorrectAnnotation?.(output.id)}
                        title="Tell Claude this annotation was wrong"
                      >
                        Correct
                      </button>
                    ) : (
                      <span className="v3-annotation-corrected">Noted — you said this passed</span>
                    )}
                  </div>
                )}
                {onUpdateFeedback && (
                  <div className="v3-rating-stack">
                    <div className="v3-toolbar-section-label">Rate this image</div>
                    <div className="v3-rating-faces">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const isExact = selectedRating === n
                        const labels = ['Bad', 'Weak', 'OK', 'Good', 'Great']
                        return (
                          <button
                            key={n}
                            className={`v3-rating-face v3-rating-face--tone-${n}${isExact ? ' v3-rating-face--selected' : ''}`}
                            onClick={() => onUpdateFeedback(output.id, selectedRating === n ? null : n)}
                            title={['Bad — reject this output', 'Weak — major issues', 'OK — usable but needs work', 'Good — minor tweaks needed', 'Great — ready to use'][n - 1]}
                            data-label={labels[n - 1]}
                          >
                            {RATING_FACES[n - 1]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {onMarkWinner && (
                  <button
                    className={`v3-tb-btn v3-tb-winner ${isWinner ? 'v3-tb-winner--active' : ''}`}
                    onClick={() => onMarkWinner(output)}
                    title={isWinner ? 'Winner! Click to unmark' : 'Mark as winner'}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={isWinner ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" />
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                    <span>{isWinner ? 'Winner!' : 'Winner'}</span>
                  </button>
                )}
              </div>
              <div className="v3-toolbar-secondary v3-toolbar-secondary--rail">
                <div className="v3-toolbar-actions">
                  <button
                    className="v3-tb-btn v3-tb-rotate"
                    onClick={() => onRotate?.(output.id)}
                    title="Rotate image 90°"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 2v6h-6" />
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                      <path d="M3 22v-6h6" />
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    <span>Rotate</span>
                  </button>
                  <button
                    className={`v3-tb-btn v3-tb-fit ${imageSizeMode === 'fit' ? 'v3-tb-info--open' : ''}`}
                    onClick={() => setImageSizeMode((mode) => (mode === 'fit' ? 'large' : 'fit'))}
                    title={imageSizeMode === 'fit' ? 'Showing the full image. Click for a larger stage.' : 'Using a larger stage. Click to fit the full image.'}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <polyline points="21 15 21 21 15 21" />
                      <polyline points="3 9 3 3 9 3" />
                    </svg>
                    <span>{imageSizeMode === 'fit' ? 'Fit' : 'Large'}</span>
                  </button>
                  <button
                    className={`v3-tb-btn v3-tb-zoom ${zoomEnabled ? 'v3-tb-zoom--on' : ''}`}
                    onClick={() => setZoomEnabled((v) => !v)}
                    title={zoomEnabled ? 'Disable zoom lens' : 'Enable zoom lens'}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span>{zoomEnabled ? `${zoomLevel.toFixed(1)}×` : 'Zoom'}</span>
                  </button>
                  <button className={`v3-tb-btn v3-tb-copy ${copyState === 'copied' ? 'v3-tb-btn--success' : ''}`} onClick={handleCopy} title="Copy to clipboard">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {copyState === 'copied' ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 0 2 2v1" />
                        </>
                      )}
                    </svg>
                    <span>{copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy'}</span>
                  </button>
                  <button className="v3-tb-btn v3-tb-save" onClick={handleDownload} title="Save to disk">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Save</span>
                  </button>
                  <div className="v3-tb-info-wrap" ref={infoWrapRef}>
                    <button
                      className={`v3-tb-btn v3-tb-info ${metaOpen ? 'v3-tb-info--open' : ''}`}
                      onClick={() => setMetaOpen((v) => !v)}
                      title="Generation details"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <span>Metadata</span>
                    </button>
                    <MetadataPopover output={output} open={metaOpen} onClose={() => setMetaOpen(false)} anchorRef={infoWrapRef} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {fullscreenOpen && getImageUrl(output) && (
        <FullscreenZoom imageUrl={getImageUrl(output)} onClose={() => setFullscreenOpen(false)} />
      )}

    </div>
  )
}
