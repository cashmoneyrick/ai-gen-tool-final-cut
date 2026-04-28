function hasStoredFeedback(record) {
  return !!record && Object.prototype.hasOwnProperty.call(record, 'feedback') && record.feedback !== undefined
}

export function getEffectiveFeedback(output, winner) {
  if (hasStoredFeedback(output)) return output.feedback ?? null
  if (hasStoredFeedback(winner)) return winner.feedback ?? null
  return null
}

/**
 * Normalize legacy 'up'/'down' feedback to numeric 1-5 scale.
 * Returns null for unrated outputs.
 */
export function normalizeFeedback(feedback) {
  if (feedback === 'up') return 4
  if (feedback === 'down') return 2
  if (typeof feedback === 'number' && feedback >= 1 && feedback <= 5) return feedback
  return null
}

export function feedbackToPreferenceType(feedback) {
  const rating = normalizeFeedback(feedback)
  if (rating >= 4) return 'success'
  if (rating <= 2) return 'failure'
  return 'preference'
}

export function getFeedbackDisplay(feedback) {
  const rating = normalizeFeedback(feedback)
  if (rating === null) return { label: 'Unrated', icon: '\u25CB', tone: 'neutral', rating: null }
  const labels = { 1: 'Not it', 2: 'Off track', 3: 'Getting close', 4: 'Almost there', 5: 'Love it' }
  const tones = { 1: 'low', 2: 'low', 3: 'mid', 4: 'high', 5: 'high' }
  return { label: labels[rating], icon: String(rating), tone: tones[rating], rating }
}
