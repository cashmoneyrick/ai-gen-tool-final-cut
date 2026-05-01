# Review Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight review calibration workflow so Rick can label image readiness separately from the operator's judgment and compare disagreements.

**Architecture:** Store two separate review objects on each output: `rickReview` for Rick's readiness/score/reason and `operatorReview` for Claude/operator readiness/score/reason. The existing `feedback` field remains as Rick's 1-5 score for backward compatibility with current insights and thumbnail badges. The review dock gains readiness buttons, a short reason box, and a compact Rick-vs-operator comparison panel.

**Tech Stack:** React 19, existing file-backed JSON storage through `server/storage.js`, current V3 review UI in `src/v3/ImageViewer.jsx`, CSS in `src/v3/ReviewConsole.css`, Vite build verification.

---

## File Structure

- Modify `src/App.jsx`: add `handleUpdateOutputReview(outputId, patch)` and pass it into `ReviewConsole`.
- Modify `src/v3/ReviewConsole.jsx`: accept `onUpdateOutputReview` and forward it to `ImageViewer`.
- Modify `src/v3/ImageViewer.jsx`: add readiness constants, Rick review controls, reason input, and operator comparison display.
- Modify `src/v3/ReviewConsole.css`: style readiness controls and comparison panel inside the existing dock.
- Modify `server/api.js`: extend `/api/operator/annotation` so future operator reviews can store `operatorReview` alongside the existing `operatorAnnotation`.
- Modify `DEVLOG.md`: record the review calibration work.

## Review Data Shape

Use this output shape. Existing outputs do not need migration; missing fields mean unrated.

```js
{
  feedback: 4,
  rickReview: {
    readiness: 'cleanup',
    score: 4,
    reason: 'Good color and layout, but one accent nail needs cleanup.',
    updatedAt: 1770000000000,
  },
  operatorReview: {
    readiness: 'inspiration',
    score: 3,
    reason: 'Theme is weak but color palette is useful.',
    pass: true,
    category: 'technique',
    updatedAt: 1770000000000,
  }
}
```

Allowed readiness values:

```js
const READINESS_OPTIONS = [
  { value: 'ready', label: 'Ready', shortLabel: 'Ready', score: 5 },
  { value: 'cleanup', label: 'Cleanup', shortLabel: 'Clean', score: 4 },
  { value: 'inspiration', label: 'Inspo', shortLabel: 'Inspo', score: 3 },
  { value: 'wrong', label: 'Wrong', shortLabel: 'Wrong', score: 2 },
  { value: 'reject', label: 'Reject', shortLabel: 'Reject', score: 1 },
]
```

---

### Task 1: Add Rick Review Persistence

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the update handler above the loading state**

Insert this handler near `handleUpdateOutputFeedback` and `handleUpdateOutputNotes` in `src/App.jsx`. It updates `rickReview`, keeps `feedback` compatible with existing app logic, and saves through the same persistence path used by ratings.

```jsx
  const handleUpdateOutputReview = useCallback((outputId, patch) => {
    const now = Date.now()
    setOutputs((prev) =>
      prev.map((output) => {
        if (output.id !== outputId) return output
        const previousReview = output.rickReview || {}
        const nextReview = {
          ...previousReview,
          ...patch,
          updatedAt: now,
        }
        const nextFeedback = Object.prototype.hasOwnProperty.call(patch, 'score')
          ? patch.score
          : output.feedback
        const updated = {
          ...output,
          rickReview: nextReview,
          feedback: nextFeedback,
        }
        if (activeProjectId && activeSessionId) {
          persist.saveOutput(activeProjectId, activeSessionId, updated).catch((error) => {
            recoverFromPersistenceError('output review save', error)
          })
        }
        return updated
      })
    )
  }, [activeProjectId, activeSessionId, recoverFromPersistenceError])
```

- [ ] **Step 2: Pass the handler into `ReviewConsole`**

Add this prop next to `onUpdateOutputFeedback` and `onUpdateFeedbackNotes` in the `ReviewConsole` call.

```jsx
          onUpdateOutputReview={handleUpdateOutputReview}
```

- [ ] **Step 3: Run build verification**

Run: `npm run build`

Expected: Vite build exits 0.

---

### Task 2: Wire the Review Prop Through ReviewConsole

**Files:**
- Modify: `src/v3/ReviewConsole.jsx`

- [ ] **Step 1: Add the prop to the component signature**

In `ReviewConsole`, add `onUpdateOutputReview` next to `onUpdateOutputFeedback`.

```jsx
  onUpdateOutputFeedback,
  onUpdateOutputReview,
  onUpdateFeedbackNotes,
```

- [ ] **Step 2: Forward the prop to `ImageViewer`**

Add this prop next to `onUpdateFeedback={onUpdateOutputFeedback}`.

```jsx
              onUpdateReview={onUpdateOutputReview}
```

- [ ] **Step 3: Run build verification**

Run: `npm run build`

Expected: Vite build exits 0.

---

### Task 3: Add Readiness Controls and Comparison Display

**Files:**
- Modify: `src/v3/ImageViewer.jsx`

- [ ] **Step 1: Add readiness constants below `RATING_FACES`**

```jsx
const READINESS_OPTIONS = [
  { value: 'ready', label: 'Ready', shortLabel: 'Ready', score: 5, title: 'Ready as-is' },
  { value: 'cleanup', label: 'Cleanup', shortLabel: 'Clean', score: 4, title: 'Good design that needs cleanup' },
  { value: 'inspiration', label: 'Inspo', shortLabel: 'Inspo', score: 3, title: 'Useful as design inspiration' },
  { value: 'wrong', label: 'Wrong', shortLabel: 'Wrong', score: 2, title: 'Technically okay, wrong direction' },
  { value: 'reject', label: 'Reject', shortLabel: 'Reject', score: 1, title: 'Reject this output' },
]

function getReadinessOption(value) {
  return READINESS_OPTIONS.find((option) => option.value === value) || null
}

function getOperatorReview(output) {
  if (output?.operatorReview) return output.operatorReview
  if (output?.operatorAnnotation) {
    return {
      readiness: output.operatorAnnotation.pass ? null : 'reject',
      score: null,
      reason: output.operatorAnnotation.note || '',
      pass: output.operatorAnnotation.pass,
      category: output.operatorAnnotation.category || 'other',
    }
  }
  return null
}

function getCalibrationAgreement(rickReview, operatorReview) {
  if (!rickReview?.readiness || !operatorReview?.readiness) return null
  if (rickReview.readiness === operatorReview.readiness) return 'agree'
  const rickScore = getReadinessOption(rickReview.readiness)?.score
  const operatorScore = getReadinessOption(operatorReview.readiness)?.score
  if (!rickScore || !operatorScore) return 'different'
  return Math.abs(rickScore - operatorScore) <= 1 ? 'close' : 'different'
}
```

- [ ] **Step 2: Add `onUpdateReview` to the props**

In the `ImageViewer` function signature, add:

```jsx
  onUpdateReview,
```

Place it near `onUpdateFeedback`.

- [ ] **Step 3: Add review values after `selectedRating`**

```jsx
  const rickReview = output.rickReview || {}
  const operatorReview = getOperatorReview(output)
  const selectedReadiness = rickReview.readiness || null
  const operatorReadiness = getReadinessOption(operatorReview?.readiness)
  const calibrationAgreement = getCalibrationAgreement(rickReview, operatorReview)
```

- [ ] **Step 4: Add helper handlers before the `return`**

```jsx
  const handleReadinessClick = (option) => {
    if (!onUpdateReview) return
    const isSelected = selectedReadiness === option.value
    onUpdateReview(output.id, {
      readiness: isSelected ? null : option.value,
      score: isSelected ? null : option.score,
    })
  }

  const handleRickReasonBlur = (event) => {
    if (!onUpdateReview) return
    onUpdateReview(output.id, { reason: event.target.value })
  }

  const handleRatingClick = (score) => {
    if (onUpdateReview) {
      onUpdateReview(output.id, { score: selectedRating === score ? null : score })
      return
    }
    onUpdateFeedback?.(output.id, selectedRating === score ? null : score)
  }
```

- [ ] **Step 5: Insert the readiness block above the rating stack in the non-prompt review dock**

Place this block before `{onUpdateFeedback && (` in the non-prompt toolbar.

```jsx
                {onUpdateReview && (
                  <div className="v3-readiness-stack">
                    <div className="v3-toolbar-section-label">Readiness</div>
                    <div className="v3-readiness-options">
                      {READINESS_OPTIONS.map((option) => {
                        const isSelected = selectedReadiness === option.value
                        return (
                          <button
                            key={option.value}
                            className={`v3-readiness-btn v3-readiness-btn--${option.value}${isSelected ? ' v3-readiness-btn--selected' : ''}`}
                            onClick={() => handleReadinessClick(option)}
                            title={option.title}
                            type="button"
                          >
                            {option.shortLabel}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
```

- [ ] **Step 6: Change rating buttons to call `handleRatingClick`**

Replace the existing image rating button `onClick` with:

```jsx
                            onClick={() => handleRatingClick(n)}
```

Do this only in the non-prompt image review dock, not the prompt preview rating stack.

- [ ] **Step 7: Add the Rick reason box below the rating stack**

Place this block after the rating stack and before the winner button.

```jsx
                {onUpdateReview && (
                  <label className="v3-review-reason-box">
                    <span className="v3-toolbar-section-label">Rick reason</span>
                    <textarea
                      className="v3-review-reason-input"
                      defaultValue={rickReview.reason || ''}
                      onBlur={handleRickReasonBlur}
                      placeholder="Why this is ready, cleanup, inspiration, wrong, or reject"
                      rows={3}
                    />
                  </label>
                )}
```

- [ ] **Step 8: Add the comparison panel below the annotation warning**

Place this block after the existing `operatorAnnotation` flag and before the readiness block.

```jsx
                {(rickReview.readiness || operatorReview) && (
                  <div className={`v3-calibration-card ${calibrationAgreement ? `v3-calibration-card--${calibrationAgreement}` : ''}`}>
                    <div className="v3-calibration-row">
                      <span className="v3-calibration-label">Rick</span>
                      <span className="v3-calibration-value">
                        {getReadinessOption(rickReview.readiness)?.label || 'Unlabeled'}
                        {rickReview.score ? ` · ${rickReview.score}/5` : ''}
                      </span>
                    </div>
                    <div className="v3-calibration-row">
                      <span className="v3-calibration-label">Claude</span>
                      <span className="v3-calibration-value">
                        {operatorReadiness?.label || (operatorReview?.pass === false ? 'Flagged' : 'No label')}
                        {operatorReview?.score ? ` · ${operatorReview.score}/5` : ''}
                      </span>
                    </div>
                    {calibrationAgreement && (
                      <div className="v3-calibration-summary">
                        {calibrationAgreement === 'agree' ? 'Aligned' : calibrationAgreement === 'close' ? 'Close' : 'Disagree'}
                      </div>
                    )}
                  </div>
                )}
```

- [ ] **Step 9: Run build verification**

Run: `npm run build`

Expected: Vite build exits 0.

---

### Task 4: Style the Calibration UI

**Files:**
- Modify: `src/v3/ReviewConsole.css`

- [ ] **Step 1: Add CSS near the existing feedback notes section**

```css
/* --- Review Calibration --- */

.v3-readiness-stack,
.v3-review-reason-box,
.v3-calibration-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.v3-readiness-options {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
}

.v3-readiness-btn {
  min-width: 0;
  min-height: 30px;
  border: 1px solid var(--v3-border-subtle);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--v3-text-secondary);
  font-family: var(--v3-font);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.v3-readiness-btn:hover,
.v3-readiness-btn--selected {
  color: var(--v3-text-primary);
  border-color: rgba(0, 113, 227, 0.55);
  background: rgba(0, 113, 227, 0.12);
}

.v3-readiness-btn--ready.v3-readiness-btn--selected {
  border-color: rgba(52, 199, 89, 0.7);
  background: rgba(52, 199, 89, 0.14);
}

.v3-readiness-btn--reject.v3-readiness-btn--selected,
.v3-readiness-btn--wrong.v3-readiness-btn--selected {
  border-color: rgba(255, 59, 48, 0.65);
  background: rgba(255, 59, 48, 0.12);
}

.v3-review-reason-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 58px;
  resize: vertical;
  border: 1px solid var(--v3-border-subtle);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--v3-text-primary);
  font-family: var(--v3-font);
  font-size: 12px;
  line-height: 1.4;
  padding: 8px;
}

.v3-review-reason-input:focus {
  outline: none;
  border-color: rgba(0, 113, 227, 0.55);
}

.v3-calibration-card {
  padding: 8px;
  border-radius: 7px;
  border: 1px solid var(--v3-border-subtle);
  background: rgba(255, 255, 255, 0.035);
}

.v3-calibration-card--agree {
  border-color: rgba(52, 199, 89, 0.45);
}

.v3-calibration-card--close {
  border-color: rgba(255, 204, 0, 0.45);
}

.v3-calibration-card--different {
  border-color: rgba(255, 59, 48, 0.45);
}

.v3-calibration-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.v3-calibration-label {
  color: var(--v3-text-muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.v3-calibration-value {
  color: var(--v3-text-primary);
  font-size: 11px;
  text-align: right;
}

.v3-calibration-summary {
  color: var(--v3-text-secondary);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 2: Run build verification**

Run: `npm run build`

Expected: Vite build exits 0.

---

### Task 5: Extend Operator Annotation Storage

**Files:**
- Modify: `server/api.js`

- [ ] **Step 1: Extend request body fields**

In `handleOperatorAnnotation`, replace:

```js
  const { outputId, pass, note, category } = body
```

with:

```js
  const { outputId, pass, note, category, readiness, score, reason } = body
```

- [ ] **Step 2: Build an operator review object before `storage.put`**

Add this before `storage.put('outputs', {`.

```js
  const operatorReason = String(reason || note || '')
  const operatorScore = Number.isFinite(Number(score)) ? Number(score) : null
  const operatorReadiness = readiness ? String(readiness) : null
```

- [ ] **Step 3: Save `operatorReview` alongside `operatorAnnotation`**

Inside the object passed to `storage.put('outputs', ...)`, add this sibling field after `operatorAnnotation`.

```js
    operatorReview: {
      pass: Boolean(pass),
      readiness: operatorReadiness,
      score: operatorScore,
      reason: operatorReason,
      category: String(category || 'other'),
      updatedAt: Date.now(),
    },
```

The final storage block should preserve the existing `operatorAnnotation` field and add the new `operatorReview` field.

- [ ] **Step 4: Run build verification**

Run: `npm run build`

Expected: Vite build exits 0.

---

### Task 6: Document the Change

**Files:**
- Modify: `DEVLOG.md`

- [ ] **Step 1: Add a short entry at the top of `DEVLOG.md`**

```markdown
## 2026-05-01 — Review Calibration MVP

- Added Rick readiness labels so “usable” can mean ready as-is, cleanup, inspiration, wrong direction, or reject.
- Separated Rick review data from operator review data on outputs while keeping legacy feedback scores compatible.
- Added a compact Rick-vs-Claude comparison in the review dock to expose agreement and disagreement during image review.
```

- [ ] **Step 2: Run final build verification**

Run: `npm run build`

Expected: Vite build exits 0.

- [ ] **Step 3: Note lint baseline**

Run: `npm run lint`

Expected: This still fails on pre-existing lint issues unrelated to this feature. Do not fix unrelated lint issues in this plan.

---

## Self-Review Checklist

- Spec coverage: readiness labels, Rick-vs-operator separation, quick review controls, comparison display, and future operator storage are each covered by a task.
- Placeholder scan: no placeholders remain; every code step includes exact code or exact command.
- Type consistency: `rickReview`, `operatorReview`, `readiness`, `score`, and `reason` are used consistently across App, UI, and API.
