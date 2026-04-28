/**
 * Core Google image generation logic.
 * Uses Vertex AI with Application Default Credentials (ADC).
 *
 * @param {string} prompt - The assembled prompt text.
 * @param {Array<{base64: string, mimeType: string}>} refs - Reference images as base64 payloads.
 * @param {string} model - Vertex Gemini model ID.
 * @returns {Promise<{images: Array<{base64: string, mimeType: string}>, text: string|null, metadata: object}>}
 */

import { postVertexGenerateContent } from './vertex-auth.js'
import { resolveImageModel } from '../src/modelConfig.js'

export async function generateFromVertexAI(prompt, refs = [], model, options = {}) {
  const resolvedModel = resolveImageModel(model)
  const parts = [{ text: prompt }]
  for (const ref of refs) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.base64,
      },
    })
  }

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

  const requestBody = {
    contents: [{ role: 'user', parts }],
    generationConfig,
  }

  if (options.googleSearch) {
    const searchTypes = { webSearch: {} }
    if (options.imageSearch) searchTypes.imageSearch = {}
    requestBody.tools = [{ googleSearch: { searchTypes } }]
  }

  const { response, durationMs } = await postVertexGenerateContent(resolvedModel, requestBody, { timeoutMs: 90_000 })

  if (!response.ok) {
    const errText = await response.text()
    let message = `Vertex AI error (${response.status})`
    let providerCode = null
    let detail = null
    try {
      const parsed = JSON.parse(errText)
      if (parsed.error?.message) message = parsed.error.message
      if (parsed.error?.status) providerCode = parsed.error.status
      detail = parsed.error?.details ? JSON.stringify(parsed.error.details).slice(0, 300) : null
    } catch {
      detail = errText.slice(0, 300)
    }

    const status = response.status
    const code = status === 429 ? 'RATE_LIMITED'
      : status === 401 || status === 403 ? 'AUTH_ERROR'
      : status === 404 ? 'MODEL_NOT_FOUND'
      : status >= 500 ? 'PROVIDER_ERROR'
      : 'API_ERROR'

    const err = new Error(message)
    err.status = status
    err.code = code
    err.retryable = status === 429 || status === 503 || status >= 500
    err.detail = providerCode ? `vertexStatus=${providerCode} ${detail || ''}`.trim() : detail
    throw err
  }

  const data = await response.json()
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

    const err = new Error(`Vertex AI returned no content — ${detail}`)
    err.status = 502
    err.code = 'NO_CONTENT'
    err.retryable = finishReason !== 'SAFETY' && !blockReason
    err.detail = detail
    throw err
  }

  const images = []
  let text = null

  for (const part of candidate.content.parts) {
    if (part.inlineData || part.inline_data) {
      const inline = part.inlineData || part.inline_data
      const mime = inline.mimeType || inline.mime_type || 'image/png'
      images.push({ base64: inline.data, mimeType: mime })
    } else if (part.text) {
      text = part.text
    }
  }

  if (images.length === 0) {
    const err = new Error(`Vertex AI returned text but no images (finish=${finishReason || 'unknown'})`)
    err.status = 502
    err.code = 'NO_IMAGES'
    err.retryable = true
    err.detail = text ? `text response: "${text.slice(0, 200)}"` : null
    throw err
  }

  const usage = data.usageMetadata || {}
  const metadata = {
    model: resolvedModel,
    provider: 'vertex-ai',
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
