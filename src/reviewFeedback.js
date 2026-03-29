function hasStoredFeedback(record) {
  return !!record && Object.prototype.hasOwnProperty.call(record, 'feedback') && record.feedback !== undefined
}

export function getEffectiveFeedback(output, winner) {
  if (hasStoredFeedback(output)) return output.feedback ?? null
  if (hasStoredFeedback(winner)) return winner.feedback ?? null
  return null
}

export function feedbackToPreferenceType(feedback) {
  if (feedback === 'up') return 'success'
  if (feedback === 'down') return 'failure'
  return 'preference'
}

export function getFeedbackDisplay(feedback) {
  if (feedback === 'up') return { label: 'Thumbs up', icon: '👍', tone: 'up' }
  if (feedback === 'down') return { label: 'Thumbs down', icon: '👎', tone: 'down' }
  return { label: 'Neutral', icon: '○', tone: 'neutral' }
}
