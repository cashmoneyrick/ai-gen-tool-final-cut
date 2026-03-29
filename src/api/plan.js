/**
 * Client-side planning API.
 * Sends session/project context to the internal planning route.
 */

export async function generatePlan(context) {
  const response = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context),
  })

  const data = await response.json()

  if (!response.ok) {
    const err = new Error(data.error || `Plan generation failed (${response.status})`)
    err.status = response.status
    throw err
  }

  return data
}
