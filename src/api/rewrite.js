/**
 * Client-side API for batch feedback rewriting.
 */

/**
 * Batch cleanup — sends all notes + project context in one call.
 * @param {Array<{text: string, type: 'keep'|'fix', source: 'image'|'batch'}>} notes
 * @param {{projectName?: string, lockedElements?: string[], currentPrompt?: string}} context
 * @returns {Promise<Array<{original: string, cleaned: string}>>}
 */
export async function rewriteBatch(notes, context = {}) {
  const res = await fetch('/api/rewrite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes, context }),
  })
  if (!res.ok) throw new Error('Rewrite failed')
  const data = await res.json()
  return data.results
}
