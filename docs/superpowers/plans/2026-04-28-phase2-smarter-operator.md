# Phase 2: Smarter Operator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual image evaluation (done by Claude Code reading image files after each batch), targeted operator questioning when the same failure repeats, and a nail knowledge base — so Rick gets flagged failures, targeted questions when stuck, and Claude learns his personal standards over time.

**Architecture:** Claude Code reads `data/last-batch.json` after each generation run, reads each image file, evaluates against `operator/nailKnowledge.md`, saves annotations via `POST /api/operator/annotation`, and reports verbally. A pre-flight check in `operator/run.js` reads stored annotations to detect repeated same-category failures and stops to ask a targeted question instead of guessing. No separate API key or SDK needed.

**Tech Stack:** Node.js ESM, React, existing `server/storage.js`, existing `server/api.js` pattern

---

## Files

| File | Action |
|------|--------|
| `operator/nailKnowledge.md` | Create |
| `operator/analyze.js` | Modify (add personalStandards to brief) |
| `server/api.js` | Modify (add per-image annotation endpoint + correction endpoint) |
| `operator/run.js` | Modify (questioning pre-flight check) |
| `src/v3/ImageViewer.jsx` | Modify (annotation display + Correct button) |
| `src/v3/ReviewConsole.jsx` | Modify (annotation correction handler) |
| `OPERATOR.md` | Modify (instruct evaluation after every batch) |

---

## Task 1: Write nail knowledge base

**Files:**
- Create: `operator/nailKnowledge.md`

- [ ] **Step 1: Create the knowledge base file**

Create `operator/nailKnowledge.md`:

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
- Effect is SOFT and DIFFUSED — NOT a harsh spotlight or hard-edged circle of light
- Shimmer transitions gradually from bright center to darker edges
- Colors should be deep jewel tones: burgundy, navy, forest, black, plum
- PASS: gradient shimmer, linear movement, jewel-tone depth, soft edges
- FAIL: spotlight effect (hard-edged circle of light), no gradient, shimmer all over, washed-out color

### Chrome / Mirror
- Highly reflective metallic surface — reflects light like a mirror
- Surface is smooth and even, no brush strokes or texture
- PASS: clear reflections visible, smooth uniform surface
- FAIL: dull, matte areas, visible brush strokes, patchy coverage

### French Tip
- White (or colored) strip at the tip ONLY — clean line where tip meets nail bed
- Strip should be even width across all nails in the image
- PASS: clean edge, consistent width, correct placement at tip only
- FAIL: uneven width across nails, too thick, bleeds into nail bed

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

## Evaluation Output Format

When evaluating an image, produce one result per image:
- pass: true if acceptable, false if something specific failed
- note: one-line specific reason if failing, empty string if passing
- category: shape | finish | color | technique | other
```

- [ ] **Step 2: Verify the file exists**

```bash
wc -l operator/nailKnowledge.md
```

Expected: 80+ lines

- [ ] **Step 3: Commit**

```bash
git add operator/nailKnowledge.md
git commit -m "feat: add nail knowledge base for operator image evaluation"
```

---

## Task 2: Add personalStandards to analyze.js brief

**Files:**
- Modify: `operator/analyze.js` (around line 328)

- [ ] **Step 1: Add buildPersonalStandards helper**

In `operator/analyze.js`, after the closing `}` of `analyzeProject` function (before `analyzeGlobal` around line 349), add:

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
      lines.push(`NOTE: Evaluation was wrong about: "${o.operatorAnnotation.note}"`)
    }
  }

  return [...new Set(lines)].join('\n')
}
```

- [ ] **Step 2: Call it inside generateProjectBrief and add to returned brief**

In `operator/analyze.js`, inside `generateProjectBrief`, find the `return {` block (around line 328):

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

Replace with:

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
node --env-file=.env -e "import('./operator/analyze.js').then(() => console.log('ok'))"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add operator/analyze.js
git commit -m "feat: add personalStandards to project brief"
```

---

## Task 3: Add annotation endpoints to api.js

**Files:**
- Modify: `server/api.js` (after handleOperatorFeedback, around line 473)

Claude Code saves per-image annotations via `POST /api/operator/annotation`. Rick corrects wrong calls via `POST /api/operator/annotation-correction`.

- [ ] **Step 1: Add handleOperatorAnnotation function**

In `server/api.js`, after the closing `}` of `handleOperatorFeedback` (around line 473), add:

```javascript
async function handleOperatorAnnotation(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'POST only')

  let body
  try {
    body = await readBody(req)
  } catch {
    return sendError(res, 400, 'Invalid JSON body')
  }

  const { outputId, pass, note, category } = body
  if (!outputId) return sendError(res, 400, 'outputId is required')

  const output = storage.get('outputs', outputId)
  if (!output) return sendError(res, 404, 'Output not found')

  storage.put('outputs', {
    ...output,
    operatorAnnotation: {
      pass: Boolean(pass),
      note: String(note || ''),
      category: String(category || 'other'),
    },
  })

  return sendJSON(res, 200, { ok: true, outputId })
}
```

- [ ] **Step 2: Add handleAnnotationCorrection function**

Immediately after `handleOperatorAnnotation`, add:

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
      reason: String(reason || ''),
      correctedAt: Date.now(),
    },
  })

  return sendJSON(res, 200, { ok: true, outputId })
}
```

- [ ] **Step 3: Register both routes**

In `server/api.js`, find (around line 784):

```javascript
  if (cleanUrl === '/api/operator/feedback') {
    return handleOperatorFeedback(req, res)
  }
```

Add immediately after:

```javascript
  if (cleanUrl === '/api/operator/annotation') {
    return handleOperatorAnnotation(req, res)
  }
  if (cleanUrl === '/api/operator/annotation-correction') {
    return handleAnnotationCorrection(req, res)
  }
```

- [ ] **Step 4: Test endpoints (server must be running)**

```bash
curl -s -X POST http://localhost:5173/api/operator/annotation \
  -H "Content-Type: application/json" \
  -d '{"outputId":"fake-id","pass":false,"note":"test","category":"shape"}' | jq .
```

Expected: `{"error":"Output not found"}` — proves the route is live.

```bash
curl -s -X POST http://localhost:5173/api/operator/annotation-correction \
  -H "Content-Type: application/json" \
  -d '{"outputId":"fake-id","corrected":false}' | jq .
```

Expected: `{"error":"Output not found"}`

- [ ] **Step 5: Commit**

```bash
git add server/api.js
git commit -m "feat: add per-image annotation and correction API endpoints"
```

---

## Task 4: Add questioning pre-flight to run.js

**Files:**
- Modify: `operator/run.js` (around line 162, after stalled iteration detection)

- [ ] **Step 1: Add the questioning pre-flight block**

In `operator/run.js`, after the stalled iteration detection block (around line 167, after the `console.log(...'Iteration may be stalled...')` lines), add:

```javascript
  // --- Questioning pre-flight: same failure category in last 2 low-rated outputs? ---
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
      console.log(`\n[operator] ⛔ SAME FAILURE TWICE (${category})`)
      console.log(`[operator] ${questions[category] || questions.other}`)
      console.log(`[operator] Stopping to ask rather than guessing a third time.`)
      console.log(`[operator] Answer the question above, then run the operator again.`)
      clearProgress()
      process.exit(0)
    }
  }
```

- [ ] **Step 2: Verify dry-run still works**

```bash
node --env-file=.env operator/run.js --dry-run 2>&1 | head -10
```

Expected: Dry-run output — no crash, no questioning trigger (no annotated data yet).

- [ ] **Step 3: Commit**

```bash
git add operator/run.js
git commit -m "feat: add same-failure questioning pre-flight to operator run"
```

---

## Task 5: Display annotations in ImageViewer.jsx

**Files:**
- Modify: `src/v3/ImageViewer.jsx`
- Modify: `src/v3/ReviewConsole.jsx`
- Modify: whichever `.css` file contains `v3-toolbar-primary` styles

- [ ] **Step 1: Find the correct CSS file**

```bash
grep -rn "v3-toolbar-primary" /Users/rick/Documents/Projects/AI\ GEN\ TOOL\ FINAL\ CUT/src/v3/*.css | head -3
```

Note the filename — you'll add CSS to that file in Step 4.

- [ ] **Step 2: Add onCorrectAnnotation prop to ImageViewer**

In `src/v3/ImageViewer.jsx`, find the props destructuring (line 157). Add `onCorrectAnnotation,` before `onRotate,`:

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

- [ ] **Step 3: Add annotation display inside the rail dock**

In `src/v3/ImageViewer.jsx`, find (around line 1122):

```jsx
              <div className="v3-toolbar-primary v3-toolbar-primary--rail">
                {onUpdateFeedback && (
                  <div className="v3-rating-stack">
```

Replace with:

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

- [ ] **Step 4: Add CSS to the file found in Step 1**

Append to the end of that CSS file:

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

- [ ] **Step 5: Add correction handler to ReviewConsole.jsx**

In `src/v3/ReviewConsole.jsx`, find where local handlers are defined (look for `useCallback` usages around line 165–200). Add:

```javascript
  const handleCorrectAnnotation = useCallback(async (outputId) => {
    try {
      await fetch('/api/operator/annotation-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputId, corrected: false }),
      })
    } catch {
      // non-fatal
    }
  }, [])
```

Verify `useCallback` is already in the React import on line 1:

```javascript
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
```

- [ ] **Step 6: Pass handler to ImageViewer**

In `src/v3/ReviewConsole.jsx`, find the `<ImageViewer` block (around line 342). Add `onCorrectAnnotation={handleCorrectAnnotation}` to its props:

```jsx
            <ImageViewer
              key={currentOutput?.id || 'empty-output'}
              output={currentOutput}
              ...
              onMarkWinner={onMarkWinner}
              onCorrectAnnotation={handleCorrectAnnotation}
```

- [ ] **Step 7: Build check**

```bash
npm run build 2>&1 | tail -10
```

Expected: Build succeeds, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/v3/ImageViewer.jsx src/v3/ReviewConsole.jsx src/v3/*.css
git commit -m "feat: display operator annotations in review UI with correction button"
```

---

## Task 6: Update OPERATOR.md with evaluation instructions

**Files:**
- Modify: `OPERATOR.md`

- [ ] **Step 1: Add evaluation section to OPERATOR.md**

In `OPERATOR.md`, after the **Feedback Handling** section, add:

```markdown
## Image Evaluation (do this after every generation)

After each operator run, read `data/last-batch.json` to get the new output IDs, read each output record to get `imagePath`, then read and evaluate each image against `operator/nailKnowledge.md`.

For each image:
1. Check shape — does it match what was asked for?
2. Check finish — does the technique match the spec?
3. Check consistency — are all nails the same shape and length?

Save the result for each output via:
```
POST http://localhost:5173/api/operator/annotation
{ "outputId": "...", "pass": true/false, "note": "one-line reason if failing", "category": "shape|finish|color|technique|other" }
```

Then report findings to Rick verbally before moving on.

If Rick says an annotation was wrong, note it — the correction is saved automatically via the Correct button in the UI.
```

- [ ] **Step 2: Commit**

```bash
git add OPERATOR.md
git commit -m "docs: add image evaluation instructions to OPERATOR.md"
```

---

## End-to-end verification

- [ ] Run the operator: `node --env-file=.env operator/run.js`
- [ ] After it completes, read `data/last-batch.json` and each image file
- [ ] Save an annotation via `POST /api/operator/annotation` for one output
- [ ] Open the app — verify the yellow flag appears above the rating buttons on that output
- [ ] Click "Correct" — verify it changes to "Noted — you said this passed"
- [ ] Run the operator again with 2 low-rated annotated outputs sharing the same category — verify it stops and prints the targeted question
