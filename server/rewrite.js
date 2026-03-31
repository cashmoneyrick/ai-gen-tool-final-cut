/**
 * Batch feedback cleanup endpoint.
 * Takes messy user feedback notes and sharpens them into concise,
 * actionable image generation direction using Gemini Pro.
 *
 * Accepts multiple notes in one call with project context.
 */

const REWRITE_MODEL = 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-2.5-flash'

function getEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

const SYSTEM_INSTRUCTION = `You are a feedback sharpener for an AI image generation tool. Users give you their raw, spoken feedback about generated images. Your job is to convert each note into concise, specific, actionable direction that an image generation AI (Gemini) can follow precisely.

RULES:
1. You receive one or more feedback notes, each labeled as KEEP (preserve this) or FIX (change this), and as IMAGE-level (about one specific output) or BATCH-level (about the whole set).
2. For KEEP notes: Convert into preservation instructions. Start with what to lock in. Be specific about what worked — colors, textures, composition, style, proportions.
3. For FIX notes: Convert into change directives. Be specific about what needs to change AND what it should become. "Colors are dull" → "Increase color saturation and vibrancy, use richer primary tones."
4. Each cleaned note MUST be 80-240 characters. Short inputs should expand with specificity. Long rambling inputs should condense to essentials.
5. Keep the user's voice and intent — don't add ideas they didn't express. Only sharpen what they said.
6. Remove filler words, false starts, and repetition. Break run-on thoughts into clear directives.
7. You will receive project context (project name, locked elements, current prompt). Use this to understand WHAT is being generated so your sharpening is relevant — but don't repeat the context back.

OUTPUT FORMAT:
Return a JSON array with one object per input note, in the same order:
[{"cleaned": "sharpened text here"}, {"cleaned": "sharpened text here"}]

Output ONLY the JSON array. No commentary, no markdown fences.`

const FEW_SHOT_CONTENTS = [
  {
    role: 'user',
    parts: [{ text: `Context: Project "Nail Art Catalog", generating nail tip designs with gemstone themes.

Notes to clean up:
1. [KEEP/IMAGE] the glossy coating on the nails is really nice and the shape is finally correct they all look the same now which is what I wanted also the gemstones underneath look pretty realistic
2. [FIX/BATCH] the colors are kind of dull and boring I want something more vibrant also the background keeps changing colors I just want a flat white background every single time stop trying to get creative with the background` }],
  },
  {
    role: 'model',
    parts: [{ text: `[{"cleaned": "Lock in: glossy nail coating, consistent nail tip shape across all nails, and realistic gemstone rendering underneath each tip."},{"cleaned": "Increase color vibrancy and saturation across all nail designs. Background must be flat pure white every time — no gradients, textures, or color variations."}]` }],
  },
  {
    role: 'user',
    parts: [{ text: `Context: Project "Logo Design", generating fairy-core style logos with botanical elements.

Notes to clean up:
1. [FIX/IMAGE] I don't really like the font color I like fairy core type colors I also think there should be more flour or cutesey sort of elements a few ornaments or things like that would make it look a lot better the Font is all right honestly
2. [KEEP/BATCH] Colors and overall style/vibe are starting to get there not totally perfect though` }],
  },
  {
    role: 'model',
    parts: [{ text: `[{"cleaned": "Change font color to soft fairy-core palette (pastels, sage green, lavender). Add more decorative elements — flowers, small ornaments, whimsical details. Keep the current font style."},{"cleaned": "Lock in: current color direction and overall fairy-core aesthetic vibe. Continue refining within this style rather than changing direction."}]` }],
  },
]

export async function handleRewrite(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'POST only' }))
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'No API key configured' }))
    return
  }

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())

    // Support both old single-note format and new batch format
    const { notes, context, text, type } = body

    // Legacy single-note path (backward compat)
    if (text && type && !notes) {
      const batchNotes = [{ text, type, source: 'image' }]
      const results = await callGemini(batchNotes, {}, apiKey, REWRITE_MODEL)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ rewritten: results[0]?.cleaned || text }))
      return
    }

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Missing notes array' }))
      return
    }

    let results
    try {
      results = await callGemini(notes, context || {}, apiKey, REWRITE_MODEL)
    } catch (err) {
      console.warn('[rewrite] Pro failed, falling back to Flash:', err.message)
      results = await callGemini(notes, context || {}, apiKey, FALLBACK_MODEL)
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ results }))
  } catch (err) {
    console.error('[rewrite] Error:', err)
    res.statusCode = 500
    res.end(JSON.stringify({ error: err.message }))
  }
}

async function callGemini(notes, context, apiKey, model) {
  // Build the user prompt with rich context
  const contextParts = []
  if (context.projectName) contextParts.push(`Project: "${context.projectName}"`)
  if (context.sessionGoal) contextParts.push(`Goal: ${context.sessionGoal.slice(0, 200)}`)
  if (context.currentPrompt) contextParts.push(`Current prompt: ${context.currentPrompt.slice(0, 300)}`)
  if (context.lockedElements?.length > 0) {
    contextParts.push(`Locked constraints: ${context.lockedElements.slice(0, 3).join('; ').slice(0, 200)}`)
  }
  if (context.refNotes?.length > 0) {
    contextParts.push(`Reference image notes: ${context.refNotes.slice(0, 4).join('; ').slice(0, 300)}`)
  }
  if (context.priorDirection) {
    contextParts.push(`Prior iteration direction: ${context.priorDirection.slice(0, 400)}`)
  }

  const contextLine = contextParts.length > 0
    ? `Context:\n${contextParts.join('\n')}\n\n`
    : ''

  const notesList = notes.map((n, i) => {
    const typeLabel = (n.type === 'keep' ? 'KEEP' : 'FIX')
    const sourceLabel = (n.source === 'batch' ? 'BATCH' : 'IMAGE')
    return `${i + 1}. [${typeLabel}/${sourceLabel}] ${n.text}`
  }).join('\n')

  const userPrompt = `${contextLine}Notes to clean up:\n${notesList}`

  const endpoint = getEndpoint(model)
  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [
        ...FEW_SHOT_CONTENTS,
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error('[rewrite] Gemini error:', errText)
    throw new Error('Gemini API error')
  }

  const data = await response.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]'

  try {
    const parsed = JSON.parse(rawText)
    // Map back to original notes
    return notes.map((n, i) => ({
      original: n.text,
      cleaned: parsed[i]?.cleaned || n.text,
    }))
  } catch {
    console.error('[rewrite] Failed to parse Gemini JSON response:', rawText)
    // Fallback: return originals unchanged
    return notes.map((n) => ({ original: n.text, cleaned: n.text }))
  }
}
