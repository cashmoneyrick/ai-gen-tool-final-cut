# Phase 5: The Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator three structured production modes — 2D variation (same shape, systematic color/finish changes), 3D render (photorealistic from a 2D winner ref), and on-hand photography (styled lifestyle shot from a 3D render ref) — each executable in a single CLI call with full output tracking.

**Architecture:** A `variationPlan` object stored on the project record captures the locked base design plus every planned variant and its status. `run.js` gets four new CLI flags (`--variant-id`, `--job-type`, `--ref-output-id`, `--shot-type`) that route to job-specific prompt builders in `promptBuilder.js`. `CollectionProgress.jsx` shows plan completion when a plan exists. Knowledge base and OPERATOR.md document evaluation criteria and workflow instructions for each job type.

**Tech Stack:** Node.js ESM operator (operator/), React/Vite UI (src/), flat-file JSON via server/storage.js, Vertex AI image generation.

---

## Files

| File | Action |
|------|--------|
| `server/api.js` | Modify — add `GET/POST /api/variation-plan/:projectId` routes |
| `operator/promptBuilder.js` | Modify — add `buildVariationPrompt()`, `build3DRenderPrompt()`, `buildOnHandPrompt()` |
| `operator/run.js` | Modify — add `--variant-id`, `--job-type`, `--ref-output-id`, `--shot-type` args; variation plan reading + status update; job-type routing |
| `src/v3/CollectionProgress.jsx` | Modify — add variation plan progress section |
| `operator/nailKnowledge.md` | Modify — add 3D render and on-hand photography evaluation sections |
| `operator/OPERATOR.md` | Modify — add pipeline workflow section |

> **Task order note:** Prompt builder functions (Tasks 2–3) must exist in `promptBuilder.js` before the run.js import is updated (Task 4). Node.js ESM throws at module load if a named export is missing — building the functions first prevents this.

---

## Task 1: Variation plan data model + API

**Files:**
- Modify: `server/api.js` (around line 923 — before the `/api/operator/annotation` route)

The `variationPlan` is a plain object stored as a field on the project record. No new storage file — it persists via the existing `storage.put('projects', ...)` mechanism.

**Shape:**
```javascript
// project.variationPlan
{
  baseOutputId: string,              // output ID of the winner used as visual template
  basePrompt: string,                // locked prompt recipe (use {color} as placeholder for variant color)
  jobType: '2d-variation',           // which pipeline stage this plan drives
  variants: [
    {
      id: string,                    // 'v_001', 'v_002', etc.
      label: string,                 // 'Garnet / January'
      colorSpec: string | null,      // '#6B0F1A' — null if not a color variant
      finishOverride: string | null, // 'matte' — null = same finish as base
      status: 'pending' | 'generating' | 'generated' | 'winner',
      outputId: string | null,       // set when status becomes 'generated'
    }
  ]
}
```

- [ ] **Step 1: Find the routing block near the bottom of api.js**

```bash
grep -n "operator/annotation\|cleanUrl ===" server/api.js | tail -10
```

You will see something like:
```
923:  if (cleanUrl === '/api/operator/annotation') {
```

The new routes go BEFORE that line.

- [ ] **Step 2: Add the two variation-plan routes**

In `server/api.js`, find this exact line:
```javascript
  if (cleanUrl === '/api/operator/annotation') {
```

Insert the following block BEFORE it:
```javascript
  if (cleanUrl.startsWith('/api/variation-plan/')) {
    const vpProjectId = cleanUrl.slice('/api/variation-plan/'.length)
    if (!vpProjectId) return sendError(res, 400, 'Missing projectId')

    if (req.method === 'GET') {
      const vpProject = storage.get('projects', vpProjectId)
      if (!vpProject) return sendError(res, 404, 'Project not found')
      return sendJSON(res, 200, vpProject.variationPlan || null)
    }

    if (req.method === 'POST') {
      const vpBody = await readBody(req)
      const vpProject = storage.get('projects', vpProjectId)
      if (!vpProject) return sendError(res, 404, 'Project not found')
      storage.put('projects', { ...vpProject, variationPlan: vpBody, updatedAt: Date.now() })
      return sendJSON(res, 200, { ok: true })
    }

    return sendError(res, 405, 'GET or POST only')
  }

```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: succeeds.

- [ ] **Step 4: Manual test via curl**

Start the dev server if not already running: `npm run dev`

Get the active project ID and write a test plan:
```bash
PROJECT_ID=$(node --input-type=module <<'EOF'
import { getActiveProject } from './server/storage.js'
console.log(getActiveProject())
EOF
)
echo "Project: $PROJECT_ID"

curl -s -X POST "http://localhost:5173/api/variation-plan/${PROJECT_ID}" \
  -H 'Content-Type: application/json' \
  -d '{
    "baseOutputId":"test-base",
    "basePrompt":"Coffin nails, French tip cat eye, {color}, glossy",
    "jobType":"2d-variation",
    "variants":[
      {"id":"v_001","label":"Garnet","colorSpec":"#6B0F1A","finishOverride":null,"status":"pending","outputId":null}
    ]
  }'
```

Then read it back:
```bash
curl -s "http://localhost:5173/api/variation-plan/${PROJECT_ID}"
```

Expected: returns `{"baseOutputId":"test-base",...}` with the single variant.

Clean up:
```bash
curl -s -X POST "http://localhost:5173/api/variation-plan/${PROJECT_ID}" \
  -H 'Content-Type: application/json' -d 'null'
```

- [ ] **Step 5: Commit**

```bash
git add server/api.js
git commit -m "feat: add GET/POST /api/variation-plan/:projectId routes"
```

---

## Task 2: 2D variation prompt builder

**Files:**
- Modify: `operator/promptBuilder.js` (append after the final export, around line 783)

`buildVariationPrompt` takes the base recipe and one variant's color/finish spec and returns a complete prompt string. The base prompt uses a `{color}` placeholder where the variant's color should be injected; if no placeholder exists, the color is appended as an override.

- [ ] **Step 1: Read the end of promptBuilder.js**

```bash
tail -15 operator/promptBuilder.js
```

You will see the closing lines of `buildStructuredPrompt`. The new function goes after it.

- [ ] **Step 2: Append buildVariationPrompt**

At the very end of `operator/promptBuilder.js`, append:
```javascript

/**
 * Build a complete prompt for one 2D variation variant.
 *
 * The basePrompt should use {color} as a placeholder for the variant's color.
 * If no placeholder is found, the color is appended as an explicit override.
 *
 * @param {object} opts
 * @param {string} opts.basePrompt     - Locked base recipe from variationPlan.basePrompt
 * @param {string|null} opts.colorSpec - Hex code e.g. '#6B0F1A'
 * @param {string} opts.label          - Human label e.g. 'Garnet / January'
 * @param {string|null} opts.finishOverride - e.g. 'matte'; null keeps base finish
 */
export function buildVariationPrompt({ basePrompt, colorSpec, label, finishOverride }) {
  let prompt = basePrompt

  const colorInstruction = colorSpec
    ? `${label ? label + ' ' : ''}${colorSpec}`
    : label || ''

  if (colorInstruction) {
    if (prompt.includes('{color}')) {
      prompt = prompt.replace('{color}', colorInstruction)
    } else {
      prompt = `${prompt.trimEnd()} Color override: ${colorInstruction}.`
    }
  }

  if (finishOverride) {
    prompt = `${prompt.trimEnd()} Finish override: ${finishOverride}.`
  }

  return prompt
}
```

- [ ] **Step 3: Verify with a node test**

```bash
node --input-type=module <<'EOF'
import { buildVariationPrompt } from './operator/promptBuilder.js'

// Test 1: with {color} placeholder
const r1 = buildVariationPrompt({
  basePrompt: 'Coffin nails, French tip cat eye, {color} color, glossy',
  colorSpec: '#6B0F1A',
  label: 'Garnet',
  finishOverride: null,
})
console.log('With placeholder:', r1)
// Expected: 'Coffin nails, French tip cat eye, Garnet #6B0F1A color, glossy'

// Test 2: no placeholder, with finish override
const r2 = buildVariationPrompt({
  basePrompt: 'Coffin nails, French tip cat eye, deep burgundy, glossy',
  colorSpec: '#003366',
  label: 'Sapphire / September',
  finishOverride: 'chrome',
})
console.log('No placeholder:', r2)
// Expected: '...Color override: Sapphire / September #003366. Finish override: chrome.'
EOF
```

Expected: both print the correct prompt strings.

- [ ] **Step 4: Commit**

```bash
git add operator/promptBuilder.js
git commit -m "feat: add buildVariationPrompt to promptBuilder for 2D color/finish variations"
```

---

## Task 3: 3D render and on-hand photography prompt builders

**Files:**
- Modify: `operator/promptBuilder.js` (append after `buildVariationPrompt`)

Two new functions for the downstream pipeline stages.

- [ ] **Step 1: Append build3DRenderPrompt**

At the very end of `operator/promptBuilder.js`, append:
```javascript

/**
 * Build a complete prompt for generating a photorealistic 3D nail photograph.
 *
 * Pass the base 2D winner as a visual ref via --ref-output-id so Gemini can
 * see the design. This prompt instructs Gemini to render it photographically.
 *
 * @param {object} opts
 * @param {string} [opts.designDescription] - Text description of the nail design,
 *   e.g. 'French tip cat eye, garnet red #6B0F1A, coffin shape, long'.
 *   Pull from the 2D winner's subject/style buckets. Omit if the visual ref
 *   fully communicates the design.
 */
export function build3DRenderPrompt({ designDescription = '' }) {
  const parts = [
    'Professional product photograph of a female hand wearing press-on nails.',
    designDescription ? `Nail design: ${designDescription}.` : '',
    'Photorealistic three-dimensional render — nails appear as real physical objects with natural depth, surface texture, and light interaction.',
    'Soft studio lighting from slightly above-left. White or off-white background. No props, plates, or distracting elements.',
    'Hand viewed from above at approximately 45 degrees. Fingers spread naturally and extended. All five nails clearly visible.',
    'Sharp focus locked on nails. Slight depth-of-field falloff toward the wrist.',
    'All nails identical in shape, length, finish, and color. Cuticle area clean and product-free.',
  ]
  return parts.filter(Boolean).join(' ')
}
```

- [ ] **Step 2: Append buildOnHandPrompt**

Still at the end of `operator/promptBuilder.js`, append:
```javascript

// Shot type context descriptions
const ON_HAND_SHOT_CONTEXTS = {
  product: 'Clean white or cream background. Professional product photography. Subject is the nails — nothing competes for attention.',
  lifestyle: 'Lifestyle photograph. Natural setting: marble surface, linen fabric, or soft neutral textured background. Soft diffused natural light. Feels aspirational and calm.',
  social: 'Styled editorial social media photograph. On-trend composition. Strong negative space, intentional color palette, subtle prop (one flower, a ring, a gemstone). Aesthetically cohesive.',
}

/**
 * Build a complete prompt for a styled lifestyle or product photograph.
 *
 * Pass the 3D render winner as a visual ref via --ref-output-id. This prompt
 * instructs Gemini to place those nails in a styled scene.
 *
 * @param {object} opts
 * @param {string} [opts.designDescription] - Text description of the nail design
 * @param {'product'|'lifestyle'|'social'} [opts.shotType] - Defaults to 'product'
 * @param {string|null} [opts.background] - Optional override e.g. 'dark green velvet'
 */
export function buildOnHandPrompt({ designDescription = '', shotType = 'product', background = null }) {
  const context = ON_HAND_SHOT_CONTEXTS[shotType] || ON_HAND_SHOT_CONTEXTS.product
  const bgNote = background ? `Background: ${background}.` : ''
  const parts = [
    'Styled photograph of a female hand with press-on nails.',
    designDescription ? `Nail design: ${designDescription}.` : '',
    context,
    bgNote,
    'Nails are the primary visual focus. Natural, relaxed hand pose. Nails facing camera.',
    'No obvious digital-render quality — photograph must feel captured, not generated.',
  ]
  return parts.filter(Boolean).join(' ')
}
```

- [ ] **Step 3: Verify both functions**

```bash
node --input-type=module <<'EOF'
import { build3DRenderPrompt, buildOnHandPrompt } from './operator/promptBuilder.js'

const r3d = build3DRenderPrompt({ designDescription: 'French tip cat eye, garnet red #6B0F1A, coffin shape' })
console.log('3D render (' + r3d.length + ' chars):', r3d.slice(0, 80) + '...')

const rohProduct = buildOnHandPrompt({ shotType: 'product' })
console.log('On-hand product:', rohProduct.slice(0, 80) + '...')

const rohLifestyle = buildOnHandPrompt({
  designDescription: 'cat eye nails',
  shotType: 'lifestyle',
  background: 'white marble',
})
console.log('On-hand lifestyle:', rohLifestyle.slice(0, 80) + '...')

const rohSocial = buildOnHandPrompt({ shotType: 'social' })
console.log('On-hand social:', rohSocial.slice(0, 80) + '...')
EOF
```

Expected: all four print readable, non-empty prompts. The lifestyle one should include "white marble". The social one should mention "editorial".

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add operator/promptBuilder.js
git commit -m "feat: add build3DRenderPrompt and buildOnHandPrompt for pipeline stages"
```

---

## Task 4: Operator variation execution (run.js)

**Files:**
- Modify: `operator/run.js`

Adds four CLI args and wires them into the generation flow. The prompt builder functions added in Tasks 2–3 now exist, so the import can be updated safely.

Key insertion points:
1. ~line 37 (import): add new exports to the promptBuilder import
2. ~line 55 (arg parsing): add `--variant-id`, `--job-type`, `--ref-output-id`, `--shot-type`
3. ~line 210 (after project loads): validate + mark variant as 'generating'
4. ~line 344 (sendingRefs): inject base output / pipeline ref
5. ~line 381 (promptOverride): build job-specific prompt
6. ~line 789 (after outputs saved): mark variant as 'generated', tag output

- [ ] **Step 1: Update the promptBuilder import**

In `operator/run.js`, find this line (~line 37):
```javascript
import { buildStructuredPrompt } from './promptBuilder.js'
```

Replace with:
```javascript
import { buildStructuredPrompt, buildVariationPrompt, build3DRenderPrompt, buildOnHandPrompt } from './promptBuilder.js'
```

- [ ] **Step 2: Parse new CLI args**

In `operator/run.js`, find this block (~line 55):
```javascript
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const promptPreviewFlag = args.includes('--prompt-preview')
const isPivot = args.includes('--pivot')
function getArg(name) {
```

Add four constants directly after `const isPivot`:
```javascript
const variantId = getArg('variant-id')            // e.g. 'v_001' — run specific plan variant
const jobTypeArg = getArg('job-type')              // '2d-variation' | '3d-render' | 'on-hand'
const refOutputId = getArg('ref-output-id')        // output ID to use as primary visual ref
const shotType = getArg('shot-type') || 'product'  // 'product' | 'lifestyle' | 'social'
```

- [ ] **Step 3: Validate variation plan and mark variant as 'generating'**

In `operator/run.js`, find this line (~line 210):
```javascript
writeProgress('context', `Loading project "${project.name}"`)
```

Insert the block BEFORE that line:
```javascript
// --- Variation plan: validate and mark variant as 'generating' ---
let activeVariant = null
let variationBaseRef = null

if (variantId) {
  const plan = project.variationPlan
  if (!plan) {
    console.error(`[operator] --variant-id specified but project has no variationPlan. Create one first via POST /api/variation-plan/:projectId`)
    process.exit(1)
  }
  activeVariant = plan.variants.find((v) => v.id === variantId)
  if (!activeVariant) {
    console.error(`[operator] Variant "${variantId}" not found in plan. Available: ${plan.variants.map((v) => v.id).join(', ')}`)
    process.exit(1)
  }
  if (activeVariant.status !== 'pending') {
    console.error(`[operator] Variant "${variantId}" is already "${activeVariant.status}" — only pending variants can be run.`)
    process.exit(1)
  }

  // Mark as 'generating' immediately so concurrent runs won't pick it up
  const updatedVariants = plan.variants.map((v) =>
    v.id === variantId ? { ...v, status: 'generating' } : v
  )
  storage.put('projects', { ...project, variationPlan: { ...plan, variants: updatedVariants }, updatedAt: Date.now() })
  console.log(`[operator] Variation mode: running variant "${variantId}" — ${activeVariant.label}`)

  // Resolve the base output as a visual anchor ref
  const baseOutput = storage.get('outputs', plan.baseOutputId)
  if (baseOutput?.imagePath) {
    variationBaseRef = {
      id: `variation-base-${plan.baseOutputId}`,
      imagePath: baseOutput.imagePath,
      send: true,
      name: 'Variation Base Template',
      notes: 'Base design to replicate with variant color/finish',
      refType: 'winner',
    }
  }
}

```

- [ ] **Step 4: Inject base ref / pipeline ref into sendingRefs**

In `operator/run.js`, find this line (~line 344):
```javascript
// Refs marked for sending
const sendingRefs = allRefs.filter((r) => r.send)
```

Replace with:
```javascript
// Refs marked for sending
let sendingRefs = allRefs.filter((r) => r.send)

// In variation mode, prepend the base design as a visual anchor
if (variationBaseRef) {
  sendingRefs = [variationBaseRef, ...sendingRefs]
}

// In 3d-render or on-hand mode, prepend the specified output as pipeline input ref
if (refOutputId && !variantId) {
  const refOutput = storage.get('outputs', refOutputId)
  if (refOutput?.imagePath) {
    sendingRefs = [{
      id: `pipeline-ref-${refOutputId}`,
      imagePath: refOutput.imagePath,
      send: true,
      name: 'Pipeline Input Ref',
      notes: jobTypeArg === '3d-render'
        ? '2D design to render as photorealistic'
        : '3D render to style as lifestyle shot',
      refType: 'general',
    }, ...sendingRefs]
  } else {
    console.warn(`[operator] --ref-output-id ${refOutputId} not found or has no imagePath — skipping`)
  }
}
```

- [ ] **Step 5: Build job-specific prompt override**

In `operator/run.js`, find this line (~line 381):
```javascript
// Precedence: CLI flag > decision file > session state
const promptOverride = getArg('prompt') || decisionFile.prompt || null
```

Replace with:
```javascript
// Precedence: CLI flag > decision file > pipeline mode > session state
let promptOverride = getArg('prompt') || decisionFile.prompt || null

// In variation mode: build variant prompt from base recipe + color spec
if (activeVariant && !promptOverride) {
  promptOverride = buildVariationPrompt({
    basePrompt: project.variationPlan.basePrompt,
    colorSpec: activeVariant.colorSpec,
    label: activeVariant.label,
    finishOverride: activeVariant.finishOverride || null,
  })
  console.log(`[operator] Variation prompt built for "${activeVariant.label}": "${promptOverride.slice(0, 100)}..."`)
}

// In 3d-render mode: build photorealistic render prompt
if (jobTypeArg === '3d-render' && !promptOverride) {
  const designDesc = decisionFile.designDescription || getArg('design') || ''
  promptOverride = build3DRenderPrompt({ designDescription: designDesc })
  console.log(`[operator] 3D render prompt: "${promptOverride.slice(0, 100)}..."`)
}

// In on-hand mode: build lifestyle/product photography prompt
if (jobTypeArg === 'on-hand' && !promptOverride) {
  const designDesc = decisionFile.designDescription || getArg('design') || ''
  const bgOverride = decisionFile.background || getArg('background') || null
  promptOverride = buildOnHandPrompt({ designDescription: designDesc, shotType, background: bgOverride })
  console.log(`[operator] On-hand prompt (${shotType}): "${promptOverride.slice(0, 100)}..."`)
}
```

- [ ] **Step 6: Mark variant as 'generated' and tag outputs**

In `operator/run.js`, find this line (~line 789):
```javascript
  // --- Write last-batch.json so verbal feedback can be saved to these outputs ---
  const lastBatchPath = fileURLToPath(new URL('../data/last-batch.json', import.meta.url))
```

Insert BEFORE that line:
```javascript
  // --- Variation plan: mark variant as 'generated', tag output with variationId ---
  if (activeVariant) {
    const freshProjectForVariant = storage.get('projects', projectId) || project
    const freshPlan = freshProjectForVariant.variationPlan
    if (freshPlan) {
      const updatedVariants = freshPlan.variants.map((v) =>
        v.id === variantId ? { ...v, status: 'generated', outputId: newOutputIds[0] || null } : v
      )
      storage.put('projects', {
        ...freshProjectForVariant,
        variationPlan: { ...freshPlan, variants: updatedVariants },
        updatedAt: Date.now(),
      })
    }
    // Tag the first output with variationId so it can be found by plan later
    if (newOutputIds[0]) {
      const taggedOutput = storage.get('outputs', newOutputIds[0])
      if (taggedOutput) {
        storage.put('outputs', { ...taggedOutput, variationId: variantId, jobType: jobTypeArg || '2d-variation' })
      }
    }
    console.log(`[operator] Variant "${variantId}" (${activeVariant.label}) marked as generated`)
  }

  // Tag non-variation pipeline outputs with jobType
  if (!activeVariant && jobTypeArg && jobTypeArg !== 'general') {
    for (const outId of newOutputIds) {
      const out = storage.get('outputs', outId)
      if (out) storage.put('outputs', { ...out, jobType: jobTypeArg })
    }
  }

```

- [ ] **Step 7: Dry-run test — flag parsing**

```bash
node --env-file=.env operator/run.js --dry-run --variant-id v_001 2>&1 | head -20
```

Expected output ends with:
```
[operator] --variant-id specified but project has no variationPlan. Create one first via POST /api/variation-plan/:projectId
```

This confirms `--variant-id` is parsed and the plan check runs. (No plan exists yet — that's correct.)

- [ ] **Step 8: Dry-run test — job-type modes (no variant)**

```bash
node --env-file=.env operator/run.js --dry-run --job-type 3d-render 2>&1 | grep -E "render prompt|dry.run|3D"
```

Expected: shows `[operator] 3D render prompt: "Professional product photograph..."` then exits.

- [ ] **Step 9: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: succeeds.

- [ ] **Step 10: Commit**

```bash
git add operator/run.js
git commit -m "feat: add --variant-id/--job-type/--ref-output-id/--shot-type flags, variation execution, variant status tracking"
```

---

## Task 5: Variation progress in CollectionProgress

**Files:**
- Modify: `src/v3/CollectionProgress.jsx`
- Modify: `src/v3/ReviewConsole.css` (append styles after existing `.v3-cprog-*` block)

When the project has a `variationPlan`, show a compact completion meter below the rating histogram. Each variant is a colored slot: grey=pending, blue=generating, green=generated, dark green=winner.

- [ ] **Step 1: Replace CollectionProgress.jsx**

Replace the full contents of `src/v3/CollectionProgress.jsx` with:
```jsx
import { useMemo } from 'react'
import { normalizeFeedback } from '../reviewFeedback.js'

function VariationPlanProgress({ plan }) {
  if (!plan || !plan.variants || plan.variants.length === 0) return null

  const total = plan.variants.length
  const generated = plan.variants.filter((v) => v.status === 'generated' || v.status === 'winner').length
  const generating = plan.variants.filter((v) => v.status === 'generating').length
  const winners = plan.variants.filter((v) => v.status === 'winner').length

  return (
    <div className="v3-cprog-vplan">
      <div className="v3-cprog-vplan-row">
        <span className="v3-cprog-title">Variation Plan</span>
        <span className="v3-cprog-counts">
          {generated} of {total} generated
          {winners > 0 && ` · ${winners} winner${winners !== 1 ? 's' : ''}`}
          {generating > 0 && ` · ${generating} running`}
        </span>
      </div>
      <div className="v3-cprog-vplan-slots">
        {plan.variants.map((v) => (
          <div
            key={v.id}
            className={`v3-cprog-vplan-slot v3-cprog-vplan-slot--${v.status}`}
            title={`${v.label}: ${v.status}`}
          />
        ))}
      </div>
    </div>
  )
}

export default function CollectionProgress({ project, outputs, winners }) {
  const stats = useMemo(() => {
    const ratingCounts = [0, 0, 0, 0, 0] // index i = rating (i+1)
    let ratedCount = 0
    for (const output of outputs) {
      const r = normalizeFeedback(output.feedback)
      if (r !== null && r >= 1 && r <= 5) {
        ratingCounts[r - 1]++
        ratedCount++
      }
    }
    return { ratingCounts, ratedCount }
  }, [outputs])

  if (!project) return null

  const totalOutputs = outputs.length
  const totalWinners = winners.length
  const maxCount = Math.max(...stats.ratingCounts, 1)

  return (
    <div className="v3-cprog">
      <div className="v3-cprog-row">
        <span className="v3-cprog-title">Collection</span>
        <span className="v3-cprog-counts">
          {totalOutputs} outputs
          {totalWinners > 0 && ` · ${totalWinners} winner${totalWinners !== 1 ? 's' : ''}`}
          {stats.ratedCount > 0 && ` · ${stats.ratedCount} rated`}
        </span>
      </div>
      {stats.ratedCount > 0 && (
        <div className="v3-cprog-bars">
          {stats.ratingCounts.map((count, i) => (
            <div key={i} className="v3-cprog-bar-row">
              <span className="v3-cprog-bar-label">{i + 1}</span>
              <div className="v3-cprog-bar-track">
                <div
                  className="v3-cprog-bar-fill"
                  style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  data-rating={i + 1}
                />
              </div>
              <span className="v3-cprog-bar-count">{count || ''}</span>
            </div>
          ))}
        </div>
      )}
      <VariationPlanProgress plan={project.variationPlan} />
    </div>
  )
}
```

- [ ] **Step 2: Append variation plan CSS**

In `src/v3/ReviewConsole.css`, find the end of the CollectionProgress block (the `.v3-cprog-bar-count` closing brace). Append after it:

```css

/* ── Variation Plan Progress ─────────────────────────────────────── */

.v3-cprog-vplan {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(128,128,128,0.12);
}

.v3-cprog-vplan-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 5px;
}

.v3-cprog-vplan-slots {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.v3-cprog-vplan-slot {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.v3-cprog-vplan-slot--pending    { background: rgba(128,128,128,0.2); }
.v3-cprog-vplan-slot--generating { background: rgba(100,160,255,0.7); }
.v3-cprog-vplan-slot--generated  { background: rgba(91,140,90,0.6); }
.v3-cprog-vplan-slot--winner     { background: #5b8c5a; }
```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: succeeds.

- [ ] **Step 4: Visual verify**

With the dev server running, inject a test plan with all four statuses:
```bash
PROJECT_ID=$(node --input-type=module <<'EOF'
import { getActiveProject } from './server/storage.js'
console.log(getActiveProject())
EOF
)
curl -s -X POST "http://localhost:5173/api/variation-plan/${PROJECT_ID}" \
  -H 'Content-Type: application/json' \
  -d '{
    "baseOutputId":"fake","basePrompt":"test","jobType":"2d-variation",
    "variants":[
      {"id":"v_001","label":"Garnet","colorSpec":"#6B0F1A","status":"pending","outputId":null},
      {"id":"v_002","label":"Amethyst","colorSpec":"#9B59B6","status":"generating","outputId":null},
      {"id":"v_003","label":"Aquamarine","colorSpec":"#7FFFD4","status":"generated","outputId":"fake-out"},
      {"id":"v_004","label":"Diamond","colorSpec":"#E0E0E0","status":"winner","outputId":"fake-out2"}
    ]
  }'
```

Open `http://localhost:5173`. Open the insights panel. Verify:
- "Variation Plan: 2 of 4 generated · 1 winner · 1 running" text appears
- 4 colored slots: grey, blue, green, dark green
- Hovering a slot shows its label + status in a tooltip

Clean up test plan:
```bash
curl -s -X POST "http://localhost:5173/api/variation-plan/${PROJECT_ID}" \
  -H 'Content-Type: application/json' -d 'null'
```

- [ ] **Step 5: Commit**

```bash
git add src/v3/CollectionProgress.jsx src/v3/ReviewConsole.css
git commit -m "feat: add variation plan progress section to CollectionProgress"
```

---

## Task 6: Knowledge base + OPERATOR.md pipeline docs

**Files:**
- Modify: `operator/nailKnowledge.md` (append two evaluation sections)
- Modify: `operator/OPERATOR.md` (append pipeline workflow section)

- [ ] **Step 1: Read the end of nailKnowledge.md**

```bash
tail -10 operator/nailKnowledge.md
```

You will see the "Evaluation Output Format" section. New sections go after it.

- [ ] **Step 2: Append 3D render and on-hand evaluation sections**

At the very end of `operator/nailKnowledge.md`, append:
```markdown

## 3D Render Quality Criteria

A 3D render is a photorealistic nail photograph generated from a 2D flat design.

### Photographic Realism
- PASS: Looks like a photograph. Natural depth, surface texture, light interaction visible on nails.
- FAIL: Flat, illustrative, or CGI look. No sense of three-dimensionality. Looks painted or rendered.

### Lighting
- PASS: Soft directional light with natural shadows. Specular highlight on glossy nails. Clear depth.
- FAIL: Flat even lighting. No shadows. Overexposed. Looks like a screenshot, not a photo.

### Hand Realism
- PASS: Hand looks human — natural skin texture, normal finger proportions, subtle variation.
- FAIL: Hand looks synthetic, too perfect, distorted proportions, uncanny valley quality.

### Design Fidelity to 2D Ref
- PASS: Nail color, finish, and technique visually match the 2D input reference.
- FAIL: Color has drifted, wrong technique applied, or elements added that weren't in the 2D ref.

### Universal Quality (same as standard criteria)
- All nails same shape and consistent length
- No props or background distractions unless specified

## On-Hand Photography Quality Criteria

An on-hand photograph is a styled lifestyle or product image.

### Shot Type Fidelity

**Product shot:** Clean background (white/cream). Subject is the nails.
- FAIL: Background has color, texture, or props competing with the nails.

**Lifestyle shot:** Contextual background (marble, fabric). Aspirational, not busy.
- FAIL: Background overpowers nails. Too distracting. Doesn't feel aspirational.

**Social shot:** Editorial, styled, on-trend. Clear visual concept.
- FAIL: Generic composition. Looks like an unlabeled product shot. No visual intention.

### Nail Visibility
- PASS: All five nails clearly visible, facing camera, in focus.
- FAIL: Hand obscures nails, nails turned away, important nails out of focus.

### Design Fidelity to 3D Render Ref
- PASS: Nail design (color, finish, shape) visually consistent with the 3D render input.
- FAIL: Design has drifted in the lifestyle context — different color, wrong finish.

### Photographic Quality
- PASS: Looks like a real photograph. Could be an Instagram post or product page.
- FAIL: Clearly AI-generated artifacts, uncanny skin, over-processed look.
```

- [ ] **Step 3: Read the end of operator/OPERATOR.md**

```bash
tail -10 operator/OPERATOR.md
```

You will see the Specialized Appendix section. New pipeline section goes after it.

- [ ] **Step 4: Append pipeline section to operator/OPERATOR.md**

At the very end of `operator/OPERATOR.md`, append:
```markdown

## Pipeline Modes

The operator has three production modes for systematic collection generation. Each is a job type triggered by `--job-type`. Use these after the "searching" phase is done and a winner has been confirmed.

### Mode: 2D Variation (`--job-type 2d-variation`)

Produces systematic color/finish variants of a confirmed base design.

**Setup — create a variation plan (once per collection):**
```bash
# Find the active project ID
PROJECT_ID=$(node --input-type=module -e "import { getActiveProject } from './server/storage.js'; console.log(getActiveProject())")

# Find the winner output ID to use as base template
# (check the review UI or data/projects.json → winnerIds → find the output)

# Create the plan with all planned variants
curl -s -X POST "http://localhost:5173/api/variation-plan/${PROJECT_ID}" \
  -H 'Content-Type: application/json' \
  -d '{
    "baseOutputId": "<winner output ID>",
    "basePrompt": "<winner prompt with {color} placeholder>",
    "jobType": "2d-variation",
    "variants": [
      { "id": "v_001", "label": "Garnet / January",    "colorSpec": "#6B0F1A", "finishOverride": null, "status": "pending", "outputId": null },
      { "id": "v_002", "label": "Amethyst / February", "colorSpec": "#9B59B6", "finishOverride": null, "status": "pending", "outputId": null }
    ]
  }'
```

**Running variants:**
```bash
node --env-file=.env operator/run.js --variant-id v_001
node --env-file=.env operator/run.js --variant-id v_002
```

Each run builds the variant prompt (base recipe + color injection), sends the base winner as a visual ref, generates, and marks the variant as 'generated'. Check the insights panel in the UI for plan progress.

**Tip:** To extract `basePrompt` from a winner, read its `finalPromptSent` field from `data/outputs.json` (or via `/api/store/outputs/:id`). Replace the color reference with `{color}`.

### Mode: 3D Render (`--job-type 3d-render`)

Produces a photorealistic nail photograph from a confirmed 2D variant winner.

```bash
node --env-file=.env operator/run.js \
  --job-type 3d-render \
  --ref-output-id <2D winner output ID> \
  --design "French tip cat eye, garnet red #6B0F1A, coffin shape, long"
```

The `--ref-output-id` image is sent to Gemini as a visual anchor. The `--design` text supplements it. Evaluate results against "3D Render Quality Criteria" in `nailKnowledge.md`.

### Mode: On-Hand Photography (`--job-type on-hand`)

Produces a styled lifestyle or product photograph from a confirmed 3D render winner.

```bash
node --env-file=.env operator/run.js \
  --job-type on-hand \
  --ref-output-id <3D render output ID> \
  --shot-type lifestyle \
  --background "white marble surface"
```

Shot types: `product` (default), `lifestyle`, `social`. Evaluate against "On-Hand Photography Quality Criteria" in `nailKnowledge.md`.

### Full Pipeline Example (one zodiac sign, end to end)

```bash
# Step 1: Confirm 2D winner, create variation plan (12 variants)
# ... (Claude creates plan via POST /api/variation-plan/:projectId)

# Step 2: Run all 2D variants
node --env-file=.env operator/run.js --variant-id v_001   # Garnet / January
node --env-file=.env operator/run.js --variant-id v_002   # Amethyst / February
# ... repeat for all 12

# Step 3: For each 2D winner, generate a 3D render
node --env-file=.env operator/run.js \
  --job-type 3d-render \
  --ref-output-id <2D winner ID> \
  --design "French tip cat eye, garnet red #6B0F1A, coffin shape, long"

# Step 4: For each 3D render winner, generate on-hand shot
node --env-file=.env operator/run.js \
  --job-type on-hand \
  --ref-output-id <3D render winner ID> \
  --shot-type product
```
```

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: succeeds (no JS changes in this task).

- [ ] **Step 6: Commit**

```bash
git add operator/nailKnowledge.md operator/OPERATOR.md
git commit -m "docs: add 3D render + on-hand eval criteria and pipeline workflow to operator docs"
```

---

## Self-Review

**Spec coverage:**
- ✅ 2D variation workflow — Tasks 1, 2, 4, 5: variation plan data model + API, `buildVariationPrompt`, `--variant-id` execution with status tracking, UI progress meter
- ✅ 3D render workflow — Tasks 3, 4: `build3DRenderPrompt`, `--job-type 3d-render`, `--ref-output-id` injection
- ✅ On-hand photography workflow — Tasks 3, 4: `buildOnHandPrompt`, `--job-type on-hand`, `--shot-type` routing
- ✅ Knowledge base — Task 6: nailKnowledge.md 3D render and on-hand evaluation criteria
- ✅ Operator docs — Task 6: OPERATOR.md full pipeline section with examples

**Placeholder scan:** None found. All steps contain exact code.

**Type consistency:**
- `variationPlan.variants[].status` — `'pending' | 'generating' | 'generated' | 'winner'` — used consistently in Tasks 1, 4, 5
- `activeVariant` — `{ id, label, colorSpec, finishOverride, status, outputId }` — shape defined in Task 1, read in Task 4
- `variationBaseRef` — `{ id, imagePath, send, name, notes, refType }` — matches shape of existing `sendingRefs` entries in run.js
- `buildVariationPrompt`, `build3DRenderPrompt`, `buildOnHandPrompt` — added to promptBuilder.js in Tasks 2–3, imported in Task 4 Step 1 — correct order
- CSS classes `v3-cprog-vplan-slot--pending/generating/generated/winner` — defined in Task 5 Step 2, applied in Task 5 Step 1 JSX — consistent
- `jobTypeArg` — `string | null` from CLI `--job-type`, used in Tasks 4 Steps 4, 5, 6 — consistent
- `shotType` — defaults to `'product'`, used in `buildOnHandPrompt` in Task 4 Step 5 — consistent with `buildOnHandPrompt` parameter default in Task 3

**Task ordering note confirmed:** Tasks 2–3 (prompt builders) come before Task 4 (run.js), so the named imports added in Task 4 Step 1 exist in promptBuilder.js at the time the import line is updated. Node.js ESM will not throw.
