/**
 * Rule-based pattern analysis engine.
 * Pure function — no DB access, no React.
 * Takes project outputs + winners, returns pattern insight suggestions.
 *
 * Conservative: requires minimum evidence thresholds,
 * uses counts not guesses, never claims causality.
 * Caps output to strongest insights per run.
 */

const MAX_INSIGHTS_PER_RUN = 5

// --- Helpers ---

function winnerSetForOutputs(outputs, winners) {
  const winnerOutputIds = new Set(winners.map((w) => w.outputId))
  return winnerOutputIds
}

function pct(n, total) {
  if (total === 0) return 0
  return Math.round((n / total) * 100)
}

// --- Rule 1: Model winner rate ---

function analyzeModelWinnerRate(outputs, winners) {
  const byModel = {}
  for (const o of outputs) {
    const m = o.model || 'unknown'
    if (!byModel[m]) byModel[m] = { outputs: 0, winners: 0 }
    byModel[m].outputs++
  }

  const winnerOutputIds = winnerSetForOutputs(outputs, winners)
  for (const o of outputs) {
    if (winnerOutputIds.has(o.id)) {
      const m = o.model || 'unknown'
      byModel[m].winners++
    }
  }

  // Need at least 2 models, each with ≥3 outputs
  const qualified = Object.entries(byModel).filter(([, v]) => v.outputs >= 3)
  if (qualified.length < 2) return null

  // Find best and worst
  qualified.sort((a, b) => (b[1].winners / b[1].outputs) - (a[1].winners / a[1].outputs))
  const [bestName, best] = qualified[0]
  const [worstName, worst] = qualified[qualified.length - 1]

  const bestRate = best.winners / best.outputs
  const worstRate = worst.winners / worst.outputs

  // Need ≥2x difference and best must have at least 1 winner
  if (best.winners < 1 || worstRate === 0 ? bestRate === 0 : bestRate / worstRate < 2) {
    // Also check the zero case: if worst has 0 winners and best has ≥1
    if (worst.winners > 0 || best.winners < 2) return null
  }

  const bestPct = pct(best.winners, best.outputs)
  const worstPct = pct(worst.winners, worst.outputs)

  return {
    fingerprint: `model-rate:${qualified.map(([n]) => n).sort().join(',')}`,
    suggestedType: 'preference',
    text: `So far in this project, ${bestName} has a ${bestPct}% winner rate (${best.winners}/${best.outputs}) vs ${worstName} at ${worstPct}% (${worst.winners}/${worst.outputs}).`,
    reason: 'Model performance comparison',
    evidence: {
      rule: 'model-winner-rate',
      details: Object.fromEntries(qualified.map(([name, data]) => [name, {
        outputs: data.outputs,
        winners: data.winners,
        rate: pct(data.winners, data.outputs),
      }])),
    },
  }
}

// --- Rule 2: Ref impact ---

function analyzeRefImpact(outputs, winners) {
  const winnerOutputIds = winnerSetForOutputs(outputs, winners)
  let withRefs = 0, withRefsWinners = 0
  let noRefs = 0, noRefsWinners = 0

  for (const o of outputs) {
    const hasRefs = o.sentRefs && o.sentRefs.length > 0
    if (hasRefs) {
      withRefs++
      if (winnerOutputIds.has(o.id)) withRefsWinners++
    } else {
      noRefs++
      if (winnerOutputIds.has(o.id)) noRefsWinners++
    }
  }

  if (withRefs < 2 || noRefs < 2) return null

  const withRate = withRefsWinners / withRefs
  const noRate = noRefsWinners / noRefs

  // Need ≥2x difference and at least 1 winner in the better group
  const refsHelp = withRate > noRate
  const better = refsHelp ? withRate : noRate
  const worse = refsHelp ? noRate : withRate
  if (better === 0 || (worse > 0 && better / worse < 2)) {
    if (worse > 0) return null
    // worse is 0, better must have ≥2 winners
    const betterWinners = refsHelp ? withRefsWinners : noRefsWinners
    if (betterWinners < 2) return null
  }

  const direction = refsHelp ? 'refs-help' : 'refs-hurt'
  const withPct = pct(withRefsWinners, withRefs)
  const noPct = pct(noRefsWinners, noRefs)

  const text = refsHelp
    ? `Based on current outcomes, generations with reference images have a ${withPct}% winner rate (${withRefsWinners}/${withRefs}) vs ${noPct}% without refs (${noRefsWinners}/${noRefs}).`
    : `In this project's recent history, generations without reference images are performing better: ${noPct}% winner rate (${noRefsWinners}/${noRefs}) vs ${withPct}% with refs (${withRefsWinners}/${withRefs}).`

  return {
    fingerprint: `ref-impact:${direction}`,
    suggestedType: 'preference',
    text,
    reason: 'Reference image impact comparison',
    evidence: {
      rule: 'ref-impact',
      details: {
        withRefs: { outputs: withRefs, winners: withRefsWinners, rate: withPct },
        withoutRefs: { outputs: noRefs, winners: noRefsWinners, rate: noPct },
      },
    },
  }
}

// --- Rule 3: Locked elements impact ---

function analyzeLockedElementImpact(outputs, winners) {
  const winnerOutputIds = winnerSetForOutputs(outputs, winners)
  let withLocked = 0, withLockedWinners = 0
  let noLocked = 0, noLockedWinners = 0

  for (const o of outputs) {
    const hasLocked = o.activeLockedElementsSnapshot && o.activeLockedElementsSnapshot.length > 0
    if (hasLocked) {
      withLocked++
      if (winnerOutputIds.has(o.id)) withLockedWinners++
    } else {
      noLocked++
      if (winnerOutputIds.has(o.id)) noLockedWinners++
    }
  }

  if (withLocked < 2 || noLocked < 2) return null

  const withRate = withLockedWinners / withLocked
  const noRate = noLockedWinners / noLocked

  const lockedHelp = withRate > noRate
  const better = lockedHelp ? withRate : noRate
  const worse = lockedHelp ? noRate : withRate
  if (better === 0 || (worse > 0 && better / worse < 2)) {
    if (worse > 0) return null
    const betterWinners = lockedHelp ? withLockedWinners : noLockedWinners
    if (betterWinners < 2) return null
  }

  const direction = lockedHelp ? 'locked-help' : 'locked-hurt'
  const withPct = pct(withLockedWinners, withLocked)
  const noPct = pct(noLockedWinners, noLocked)

  const text = lockedHelp
    ? `So far in this project, generations with locked elements have a ${withPct}% winner rate (${withLockedWinners}/${withLocked}) vs ${noPct}% without (${noLockedWinners}/${noLocked}).`
    : `In this project's recent history, generations without locked elements are performing better: ${noPct}% winner rate (${noLockedWinners}/${noLocked}) vs ${withPct}% with locked elements (${withLockedWinners}/${withLocked}).`

  return {
    fingerprint: `locked-impact:${direction}`,
    suggestedType: 'preference',
    text,
    reason: 'Locked elements impact comparison',
    evidence: {
      rule: 'locked-impact',
      details: {
        withLocked: { outputs: withLocked, winners: withLockedWinners, rate: withPct },
        withoutLocked: { outputs: noLocked, winners: noLockedWinners, rate: noPct },
      },
    },
  }
}

// --- Rule 4: Feedback skew ---

function analyzeFeedbackSkew(outputs) {
  let up = 0, down = 0
  for (const output of outputs) {
    if (output.feedback === 'up') up++
    else if (output.feedback === 'down') down++
  }

  const total = up + down
  if (total < 3) return null

  const upPct = pct(up, total)
  const downPct = pct(down, total)

  if (upPct >= 80) {
    return {
      fingerprint: `feedback-skew:positive`,
      suggestedType: 'success',
      text: `Based on current confirmed outcomes, ${upPct}% of rated outputs (${up}/${total}) received positive feedback. The current workflow direction is working well.`,
      reason: 'Positive feedback trend',
      evidence: {
        rule: 'feedback-skew',
        details: { thumbsUp: up, thumbsDown: down, total, upPct, downPct },
      },
    }
  }

  if (downPct >= 50) {
    return {
      fingerprint: `feedback-skew:negative`,
      suggestedType: 'warning',
      text: `In this project's recent history, ${downPct}% of rated outputs (${down}/${total}) received negative feedback. Consider revisiting the current approach.`,
      reason: 'High negative feedback rate',
      evidence: {
        rule: 'feedback-skew',
        details: { thumbsUp: up, thumbsDown: down, total, upPct, downPct },
      },
    }
  }

  return null
}

// --- Rule 5: Model + feedback ---

function analyzeModelFeedback(outputs) {
  const byModel = {}
  for (const output of outputs) {
    if (!output.feedback) continue
    const model = output.model || output.metadata?.model || 'unknown'
    if (!byModel[model]) byModel[model] = { up: 0, down: 0 }
    if (output.feedback === 'up') byModel[model].up++
    else if (output.feedback === 'down') byModel[model].down++
  }

  const results = []
  for (const [model, data] of Object.entries(byModel)) {
    const total = data.up + data.down
    if (total < 2) continue
    const downPct = pct(data.down, total)
    if (downPct >= 50) {
      results.push({
        fingerprint: `model-feedback:${model}`,
        suggestedType: 'warning',
        text: `So far in this project, ${model} has a ${downPct}% negative feedback rate (${data.down}/${total} rated outputs). Consider trying a different model.`,
        reason: 'Model-specific negative feedback',
        evidence: {
          rule: 'model-feedback',
          details: { model, thumbsUp: data.up, thumbsDown: data.down, total, downPct },
        },
      })
    }
  }

  return results
}

// --- Main analysis function ---

export function analyzePatterns({ outputs, winners, existingSuggestions }) {
  // Only use successful outputs for comparative analysis
  const successfulOutputs = outputs.filter((o) => o.status === 'succeeded' || !o.status)

  // Collect existing pattern fingerprints (any status) for dedup
  const existingFingerprints = new Set(
    (existingSuggestions || [])
      .filter((s) => s.kind === 'pattern' && s.fingerprint)
      .map((s) => s.fingerprint)
  )

  // Run all rules
  const raw = [
    analyzeModelWinnerRate(successfulOutputs, winners),
    analyzeRefImpact(successfulOutputs, winners),
    analyzeLockedElementImpact(successfulOutputs, winners),
    analyzeFeedbackSkew(successfulOutputs),
    ...analyzeModelFeedback(successfulOutputs),
  ].filter(Boolean)

  // Dedup against existing
  const fresh = raw.filter((insight) => !existingFingerprints.has(insight.fingerprint))

  // Cap to strongest insights
  // Rank: warnings first (actionable), then preferences, then success
  const typeRank = { warning: 0, preference: 1, success: 2 }
  fresh.sort((a, b) => (typeRank[a.suggestedType] ?? 9) - (typeRank[b.suggestedType] ?? 9))

  return fresh.slice(0, MAX_INSIGHTS_PER_RUN)
}
