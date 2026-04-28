/**
 * Cost estimation from Gemini token usage.
 *
 * Pricing source: https://ai.google.dev/gemini-api/docs/pricing (March 2026)
 * All prices are per 1M tokens (standard tier, not batch).
 */

import { DEFAULT_IMAGE_MODEL } from '../modelConfig'

const PRICING = {
  'gemini-2.5-flash-image': {
    inputPerM: 0.50,
    textOutputPerM: 3.00,
    imageOutputPerM: 60.00,
    imageTokens: { '512': 747, '1K': 1120, '2K': 1680, '4K': 2520 },
  },
  'gemini-3.1-flash-image-preview': {
    inputPerM: 0.50,       // $0.50 per 1M input tokens
    textOutputPerM: 3.00,  // $3.00 per 1M text output tokens
    imageOutputPerM: 60.00, // $60.00 per 1M image output tokens
    // Image token counts by size tier
    imageTokens: { '512': 747, '1K': 1120, '2K': 1680, '4K': 2520 },
  },
  'gemini-3-pro-image-preview': {
    inputPerM: 2.00,
    textOutputPerM: 12.00,
    imageOutputPerM: 120.00,
    imageTokens: { '1K': 1120, '2K': 1120, '4K': 2000 },
  },
}

// Fallback for unknown models — use Flash pricing as approximation
const DEFAULT_PRICING = PRICING[DEFAULT_IMAGE_MODEL]

/**
 * Estimate cost for a single output based on its token usage and model.
 *
 * @param {object} output - Output record with metadata.tokenUsage and model
 * @returns {number|null} Estimated cost in dollars, or null if no token data
 */
export function estimateCost(output) {
  if (!output) return null
  const meta = output.metadata || {}
  const tokens = meta.tokenUsage || {}
  if (!tokens.total && !tokens.prompt && !tokens.output) return null

  const pricing = PRICING[output.model] || DEFAULT_PRICING
  const promptTokens = tokens.prompt || 0
  const outputTokens = tokens.output || 0

  // For image generation, output tokens are primarily image tokens.
  // The API returns a combined output count — we treat it all as image output
  // since text output is negligible in image generation responses.
  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerM
  const outputCost = (outputTokens / 1_000_000) * pricing.imageOutputPerM

  return inputCost + outputCost
}

/**
 * Estimate total cost for an array of outputs.
 *
 * @param {object[]} outputs
 * @returns {{ total: number, count: number, perImage: number|null }}
 */
export function estimateBatchCost(outputs) {
  if (!outputs || outputs.length === 0) return { total: 0, count: 0, perImage: null }

  let total = 0
  let counted = 0
  for (const o of outputs) {
    const cost = estimateCost(o)
    if (cost !== null) {
      total += cost
      counted++
    }
  }

  return {
    total,
    count: counted,
    perImage: counted > 0 ? total / counted : null,
  }
}

/**
 * Format a dollar amount for display.
 * Shows 3 decimal places for amounts under $1, 2 otherwise.
 *
 * @param {number|null} amount
 * @returns {string}
 */
export function formatCost(amount) {
  if (amount === null || amount === undefined) return '--'
  if (amount === 0) return '$0.00'
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  if (amount < 1) return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(2)}`
}
