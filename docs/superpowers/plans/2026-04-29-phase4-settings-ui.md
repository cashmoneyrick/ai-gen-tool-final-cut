# Phase 4: Settings Panel, Collection Progress, and Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface generation settings in a persistent visible panel, make those settings flow through to the operator, show collection progress in the review rail, and remove dead components that no longer have any callers.

**Architecture:** `ActionBar.jsx` is fully built but never rendered. This plan wires it in: App.jsx gets the missing settings state, `loadProjectState` returns them, ReviewConsole receives them as props and renders ActionBar, and `operator/run.js` reads from the project record so UI changes take effect on the next run. A new `CollectionProgress` widget drops into the insights area using data already in scope. Six orphaned component files are deleted. Full visual redesign is explicitly **out of scope** — it needs a separate brainstorm.

**Tech Stack:** React (src/), Node.js ESM (operator/), JSON flat-file storage (server/storage.js + src/storage/db.js)

---

## Files

| File | Action |
|------|--------|
| `src/storage/session.js` | Modify — add 5 settings fields to `loadProjectState` return |
| `src/App.jsx` | Modify — add 5 settings state vars, load them, persist them, pass to ReviewConsole |
| `src/v3/ActionBar.jsx` | Modify — make Run button optional (guard on `onRunNextAttempt`) |
| `src/v3/ReviewConsole.jsx` | Modify — add settings props, import + render ActionBar |
| `operator/run.js` | Modify — add project record as settings source between decisionFile and defaults |
| `src/v3/CollectionProgress.jsx` | Create — rating distribution + output/winner counts |
| `src/v3/ReviewConsole.css` | Modify — add CollectionProgress styles |
| `src/v3/BatchBar.jsx` | Delete |
| `src/v3/SidePanel.jsx` | Delete |
| `src/v3/FeedbackNotes.jsx` | Delete |
| `src/v3/NoteBox.jsx` | Delete |
| `src/v3/GenerationProgress.jsx` | Delete |
| `src/v3/InsightsModal.jsx` | Delete |
| `src/v3/InsightsModal.css` | Delete |

---

## Task 1: Add missing settings to loadProjectState + App.jsx state

**Files:**
- Modify: `src/storage/session.js` (around line 336)
- Modify: `src/App.jsx` (lines 150, 185–191, 218–226, 296–305)

`loadProjectState` already returns `model` and `batchSize` from the project record but not `aspectRatio`, `imageSize`, `thinkingLevel`, `googleSearch`, `imageSearch`. App.jsx has no state for them either.

- [ ] **Step 1: Add fields to loadProjectState return**

In `src/storage/session.js`, find the return block of `loadProjectState` (around line 336). It currently ends:
```javascript
    model: project?.model ?? session.model ?? DEFAULT_IMAGE_MODEL,
    batchSize: project?.batchSize ?? session.batchSize ?? 1,
    promptPreviewMode: project?.promptPreviewMode ?? session.promptPreviewMode ?? false,
```

Add the 5 missing lines directly after `batchSize`:
```javascript
    model: project?.model ?? session.model ?? DEFAULT_IMAGE_MODEL,
    batchSize: project?.batchSize ?? session.batchSize ?? 1,
    aspectRatio: project?.aspectRatio ?? session.aspectRatio ?? '1:1',
    imageSize: project?.imageSize ?? session.imageSize ?? '1K',
    thinkingLevel: project?.thinkingLevel ?? session.thinkingLevel ?? 'minimal',
    googleSearch: project?.googleSearch ?? session.googleSearch ?? false,
    imageSearch: project?.imageSearch ?? session.imageSearch ?? false,
    promptPreviewMode: project?.promptPreviewMode ?? session.promptPreviewMode ?? false,
```

- [ ] **Step 2: Add state vars to App.jsx**

In `src/App.jsx`, around line 150 (near `const [batchSize, setBatchSize] = useState(1)`), add 5 new state declarations:

```javascript
  const [batchSize, setBatchSize] = useState(1)
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [imageSize, setImageSize] = useState('1K')
  const [thinkingLevel, setThinkingLevel] = useState('minimal')
  const [googleSearch, setGoogleSearch] = useState(false)
  const [imageSearch, setImageSearch] = useState(false)
```

- [ ] **Step 3: Load settings in applyState**

In `src/App.jsx`, in the `applyState` callback (around line 185), find:
```javascript
    setModel(resolveImageModel(state.model))
    setBatchSize(state.batchSize || 1)
```

Replace with:
```javascript
    setModel(resolveImageModel(state.model))
    setBatchSize(state.batchSize || 1)
    setAspectRatio(state.aspectRatio || '1:1')
    setImageSize(state.imageSize || '1K')
    setThinkingLevel(state.thinkingLevel || 'minimal')
    setGoogleSearch(state.googleSearch ?? false)
    setImageSearch(state.imageSearch ?? false)
```

- [ ] **Step 4: Add settings to flushPendingSessionSave**

In `src/App.jsx`, in `flushPendingSessionSave` (around line 218), find the `saveSessionFields` call:
```javascript
    await persist.saveSessionFields(activeSessionId, {
      goal,
      buckets,
      assembledPrompt: assembled,
      assembledPromptDirty: assembledDirty,
      promptPreviewMode,
      model,
      batchSize,
    })
```

Replace with:
```javascript
    await persist.saveSessionFields(activeSessionId, {
      goal,
      buckets,
      assembledPrompt: assembled,
      assembledPromptDirty: assembledDirty,
      promptPreviewMode,
      model,
      batchSize,
      aspectRatio,
      imageSize,
      thinkingLevel,
      googleSearch,
      imageSearch,
    })
```

- [ ] **Step 5: Add settings to the debounced save effect**

In `src/App.jsx`, in the persistence effect (around line 296), find the debounced `saveSessionFields` call:
```javascript
      persist.saveSessionFields(sid, {
        goal,
        buckets,
        assembledPrompt: assembled,
        assembledPromptDirty: assembledDirty,
        promptPreviewMode,
        model,
        batchSize,
      })
```

Replace with:
```javascript
      persist.saveSessionFields(sid, {
        goal,
        buckets,
        assembledPrompt: assembled,
        assembledPromptDirty: assembledDirty,
        promptPreviewMode,
        model,
        batchSize,
        aspectRatio,
        imageSize,
        thinkingLevel,
        googleSearch,
        imageSearch,
      })
```

Also update the `useEffect` dependency array for this effect. Find:
```javascript
  }, [hydrated, activeSessionId, goal, buckets, assembled, assembledDirty, promptPreviewMode, model, batchSize])
```

Replace with:
```javascript
  }, [hydrated, activeSessionId, goal, buckets, assembled, assembledDirty, promptPreviewMode, model, batchSize, aspectRatio, imageSize, thinkingLevel, googleSearch, imageSearch])
```

And update `flushPendingSessionSave`'s dependency array. Find:
```javascript
  }, [activeSessionId, goal, buckets, assembled, assembledDirty, promptPreviewMode, model, batchSize])
```

Replace with:
```javascript
  }, [activeSessionId, goal, buckets, assembled, assembledDirty, promptPreviewMode, model, batchSize, aspectRatio, imageSize, thinkingLevel, googleSearch, imageSearch])
```

- [ ] **Step 6: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/storage/session.js src/App.jsx
git commit -m "feat: add aspectRatio/imageSize/thinkingLevel/search settings to app state and project persistence"
```

---

## Task 2: Make ActionBar Run button optional

**Files:**
- Modify: `src/v3/ActionBar.jsx` (around line 80)

ActionBar currently always renders a Run button. Inside ReviewConsole, the operator handles generation — the Run button is irrelevant. Making `onRunNextAttempt` optional lets us render ActionBar settings-only when no run handler is provided.

- [ ] **Step 1: Read the Run button section in ActionBar.jsx**

```bash
sed -n '72,90p' src/v3/ActionBar.jsx
```

You will see the `buttonLabel`, `isDisabled` vars, and the run button JSX.

- [ ] **Step 2: Guard the Run button on onRunNextAttempt**

In `src/v3/ActionBar.jsx`, find this block (around line 72–80):
```javascript
  const buttonLabel = handoffState === 'saving'
    ? 'Saving...'
    : handoffState === 'saved'
    ? 'Handoff Saved!'
    : handoffState === 'failed'
    ? 'Failed - Retry'
    : 'Run Next Attempt'

  const isDisabled = (!dirty && handoffState === 'idle') || handoffState === 'saving'
```

Add a guard variable after:
```javascript
  const showRunButton = typeof onRunNextAttempt === 'function'
```

- [ ] **Step 3: Wrap the Run button JSX in the guard**

Find this block in the return JSX (around line 231):
```jsx
        {/* Divider */}
        <div className="v3-control-divider" />

        {/* Image count */}
        <div className="v3-control-group">
          <span className="v3-control-label">Images</span>
          <select
            className="v3-control-select"
            value={imageCount}
            onChange={(e) => onImageCountChange(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* Run button */}
        <button
          className={`v3-run-btn ${isDisabled ? 'v3-run-btn-disabled' : ''} ${handoffState === 'saved' ? 'v3-run-btn-success' : ''}`}
          onClick={handleRun}
          disabled={isDisabled}
        >
          {buttonLabel}
        </button>
```

Replace with:
```jsx
        {showRunButton && <div className="v3-control-divider" />}

        {/* Image count */}
        <div className="v3-control-group">
          <span className="v3-control-label">Images</span>
          <select
            className="v3-control-select"
            value={imageCount}
            onChange={(e) => onImageCountChange(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {/* Run button — only shown when onRunNextAttempt is provided */}
        {showRunButton && (
          <button
            className={`v3-run-btn ${isDisabled ? 'v3-run-btn-disabled' : ''} ${handoffState === 'saved' ? 'v3-run-btn-success' : ''}`}
            onClick={handleRun}
            disabled={isDisabled}
          >
            {buttonLabel}
          </button>
        )}
```

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/v3/ActionBar.jsx
git commit -m "feat: make ActionBar Run button optional when onRunNextAttempt is not provided"
```

---

## Task 3: Wire ActionBar into ReviewConsole

**Files:**
- Modify: `src/v3/ReviewConsole.jsx` (lines 1–11, 65–103, 285–340)
- Modify: `src/App.jsx` (lines 875–914)

ReviewConsole currently receives no settings props. This task threads settings + change handlers from App.jsx through ReviewConsole into ActionBar.

- [ ] **Step 1: Add ActionBar import to ReviewConsole.jsx**

In `src/v3/ReviewConsole.jsx`, find the import block (lines 1–11). After the last import, add:
```javascript
import ActionBar from './ActionBar'
import { AVAILABLE_IMAGE_MODELS } from '../modelConfig'
```

- [ ] **Step 2: Add settings props to ReviewConsole**

In `src/v3/ReviewConsole.jsx`, find the props destructuring of `export default function ReviewConsole({` (around line 65). After `onUsePromptPreviewAsBase,`, add:

```javascript
  // Generation settings
  model,
  imageSize,
  aspectRatio,
  thinkingLevel,
  googleSearch,
  imageSearch,
  imageCount,
  onModelChange,
  onImageSizeChange,
  onAspectRatioChange,
  onThinkingLevelChange,
  onGoogleSearchChange,
  onImageSearchChange,
  onImageCountChange,
```

- [ ] **Step 3: Render ActionBar between header and body**

In `src/v3/ReviewConsole.jsx`, find this exact line in the JSX:
```jsx
      <div className="v3-body-row">
```

Insert ActionBar directly before it:
```jsx
      <ActionBar
        imageCount={imageCount}
        onImageCountChange={onImageCountChange}
        model={model}
        availableModels={AVAILABLE_IMAGE_MODELS}
        imageSize={imageSize}
        aspectRatio={aspectRatio}
        thinkingLevel={thinkingLevel}
        googleSearch={googleSearch}
        imageSearch={imageSearch}
        onModelChange={onModelChange}
        onImageSizeChange={onImageSizeChange}
        onAspectRatioChange={onAspectRatioChange}
        onThinkingLevelChange={onThinkingLevelChange}
        onGoogleSearchChange={onGoogleSearchChange}
        onImageSearchChange={onImageSearchChange}
      />

      <div className="v3-body-row">
```

Note: `dirty` and `onRunNextAttempt` are intentionally omitted — no Run button in this context.

- [ ] **Step 4: Pass settings props from App.jsx to ReviewConsole**

In `src/App.jsx`, find the `<ReviewConsole` JSX block (around line 875). After the `onUsePromptPreviewAsBase` line, add:

```jsx
          model={model}
          imageSize={imageSize}
          aspectRatio={aspectRatio}
          thinkingLevel={thinkingLevel}
          googleSearch={googleSearch}
          imageSearch={imageSearch}
          imageCount={batchSize}
          onModelChange={setModel}
          onImageSizeChange={setImageSize}
          onAspectRatioChange={setAspectRatio}
          onThinkingLevelChange={setThinkingLevel}
          onGoogleSearchChange={setGoogleSearch}
          onImageSearchChange={setImageSearch}
          onImageCountChange={setBatchSize}
```

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: succeeds. Open `http://localhost:5173` and verify:
- Settings bar appears between the project name header and the image stage
- Model selector shows Flash / Pro
- Size (1K/2K/4K), Ratio picker, Think toggle, Search toggles, Images count all render
- Run button is NOT shown (no `onRunNextAttempt` passed)
- Changing model/size/ratio should reflect in the controls (state update) and persist on refresh

- [ ] **Step 6: Commit**

```bash
git add src/v3/ReviewConsole.jsx src/App.jsx
git commit -m "feat: wire ActionBar settings panel into ReviewConsole header"
```

---

## Task 4: Operator reads settings from project record

**Files:**
- Modify: `operator/run.js` (lines 417–435)

Currently the operator reads settings from `decisionFile` (CLI-passed JSON) → `OPERATOR_DEFAULTS`. The project record now stores `model`, `batchSize`, `aspectRatio`, `imageSize`, `thinkingLevel`, `googleSearch`, `imageSearch` from Task 1. Add the project record as a source between the two.

- [ ] **Step 1: Read the current settings resolution block**

```bash
sed -n '417,436p' operator/run.js
```

You will see:
```javascript
const modelOverride = getArg('model') || decisionFile.model || null
const model = resolveImageModel(modelOverride || OPERATOR_DEFAULTS.model)

const batchSize = parseInt(getArg('batch') || decisionFile.batchSize || OPERATOR_DEFAULTS.batchSize, 10)

const genOptions = {
  imageSize: decisionFile.imageSize || OPERATOR_DEFAULTS.imageSize,
  aspectRatio: decisionFile.aspectRatio || OPERATOR_DEFAULTS.aspectRatio,
  thinkingLevel: decisionFile.thinkingLevel || OPERATOR_DEFAULTS.thinkingLevel,
  googleSearch: decisionFile.googleSearch ?? OPERATOR_DEFAULTS.googleSearch,
  imageSearch: decisionFile.imageSearch ?? OPERATOR_DEFAULTS.imageSearch,
}
```

- [ ] **Step 2: Replace with project-aware resolution**

Replace the block from Step 1 with:

```javascript
// --- Resolve model ---
// Precedence: CLI flag > decision file > project record > operator defaults
const modelOverride = getArg('model') || decisionFile.model || null
const model = resolveImageModel(modelOverride || project.model || OPERATOR_DEFAULTS.model)

// --- Resolve batch size ---
// Precedence: CLI flag > decision file > project record > operator defaults
const batchSize = parseInt(getArg('batch') || decisionFile.batchSize || project.batchSize || OPERATOR_DEFAULTS.batchSize, 10)

// --- Resolve gen options ---
// Precedence: decision file > project record > operator defaults
const genOptions = {
  imageSize: decisionFile.imageSize || project.imageSize || OPERATOR_DEFAULTS.imageSize,
  aspectRatio: decisionFile.aspectRatio || project.aspectRatio || OPERATOR_DEFAULTS.aspectRatio,
  thinkingLevel: decisionFile.thinkingLevel || project.thinkingLevel || OPERATOR_DEFAULTS.thinkingLevel,
  googleSearch: decisionFile.googleSearch ?? project.googleSearch ?? OPERATOR_DEFAULTS.googleSearch,
  imageSearch: decisionFile.imageSearch ?? project.imageSearch ?? OPERATOR_DEFAULTS.imageSearch,
}
```

- [ ] **Step 3: Verify project is in scope at this point**

```bash
grep -n "^const project\b\|^  const project\b\|project = " operator/run.js | head -5
```

Expected: `project` is declared before line 417 (it's loaded in the startup block around line 110). If it's not in scope, move the resolution block below where `project` is declared.

- [ ] **Step 4: Dry-run test**

```bash
node --env-file=.env operator/run.js --dry-run 2>&1 | grep -E "Settings:|Model:|aspectRatio|imageSize"
```

Expected output includes:
```
Settings: <model> | <size> | <ratio> | thinking: <level> | search: off | batch: <n>
```

The values should match what's stored in `data/projects.json` for the active project (check with `cat data/projects.json | node -e "const p=require('fs').readFileSync('/dev/stdin','utf8'); const projects=JSON.parse(p); const p0=projects[0]; console.log(p0.model, p0.imageSize, p0.aspectRatio)"`).

- [ ] **Step 5: Commit**

```bash
git add operator/run.js
git commit -m "feat: operator reads model/size/ratio/thinking/search settings from project record"
```

---

## Task 5: Collection progress widget

**Files:**
- Create: `src/v3/CollectionProgress.jsx`
- Modify: `src/v3/ReviewConsole.css` (add styles at the end)
- Modify: `src/v3/ReviewConsole.jsx` (add import + render in insightsContent)

Shows output count, winner count, rated count, and a mini rating distribution bar chart. Uses data already in scope inside ReviewConsole.

- [ ] **Step 1: Create CollectionProgress.jsx**

Create `src/v3/CollectionProgress.jsx` with the full content below:

```jsx
import { useMemo } from 'react'
import { normalizeFeedback } from '../reviewFeedback.js'

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
    <div className="v3-cp">
      <div className="v3-cp-row">
        <span className="v3-cp-title">Collection</span>
        <span className="v3-cp-counts">
          {totalOutputs} outputs
          {totalWinners > 0 && ` · ${totalWinners} winner${totalWinners !== 1 ? 's' : ''}`}
          {stats.ratedCount > 0 && ` · ${stats.ratedCount} rated`}
        </span>
      </div>
      {stats.ratedCount > 0 && (
        <div className="v3-cp-bars">
          {stats.ratingCounts.map((count, i) => (
            <div key={i} className="v3-cp-bar-row">
              <span className="v3-cp-bar-label">{i + 1}</span>
              <div className="v3-cp-bar-track">
                <div
                  className="v3-cp-bar-fill"
                  style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  data-rating={i + 1}
                />
              </div>
              <span className="v3-cp-bar-count">{count || ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add CollectionProgress styles to ReviewConsole.css**

Open `src/v3/ReviewConsole.css`. At the very end of the file, append:

```css
/* ── Collection Progress ─────────────────────────────────────────── */

.v3-cp {
  padding: 10px 0 6px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 8px;
}

.v3-cp-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.v3-cp-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
  flex-shrink: 0;
}

.v3-cp-counts {
  font-size: 11px;
  color: rgba(255,255,255,0.55);
}

.v3-cp-bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.v3-cp-bar-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.v3-cp-bar-label {
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  width: 8px;
  text-align: right;
  flex-shrink: 0;
}

.v3-cp-bar-track {
  flex: 1;
  height: 4px;
  background: rgba(255,255,255,0.07);
  border-radius: 2px;
  overflow: hidden;
}

.v3-cp-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: rgba(255,255,255,0.2);
  transition: width 0.2s ease;
}

.v3-cp-bar-fill[data-rating="5"] { background: #5b8c5a; }
.v3-cp-bar-fill[data-rating="4"] { background: rgba(91,140,90,0.6); }
.v3-cp-bar-fill[data-rating="3"] { background: rgba(255,255,255,0.25); }
.v3-cp-bar-fill[data-rating="2"] { background: rgba(180,80,60,0.5); }
.v3-cp-bar-fill[data-rating="1"] { background: rgba(180,60,60,0.7); }

.v3-cp-bar-count {
  font-size: 10px;
  color: rgba(255,255,255,0.3);
  width: 14px;
  text-align: left;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Import CollectionProgress in ReviewConsole.jsx**

In `src/v3/ReviewConsole.jsx`, add to the import block:
```javascript
import CollectionProgress from './CollectionProgress'
```

- [ ] **Step 4: Render CollectionProgress inside insightsContent**

In `src/v3/ReviewConsole.jsx`, find the `insightsContent` prop passed to ImageViewer:
```jsx
              insightsContent={(
                <>
                  {sessionDecision && (
```

Add CollectionProgress as the first child, before `{sessionDecision && (`:
```jsx
              insightsContent={(
                <>
                  <CollectionProgress
                    project={project}
                    outputs={reviewableOutputs}
                    winners={winners}
                  />
                  {sessionDecision && (
```

- [ ] **Step 5: Build check and visual verify**

```bash
npm run build 2>&1 | tail -5
```

Open `http://localhost:5173`. Click the insights/strategy section of the review rail. Verify:
- "Collection" header line with output / winner / rated counts appears
- Rating distribution bars render (color-coded 5=green, 1=red)
- If no outputs, nothing renders (graceful empty state)

- [ ] **Step 6: Commit**

```bash
git add src/v3/CollectionProgress.jsx src/v3/ReviewConsole.css src/v3/ReviewConsole.jsx
git commit -m "feat: add collection progress widget with rating distribution to insights panel"
```

---

## Task 6: Remove dead components

**Files to delete:**
- `src/v3/BatchBar.jsx` — 0 imports
- `src/v3/SidePanel.jsx` — 0 imports
- `src/v3/FeedbackNotes.jsx` — 0 imports
- `src/v3/NoteBox.jsx` — 0 imports
- `src/v3/GenerationProgress.jsx` — 0 imports
- `src/v3/InsightsModal.jsx` — 0 imports
- `src/v3/InsightsModal.css` — only imported by InsightsModal.jsx

`SaveIndicator.jsx` is used (11 imports). `ColorPicker.jsx` is a planned feature. Both stay.

- [ ] **Step 1: Confirm zero imports**

```bash
for f in BatchBar SidePanel FeedbackNotes NoteBox GenerationProgress InsightsModal; do
  count=$(grep -rn "import.*$f\|<$f" src/ | grep -v "^src/v3/$f\.jsx" | wc -l)
  echo "$f: $count references"
done
```

Expected: all show `0 references`. If any show non-zero, stop and investigate before deleting.

- [ ] **Step 2: Delete the files**

```bash
rm src/v3/BatchBar.jsx
rm src/v3/SidePanel.jsx
rm src/v3/FeedbackNotes.jsx
rm src/v3/NoteBox.jsx
rm src/v3/GenerationProgress.jsx
rm src/v3/InsightsModal.jsx
rm src/v3/InsightsModal.css
```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: succeeds. If it fails with "Cannot find module", one of the deleted files is actually imported somewhere — restore it and update the import map in Step 1.

- [ ] **Step 4: Commit**

```bash
git add -A src/v3/
git commit -m "chore: remove dead components (BatchBar, SidePanel, FeedbackNotes, NoteBox, GenerationProgress, InsightsModal)"
```

---

## Self-Review

**Spec coverage:**
- ✅ Quick settings panel — Tasks 2, 3 (ActionBar wired + settings persist to project)
- ✅ Settings sticky across reloads — Task 1 (loadProjectState returns them)
- ✅ Operator reads UI settings — Task 4 (project record as source)
- ✅ Collection progress view — Task 5 (rating distribution + counts)
- ✅ Audit and cut broken features — Task 6 (6 dead components removed)
- ❌ Full UI redesign — **out of scope**, needs separate brainstorm with Rick

**Placeholder scan:** None found. All steps have exact code.

**Type consistency:**
- `aspectRatio` — string (`'1:1'`) — defined in Task 1, used in Tasks 2, 3, 4
- `imageSize` — string (`'1K'`) — defined in Task 1, used in Tasks 2, 3, 4
- `thinkingLevel` — string (`'minimal'`) — defined in Task 1, used in Tasks 2, 3, 4
- `googleSearch` — boolean — defined in Task 1, used in Tasks 2, 3, 4
- `imageSearch` — boolean — defined in Task 1, used in Tasks 2, 3, 4
- `imageCount` prop in ReviewConsole — maps to `batchSize` state in App.jsx — consistent (Task 3 Step 4)
- `normalizeFeedback` — imported from `../reviewFeedback.js` — same path used in ReviewConsole.jsx line 10
- `project` prop in CollectionProgress — same object passed as `project={activeProject}` in ReviewConsole (Task 5 Step 4)
- `showRunButton` — local boolean — defined Task 2 Step 2, used Task 2 Step 3 — consistent
