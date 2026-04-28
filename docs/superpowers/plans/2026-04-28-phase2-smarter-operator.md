# Phase 2: Smarter Operator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual image evaluation, targeted operator questioning, and a nail knowledge base to the operator — so Rick gets flagged failures, targeted questions when stuck, and Claude learns his personal standards over time.

**Architecture:** New `operator/evaluate.js` module calls Claude Haiku with each generated image and the nail knowledge base immediately after Gemini generation. Annotations are stored on output records and shown in the review UI. A pre-flight check in `operator/run.js` detects repeated same-category failures and stops to ask a targeted question instead of guessing.

**Tech Stack:** Node.js ESM, `@anthropic-ai/sdk` (new), React, existing `server/storage.js`

---

## Files

| File | Action |
|------|--------|
| `operator/nailKnowledge.md` | Create |
| `operator/evaluate.js` | Create |
| `operator/run.js` | Modify (evaluation step + questioning pre-flight) |
| `operator/analyze.js` | Modify (add personalStandards to brief) |
| `server/api.js` | Modify (add annotation correction endpoint) |
| `src/v3/ImageViewer.jsx` | Modify (annotation display + Correct button) |
| `src/v3/ReviewConsole.jsx` | Modify (annotation correction handler) |

---

## Task 1: Install Anthropic SDK

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

Expected: `added 1 package` (or similar). `package.json` now shows `"@anthropic-ai/sdk"` in dependencies.

- [ ] **Step 2: Add API key placeholder to .env.example**

Open `.env.example` and add:

```
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

- [ ] **Step 3: Add API key to your actual .env file**

Rick must supply a real `ANTHROPIC_API_KEY` from console.anthropic.com and add it to `.env`.

- [ ] **Step 4: Verify the SDK imports**

```bash
node --env-file=.env -e "import('@anthropic-ai/sdk').then(m => console.log('SDK ok:', typeof m.default))"
```

Expected output: `SDK ok: function`

---

## Task 2: Write nail knowledge base

**Files:**
- Create: `operator/nailKnowledge.md`

- [ ] **Step 1: Create the knowledge base file**

Create `operator/nailKnowledge.md` with this content:

```markdown
# Nail Quality Evaluation Guide

## Shape Definitions

### Coffin (Ballerina)
- Long length with tapered sides and a FLAT squared-off tip
- Tip width is approximately 1/3 of nail width at the base
- Sidewalls taper inward gradually, then terminate flat
- PASS: flat tip, gradual taper, clean flat edge
- FAIL: pointed tip (stiletto-like), rounded tip, sidewalls don't taper, tip too narrow

### Almond
- Medium-long oval body tapering to a gently rounded point
- Sides curve inward symmetrically, tip is rounded like an almond
- PASS: symmetrical taper, rounded (not sharp) tip
- FAIL: too pointy (stiletto), too blunt (oval/square), asymmetrical taper

### Stiletto
- Long, dramatically tapered to a SHARP point
- Entire nail narrows continuously from base to tip — no flat area
- PASS: sharp distinct point, continuous taper from base
- FAIL: tip rounded, not sharp enough, sides don't taper fully

### Square
- Straight sidewalls (no taper), flat tip at 90° to the sidewalls
- PASS: parallel sides, crisp flat tip, square corners
- FAIL: rounded corners, tapered sides, angled tip

### Oval
- Straight sidewalls, tip follows a smooth rounded curve
- PASS: straight sides, cleanly rounded tip, no points or angles
- FAIL: pointed tip, angular corners, tapering sides

## Finish Types

### Cat Eye
- A linear shimmer streak/gradient running down the CENTER of the nail
- Effect is a SOFT, DIFFUSED linear highlight — NOT a harsh spotlight
- Shimmer transitions gradually from bright center to darker edges
- Colors should be deep: burgundy, navy, forest, black, plum
- PASS: gradient shimmer effect, linear movement, jewel-tone depth
- FAIL: looks like a spotlight (hard-edged circle of light), no gradient, too much shimmer all over, washed-out color

### Chrome / Mirror
- Highly reflective metallic surface — reflects light like a mirror
- Surface is smooth and even, no brush strokes or texture
- PASS: clear reflections visible, smooth uniform surface
- FAIL: dull, matte areas, visible brush strokes, patchy coverage

### French Tip
- White (or colored) strip at the tip ONLY — clean line where tip meets nail bed
- Strip should be even width across all nails in the image
- PASS: clean edge, consistent width, correct placement at tip only
- FAIL: uneven width across nails, too thick, bleeds into nail bed area

### Glitter
- Even coverage without bare patches
- For full glitter: entire surface covered uniformly
- PASS: consistent coverage, no bare nail visible through glitter
- FAIL: patchy coverage, too sparse, clumping

### Gel / Acrylic Surface
- Gel: glassy, smooth, high-shine surface with depth
- Acrylic: solid, matte-smooth, no surface texture
- PASS: appropriate surface texture for requested finish
- FAIL: nail polish streaks visible, surface looks inconsistent

## Universal Quality Criteria

- All nails in the image should be the SAME shape
- Nail length should be CONSISTENT across all fingers
- Cuticle area should be clean — no visible product gaps
- Tips should be sharp and clean, not soft or fuzzy
- The hand/nails should be the only subject — no plates, props, or backgrounds unless specified

## Evaluation Instructions

When evaluating an image:
1. Identify the nail shape — does it match the description above?
2. Identify the finish — does it match the criteria above?
3. Check consistency — are all nails the same?
4. Return: pass if acceptable, fail with specific one-line reason and category

Categories: shape, finish, color, technique, other
```

- [ ] **Step 2: Verify the file exists**

```bash
wc -l operator/nailKnowledge.md
```

Expected: 80+ lines

---

## Task 3: Create evaluate.js

**Files:**
- Create: `operator/evaluate.js`

- [ ] **Step 1: Create the module**

Create `operator/evaluate.js`:

```javascript
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const client = new Anthropic()
const knowledgePath = fileURLToPath(new URL('./nailKnowledge.md', import.meta.url))
const STATIC_KNOWLEDGE = readFileSync(knowledgePath, 'utf-8')

/**
 * Evaluate an array of generated images against the nail knowledge base.
 * Returns one annotation per image. Never throws — returns pass:true on error
 * so a Claude failure never blocks generation.
 *
 * @param {Array<{data: string, mediaType: string}>} images - base64 images
 * @param {string} [personalStandards] - dynamic standards from project brief
 * @returns {Promise<Array<{pass: boolean, note: string, category: string}>>}
 */
export async function evaluateImages(images, personalStandards = '') {
  const results = []
  for (const image of images) {
    try {
      const result = await evaluateImage(image, personalStandards)
      results.push(result)
    } catch (err) {
      console.log(`[evaluate] Evaluation failed (non-fatal): ${err.message}`)
      results.push({ pass: true, note: '', category: 'other' })
    }
  }
  return results
}

async function evaluateImage({ data, mediaType }, personalStandards) {
  const systemContent = [
    'You are a nail image quality evaluator. Evaluate nail images against technical specifications.',
    '',
    'Knowledge base:',
    STATIC_KNOWLEDGE,
    personalStandards ? `\nPersonal standards:\n${personalStandards}` : '',
  ].join('\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system: systemContent,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data },
        },
        {
          type: 'text',
          text: 'Evaluate this nail image. Respond with JSON only, no other text:\n{"pass": true/false, "note": "one-line reason if failing, empty string if passing", "category": "shape|finish|color|technique|other"}',
        },
      ],
    }],
  })

  const text = response.content[0]?.text || ''
  const jsonMatch = text.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) return { pass: true, note: '', category: 'other' }

  const parsed = JSON.parse(jsonMatch[0])
  return {
    pass: Boolean(parsed.pass),
    note: String(parsed.note || ''),
    category: String(parsed.category || 'other'),
  }
}
```

- [ ] **Step 2: Smoke-test the module loads**

```bash
node --env-file=.env -e "import('./operator/evaluate.js').then(() => console.log('evaluate.js loaded ok'))"
```

Expected: `evaluate.js loaded ok`

---

## Task 4: Add personalStandards to analyze.js brief

**Files:**
- Modify: `operator/analyze.js` (around line 328)

- [ ] **Step 1: Add buildPersonalStandards helper function**

In `operator/analyze.js`, after the `analyzeProject` function (before `analyzeGlobal` at line ~349), add:

```javascript
function buildPersonalStandards(projectOutputs, winnerOutputIds) {
  const lines = []

  const winnerOutputs = projectOutputs.filter(o => winnerOutputIds.has(o.id))
  for (const o of winnerOutputs.slice(0, 5)) {
    if (o.notesKeep?.trim()) lines.push(`APPROVED: ${o.notesKeep.trim()}`)
    if (o.batchNotesKeep?.trim()) lines.push(`APPROVED: ${o.batchNotesKeep.trim()}`)
  }

  const highRated = projectOutputs
    .filter(o => normalizeFeedback(o.feedback) >= 4)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5)
  for (const o of highRated) {
    if (o.notesKeep?.trim()) lines.push(`LIKED: ${o.notesKeep.trim()}`)
  }

  const corrected = projectOutputs
    .filter(o => o.annotationCorrection?.corrected === false)
    .slice(0, 5)
  for (const o of corrected) {
    if (o.operatorAnnotation?.note) {
      lines.push(`NOTE: Visual evaluation was wrong about: "${o.operatorAnnotation.note}"`)
    }
  }

  return [...new Set(lines)].join('\n')
}
```

- [ ] **Step 2: Call it inside generateProjectBrief and add to returned brief**

In `operator/analyze.js`, inside `generateProjectBrief`, find the `return {` block (around line 328). The current return looks like:

```javascript
  return {
    projectId: resolvedId,
    projectName: project.name || resolvedId,
    category,
    totalOutputs: projectOutputs.length,
    totalRated: ratedOutputs.length,
    totalWinners: winnerOutputs.length,
    avgRating,
    whatWorks: whatWorks.slice(0, 20),
    whatFails: whatFails.slice(0, 20),
    modelComparison,
    winnerDNA: winnerDNA.slice(0, 20),
    colors,
    signalCounts,
    constantKeywords: [...constantKeywords].slice(0, 30),
  }
```

Change it to:

```javascript
  const winnerOutputIds = new Set(winnerOutputs.map(o => o.id))
  const personalStandards = buildPersonalStandards(projectOutputs, winnerOutputIds)

  return {
    projectId: resolvedId,
    projectName: project.name || resolvedId,
    category,
    totalOutputs: projectOutputs.length,
    totalRated: ratedOutputs.length,
    totalWinners: winnerOutputs.length,
    avgRating,
    whatWorks: whatWorks.slice(0, 20),
    whatFails: whatFails.slice(0, 20),
    modelComparison,
    winnerDNA: winnerDNA.slice(0, 20),
    colors,
    signalCounts,
    constantKeywords: [...constantKeywords].slice(0, 30),
    personalStandards,
  }
```

Note: `winnerOutputs` is already defined earlier in `generateProjectBrief` — do not redefine it.

- [ ] **Step 3: Verify no syntax errors**

```bash
node --env-file=.env -e "import('./operator/analyze.js').then(() => console.log('analyze.js loaded ok'))"
```

Expected: `analyze.js loaded ok`

- [ ] **Step 4: Commit**

```bash
git add operator/nailKnowledge.md operator/evaluate.js operator/analyze.js package.json package-lock.json .env.example
git commit -m "feat: add nail knowledge base, evaluate.js, and personalStandards to brief"
```

---

## Task 5: Wire evaluation into run.js

**Files:**
- Modify: `operator/run.js` (around lines 595–686)

- [ ] **Step 1: Add evaluate import at the top of run.js**

In `operator/run.js`, after the existing imports (around line 39), add:

```javascript
import { evaluateImages } from './evaluate.js'
```

- [ ] **Step 2: Convert the image save loop from for...of to indexed for loop**

In `operator/run.js`, find the section starting at line ~658:

```javascript
  for (const img of allImages) {
    const outputId = randomUUID()
    const imagePath = storage.writeImageFile(outputId, img.mimeType, img.base64)

    const output = {
      id: outputId,
      imagePath,
      mimeType: img.mimeType,
      createdAt: endedAt,
      feedback: null,
      notes: '',
      status: 'succeeded',
      errorCode: null,
      errorMessage: null,
      ...outputContext,
      metadata: img.metadata || lastMetadata || null,
      operatorDecision,
      projectId,
      sessionId: session.id,
    }

    storage.put('outputs', output)
    newOutputIds.push(output.id)
    console.log(`[operator] Saved output: ${output.id}`)
  }
```

Replace with:

```javascript
  // --- Visual evaluation (runs before saving, uses in-memory base64) ---
  writeProgress('evaluating', `Evaluating ${allImages.length} image(s) with Claude...`)
  console.log(`[operator] Evaluating ${allImages.length} image(s)...`)
  let annotations = []
  try {
    const personalStandards = projectBrief?.personalStandards || ''
    annotations = await evaluateImages(
      allImages.map(img => ({ data: img.base64, mediaType: img.mimeType })),
      personalStandards
    )
    const flagged = annotations.filter(a => !a.pass).length
    console.log(`[operator] Evaluation complete: ${flagged}/${allImages.length} flagged`)
    for (let i = 0; i < annotations.length; i++) {
      const a = annotations[i]
      if (!a.pass) console.log(`  Image ${i + 1}: flagged — ${a.note} (${a.category})`)
    }
  } catch (err) {
    console.log(`[operator] Evaluation error (non-fatal): ${err.message}`)
    annotations = allImages.map(() => ({ pass: true, note: '', category: 'other' }))
  }

  for (let i = 0; i < allImages.length; i++) {
    const img = allImages[i]
    const outputId = randomUUID()
    const imagePath = storage.writeImageFile(outputId, img.mimeType, img.base64)

    const output = {
      id: outputId,
      imagePath,
      mimeType: img.mimeType,
      createdAt: endedAt,
      feedback: null,
      notes: '',
      status: 'succeeded',
      errorCode: null,
      errorMessage: null,
      ...outputContext,
      metadata: img.metadata || lastMetadata || null,
      operatorDecision,
      projectId,
      sessionId: session.id,
      operatorAnnotation: annotations[i] || null,
    }

    storage.put('outputs', output)
    newOutputIds.push(output.id)
    console.log(`[operator] Saved output: ${output.id}`)
  }
```

- [ ] **Step 3: Verify run.js loads without errors**

```bash
node --env-file=.env --dry-run operator/run.js --dry-run 2>&1 | head -20
```

Expected: No import errors. Should see the dry-run prompt output.

---

## Task 6: Add questioning pre-flight check to run.js

**Files:**
- Modify: `operator/run.js` (around line 160, after rating/winner summary)

- [ ] **Step 1: Add the questioning pre-flight check**

In `operator/run.js`, after the existing stalled iteration detection block (around line 167, after `console.log(...'Iteration may be stalled...')`), add:

```javascript
  // --- Questioning pre-flight: same failure category twice in a row? ---
  const lowRatedAnnotated = learningOutputs
    .filter(o => {
      const r = normalizeFeedback(o.feedback)
      return r !== null && r <= 2 && o.operatorAnnotation && !o.operatorAnnotation.pass
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 2)

  if (lowRatedAnnotated.length === 2) {
    const [last, prev] = lowRatedAnnotated
    if (last.operatorAnnotation.category === prev.operatorAnnotation.category) {
      const category = last.operatorAnnotation.category
      const questions = {
        shape: "I've flagged nail shape twice in a row — can you send a reference image or describe the exact tip shape you want?",
        finish: "The finish isn't landing after two tries — can you point to a winner that had it right, or describe what's missing?",
        color: "The color isn't working after two tries — want to give me a hex code instead of a color name?",
        technique: "The technique keeps coming out wrong — can you describe what correct looks like, or share a reference?",
        other: "I've flagged the same issue twice and I'm guessing at this point — what specifically needs to change?",
      }
      const question = questions[category] || questions.other
      console.log(`\n[operator] ⛔ SAME FAILURE TWICE (${category})`)
      console.log(`[operator] ${question}`)
      console.log(`[operator] Stopping to ask rather than guessing a third time.`)
      console.log(`[operator] Answer my question above, then run the operator again.`)
      clearProgress()
      process.exit(0)
    }
  }
```

- [ ] **Step 2: Verify the check doesn't break dry-run**

```bash
node --env-file=.env operator/run.js --dry-run 2>&1 | head -5
```

Expected: dry-run output (no crash, no questioning trigger since there's no annotated data yet).

- [ ] **Step 3: Commit**

```bash
git add operator/run.js
git commit -m "feat: wire visual evaluation into run.js and add questioning pre-flight check"
```

---

## Task 7: Add annotation correction endpoint to api.js

**Files:**
- Modify: `server/api.js` (after handleOperatorFeedback, around line 473)

- [ ] **Step 1: Add the handler function**

In `server/api.js`, after the closing `}` of `handleOperatorFeedback` (around line 473), add:

```javascript
async function handleAnnotationCorrection(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'POST only')

  let body
  try {
    body = await readBody(req)
  } catch {
    return sendError(res, 400, 'Invalid JSON body')
  }

  const { outputId, corrected, reason } = body
  if (!outputId) return sendError(res, 400, 'outputId is required')

  const output = storage.get('outputs', outputId)
  if (!output) return sendError(res, 404, 'Output not found')

  storage.put('outputs', {
    ...output,
    annotationCorrection: {
      corrected: Boolean(corrected),
      reason: reason || '',
      correctedAt: Date.now(),
    },
  })

  return sendJSON(res, 200, { ok: true, outputId })
}
```

- [ ] **Step 2: Register the route**

In `server/api.js`, find this block (around line 784):

```javascript
  if (cleanUrl === '/api/operator/feedback') {
    return handleOperatorFeedback(req, res)
  }
```

Add the new route immediately after:

```javascript
  if (cleanUrl === '/api/operator/feedback') {
    return handleOperatorFeedback(req, res)
  }
  if (cleanUrl === '/api/operator/annotation-correction') {
    return handleAnnotationCorrection(req, res)
  }
```

- [ ] **Step 3: Test the endpoint (server must be running)**

```bash
curl -s -X POST http://localhost:5173/api/operator/annotation-correction \
  -H "Content-Type: application/json" \
  -d '{"outputId": "nonexistent-id", "corrected": false}' | jq .
```

Expected: `{"error":"Output not found"}` with status 404 — proves the endpoint is live and routing correctly.

- [ ] **Step 4: Commit**

```bash
git add server/api.js
git commit -m "feat: add annotation correction API endpoint"
```

---

## Task 8: Display annotation in ImageViewer.jsx

**Files:**
- Modify: `src/v3/ImageViewer.jsx`

- [ ] **Step 1: Add onCorrectAnnotation to the props signature**

In `src/v3/ImageViewer.jsx`, find the props destructuring (line 157):

```javascript
export default function ImageViewer({
  output,
  currentIndex,
  totalCount,
  onNavigate,
  onUpdateFeedback,
  onUseAsRef,
  onMarkWinner,
  isWinner,
  outputs,
  refs,
  onAddRefs,
  onRemoveRef,
  onToggleRefSend,
  onUpdateRefMode,
  onReorderRefs,
  onUpdateRefNotes,
  activeProjectId,
  onOutputSignal,
  onUpdatePromptPreviewText,
  onUsePromptPreviewAsBase,
  reviewDockStatus,
  insightsTitle = 'Open strategy and session context',
  insightsMeta = [],
  insightsContent = null,
  rotation = 0,
  onRotate,
}) {
```

Add `onCorrectAnnotation,` before `onRotate,`:

```javascript
export default function ImageViewer({
  output,
  currentIndex,
  totalCount,
  onNavigate,
  onUpdateFeedback,
  onUseAsRef,
  onMarkWinner,
  isWinner,
  outputs,
  refs,
  onAddRefs,
  onRemoveRef,
  onToggleRefSend,
  onUpdateRefMode,
  onReorderRefs,
  onUpdateRefNotes,
  activeProjectId,
  onOutputSignal,
  onUpdatePromptPreviewText,
  onUsePromptPreviewAsBase,
  reviewDockStatus,
  insightsTitle = 'Open strategy and session context',
  insightsMeta = [],
  insightsContent = null,
  rotation = 0,
  onCorrectAnnotation,
  onRotate,
}) {
```

- [ ] **Step 2: Add annotation display above the rating section in the rail dock**

In `src/v3/ImageViewer.jsx`, find this block (around line 1122):

```jsx
              <div className="v3-toolbar-primary v3-toolbar-primary--rail">
                {onUpdateFeedback && (
                  <div className="v3-rating-stack">
```

Insert the annotation display immediately after the opening `<div className="v3-toolbar-primary v3-toolbar-primary--rail">` line:

```jsx
              <div className="v3-toolbar-primary v3-toolbar-primary--rail">
                {output.operatorAnnotation && !output.operatorAnnotation.pass && (
                  <div className="v3-annotation-flag">
                    <span className="v3-annotation-flag-text">
                      ⚠ Claude flagged: {output.operatorAnnotation.note}
                    </span>
                    {!output.annotationCorrection ? (
                      <button
                        className="v3-annotation-correct-btn"
                        onClick={() => onCorrectAnnotation?.(output.id)}
                        title="Tell Claude this annotation was wrong"
                      >
                        Correct
                      </button>
                    ) : (
                      <span className="v3-annotation-corrected">Noted — you said this passed</span>
                    )}
                  </div>
                )}
                {onUpdateFeedback && (
                  <div className="v3-rating-stack">
```

- [ ] **Step 3: Add minimal CSS for the annotation flag**

In `src/v3/ReviewConsole.css` (or wherever ImageViewer styles live — check with `grep -rn "v3-toolbar-primary" src/v3/*.css`), add at the end of the file:

```css
.v3-annotation-flag {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 160, 0, 0.12);
  border: 1px solid rgba(255, 160, 0, 0.3);
  border-radius: 6px;
  margin-bottom: 8px;
}

.v3-annotation-flag-text {
  font-size: 11px;
  color: #c8830a;
  flex: 1;
  line-height: 1.4;
}

.v3-annotation-correct-btn {
  flex-shrink: 0;
  font-size: 10px;
  padding: 2px 8px;
  background: none;
  border: 1px solid rgba(255, 160, 0, 0.5);
  border-radius: 4px;
  color: #c8830a;
  cursor: pointer;
}

.v3-annotation-correct-btn:hover {
  background: rgba(255, 160, 0, 0.15);
}

.v3-annotation-corrected {
  font-size: 10px;
  color: #777;
  font-style: italic;
}
```

- [ ] **Step 4: Verify which CSS file to edit**

```bash
grep -rn "v3-toolbar-primary" /Users/rick/Documents/Projects/AI\ GEN\ TOOL\ FINAL\ CUT/src/v3/*.css | head -5
```

Add the CSS to whichever file already contains `v3-toolbar-primary` styles.

---

## Task 9: Wire correction handler in ReviewConsole.jsx

**Files:**
- Modify: `src/v3/ReviewConsole.jsx`

- [ ] **Step 1: Add the correction handler**

In `src/v3/ReviewConsole.jsx`, find where other local handlers are defined (look for `const handleOutputSignal` or similar, around line 165–200). Add this handler nearby:

```javascript
  const handleCorrectAnnotation = useCallback(async (outputId) => {
    try {
      await fetch('/api/operator/annotation-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputId, corrected: false }),
      })
    } catch {
      // non-fatal — correction is best-effort
    }
  }, [])
```

You'll need to add `useCallback` to the existing React imports at the top if it isn't already there (check line 1).

- [ ] **Step 2: Pass the handler to ImageViewer**

In `src/v3/ReviewConsole.jsx`, find the `<ImageViewer` block (around line 342). It ends around line 420. Add `onCorrectAnnotation={handleCorrectAnnotation}` to the props:

```jsx
            <ImageViewer
              key={currentOutput?.id || 'empty-output'}
              output={currentOutput}
              rotation={rotations[currentOutput?.id] ?? 0}
              onRotate={(id) => setRotations((prev) => ({ ...prev, [id]: ((prev[id] ?? 0) + 90) % 360 }))}
              outputs={orderedOutputs}
              currentIndex={safeCurrentIndex}
              totalCount={orderedOutputs.length}
              onNavigate={setCurrentIndex}
              onUpdateFeedback={onUpdateOutputFeedback}
              onUpdateFeedbackNotes={onUpdateFeedbackNotes}
              onMarkWinner={onMarkWinner}
              onCorrectAnnotation={handleCorrectAnnotation}
```

- [ ] **Step 3: Check useCallback is imported**

Line 1 of ReviewConsole.jsx should include `useCallback` in the React import:

```javascript
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
```

If `useCallback` is already there, nothing to do. If missing, add it.

- [ ] **Step 4: Verify no TypeScript/build errors**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors. Warnings are acceptable.

- [ ] **Step 5: Commit**

```bash
git add src/v3/ImageViewer.jsx src/v3/ReviewConsole.jsx src/v3/*.css
git commit -m "feat: display operator annotation in review UI with correction button"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Run the operator (real generation)**

```bash
node --env-file=.env operator/run.js
```

Expected console output includes:
```
[operator] Evaluating N image(s)...
[operator] Evaluation complete: X/N flagged
```

If Claude flags an image:
```
  Image 1: flagged — nail tip too narrow for coffin shape (shape)
```

- [ ] **Step 3: Open the app and check the annotation**

Open the review console. Navigate to a flagged image. Verify:
- A yellow warning box appears above the rating buttons
- It shows the flagged reason
- A "Correct" button is visible

- [ ] **Step 4: Test the Correct button**

Click "Correct" on a flagged image. Verify:
- The button disappears
- "Noted — you said this passed" appears instead
- (Optionally check the output record via `/api/store/outputs/<id>` to see `annotationCorrection` field)

- [ ] **Step 5: Test the questioning trigger**

To test manually: open the browser console and update two recent outputs to have `feedback: 1` and `operatorAnnotation: {pass: false, note: "test", category: "shape"}`. Then run the operator and verify it prints the shape question and exits without generating.

Or: wait until it triggers naturally after two consecutive real failures.

- [ ] **Step 6: Final commit if any cleanup needed**

```bash
git add -p
git commit -m "chore: phase 2 cleanup"
```

---

## Self-review checklist

- [x] **Spec coverage:** knowledge base ✓, visual evaluation ✓, annotation display ✓, correction feedback loop ✓, operator questioning ✓, personalStandards ✓
- [x] **No placeholders:** all code blocks are complete
- [x] **Type consistency:** `operatorAnnotation` shape (`pass`, `note`, `category`) consistent across evaluate.js, run.js, and ImageViewer display
- [x] **annotationCorrection` shape (`corrected`, `reason`, `correctedAt`) consistent across api.js handler and ImageViewer display check
- [x] **Non-blocking:** evaluation errors always fall back to `pass: true` — never blocks generation
- [x] **`useCallback` import checked** — step added to verify
- [x] **CSS file target verified** — step added to find the right file before editing
