/**
 * Core Gemini generation logic — extracted from generate.js for reuse.
 * Used by both the HTTP handler (server/generate.js) and the operator CLI (operator/run.js).
 *
 * @param {string} prompt - The assembled prompt text.
 * @param {Array<{base64: string, mimeType: string}>} refs - Reference images as base64 payloads.
 * @param {string} model - Gemini model ID.
 * @param {string} apiKey - Gemini API key.
 * @returns {Promise<{images: Array<{base64: string, mimeType: string}>, text: string|null, metadata: object}>}
 */
export async function generateFromGemini(prompt, refs = [], model, apiKey, options = {}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  // Build Gemini-specific parts: text first, then image refs
  const parts = [{ text: prompt }]
  for (const ref of refs) {
    parts.push({
      inline_data: {
        mime_type: ref.mimeType,
        data: ref.base64,
      },
    })
  }

  // Build generationConfig with optional imageConfig + thinkingConfig
  const generationConfig = {
    responseModalities: ['TEXT', 'IMAGE'],
  }

  if (options.imageSize || options.aspectRatio) {
    generationConfig.imageConfig = {}
    if (options.imageSize) generationConfig.imageConfig.imageSize = options.imageSize
    if (options.aspectRatio) generationConfig.imageConfig.aspectRatio = options.aspectRatio
  }

  if (options.thinkingLevel && options.thinkingLevel !== 'minimal') {
    generationConfig.thinkingConfig = { thinkingLevel: options.thinkingLevel }
  }

  const geminiBody = {
    contents: [{ parts }],
    generationConfig,
  }

  // Google Search grounding (web + optional image search)
  if (options.googleSearch) {
    const searchTypes = { webSearch: {} }
    if (options.imageSearch) searchTypes.imageSearch = {}
    geminiBody.tools = [{ google_search: { searchTypes } }]
  }

  const startTime = Date.now()

  // 90-second timeout — Gemini image gen can take 15-30s, but should never hang forever
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)

  let geminiRes
  try {
    geminiRes = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  const durationMs = Date.now() - startTime

  // --- Gemini returned an HTTP error ---
  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    let message = `Gemini API error (${geminiRes.status})`
    let geminiCode = null
    let detail = null
    try {
      const parsed = JSON.parse(errText)
      if (parsed.error?.message) message = parsed.error.message
      if (parsed.error?.status) geminiCode = parsed.error.status
      detail = parsed.error?.details ? JSON.stringify(parsed.error.details).slice(0, 300) : null
    } catch {
      detail = errText.slice(0, 300)
    }

    const status = geminiRes.status
    const code = status === 429 ? 'RATE_LIMITED'
      : status === 401 || status === 403 ? 'AUTH_ERROR'
      : status === 404 ? 'MODEL_NOT_FOUND'
      : status >= 500 ? 'PROVIDER_ERROR'
      : 'API_ERROR'

    const err = new Error(message)
    err.status = status
    err.code = code
    err.retryable = status === 429 || status === 503 || status >= 500
    err.detail = geminiCode ? `geminiStatus=${geminiCode} ${detail || ''}`.trim() : detail
    throw err
  }

  // --- Gemini returned 200 but check candidates ---
  const data = await geminiRes.json()
  const candidate = data.candidates?.[0]

  const finishReason = candidate?.finishReason || null
  const blockReason = data.promptFeedback?.blockReason || null
  const safetyRatings = candidate?.safetyRatings || data.promptFeedback?.safetyRatings || null

  if (!candidate?.content?.parts) {
    const reasons = []
    if (finishReason) reasons.push(`finish=${finishReason}`)
    if (blockReason) reasons.push(`block=${blockReason}`)
    if (safetyRatings) {
      const flagged = safetyRatings.filter((r) => r.blocked || r.probability === 'HIGH')
      if (flagged.length > 0) reasons.push(`safety=${flagged.map((r) => r.category).join(',')}`)
    }
    const detail = reasons.length > 0 ? reasons.join(' ') : 'empty candidates array'

    const err = new Error(`Gemini returned no content — ${detail}`)
    err.status = 502
    err.code = 'NO_CONTENT'
    err.retryable = finishReason !== 'SAFETY' && !blockReason
    err.detail = detail
    throw err
  }

  const images = []
  let text = null

  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      const mime = part.inlineData.mimeType || part.inlineData.mime_type || 'image/png'
      images.push({ base64: part.inlineData.data, mimeType: mime })
    } else if (part.text) {
      text = part.text
    }
  }

  if (images.length === 0) {
    const err = new Error(`Gemini returned text but no images (finish=${finishReason || 'unknown'})`)
    err.status = 502
    err.code = 'NO_IMAGES'
    err.retryable = true
    err.detail = text ? `text response: "${text.slice(0, 200)}"` : null
    throw err
  }

  // Extract metadata from Gemini response
  const usage = data.usageMetadata || {}
  const metadata = {
    model,
    durationMs,
    tokenUsage: {
      prompt: usage.promptTokenCount ?? null,
      output: usage.candidatesTokenCount ?? null,
      total: usage.totalTokenCount ?? null,
    },
    finishReason,
    generatedAt: Date.now(),
  }

  return { images, text, metadata }
}
