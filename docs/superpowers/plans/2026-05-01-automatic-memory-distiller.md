# Automatic Memory Distiller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Rick's feedback automatically carry into future projects by distilling repeated image-review patterns into reusable category lessons.

**Architecture:** Add a pure operator memory helper that reads reviewed outputs and creates stable global/category lessons without changing user data. `operator/analyze.js` writes those lessons into `data/global-state.json`, and `operator/run.js`/`operator/promptBuilder.js` inject the relevant lessons for the active project. The UI does not show this as another Rick task.

**Tech Stack:** Node ESM modules, existing JSON storage, Vite React build, existing structured prompt builder.

---

## File Structure

- Create `operator/autoLessons.js`: pure lesson distiller, category selector, and active lesson selector.
- Modify `operator/analyze.js`: include automatic lessons in generated global state.
- Modify `operator/promptBuilder.js`: accept active automatic lessons and inject them into structured prompts.
- Modify `operator/run.js`: select lessons for the active project and record them in output receipts.
- Modify `operator/context.js`: expose selected automatic lessons in operator context.
- Modify `DEVLOG.md`: add a plain-English record of the change.

---

### Task 1: Add Automatic Lesson Distiller

**Files:**
- Create: `operator/autoLessons.js`

- [ ] **Step 1: Create the helper with deterministic lesson rules**

Create `operator/autoLessons.js` with these exports:

```js
import { normalizeFeedback } from '../src/reviewFeedback.js'

export const AUTO_LESSON_VERSION = 1

const USEFUL_READINESS = new Set(['ready', 'cleanup', 'inspiration'])
const READY_READINESS = new Set(['ready', 'cleanup'])
const MISS_READINESS = new Set(['wrong', 'reject'])

const CATEGORY_KEYWORDS = {
  nails: ['nail', 'nails', 'french', 'floral', 'flower', 'press-on', 'manicure', 'tip'],
}

const NAIL_RULES = [
  {
    id: 'nails-french-tip-visible',
    signal: 'correction',
    text: 'For nail sets, avoid thin or barely visible French tips; make French tips clearly readable and intentionally shaped.',
    match: (text) => includesAll(text, ['french']) && includesAny(text, ['thin', 'too thin', 'skinny', 'barely']),
  },
  {
    id: 'nails-hand-painted-florals',
    signal: 'correction',
    text: 'For nail sets, florals should look like hand-painted nail art, not printed decals, photo flowers, or random pasted graphics.',
    match: (text) => includesAny(text, ['flower', 'flowers', 'floral']) && includesAny(text, ['printed', 'decal', 'sticker', 'not hand painted', 'not hand-painted', 'photo']),
  },
  {
    id: 'nails-avoid-basic',
    signal: 'correction',
    text: 'For nail sets, avoid designs that feel too basic or empty; include one clear focal idea while keeping the set wearable.',
    match: (text) => includesAny(text, ['basic', 'boring', 'plain', 'empty', 'too simple']),
  },
  {
    id: 'nails-motif-direction',
    signal: 'correction',
    text: 'For nail sets, keep fruit and floral motifs facing naturally and consistently across the five nails.',
    match: (text) => includesAny(text, ['wrong way', 'wrong direction', 'facing wrong', 'upside down']),
  },
  {
    id: 'nails-no-random-objects',
    signal: 'correction',
    text: 'For nail sets, avoid random rocks, gems, charms, or center objects unless Rick explicitly asks for them.',
    match: (text) => includesAny(text, ['rock', 'rocks', 'gem', 'gems', 'random object', 'center object']),
  },
  {
    id: 'nails-five-nail-readability',
    signal: 'preference',
    text: 'For nail sets, prefer a clean five-nail presentation with readable individual designs, a nude or soft base, and balanced accent nails.',
    match: (text, output) => isUseful(output) && includesAny(text, ['five', '5 nail', '5-nail', 'set', 'balanced', 'clean', 'good', 'nice', 'ready']),
  },
]

function cleanText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle))
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle))
}

function getReview(output) {
  return output?.rickReview || {}
}

function isUseful(output) {
  const readiness = getReview(output).readiness
  const rating = normalizeFeedback(output?.feedback)
  return USEFUL_READINESS.has(readiness) || rating >= 4
}

function isReady(output) {
  const readiness = getReview(output).readiness
  const rating = normalizeFeedback(output?.feedback)
  return READY_READINESS.has(readiness) || rating >= 4
}

function isMiss(output) {
  const readiness = getReview(output).readiness
  const rating = normalizeFeedback(output?.feedback)
  return MISS_READINESS.has(readiness) || rating <= 2
}

function outputText(output) {
  const review = getReview(output)
  return cleanText([
    review.reason,
    output?.notesKeep,
    output?.notesFix,
    output?.batchNotesKeep,
    output?.batchNotesFix,
    output?.finalPromptSent,
    output?.prompt,
  ].filter(Boolean).join(' '))
}

export function inferAutoLessonCategory(project, sessions = [], outputs = []) {
  const explicit = project?.category
  if (explicit) return explicit
  const combined = cleanText([
    project?.name,
    ...(sessions || []).map((session) => session?.goal),
    ...(outputs || []).slice(0, 12).map((output) => output?.finalPromptSent || output?.prompt),
  ].filter(Boolean).join(' '))
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (includesAny(combined, keywords)) return category
  }
  return 'general'
}

export function distillAutoLessons({ projects = [], sessions = [], outputs = [] } = {}) {
  const sessionsByProject = new Map()
  for (const session of sessions) {
    if (!session?.projectId) continue
    if (!sessionsByProject.has(session.projectId)) sessionsByProject.set(session.projectId, [])
    sessionsByProject.get(session.projectId).push(session)
  }

  const outputsByProject = new Map()
  for (const output of outputs) {
    const projectId = output?.projectId || sessions.find((session) => session.id === output?.sessionId)?.projectId
    if (!projectId || output?.outputKind === 'prompt-preview') continue
    if (!outputsByProject.has(projectId)) outputsByProject.set(projectId, [])
    outputsByProject.get(projectId).push(output)
  }

  const ruleHits = new Map()
  for (const project of projects) {
    const projectSessions = sessionsByProject.get(project.id) || []
    const projectOutputs = outputsByProject.get(project.id) || []
    const category = inferAutoLessonCategory(project, projectSessions, projectOutputs)
    if (category !== 'nails') continue

    for (const output of projectOutputs) {
      if (!getReview(output).readiness && normalizeFeedback(output.feedback) === null) continue
      const text = outputText(output)
      for (const rule of NAIL_RULES) {
        if (!rule.match(text, output)) continue
        if (rule.signal === 'preference' && !isReady(output)) continue
        if (rule.signal === 'correction' && !isMiss(output) && !text) continue
        const key = `${category}:${rule.id}`
        if (!ruleHits.has(key)) {
          ruleHits.set(key, {
            id: rule.id,
            scope: 'category',
            category,
            signal: rule.signal,
            text: rule.text,
            support: 0,
            projectIds: new Set(),
            outputIds: [],
            version: AUTO_LESSON_VERSION,
          })
        }
        const hit = ruleHits.get(key)
        hit.support += 1
        hit.projectIds.add(project.id)
        if (output.id && hit.outputIds.length < 8) hit.outputIds.push(output.id)
      }
    }
  }

  return [...ruleHits.values()]
    .filter((lesson) => lesson.support >= 2)
    .map((lesson) => ({
      ...lesson,
      projectIds: [...lesson.projectIds],
      confidence: lesson.support >= 5 ? 'high' : 'medium',
      updatedAt: Date.now(),
    }))
    .sort((a, b) => b.support - a.support || a.id.localeCompare(b.id))
}

export function selectAutoLessonsForProject(globalState, project, limit = 8) {
  const category = project?.category || globalState?.projectSummaries?.find((entry) => entry.id === project?.id)?.category || 'general'
  const categoryLessons = globalState?.categoryProfiles?.[category]?.autoLessons || []
  const globalLessons = globalState?.autoLessons || []
  const seen = new Set()
  return [...categoryLessons, ...globalLessons]
    .filter((lesson) => lesson?.text && !seen.has(lesson.id) && seen.add(lesson.id))
    .slice(0, limit)
}
```

- [ ] **Step 2: Run a focused helper check**

Run:

```bash
node --input-type=module <<'EOF'
import assert from 'node:assert/strict'
import { distillAutoLessons, selectAutoLessonsForProject } from './operator/autoLessons.js'
const projects = [{ id: 'p1', name: 'Spring nail sets', category: 'nails' }]
const sessions = [{ id: 's1', projectId: 'p1', goal: '5 nail spring French floral sets' }]
const outputs = [
  { id: 'o1', projectId: 'p1', feedback: 2, rickReview: { readiness: 'reject', reason: 'french tip is too thin' } },
  { id: 'o2', projectId: 'p1', feedback: 3, rickReview: { readiness: 'cleanup', reason: 'french tip is a bit thin' } },
  { id: 'o3', projectId: 'p1', feedback: 5, rickReview: { readiness: 'ready', reason: 'clean balanced five nail set' } },
  { id: 'o4', projectId: 'p1', feedback: 4, rickReview: { readiness: 'cleanup', reason: 'good 5 nail set' } },
]
const lessons = distillAutoLessons({ projects, sessions, outputs })
assert.equal(lessons.some((lesson) => lesson.id === 'nails-french-tip-visible'), true)
assert.equal(lessons.some((lesson) => lesson.id === 'nails-five-nail-readability'), true)
const globalState = { categoryProfiles: { nails: { autoLessons: lessons } } }
assert.equal(selectAutoLessonsForProject(globalState, projects[0]).length, lessons.length)
console.log('autoLessons helper ok')
EOF
```

Expected: prints `autoLessons helper ok`.

---

### Task 2: Save Automatic Lessons Into Global State

**Files:**
- Modify: `operator/analyze.js`

- [ ] **Step 1: Import the distiller**

Add:

```js
import { distillAutoLessons } from './autoLessons.js'
```

- [ ] **Step 2: Attach lessons to global and category state**

Inside `analyzeGlobal()`, after `categoryProfiles` is built and before `return`, add:

```js
  const autoLessons = distillAutoLessons({
    projects: allProjects,
    sessions: allSessions,
    outputs: allOutputs,
  })

  for (const lesson of autoLessons) {
    if (!categoryProfiles[lesson.category]) continue
    if (!categoryProfiles[lesson.category].autoLessons) {
      categoryProfiles[lesson.category].autoLessons = []
    }
    categoryProfiles[lesson.category].autoLessons.push(lesson)
  }
```

Add `autoLessons` to the returned object:

```js
    autoLessons,
```

- [ ] **Step 3: Persist lessons in `generateGlobalState()`**

Add `autoLessons: analysis.autoLessons || []` to the saved `state` object.

- [ ] **Step 4: Run a no-write import check**

Run:

```bash
node --input-type=module -e "import('./operator/analyze.js').then(() => console.log('analyze import ok'))"
```

Expected: prints `analyze import ok`.

---

### Task 3: Inject Automatic Lessons Into Prompts

**Files:**
- Modify: `operator/promptBuilder.js`
- Modify: `operator/run.js`

- [ ] **Step 1: Add prompt-builder source priority**

In `SOURCE_PRIORITY`, add:

```js
  autoLesson: 735,
```

- [ ] **Step 2: Accept and inject `activeAutoLessons`**

Add `activeAutoLessons = []` to the `buildStructuredPrompt()` parameters.

After the project lesson loop, add:

```js
  // --- Automatic cross-project/category lessons distilled from Rick's feedback ---
  for (const lesson of activeAutoLessons || []) {
    const clean = normalizeText(lesson.text)
    if (!clean) continue
    const isCorrective = lesson.signal === 'failure'
      || lesson.signal === 'correction'
      || clean.toLowerCase().includes('avoid')
    addSectionTextCandidates(candidates, clean, {
      sourceType: 'autoLesson',
      role: isCorrective ? 'negative' : 'preserve',
      priority: SOURCE_PRIORITY.autoLesson,
      defaultSection: isCorrective ? 'technical' : classifyPromptSection(clean, 'style'),
      createdAt: lesson.updatedAt || 0,
      meta: { lessonId: lesson.id, category: lesson.category, support: lesson.support },
    })
  }
```

- [ ] **Step 3: Select active lessons in operator run**

In `operator/run.js`, import:

```js
import { selectAutoLessonsForProject } from './autoLessons.js'
```

After `activeProjectLessons` is created, add:

```js
const activeAutoLessons = selectAutoLessonsForProject(globalState, project, 8)
```

Update the progress line to include automatic lessons:

```js
writeProgress('prompt', `Assembling prompt — ${activeMemories.length} memories, ${activeProjectLessons.length} project lessons, ${activeAutoLessons.length} auto lessons, ${orderedLocked.filter(e => e.enabled).length} locked, ${sendingRefs.length} refs`)
```

Pass `activeAutoLessons` into `buildStructuredPrompt()`.

Add to `generationReceipt`:

```js
  autoLessonsUsed: { count: activeAutoLessons.length, ids: activeAutoLessons.map((lesson) => lesson.id) },
```

- [ ] **Step 4: Dry-run prompt check**

Run:

```bash
node --env-file=.env operator/run.js --dry-run --prompt "Create five spring floral French press-on nails, 3:4 product image"
```

Expected: dry run completes without calling Gemini. If there is no active project in the isolated worktree data folder, run only the build check in Task 5 and note that dry-run needs copied local data.

---

### Task 4: Expose Automatic Lessons To Operator Context

**Files:**
- Modify: `operator/context.js`

- [ ] **Step 1: Import the selector**

Add:

```js
import { selectAutoLessonsForProject } from './autoLessons.js'
```

- [ ] **Step 2: Include `autoLessons` in returned context**

After `projectLessons` is loaded, add:

```js
  const autoLessons = selectAutoLessonsForProject(globalState, { ...project, id: resolvedProjectId, category: projectCategory }, 8)
```

In the returned object, add:

```js
    autoLessons: autoLessons.map((lesson) => ({
      id: lesson.id,
      category: lesson.category || 'global',
      signal: lesson.signal || 'preference',
      text: truncate(lesson.text, 260),
      support: lesson.support || 0,
    })),
```

- [ ] **Step 3: Run context import check**

Run:

```bash
node --input-type=module -e "import('./operator/context.js').then(() => console.log('context import ok'))"
```

Expected: prints `context import ok`.

---

### Task 5: Verification And Devlog

**Files:**
- Modify: `DEVLOG.md`

- [ ] **Step 1: Add devlog entry**

Add this bullet under `2026-05-01 — Feedback Learning Loop MVP`:

```md
- Added automatic category memory distillation so repeated Rick feedback can carry into future projects without a visible review task.
```

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: Vite build passes.

- [ ] **Step 3: Inspect changed files**

Run:

```bash
git status --short
git diff --stat
```

Expected: only planned source/docs files changed.

- [ ] **Step 4: Commit**

Run:

```bash
git add operator/autoLessons.js operator/analyze.js operator/promptBuilder.js operator/run.js operator/context.js DEVLOG.md docs/superpowers/plans/2026-05-01-automatic-memory-distiller.md
git commit -m "Add automatic feedback memory distiller"
```

Expected: commit succeeds on `codex/automatic-memory-distiller`.

---

## Self-Review

- Spec coverage: fully automatic memory is handled by automatic distillation during global analysis and automatic prompt injection during operator runs.
- Project-vs-cross-project boundary: project lessons remain project-scoped; automatic lessons are category-scoped, so nail feedback carries into new nail projects without polluting logos/packaging.
- User burden: no visible review card or manual save is required.
- Test coverage: pure helper check verifies lesson extraction and selection; import/build checks verify integration.
