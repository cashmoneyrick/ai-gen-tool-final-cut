/**
 * Server-side Vertex AI generation handler (HTTP layer).
 * Core generation logic lives in server/gemini.js.
 *
 * Default model: Pro image generation on Vertex (gemini-3-pro-image-preview)
 * Override via GEMINI_MODEL env var for Pro path later.
 */

import { generateFromVertexAI } from './gemini.js'
import { assertVertexAIConfigured } from './vertex-auth.js'
import { AVAILABLE_IMAGE_MODELS, DEFAULT_IMAGE_MODEL, resolveImageModel } from '../src/modelConfig.js'

const DEFAULT_MODEL = DEFAULT_IMAGE_MODEL

/**
 * Send a structured error response.
 * Every error path uses this so the client always gets the same shape.
 */
function sendError(res, { status, code, message, retryable = false, detail = null }) {
  console.error(`[generate] ERROR ${status} ${code}: ${message}${detail ? ` | ${detail}` : ''}`)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: message, code, retryable, detail }))
}

/**
 * Returns available models and default model for the client.
 */
export function handleConfig(req, res) {
  const defaultModel = resolveImageModel(process.env.GEMINI_MODEL || DEFAULT_MODEL)
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ defaultModel, availableModels: AVAILABLE_IMAGE_MODELS }))
}

/**
 * Vite dev server middleware handler for POST /api/generate.
 *
 * Expects JSON body: { prompt: string, refs: [{ base64: string, mimeType: string }] }
 * Returns JSON: { images: [{ base64: string, mimeType: string }], text: string | null }
 */
export async function handleGenerate(req, res) {
  try {
    assertVertexAIConfigured()
  } catch (err) {
    return sendError(res, {
      status: err.status || 500,
      code: err.code || 'VERTEX_CONFIG_ERROR',
      message: err.message,
      retryable: err.retryable ?? false,
      detail: err.detail || null,
    })
  }

  // Read request body
  let body
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    body = JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    return sendError(res, {
      status: 400, code: 'INVALID_BODY',
      message: 'Invalid request body',
    })
  }

  const { prompt, refs = [], model: requestModel, imageSize, aspectRatio, thinkingLevel, googleSearch, imageSearch } = body
  if (!prompt || typeof prompt !== 'string') {
    return sendError(res, {
      status: 400, code: 'MISSING_PROMPT',
      message: 'Missing prompt',
    })
  }

  // Resolve model: client request > env var > default
  const model = resolveImageModel(requestModel || process.env.GEMINI_MODEL || DEFAULT_MODEL)

  // Build generation options from request body
  const options = {}
  if (imageSize) options.imageSize = imageSize
  if (aspectRatio) options.aspectRatio = aspectRatio
  if (thinkingLevel) options.thinkingLevel = thinkingLevel
  if (googleSearch) options.googleSearch = true
  if (imageSearch) options.imageSearch = true

  const optionsSummary = Object.keys(options).length > 0 ? ` opts=${JSON.stringify(options)}` : ''
  console.log(`[generate] received at ${Date.now()} model=${model} refs=${refs.length}${optionsSummary}`)

  try {
    const result = await generateFromVertexAI(prompt, refs, model, options)

    console.log(`[generate] done model=${model} refs=${refs.length} durationMs=${result.metadata.durationMs} images=${result.images.length} finish=${result.metadata.finishReason || 'unknown'}`)

    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  } catch (err) {
    if (err.name === 'AbortError') {
      return sendError(res, {
        status: 504, code: 'TIMEOUT',
        message: 'Vertex AI took too long (>90s) — try again',
        retryable: true,
      })
    }
    return sendError(res, {
      status: err.status || 500,
      code: err.code || 'SERVER_ERROR',
      message: err.message || 'Server error during generation',
      retryable: err.retryable ?? true,
      detail: err.detail || err.stack?.split('\n').slice(0, 3).join(' ') || null,
    })
  }
}
