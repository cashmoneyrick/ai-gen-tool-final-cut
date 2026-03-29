/**
 * Client-side generation API.
 * Provider-agnostic — sends prompt + refs to the internal server route.
 * All provider-specific logic lives in server/generate.js.
 */

/**
 * Read a File or Blob as a base64 string (data portion only).
 * Works with both fresh File uploads and persisted Blobs from IndexedDB.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Fetch available models and default model from the server.
 */
export async function fetchConfig() {
  const response = await fetch('/api/config')
  if (!response.ok) throw new Error('Failed to load config')
  return response.json()
}

/**
 * Convert refs (File/Blob) to base64 payloads for transport.
 * Call once and pass the result to multiple generateImages() calls
 * to avoid redundant base64 conversion in batch scenarios.
 *
 * @param {Array} refs - Array of ref objects with { file, blob, type }.
 * @returns {Promise<Array<{ base64: string, mimeType: string }>>}
 */
export async function prepareRefs(refs = []) {
  return Promise.all(
    refs.map(async (ref) => ({
      base64: await blobToBase64(ref.file || ref.blob),
      mimeType: ref.type,
    }))
  )
}

/**
 * Generate images by sending prompt + refs to the internal API route.
 *
 * @param {string} prompt - The assembled prompt text.
 * @param {Array} refs - Array of ref objects with { file, type } OR pre-converted { base64, mimeType } payloads.
 * @param {string} [model] - Optional model ID to use for generation.
 * @returns {Promise<{ images: Array<{ dataUrl: string, mimeType: string }>, text: string | null, metadata: object | null }>}
 */
export async function generateImages(prompt, refs = [], model) {
  // Accept pre-converted payloads (have .base64) or raw refs (have .file/.blob)
  const refPayloads = refs.length > 0 && refs[0].base64
    ? refs
    : await prepareRefs(refs)

  const body = { prompt, refs: refPayloads }
  if (model) body.model = model

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (!response.ok) {
    const err = new Error(data.error || `Generation failed (${response.status})`)
    err.status = response.status
    err.code = data.code || 'UNKNOWN'
    err.retryable = data.retryable ?? false
    err.detail = data.detail || null
    throw err
  }

  // Convert server base64 responses to data URLs for the UI
  const images = data.images.map((img) => ({
    dataUrl: `data:${img.mimeType};base64,${img.base64}`,
    mimeType: img.mimeType,
  }))

  return { images, text: data.text, metadata: data.metadata || null }
}
