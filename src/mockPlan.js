/**
 * Generate a mock plan loosely derived from the session goal text.
 * This is a placeholder — real AI planning comes later.
 */
export function generateMockPlan(goal) {
  const lower = goal.toLowerCase()

  // Pick a tone/direction hint from the goal
  let mood = 'clean and professional'
  if (lower.includes('dramatic') || lower.includes('bold') || lower.includes('dark')) {
    mood = 'dramatic and high-contrast'
  } else if (lower.includes('soft') || lower.includes('gentle') || lower.includes('warm')) {
    mood = 'soft and inviting'
  } else if (lower.includes('minimal') || lower.includes('simple') || lower.includes('clean')) {
    mood = 'minimal and refined'
  } else if (lower.includes('vibrant') || lower.includes('colorful') || lower.includes('bright')) {
    mood = 'vibrant and energetic'
  }

  // Extract a subject hint or use a generic one
  let subjectHint = 'the main subject'
  const words = goal.trim().split(/\s+/)
  if (words.length >= 3) {
    subjectHint = goal.trim()
  }

  return {
    summary: `Create a ${mood} image based on: "${subjectHint.slice(0, 80)}"`,
    buckets: {
      subject: subjectHint.slice(0, 120),
      style: `${mood.charAt(0).toUpperCase() + mood.slice(1)} visual style with attention to detail`,
      lighting: mood.includes('dramatic')
        ? 'Strong directional light with deep shadows and rim highlights'
        : mood.includes('soft')
          ? 'Soft diffused natural light, gentle gradients, minimal harsh shadows'
          : mood.includes('vibrant')
            ? 'Bright even lighting with saturated color temperature'
            : 'Clean balanced lighting with subtle directional key light',
      composition: 'Centered framing with intentional negative space, balanced visual weight',
      technical: 'High resolution, sharp focus on subject, controlled depth of field',
    },
  }
}
