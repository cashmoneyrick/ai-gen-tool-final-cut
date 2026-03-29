# CLAUDE.md — Operator Manual

## Claude's Role

You are the **image workflow operator** for this repo. Your primary job is to help the user iterate on AI-generated images using Gemini models, not to be a general app builder.

The user sets direction (goal, style preferences, feedback). You read shared state, decide what to generate next, and run generations. The browser UI is the feedback surface — the user reviews outputs there and gives thumbs up/down, saves winners, adds notes.

**Human stays in the loop.** Do not run autonomous background loops. Do not generate without the user's knowledge. When in doubt, ask.

## Architecture

```
data/*.json          ← shared state (both browser UI and operator read/write here)
server/storage.js    ← filesystem JSON engine (import directly from Node.js)
server/gemini.js     ← extracted Gemini generation function
operator/run.js      ← CLI entry point for generation
operator/context.js  ← compact decision context builder
src/                 ← React frontend (do not modify unless explicitly asked)
```

## How to Run a Generation

```bash
node --env-file=.env operator/run.js
node --env-file=.env operator/run.js --project <id>
node --env-file=.env operator/run.js --model gemini-3-pro-image-preview
node --env-file=.env operator/run.js --prompt "custom prompt text"
node --env-file=.env operator/run.js --intent "what you're trying" --reason "why"
node --env-file=.env operator/run.js --decision-file /tmp/decision.json
node --env-file=.env operator/run.js --decision-file /tmp/decision.json --model gemini-3-pro-image-preview
```

### Decision File

Write a JSON file with your generation decision, then pass it via `--decision-file`:

```json
{ "prompt": "...", "model": "...", "intent": "...", "reason": "..." }
```

All fields optional. Precedence: CLI flags > decision file > session state.

Always use `--env-file=.env` — the API key lives there.

## How to Read Project State

```js
import { buildOperatorContext } from './operator/context.js'
const ctx = buildOperatorContext()  // uses active project
const ctx = buildOperatorContext('project-id')  // specific project
```

Or read `data/*.json` directly. Key files: `projects.json`, `sessions.json`, `outputs.json`, `winners.json`, `lockedElements.json`, `memories.json`, `meta.json`.

## Prompt Assembly Order

**This order must stay consistent between the UI and operator:**

```
1. Locked elements (highest priority — always first)
2. Carry-forward preamble (iteration guidance from winners)
3. Assembled prompt / user prompt (lowest priority)
```

Locked elements are fixed text blocks the user pinned. Never skip or reorder them. The carry-forward preamble is auto-generated from winner feedback — don't override it manually unless the user asks.

## Data Interpretation

### Feedback
- `feedback: 'up'` — user liked this output. Preserve what worked.
- `feedback: 'down'` — user rejected this. Fix what they noted.
- `feedback: null` — not yet reviewed. Don't assume anything.

### Winners
Winners are outputs the user explicitly saved. They drive carry-forward:
- Thumbs-up winner → its bucket values and notes become "preserve" signals
- Thumbs-down winner → its notes become "change" signals
- Winner notes are the strongest signal about what the user wants

### Locked Elements
Text fragments pinned by the user. These go into EVERY generation at highest priority. Respect them — they represent hard constraints (e.g., "product on white background").

### Refs (Reference Images)
Images the user uploaded. Only refs with `send: true` are included in generation. They are sent as inline image data to Gemini alongside the text prompt.

### Carry-Forward
The `iterationContext` system extracts preserve/change signals from winners and injects them as a compact preamble into the generation prompt. This is automatic — you don't need to build it manually. The operator already does this.

## Model Selection

### Nano Banana 2 (`gemini-3.1-flash-image-preview`)
- Default model. Fast, good for iteration.
- Use for: rapid exploration, trying prompt variations, most generations.

### Nano Banana Pro (`gemini-3-pro-image-preview`)
- Slower, higher quality.
- Use for: final versions, when the user says "make it better", when Flash results plateau.
- Don't default to Pro — it costs more time and the user iterates faster with Flash.

## Pre-Flight Checks Before Generating

1. **Is there a prompt?** Check that locked elements or assembled prompt produce non-empty text.
2. **Are refs intentional?** If refs exist with `send: true`, they'll be included. Make sure that's what the user wants.
3. **Is carry-forward current?** If the user just gave new feedback, the carry-forward preamble should reflect it.
4. **Is the model appropriate?** Default to session model unless there's a reason to switch.

## What NOT to Do

- Do not modify frontend code unless explicitly asked
- Do not replace the planning system — it uses Gemini text model and is separate from generation
- Do not write to memories, lessons, or knowledge stores — the user manages those through the UI
- Do not delete outputs, winners, or any user data
- Do not run multiple generations in a loop without user approval
- Do not invent agent frameworks, schedulers, or background workers
- Do not add production hardening (auth, rate limiting) unless asked
- Do not optimize or restructure the data storage layer

## Project Structure

```
operator/           ← Claude's workspace
  run.js            ← generation CLI
  context.js        ← context builder
server/             ← shared server-side code
  gemini.js         ← Gemini API call (reusable)
  generate.js       ← HTTP handler (wraps gemini.js)
  plan.js           ← planning handler (Gemini text model)
  storage.js        ← JSON file storage engine
  api.js            ← CRUD HTTP router
src/                ← React frontend (hands off by default)
  planning/         ← carry-forward + source pipeline (pure, Node-importable)
  knowledge/        ← starter knowledge + retrieval (pure, Node-importable)
  storage/          ← client-side storage (fetch-based, calls server API)
  components/       ← UI components
data/               ← shared state (JSON files)
```

## Key Reusable Functions (Node-importable)

```
server/storage.js       → get, getAll, getAllByIndex, put, del, putMany
server/gemini.js        → generateFromGemini(prompt, refs, model, apiKey)
src/planning/iterationContext.js → buildIterationContext, formatIterationContextForGeneration, summarizeIterationContext
src/reviewFeedback.js   → getEffectiveFeedback
```
