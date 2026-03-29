/**
 * Server-side AI planning handler.
 * Calls Gemini text model with structured session/project context
 * to produce a useful generation plan.
 */

const PLAN_MODEL = 'gemini-2.5-flash'

function getEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

function toNullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildPlanningPrompt(ctx) {
  const sections = []

  sections.push(`SESSION GOAL:\n${ctx.goal}`)
  sections.push(`PROJECT: ${ctx.projectName}`)

  if (ctx.approvedPlan) {
    sections.push(
      `CURRENT APPROVED PLAN:\nSummary: ${ctx.approvedPlan.summary}\n` +
      `Buckets: ${JSON.stringify(ctx.approvedPlan.buckets, null, 2)}`
    )
  }

  const filledBuckets = Object.entries(ctx.buckets || {}).filter(([, v]) => v)
  if (filledBuckets.length > 0) {
    sections.push(
      `CURRENT BUCKETS:\n${filledBuckets.map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
    )
  }

  if (ctx.assembledPrompt) {
    sections.push(`ASSEMBLED PROMPT:\n${ctx.assembledPrompt.slice(0, 500)}`)
  }

  if (ctx.lockedElements?.length > 0) {
    sections.push(
      `LOCKED ELEMENTS (always included in prompt):\n${ctx.lockedElements.map((t) => `  - ${t}`).join('\n')}`
    )
  }

  if (ctx.refs?.length > 0) {
    sections.push(
      `REFERENCE IMAGES (${ctx.refs.length}):\n${ctx.refs.map((r) => `  - ${r.name} (${r.type})`).join('\n')}`
    )
  }

  if (ctx.outputs?.length > 0) {
    sections.push(
      `RECENT OUTPUTS (${ctx.outputs.length}):\n${ctx.outputs.map((o) => {
        const prompt = o.finalPromptSent ? o.finalPromptSent.slice(0, 150) : 'unknown prompt'
        return `  - model: ${o.model || 'unknown'}, prompt: "${prompt}"${o.finishReason ? `, finish: ${o.finishReason}` : ''}`
      }).join('\n')}`
    )
  }

  if (ctx.winners?.length > 0) {
    sections.push(
      `SAVED WINNERS (${ctx.winners.length}):\n${ctx.winners.map((w) => {
        const prompt = w.finalPromptSent ? w.finalPromptSent.slice(0, 150) : 'unknown prompt'
        let line = `  - model: ${w.model || 'unknown'}, prompt: "${prompt}"`
        if (w.feedback) line += `, feedback: ${w.feedback}`
        if (w.notes) line += `, notes: "${w.notes.slice(0, 100)}"`
        return line
      }).join('\n')}`
    )
  }

  if (ctx.iterationContext) {
    sections.push(`ITERATION CONTEXT (carry-forward from winners):\n${ctx.iterationContext}`)
  }

  if (ctx.memories?.length > 0) {
    sections.push(
      `PROJECT MEMORIES (${ctx.memories.length}):\n${ctx.memories.map((m) => {
        const pin = m.pinned ? ' [PINNED]' : ''
        return `  - [${m.type}]${pin}: ${m.text}`
      }).join('\n')}`
    )
  }

  if (ctx.docs?.length > 0) {
    sections.push(
      `PROJECT DOCS (${ctx.docs.length}):\n${ctx.docs.map((d) => {
        const pin = d.pinned ? ' [PINNED]' : ''
        return `  - [${d.type}]${pin} "${d.title}":\n    ${d.text}`
      }).join('\n')}`
    )
  }

  if (ctx.sharedMemories?.length > 0) {
    sections.push(
      `SHARED MEMORIES (${ctx.sharedMemories.length} — cross-project):\n${ctx.sharedMemories.map((m) => {
        const pin = m.pinned ? ' [PINNED]' : ''
        return `  - [${m.type}]${pin}: ${m.text}`
      }).join('\n')}`
    )
  }

  if (ctx.sharedDocs?.length > 0) {
    sections.push(
      `SHARED DOCS (${ctx.sharedDocs.length} — cross-project):\n${ctx.sharedDocs.map((d) => {
        const pin = d.pinned ? ' [PINNED]' : ''
        return `  - [${d.type}]${pin} "${d.title}":\n    ${d.text}`
      }).join('\n')}`
    )
  }

  if (ctx.starterKnowledge?.length > 0) {
    const grouped = {}
    for (const entry of ctx.starterKnowledge) {
      if (!grouped[entry.kind]) grouped[entry.kind] = []
      grouped[entry.kind].push(entry)
    }

    const lines = []
    for (const [kind, entries] of Object.entries(grouped)) {
      lines.push(`  [${kind.toUpperCase()}S]`)
      for (const e of entries) {
        const tag = e.isOverride ? ' [PROJECT OVERRIDE]' : ''
        if (kind === 'rule') {
          lines.push(`    - ${e.rule}${e.notes ? ` (${e.notes})` : ''}${tag}`)
        } else if (kind === 'workflow') {
          lines.push(`    - ${e.title}: ${e.useWhen}${tag}`)
          if (e.keySteps?.length > 0) lines.push(`      Steps: ${e.keySteps.join('; ')}`)
          if (e.failureModes?.length > 0) lines.push(`      Avoid: ${e.failureModes.join('; ')}`)
        } else if (kind === 'lesson') {
          lines.push(`    - ${e.lesson}${tag}`)
          if (e.failedPattern) lines.push(`      Failed: ${e.failedPattern}`)
          if (e.betterPattern) lines.push(`      Better: ${e.betterPattern}`)
        } else if (kind === 'pattern') {
          lines.push(`    - ${e.pattern}${tag}`)
          if (e.exampleStructure) lines.push(`      Example: ${e.exampleStructure}`)
        } else if (kind === 'preference') {
          lines.push(`    - ${e.preference}${e.notes ? ` (${e.notes})` : ''}${tag}`)
        }
      }
    }
    sections.push(`STARTER KNOWLEDGE (${ctx.starterKnowledge.length} auto-selected entries):\n${lines.join('\n')}`)
  }

  if (ctx.roughNotes) {
    sections.push(`ROUGH NOTES:\n${ctx.roughNotes.slice(0, 300)}`)
  }

  return sections.join('\n\n')
}

const SYSTEM_INSTRUCTION = `You are a creative director helping plan the next image generation iteration in a studio workflow app.

You receive context about the current session: the goal, project, existing work, winners, feedback, and current prompt settings. Your job is to analyze this context and produce a structured plan that helps the user decide what to do next.

Be specific, not generic. Reference actual details from the context. If there are winners with positive feedback, identify what made them work. If there are failed or disliked outputs, suggest what to change.

If the workspace is empty (no outputs or winners yet), focus on a strong first approach based on the goal.

If there is an existing approved plan, build on it — don't start from scratch unless the goal has fundamentally changed.

If ITERATION CONTEXT is provided, treat it as the primary signal for continuity. Elements marked "preserve" come from winners the user approved — carry those settings forward into your recommended buckets. Elements marked "change" come from rejected outputs — address those issues specifically. The user expects the next iteration to build on what already worked, not start over.

If project memories are provided, treat them as explicit user lessons. Pinned memories are especially important. Success memories indicate what worked. Failure memories indicate what to avoid. Corrections and preferences should guide your recommendations.

If project docs are provided, treat them as reference material the user has written to guide creative direction. These may include briefs, style guides, or notes about the project. Use them to inform your recommendations but don't just parrot them back.

If shared memories or shared docs are provided, these are cross-project knowledge the user has chosen to activate for this project. Treat them like project-level memories and docs but recognize they represent broader, reusable lessons and references. Project-specific memories and docs should take priority when they conflict with shared knowledge.

If starter knowledge is provided, treat it as curated domain expertise for this type of image workflow. These entries represent proven rules, workflows, and anti-drift lessons learned from extensive prior work. Follow starter knowledge rules and workflows unless a project-specific memory explicitly overrides them. When starter knowledge includes anti-patterns or failure modes, actively avoid those patterns in your recommendations. Entries marked [PROJECT OVERRIDE] have been customized for this specific project and should take highest precedence.

Keep bucket values concise: 1-2 sentences each.
Keep list items (preserve, pushFurther, change, risks) to 2-4 items each. Be direct and useful.
The "approach" field should be 1-2 sentences describing the recommended strategy for the next generation.`

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: '1-2 sentence plan overview' },
    preserve: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'What is working well and should be kept (2-4 items)',
    },
    pushFurther: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'What to amplify or push further (2-4 items)',
    },
    change: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'What to reconsider, drop, or change (2-4 items)',
    },
    risks: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Tradeoffs and pitfalls to watch for (2-4 items)',
    },
    approach: {
      type: 'STRING',
      description: 'Recommended strategy for the next generation (1-2 sentences)',
    },
    buckets: {
      type: 'OBJECT',
      properties: {
        subject: { type: 'STRING', description: 'Subject description (1-2 sentences)' },
        style: { type: 'STRING', description: 'Visual style direction (1-2 sentences)' },
        lighting: { type: 'STRING', description: 'Lighting approach (1-2 sentences)' },
        composition: { type: 'STRING', description: 'Framing and composition (1-2 sentences)' },
        technical: { type: 'STRING', description: 'Technical refinements (1-2 sentences)' },
      },
      required: ['subject', 'style', 'lighting', 'composition', 'technical'],
    },
  },
  required: ['summary', 'preserve', 'pushFurther', 'change', 'risks', 'approach', 'buckets'],
}

export async function handlePlan(req, res) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not set in server environment' }))
    return
  }

  let body
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    body = JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Invalid request body' }))
    return
  }

  if (!body.goal || typeof body.goal !== 'string') {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Missing goal' }))
    return
  }

  const planModel = process.env.GEMINI_PLAN_MODEL || PLAN_MODEL
  const contextText = buildPlanningPrompt(body)

  const geminiBody = {
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        parts: [{ text: contextText }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  }

  try {
    const endpoint = getEndpoint(planModel)
    const startTime = Date.now()

    const geminiRes = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    })

    const durationMs = Date.now() - startTime

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      let message = `Gemini API error (${geminiRes.status})`
      try {
        const parsed = JSON.parse(errText)
        if (parsed.error?.message) message = parsed.error.message
      } catch {
        // use default
      }
      res.statusCode = geminiRes.status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: message }))
      return
    }

    const data = await geminiRes.json()
    const candidate = data.candidates?.[0]
    const usage = data.usageMetadata || {}
    if (!candidate?.content?.parts?.[0]?.text) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'No plan returned from Gemini' }))
      return
    }

    let plan
    try {
      plan = JSON.parse(candidate.content.parts[0].text)
    } catch {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Invalid plan format from Gemini' }))
      return
    }

    // Ensure required fields exist
    if (!plan.summary || !plan.buckets) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Incomplete plan from Gemini — missing summary or buckets' }))
      return
    }

    // Attach context metadata so the client knows what was used
    plan.contextUsed = {
      goal: body.goal ? true : false,
      projectName: body.projectName || 'Unknown',
      hasApprovedPlan: !!body.approvedPlan,
      winnersCount: body.winners?.length || 0,
      winnersWithFeedback: (body.winners || []).filter((w) => w.feedback).length,
      hasIterationContext: !!body.iterationContext,
      outputsCount: body.outputs?.length || 0,
      lockedElementsCount: body.lockedElements?.length || 0,
      refsCount: body.refs?.length || 0,
      memoriesCount: body.memories?.length || 0,
      memoriesPinned: (body.memories || []).filter((m) => m.pinned).length,
      docsCount: body.docs?.length || 0,
      docsPinned: (body.docs || []).filter((d) => d.pinned).length,
      sharedMemoriesCount: body.sharedMemories?.length || 0,
      sharedMemoriesPinned: (body.sharedMemories || []).filter((m) => m.pinned).length,
      sharedDocsCount: body.sharedDocs?.length || 0,
      sharedDocsPinned: (body.sharedDocs || []).filter((d) => d.pinned).length,
    }

    plan.planMeta = {
      model: planModel,
      durationMs,
      tokenUsage: {
        prompt: toNullableNumber(usage.promptTokenCount),
        output: toNullableNumber(usage.candidatesTokenCount),
        total: toNullableNumber(usage.totalTokenCount),
      },
      estimatedCost: null,
    }

    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(plan))
  } catch (err) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err.message || 'Server error during plan generation' }))
  }
}
