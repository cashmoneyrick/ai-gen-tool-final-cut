# Phase 6: Pipeline Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase 5 pipeline usable from the app UI so Rick can create a variation plan, run planned variants, and launch 3D/on-hand pipeline jobs without curl or terminal commands.

**Architecture:** Keep the existing Phase 5 backend and operator logic. Add small pure helpers for variation-plan parsing/progress and operator-run argument construction, then wire a compact `PipelinePanel` into the existing review insights panel. The UI writes `project.variationPlan` through the existing `/api/variation-plan/:projectId` route and starts jobs through `/api/operator/run`.

**Tech Stack:** React/Vite frontend, Node.js ESM dev-server API, flat-file JSON storage, existing `operator/run.js` pipeline flags.

---

## Files

| File | Action |
|------|--------|
| `src/pipeline/variationPlan.js` | Create — pure helpers for variant rows, plan creation, and progress derivation |
| `src/pipeline/variationPlan.test.mjs` | Create — Node assertion tests for variation-plan helpers |
| `src/api/pipeline.js` | Create — small fetch wrapper for variation-plan and operator-run API calls |
| `server/operatorArgs.js` | Create — pure helper to build `node operator/run.js` args from `/api/operator/run` body |
| `server/operatorArgs.test.mjs` | Create — Node assertion tests for operator arg helper |
| `server/api.js` | Modify — use `buildOperatorRunArgs()` so browser-triggered runs support pipeline flags |
| `src/v3/PipelinePanel.jsx` | Create — compact UI for plan creation and pipeline job starts |
| `src/v3/ReviewConsole.jsx` | Modify — render `PipelinePanel` inside insights content |
| `src/App.jsx` | Modify — keep `projects[].variationPlan` fresh after UI saves a plan |
| `src/v3/ReviewConsole.css` | Modify — add scoped `.v3-pipeline-*` styles |
| `DEVLOG.md` | Modify — record Phase 6 plan execution when complete |

---

## Task 1: Pure Variation-Plan Helpers

**Files:**
- Create: `src/pipeline/variationPlan.js`
- Create: `src/pipeline/variationPlan.test.mjs`

- [ ] **Step 1: Create the failing helper tests**

Create `src/pipeline/variationPlan.test.mjs`:

```javascript
import assert from 'node:assert/strict'
import {
  parseVariantRows,
  buildVariationPlan,
  deriveVariationProgress,
} from './variationPlan.js'

const rows = parseVariantRows(`
Garnet / January | #6B0F1A | glossy
Amethyst / February | #9B59B6
Diamond / April
`)

assert.deepEqual(rows, [
  {
    id: 'v_001',
    label: 'Garnet / January',
    colorSpec: '#6B0F1A',
    finishOverride: 'glossy',
    status: 'pending',
    outputId: null,
  },
  {
    id: 'v_002',
    label: 'Amethyst / February',
    colorSpec: '#9B59B6',
    finishOverride: null,
    status: 'pending',
    outputId: null,
  },
  {
    id: 'v_003',
    label: 'Diamond / April',
    colorSpec: null,
    finishOverride: null,
    status: 'pending',
    outputId: null,
  },
])

assert.throws(
  () => parseVariantRows(' | #ffffff'),
  /Variant line 1 is missing a label/
)

const plan = buildVariationPlan({
  baseOutputId: 'out-base',
  basePrompt: 'Coffin nails, {color}, glossy',
  variantRows: rows,
})

assert.equal(plan.baseOutputId, 'out-base')
assert.equal(plan.basePrompt, 'Coffin nails, {color}, glossy')
assert.equal(plan.jobType, '2d-variation')
assert.equal(plan.variants.length, 3)

const progress = deriveVariationProgress({
  plan: {
    ...plan,
    variants: [
      { ...plan.variants[0], status: 'generated', outputId: 'out-garnet' },
      { ...plan.variants[1], status: 'generating', outputId: null },
      { ...plan.variants[2], status: 'generated', outputId: 'out-diamond' },
    ],
  },
  outputs: [
    { id: 'out-garnet', variationId: 'v_001' },
    { id: 'out-diamond', variationId: 'v_003' },
  ],
  winners: [
    { id: 'winner-1', outputId: 'out-diamond' },
  ],
})

assert.equal(progress.total, 3)
assert.equal(progress.generated, 2)
assert.equal(progress.generating, 1)
assert.equal(progress.winners, 1)
assert.equal(progress.variants[2].status, 'winner')

console.log('variationPlan helper tests passed')
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node src/pipeline/variationPlan.test.mjs
```

Expected: FAIL with module/function not found because `src/pipeline/variationPlan.js` does not exist yet.

- [ ] **Step 3: Create the helper implementation**

Create `src/pipeline/variationPlan.js`:

```javascript
export function parseVariantRows(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [labelPart, colorPart = '', finishPart = ''] = line.split('|').map((part) => part.trim())
      if (!labelPart) {
        throw new Error(`Variant line ${index + 1} is missing a label`)
      }
      return {
        id: `v_${String(index + 1).padStart(3, '0')}`,
        label: labelPart,
        colorSpec: colorPart || null,
        finishOverride: finishPart || null,
        status: 'pending',
        outputId: null,
      }
    })
}

export function buildVariationPlan({ baseOutputId, basePrompt, variantRows }) {
  if (!baseOutputId) throw new Error('Choose a base output first')
  if (!String(basePrompt || '').trim()) throw new Error('Base prompt is required')
  if (!Array.isArray(variantRows) || variantRows.length === 0) {
    throw new Error('Add at least one variant row')
  }

  return {
    baseOutputId,
    basePrompt: String(basePrompt).trim(),
    jobType: '2d-variation',
    variants: variantRows,
  }
}

export function deriveVariationProgress({ plan, outputs = [], winners = [] }) {
  if (!plan || !Array.isArray(plan.variants) || plan.variants.length === 0) {
    return {
      total: 0,
      generated: 0,
      generating: 0,
      winners: 0,
      variants: [],
    }
  }

  const winnerOutputIds = new Set(winners.map((winner) => winner.outputId || winner.id))
  const outputIdByVariationId = new Map(
    outputs
      .filter((output) => output.variationId)
      .map((output) => [output.variationId, output.id])
  )

  const variants = plan.variants.map((variant) => {
    const outputId = variant.outputId || outputIdByVariationId.get(variant.id) || null
    const status = outputId && winnerOutputIds.has(outputId) ? 'winner' : variant.status
    return { ...variant, outputId, status }
  })

  return {
    total: variants.length,
    generated: variants.filter((variant) => variant.status === 'generated' || variant.status === 'winner').length,
    generating: variants.filter((variant) => variant.status === 'generating').length,
    winners: variants.filter((variant) => variant.status === 'winner').length,
    variants,
  }
}

export function getNextPendingVariant(plan) {
  return plan?.variants?.find((variant) => variant.status === 'pending') || null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node src/pipeline/variationPlan.test.mjs
```

Expected: PASS and prints `variationPlan helper tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/variationPlan.js src/pipeline/variationPlan.test.mjs
git commit -m "feat: add variation plan helpers"
```

---

## Task 2: Refactor CollectionProgress To Use Shared Progress Helper

**Files:**
- Modify: `src/v3/CollectionProgress.jsx`
- Test: `src/pipeline/variationPlan.test.mjs`

- [ ] **Step 1: Replace inline progress derivation with helper import**

In `src/v3/CollectionProgress.jsx`, add this import:

```javascript
import { deriveVariationProgress } from '../pipeline/variationPlan.js'
```

Replace the whole `VariationPlanProgress` function with:

```jsx
function VariationPlanProgress({ plan, outputs, winners }) {
  const progress = deriveVariationProgress({ plan, outputs, winners })
  if (progress.total === 0) return null

  return (
    <div className="v3-cprog-vplan">
      <div className="v3-cprog-vplan-row">
        <span className="v3-cprog-title">Variation Plan</span>
        <span className="v3-cprog-counts">
          {progress.generated} of {progress.total} generated
          {progress.winners > 0 && ` · ${progress.winners} winner${progress.winners !== 1 ? 's' : ''}`}
          {progress.generating > 0 && ` · ${progress.generating} running`}
        </span>
      </div>
      <div className="v3-cprog-vplan-slots">
        {progress.variants.map((variant) => (
          <div
            key={variant.id}
            className={`v3-cprog-vplan-slot v3-cprog-vplan-slot--${variant.status}`}
            title={`${variant.label}: ${variant.status}`}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run helper and component lint checks**

```bash
node src/pipeline/variationPlan.test.mjs
npx eslint src/v3/CollectionProgress.jsx
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/v3/CollectionProgress.jsx
git commit -m "refactor: share variation progress derivation"
```

---

## Task 3: Browser-Triggered Operator Pipeline Args

**Files:**
- Create: `server/operatorArgs.js`
- Create: `server/operatorArgs.test.mjs`
- Modify: `server/api.js`

- [ ] **Step 1: Create the failing operator-args tests**

Create `server/operatorArgs.test.mjs`:

```javascript
import assert from 'node:assert/strict'
import { buildOperatorRunArgs } from './operatorArgs.js'

assert.deepEqual(
  buildOperatorRunArgs({
    projectId: 'project-1',
    model: 'gemini-3-pro-image-preview',
    promptPreview: true,
  }),
  [
    '--env-file=.env',
    'operator/run.js',
    '--project',
    'project-1',
    '--model',
    'gemini-3-pro-image-preview',
    '--prompt-preview',
  ]
)

assert.deepEqual(
  buildOperatorRunArgs({
    projectId: 'project-1',
    variantId: 'v_001',
    jobType: '2d-variation',
    batch: 1,
  }),
  [
    '--env-file=.env',
    'operator/run.js',
    '--project',
    'project-1',
    '--variant-id',
    'v_001',
    '--job-type',
    '2d-variation',
    '--batch',
    '1',
  ]
)

assert.deepEqual(
  buildOperatorRunArgs({
    projectId: 'project-1',
    jobType: 'on-hand',
    refOutputId: 'out-3d',
    shotType: 'lifestyle',
    design: 'cat eye nails',
    background: 'white marble',
  }),
  [
    '--env-file=.env',
    'operator/run.js',
    '--project',
    'project-1',
    '--job-type',
    'on-hand',
    '--ref-output-id',
    'out-3d',
    '--shot-type',
    'lifestyle',
    '--design',
    'cat eye nails',
    '--background',
    'white marble',
  ]
)

console.log('operatorArgs tests passed')
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node server/operatorArgs.test.mjs
```

Expected: FAIL with module/function not found because `server/operatorArgs.js` does not exist yet.

- [ ] **Step 3: Create the operator-args helper**

Create `server/operatorArgs.js`:

```javascript
function addValueArg(args, flag, value) {
  if (value === undefined || value === null || value === '') return
  args.push(flag, String(value))
}

export function buildOperatorRunArgs(body = {}) {
  const args = ['--env-file=.env', 'operator/run.js']

  addValueArg(args, '--project', body.projectId)
  addValueArg(args, '--model', body.model)
  if (body.promptPreview === true) args.push('--prompt-preview')
  addValueArg(args, '--variant-id', body.variantId)
  addValueArg(args, '--job-type', body.jobType)
  addValueArg(args, '--ref-output-id', body.refOutputId)
  addValueArg(args, '--shot-type', body.shotType)
  addValueArg(args, '--design', body.design)
  addValueArg(args, '--background', body.background)
  addValueArg(args, '--batch', body.batch)

  return args
}
```

- [ ] **Step 4: Use the helper in `server/api.js`**

At the top of `server/api.js`, add:

```javascript
import { buildOperatorRunArgs } from './operatorArgs.js'
```

In `handleOperatorRun`, replace this block:

```javascript
    const projectId = body.projectId
    const model = body.model
    const promptPreview = body.promptPreview === true

    const args = ['--env-file=.env', 'operator/run.js']
    if (projectId) args.push('--project', projectId)
    if (model) args.push('--model', model)
    if (promptPreview) args.push('--prompt-preview')
```

with:

```javascript
    const args = buildOperatorRunArgs(body)
```

- [ ] **Step 5: Run tests and syntax check**

```bash
node server/operatorArgs.test.mjs
node --check server/api.js
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add server/operatorArgs.js server/operatorArgs.test.mjs server/api.js
git commit -m "feat: support pipeline args from operator API"
```

---

## Task 4: Frontend Pipeline API Wrapper

**Files:**
- Create: `src/api/pipeline.js`

- [ ] **Step 1: Create the API wrapper**

Create `src/api/pipeline.js`:

```javascript
async function readJSON(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed with ${res.status}`)
  }
  return data
}

export async function getVariationPlan(projectId) {
  const res = await fetch(`/api/variation-plan/${encodeURIComponent(projectId)}`)
  return readJSON(res)
}

export async function saveVariationPlan(projectId, plan) {
  const res = await fetch(`/api/variation-plan/${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan),
  })
  await readJSON(res)
  return plan
}

export async function startOperatorRun(payload) {
  const res = await fetch('/api/operator/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJSON(res)
}

export async function getOperatorStatus() {
  const res = await fetch('/api/operator/status')
  return readJSON(res)
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check src/api/pipeline.js
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/api/pipeline.js
git commit -m "feat: add frontend pipeline api helpers"
```

---

## Task 5: PipelinePanel UI

**Files:**
- Create: `src/v3/PipelinePanel.jsx`
- Modify: `src/v3/ReviewConsole.css`

- [ ] **Step 1: Create `PipelinePanel.jsx`**

Create `src/v3/PipelinePanel.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react'
import {
  buildVariationPlan,
  deriveVariationProgress,
  getNextPendingVariant,
  parseVariantRows,
} from '../pipeline/variationPlan.js'
import { saveVariationPlan, startOperatorRun } from '../api/pipeline.js'

const DEFAULT_VARIANT_ROWS = `Garnet / January | #6B0F1A
Amethyst / February | #9B59B6
Aquamarine / March | #7FFFD4
Diamond / April | #E0E0E0
Emerald / May | #046307
Alexandrite / June | #6A0DAD
Ruby / July | #9B111E
Peridot / August | #8DB600
Sapphire / September | #0033A0
Opal / October | #F2E8C9
Topaz / November | #FFC87C
Turquoise / December | #30D5C8`

function getOutputLabel(output) {
  if (!output) return 'No output selected'
  return output.displayId || output.id?.slice(0, 8) || 'Selected output'
}

export default function PipelinePanel({
  activeProjectId,
  project,
  currentOutput,
  outputs,
  winners,
  onVariationPlanSaved,
}) {
  const [basePrompt, setBasePrompt] = useState('')
  const [variantRowsText, setVariantRowsText] = useState(DEFAULT_VARIANT_ROWS)
  const [shotType, setShotType] = useState('product')
  const [designText, setDesignText] = useState('')
  const [backgroundText, setBackgroundText] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const plan = project?.variationPlan || null
  const progress = useMemo(
    () => deriveVariationProgress({ plan, outputs, winners }),
    [plan, outputs, winners]
  )
  const nextVariant = useMemo(() => getNextPendingVariant(plan), [plan])

  useEffect(() => {
    if (!currentOutput) return
    setBasePrompt((existing) => existing || currentOutput.finalPromptSent || currentOutput.prompt || '')
    setDesignText((existing) => existing || currentOutput.bucketSnapshot?.subject || currentOutput.prompt || '')
  }, [currentOutput])

  async function handleSavePlan() {
    if (!activeProjectId || !currentOutput) {
      setMessage('Choose a base output first.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const variantRows = parseVariantRows(variantRowsText)
      const nextPlan = buildVariationPlan({
        baseOutputId: currentOutput.id,
        basePrompt,
        variantRows,
      })
      await saveVariationPlan(activeProjectId, nextPlan)
      onVariationPlanSaved?.(nextPlan)
      setMessage(`Saved ${variantRows.length} planned variants.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRunNextVariant() {
    if (!activeProjectId || !nextVariant) {
      setMessage('No pending variant to run.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      await startOperatorRun({
        projectId: activeProjectId,
        variantId: nextVariant.id,
        jobType: '2d-variation',
        batch: 1,
      })
      setMessage(`Started ${nextVariant.label}.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRun3DRender() {
    if (!activeProjectId || !currentOutput) {
      setMessage('Choose a 2D winner output first.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      await startOperatorRun({
        projectId: activeProjectId,
        jobType: '3d-render',
        refOutputId: currentOutput.id,
        design: designText,
        batch: 1,
      })
      setMessage('Started 3D render job.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRunOnHand() {
    if (!activeProjectId || !currentOutput) {
      setMessage('Choose a 3D render output first.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      await startOperatorRun({
        projectId: activeProjectId,
        jobType: 'on-hand',
        refOutputId: currentOutput.id,
        shotType,
        design: designText,
        background: backgroundText,
        batch: 1,
      })
      setMessage(`Started on-hand ${shotType} job.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="v3-pipeline">
      <div className="v3-pipeline-row">
        <span className="v3-cprog-title">Pipeline</span>
        <span className="v3-cprog-counts">
          Base: {getOutputLabel(currentOutput)}
          {progress.total > 0 && ` · ${progress.generated}/${progress.total} variants`}
        </span>
      </div>

      <label className="v3-pipeline-label">
        Base prompt
        <textarea
          className="v3-pipeline-textarea"
          rows={3}
          value={basePrompt}
          onChange={(event) => setBasePrompt(event.target.value)}
          placeholder="Use {color} where the variant color should go."
        />
      </label>

      <label className="v3-pipeline-label">
        Variants
        <textarea
          className="v3-pipeline-textarea"
          rows={5}
          value={variantRowsText}
          onChange={(event) => setVariantRowsText(event.target.value)}
          placeholder="Label | #hex | optional finish"
        />
      </label>

      <div className="v3-pipeline-actions">
        <button type="button" onClick={handleSavePlan} disabled={busy || !currentOutput}>
          Save Plan
        </button>
        <button type="button" onClick={handleRunNextVariant} disabled={busy || !nextVariant}>
          Run Next Variant
        </button>
      </div>

      <label className="v3-pipeline-label">
        Design description
        <input
          className="v3-pipeline-input"
          value={designText}
          onChange={(event) => setDesignText(event.target.value)}
          placeholder="Short description for 3D/on-hand jobs"
        />
      </label>

      <div className="v3-pipeline-actions">
        <button type="button" onClick={handleRun3DRender} disabled={busy || !currentOutput}>
          Run 3D Render
        </button>
        <select value={shotType} onChange={(event) => setShotType(event.target.value)} disabled={busy}>
          <option value="product">Product</option>
          <option value="lifestyle">Lifestyle</option>
          <option value="social">Social</option>
        </select>
      </div>

      <label className="v3-pipeline-label">
        On-hand background
        <input
          className="v3-pipeline-input"
          value={backgroundText}
          onChange={(event) => setBackgroundText(event.target.value)}
          placeholder="white marble surface"
        />
      </label>

      <div className="v3-pipeline-actions">
        <button type="button" onClick={handleRunOnHand} disabled={busy || !currentOutput}>
          Run On-Hand
        </button>
      </div>

      {message && <div className="v3-pipeline-message">{message}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Append scoped CSS**

Append this block to `src/v3/ReviewConsole.css`:

```css

/* ── Pipeline Controls ───────────────────────────────────────────── */

.v3-pipeline {
  padding: 10px 0;
  border-bottom: 1px solid rgba(128,128,128,0.15);
  margin-bottom: 8px;
}

.v3-pipeline-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.v3-pipeline-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--v3-text-muted);
}

.v3-pipeline-textarea,
.v3-pipeline-input,
.v3-pipeline select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(128,128,128,0.22);
  border-radius: 6px;
  background: var(--v3-panel-bg);
  color: var(--v3-text-primary);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0;
  text-transform: none;
  padding: 7px 8px;
}

.v3-pipeline-textarea {
  resize: vertical;
  min-height: 62px;
}

.v3-pipeline-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.v3-pipeline-actions button,
.v3-pipeline-actions select {
  min-height: 30px;
}

.v3-pipeline-actions button {
  border: 1px solid rgba(128,128,128,0.22);
  border-radius: 6px;
  background: rgba(128,128,128,0.1);
  color: var(--v3-text-primary);
  font-size: 11px;
  cursor: pointer;
}

.v3-pipeline-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.v3-pipeline-message {
  font-size: 11px;
  color: var(--v3-text-secondary);
  line-height: 1.35;
}
```

- [ ] **Step 3: Component lint check**

```bash
npx eslint src/v3/PipelinePanel.jsx
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/v3/PipelinePanel.jsx src/v3/ReviewConsole.css
git commit -m "feat: add pipeline controls panel"
```

---

## Task 6: Wire PipelinePanel Into Review UI

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/v3/ReviewConsole.jsx`

- [ ] **Step 1: Add app-level project update callback**

In `src/App.jsx`, add this callback near the other project callbacks, before the loading-state return:

```jsx
  const handleVariationPlanSaved = useCallback((variationPlan) => {
    if (!activeProjectId) return
    setProjects((prev) =>
      prev.map((project) =>
        project.id === activeProjectId
          ? { ...project, variationPlan, updatedAt: Date.now() }
          : project
      )
    )
  }, [activeProjectId])
```

Pass it into `ReviewConsole`:

```jsx
          onVariationPlanSaved={handleVariationPlanSaved}
```

- [ ] **Step 2: Import and render PipelinePanel**

In `src/v3/ReviewConsole.jsx`, add:

```javascript
import PipelinePanel from './PipelinePanel'
```

Add `onVariationPlanSaved` to the prop destructuring:

```javascript
  onVariationPlanSaved,
```

In the `insightsContent` fragment, directly after `CollectionProgress`, add:

```jsx
                  <PipelinePanel
                    activeProjectId={activeProjectId}
                    project={project}
                    currentOutput={currentOutput}
                    outputs={reviewableOutputs}
                    winners={winners}
                    onVariationPlanSaved={onVariationPlanSaved}
                  />
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/v3/ReviewConsole.jsx
git commit -m "feat: show pipeline controls in review insights"
```

---

## Task 7: Manual QA And Documentation

**Files:**
- Modify: `DEVLOG.md`

- [ ] **Step 1: Run focused automated checks**

```bash
node src/pipeline/variationPlan.test.mjs
node server/operatorArgs.test.mjs
node --check src/api/pipeline.js
npx eslint src/v3/CollectionProgress.jsx src/v3/PipelinePanel.jsx
npm run build
```

Expected: all pass. Do not require repo-wide `npm run lint` to pass; it currently has unrelated existing failures.

- [ ] **Step 2: Manual browser test**

Start the app:

```bash
npm run dev
```

In the browser:

1. Open the review screen.
2. Select a completed output.
3. Open the insights panel.
4. Confirm the Pipeline section shows the selected output as the base.
5. Click `Save Plan`.
6. Confirm the Variation Plan meter appears and shows `0 of 12 generated`.
7. Click `Run Next Variant`.
8. Confirm the button reports `Started Garnet / January` or the API returns `Generation already in progress`.

- [ ] **Step 3: Update DEVLOG**

Append this bullet to `DEVLOG.md` under `2026-04`:

```markdown
- Phase 6 pipeline controls planned/executed: added app-side controls for saving variation plans and starting 2D variation, 3D render, and on-hand pipeline jobs from the review insights panel.
```

- [ ] **Step 4: Commit**

```bash
git add DEVLOG.md
git commit -m "docs: record phase 6 pipeline controls"
```

---

## Self-Review

**Spec coverage:**
- App-side variation plan creation: Tasks 1, 4, 5, 6.
- Browser-triggered planned variant runs: Tasks 3, 4, 5.
- Browser-triggered 3D render/on-hand jobs: Tasks 3, 4, 5.
- Existing progress meter stays accurate: Tasks 1 and 2.
- Manual QA and devlog update: Task 7.

**Placeholder scan:** No placeholder markers or incomplete code steps remain. Commands and expected results are explicit.

**Type consistency:**
- `variationPlan.variants[].id` uses `v_001` format in helper, UI, and operator calls.
- `jobType` values match Phase 5: `2d-variation`, `3d-render`, `on-hand`.
- Operator API body names match `operator/run.js` flags through `server/operatorArgs.js`: `variantId`, `jobType`, `refOutputId`, `shotType`, `design`, `background`, `batch`.
- `onVariationPlanSaved(plan)` updates `projects[].variationPlan`, which feeds `CollectionProgress` and `PipelinePanel`.
