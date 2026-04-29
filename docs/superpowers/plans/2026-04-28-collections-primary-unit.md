# Collections as Primary Data Unit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the project record the single source of truth for collection-level data, eliminating the session indirection in the operator, analysis engine, and frontend persist layer.

**Architecture:** Each project record absorbs the meaningful fields currently stored on its session (goal, outputIds, winnerIds, model, batchSize, etc.). A one-time startup migration copies these fields. Sessions remain on disk as an inert backward-compatible run log — they are never deleted, just no longer written to as the primary record.

**Tech Stack:** Node.js (server/operator), React (frontend), JSON flat-file storage via server/storage.js and src/storage/db.js

---

## Context You Must Read Before Starting

The codebase has two storage layers:
- **Server-side** (`server/storage.js`): used by the operator (`operator/run.js`, `operator/analyze.js`) and the server (`server/api.js`). Reads/writes JSON files in `data/`.
- **Frontend** (`src/storage/db.js` + `src/storage/session.js`): used by the React app. Makes fetch calls to `/api/store/*` which proxies to the server-side storage.

Both layers must be updated. Changes to server/storage.js affect the operator and the API. Changes to src/storage/session.js affect what the React app reads and writes.

The app is running in dev mode at `http://localhost:5173`. Test by opening the app and checking that the active project loads correctly with all its outputs and goal.

---

## Task 1: Startup migration — lift session fields onto project records

**Files:**
- Modify: `server/api.js`

This migration runs once at server startup. For each project that hasn't been migrated yet (no `_sessionMigrated` flag), it finds the associated session and copies its fields onto the project record.

- [ ] **Step 1: Read the current startup block in server/api.js**

Run:
```bash
grep -n "migrate\|startup\|init\|export.*handle\|export function\|^export" server/api.js | head -20
```

Find the exported handler function (likely `handleRequest` or similar at the bottom of the file).

- [ ] **Step 2: Add the migration function before the exports in server/api.js**

Find the line that reads `// --- Bulk migrate` or the last route handler before exports. Add this migration function directly above it:

```javascript
// --- One-time collection migration: lift session fields onto project records ---

const EMPTY_BUCKETS_MIGRATE = { subject: '', style: '', lighting: '', composition: '', technical: '' }

function mergeIds(projectIds, sessionIds) {
  const seen = new Set(projectIds || [])
  const result = [...(projectIds || [])]
  for (const id of (sessionIds || [])) {
    if (!seen.has(id)) { seen.add(id); result.push(id) }
  }
  return result
}

export function runCollectionMigration() {
  const projects = storage.getAll('projects')
  const sessions = storage.getAll('sessions')
  const sessionByProject = new Map(sessions.map(s => [s.projectId, s]))

  let migrated = 0
  for (const project of projects) {
    if (project._sessionMigrated) continue
    const session = sessionByProject.get(project.id)
    if (!session) {
      // No session — mark migrated with defaults
      storage.put('projects', { ...project, _sessionMigrated: true })
      migrated++
      continue
    }
    storage.put('projects', {
      ...project,
      goal: project.goal ?? session.goal ?? '',
      buckets: project.buckets ?? session.buckets ?? { ...EMPTY_BUCKETS_MIGRATE },
      assembledPrompt: project.assembledPrompt ?? session.assembledPrompt ?? '',
      assembledPromptDirty: project.assembledPromptDirty ?? session.assembledPromptDirty ?? false,
      roughNotes: project.roughNotes ?? session.roughNotes ?? '',
      lockedElementIds: mergeIds(project.lockedElementIds, session.lockedElementIds),
      refIds: mergeIds(project.refIds, session.refIds),
      outputIds: mergeIds(project.outputIds, session.outputIds),
      winnerIds: mergeIds(project.winnerIds, session.winnerIds),
      model: project.model ?? session.model ?? null,
      batchSize: project.batchSize ?? session.batchSize ?? 1,
      planStatus: project.planStatus ?? session.planStatus ?? 'idle',
      approvedPlan: project.approvedPlan ?? session.approvedPlan ?? null,
      promptPreviewMode: project.promptPreviewMode ?? session.promptPreviewMode ?? false,
      _sessionMigrated: true,
    })
    migrated++
  }
  if (migrated > 0) {
    console.log(`[migrate] Lifted ${migrated} session(s) into project records`)
  }
  return migrated
}
```

- [ ] **Step 3: Call the migration at the end of server/api.js**

Find the last few lines of `server/api.js`. Add a call to `runCollectionMigration()` after the function is defined (module-level, runs on import):

```javascript
// Run on startup
runCollectionMigration()
```

- [ ] **Step 4: Restart the dev server and verify the migration ran**

Stop the dev server (Ctrl-C) and restart:
```bash
npm run dev 2>&1 | head -20
```

Expected output to include:
```
[migrate] Lifted 26 session(s) into project records
```

On second restart, expected:
```
(no migrate line — migration already done)
```

- [ ] **Step 5: Verify project records now have goal and outputIds**

```bash
node -e "
const fs = require('fs');
const projects = JSON.parse(fs.readFileSync('data/projects.json', 'utf8'));
const zodiac = projects.find(p => p.name.includes('Zodiac'));
console.log('goal:', zodiac.goal);
console.log('outputIds count:', zodiac.outputIds?.length);
console.log('winnerIds count:', zodiac.winnerIds?.length);
console.log('_sessionMigrated:', zodiac._sessionMigrated);
"
```

Expected:
```
goal: Design zodiac-themed nail art sets for all 12 signs
outputIds count: 30
winnerIds count: 10
_sessionMigrated: true
```

- [ ] **Step 6: Commit**

```bash
git add server/api.js
git commit -m "feat: one-time migration to lift session fields onto project records"
```

---

## Task 2: Union-merge for projects in server/storage.js

**Files:**
- Modify: `server/storage.js` (lines ~154–171)

Currently, when a project record is written, arrays like `outputIds` and `winnerIds` can be clobbered by a stale browser write. The same union-merge protection that exists for sessions needs to apply to projects.

- [ ] **Step 1: Read the current union-merge block**

```bash
sed -n '150,175p' server/storage.js
```

You will see:
```javascript
// Sessions: union-merge array ID fields so a stale browser write never evicts
// operator-written IDs. outputIds/winnerIds/refIds/lockedElementIds can only grow.
if (storeName === 'sessions' && idx >= 0) {
  const existing = records[idx]
  const arrayFields = ['outputIds', 'winnerIds', 'refIds', 'lockedElementIds']
  ...
}
```

- [ ] **Step 2: Extend union-merge to cover projects too**

Change the condition from:
```javascript
if (storeName === 'sessions' && idx >= 0) {
```

To:
```javascript
if ((storeName === 'sessions' || storeName === 'projects') && idx >= 0) {
```

That single-line change is the entire edit. The `arrayFields` list and merge logic work identically for both.

- [ ] **Step 3: Verify the change looks correct**

```bash
sed -n '150,175p' server/storage.js
```

Expected: line 156 now reads `if ((storeName === 'sessions' || storeName === 'projects') && idx >= 0) {`

- [ ] **Step 4: Commit**

```bash
git add server/storage.js
git commit -m "feat: extend union-merge protection to project records"
```

---

## Task 3: operator/analyze.js — filter by projectId directly

**Files:**
- Modify: `operator/analyze.js` (lines ~147–165)

Currently `analyzeProject` looks up all sessions for the project, collects their IDs, then filters outputs by session ID. Outputs already carry `projectId`, so the session join is unnecessary.

- [ ] **Step 1: Read the current analyzeProject function opening**

```bash
sed -n '144,170p' operator/analyze.js
```

You will see:
```javascript
export function analyzeProject(projectId) {
  const resolvedId = projectId || storage.getActiveProject()
  const project = storage.get('projects', resolvedId)
  if (!project) return null

  const sessions = storage.getAllByIndex('sessions', 'projectId', resolvedId)
  const sessionIds = new Set(sessions.map(s => s.id))

  // Read all outputs ONCE, filter to this project's sessions
  const allOutputs = storage.getAll('outputs')
  const projectOutputs = allOutputs.filter((o) => sessionIds.has(o.sessionId) && !isPromptPreviewOutput(o))

  // Read all winners for this project's sessions
  const allWinners = storage.getAll('winners')
  const projectWinners = allWinners.filter(w => sessionIds.has(w.sessionId))
  const winnerOutputIds = new Set(projectWinners.map(w => w.outputId || w.id))
```

- [ ] **Step 2: Replace the session-join block with direct projectId filtering**

Replace these lines:
```javascript
  const sessions = storage.getAllByIndex('sessions', 'projectId', resolvedId)
  const sessionIds = new Set(sessions.map(s => s.id))

  // Read all outputs ONCE, filter to this project's sessions
  const allOutputs = storage.getAll('outputs')
  const projectOutputs = allOutputs.filter((o) => sessionIds.has(o.sessionId) && !isPromptPreviewOutput(o))

  // Read all winners for this project's sessions
  const allWinners = storage.getAll('winners')
  const projectWinners = allWinners.filter(w => sessionIds.has(w.sessionId))
```

With:
```javascript
  // Read all outputs ONCE, filter to this project directly (outputs carry projectId)
  const allOutputs = storage.getAll('outputs')
  const projectOutputs = allOutputs.filter((o) => o.projectId === resolvedId && !isPromptPreviewOutput(o))

  // Read all winners for this project directly
  const allWinners = storage.getAll('winners')
  const projectWinners = allWinners.filter(w => w.projectId === resolvedId)
```

- [ ] **Step 3: Check if `sessions` variable is used anywhere else in analyzeProject**

```bash
grep -n "sessions\|sessionIds" operator/analyze.js
```

If `sessions` is used in `inferProjectCategory` call further down, find it and pass `[]` instead:

```bash
sed -n '320,340p' operator/analyze.js
```

If line ~325 reads:
```javascript
project.category || inferProjectCategory(project, sessions, projectOutputs)
```

Change it to:
```javascript
project.category || inferProjectCategory(project, [], projectOutputs)
```

- [ ] **Step 4: Verify the operator still produces a brief**

With the dev server running:
```bash
node --env-file=.env operator/run.js --project $(node -e "const p=require('./data/projects.json');console.log(p.find(x=>x.name.includes('Zodiac')).id)") 2>&1 | head -30
```

Expected: operator loads, prints project name, stats line shows correct output/winner counts, no errors.

- [ ] **Step 5: Commit**

```bash
git add operator/analyze.js
git commit -m "feat: filter outputs/winners by projectId in analyze.js, remove session join"
```

---

## Task 4: operator/run.js — read from project, write to project

**Files:**
- Modify: `operator/run.js`

The operator currently reads `goal`, `outputIds`, `winnerIds` from the session. After migration, these live on the project. We update run.js to read from project and write new outputIds to project (in addition to session, for backward compat).

- [ ] **Step 1: Update goal and ordering to read from project**

Find lines ~108–120 in operator/run.js:
```bash
sed -n '99,135p' operator/run.js
```

You will see:
```javascript
const sessions = storage.getAllByIndex('sessions', 'projectId', projectId)
const session = sessions[0]
if (!session) {
  console.error(`[operator] No session found for project: ${projectId}`)
  ...
}
...
console.log(`[operator] Goal: ${session.goal || '(none)'}`)
```

Change the goal log line from `session.goal` to `project.goal`:
```javascript
console.log(`[operator] Goal: ${project.goal || session.goal || '(none)'}`)
```

- [ ] **Step 2: Update output ordering to prefer project.outputIds**

Find line ~311 in operator/run.js:
```bash
sed -n '305,320p' operator/run.js
```

You will see:
```javascript
const orderedOutputs = (session.outputIds || []).map((id) => outputMap.get(id)).filter(Boolean)
const orderedWinners = (session.winnerIds || []).map((id) => winnerMap.get(id)).filter(Boolean)
```

Change to prefer project over session (project is now the source of truth):
```javascript
const orderedOutputs = (project.outputIds || session.outputIds || []).map((id) => outputMap.get(id)).filter(Boolean)
const orderedWinners = (project.winnerIds || session.winnerIds || []).map((id) => winnerMap.get(id)).filter(Boolean)
```

- [ ] **Step 3: Write new outputIds to project after generation**

Find the block around line ~722 that writes to session after generation:
```bash
sed -n '715,750p' operator/run.js
```

You will see:
```javascript
  const freshSession = storage.get('sessions', session.id) || session
  const currentOutputIds = freshSession.outputIds || []
  const updatedOutputIds = [...newOutputIds, ...currentOutputIds]
  const updatedSession = {
    ...freshSession,
    outputIds: updatedOutputIds,
    updatedAt: Date.now(),
  }
  storage.put('sessions', updatedSession)

  // Also touch project updatedAt
  storage.put('projects', { ...project, updatedAt: Date.now() })
```

Change the project write to also persist the new outputIds:
```javascript
  const freshSession = storage.get('sessions', session.id) || session
  const currentOutputIds = freshSession.outputIds || []
  const updatedOutputIds = [...newOutputIds, ...currentOutputIds]
  const updatedSession = {
    ...freshSession,
    outputIds: updatedOutputIds,
    updatedAt: Date.now(),
  }
  storage.put('sessions', updatedSession)

  // Write outputIds to project (project is now primary data unit)
  const freshProject = storage.get('projects', projectId) || project
  const currentProjectOutputIds = freshProject.outputIds || []
  const mergedProjectOutputIds = [...newOutputIds, ...currentProjectOutputIds.filter(id => !newOutputIds.includes(id))]
  storage.put('projects', { ...freshProject, outputIds: mergedProjectOutputIds, updatedAt: Date.now() })
```

- [ ] **Step 4: Do the same for the prompt-preview output block**

Find line ~539 (the preview output block):
```bash
sed -n '535,555p' operator/run.js
```

You will see:
```javascript
  const freshSession = storage.get('sessions', session.id) || session
  const currentOutputIds = freshSession.outputIds || []
  const updatedSession = {
    ...freshSession,
    outputIds: [outputId, ...currentOutputIds],
    updatedAt: Date.now(),
  }
  storage.put('sessions', updatedSession)
  storage.put('projects', { ...project, updatedAt: Date.now() })
```

Change the project write:
```javascript
  const freshSession = storage.get('sessions', session.id) || session
  const currentOutputIds = freshSession.outputIds || []
  const updatedSession = {
    ...freshSession,
    outputIds: [outputId, ...currentOutputIds],
    updatedAt: Date.now(),
  }
  storage.put('sessions', updatedSession)

  const freshProject = storage.get('projects', projectId) || project
  const currentProjectOutputIds = freshProject.outputIds || []
  storage.put('projects', {
    ...freshProject,
    outputIds: [outputId, ...currentProjectOutputIds.filter(id => id !== outputId)],
    updatedAt: Date.now(),
  })
```

- [ ] **Step 5: Verify operator runs without error**

```bash
node --env-file=.env operator/run.js --project $(node -e "const p=require('./data/projects.json');console.log(p.find(x=>x.name.includes('Zodiac')).id)") 2>&1 | head -30
```

Expected: loads project, reads goal from project, no errors. (Will not generate since we're just testing the run path.)

- [ ] **Step 6: Commit**

```bash
git add operator/run.js
git commit -m "feat: operator reads goal/outputIds from project, writes outputIds to project after generation"
```

---

## Task 5: src/storage/session.js — frontend reads/writes use project

**Files:**
- Modify: `src/storage/session.js`

The frontend persist layer (`session.js`) currently reads goal, buckets, model, outputIds, winnerIds, etc. from the session record. We update it to read these from the project record instead, while keeping the session lookup for refs and lockedElements (which remain indexed by sessionId).

- [ ] **Step 1: Update createProject to add session fields to project record**

Find `createProject` (line ~59). Currently it creates both a project (name only) and a session (all data). Change so the project record also gets the session fields:

Replace:
```javascript
  const project = {
    id: projectId,
    name: name || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    archived: false,
    notes: '',
    defaultModel: null,
  }
```

With:
```javascript
  const project = {
    id: projectId,
    name: name || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    archived: false,
    notes: '',
    defaultModel: null,
    // Collection-level fields (also on session for backward compat)
    goal: '',
    buckets: { ...EMPTY_BUCKETS },
    assembledPrompt: '',
    assembledPromptDirty: false,
    roughNotes: '',
    lockedElementIds: [],
    refIds: [],
    outputIds: [],
    winnerIds: [],
    model: DEFAULT_IMAGE_MODEL,
    batchSize: 1,
    planStatus: 'idle',
    approvedPlan: null,
    promptPreviewMode: false,
    _sessionMigrated: true,
  }
```

- [ ] **Step 2: Update loadProjectState to read from project record**

Find `loadProjectState` (line ~213). Currently it reads `session.goal`, `session.buckets`, etc.

After the session lookup (keep the lookup — we still need `sessionId` for refs/lockedElements), replace the return value's source:

Change this block:
```javascript
  return {
    sessionId,
    goal: session.goal || '',
    goalDirtyAfterApproval: session.goalDirtyAfterApproval || false,
    plan: session.approvedPlan || null,
    planStatus: session.planStatus || 'idle',
    buckets: session.buckets || { ...EMPTY_BUCKETS },
    assembled: session.assembledPrompt || '',
    assembledDirty: session.assembledPromptDirty || false,
    model: session.model || DEFAULT_IMAGE_MODEL,
    batchSize: session.batchSize || 1,
    promptPreviewMode: session.promptPreviewMode || false,
    refs: hydratedRefs,
    lockedElements: orderedLocked.map((el) => ({
      id: el.id,
      text: el.text,
      enabled: el.enabled,
    })),
    outputs: normalizedOutputs,
    winners: orderedWinners,
```

With (add project lookup before this return, use project fields with session fallback):
```javascript
  // Load project record as primary source of truth for collection-level fields
  const project = await db.get('projects', projectId)

  return {
    sessionId,
    goal: project?.goal ?? session.goal ?? '',
    goalDirtyAfterApproval: project?.goalDirtyAfterApproval ?? session.goalDirtyAfterApproval ?? false,
    plan: project?.approvedPlan ?? session.approvedPlan ?? null,
    planStatus: project?.planStatus ?? session.planStatus ?? 'idle',
    buckets: project?.buckets ?? session.buckets ?? { ...EMPTY_BUCKETS },
    assembled: project?.assembledPrompt ?? session.assembledPrompt ?? '',
    assembledDirty: project?.assembledPromptDirty ?? session.assembledPromptDirty ?? false,
    model: project?.model ?? session.model ?? DEFAULT_IMAGE_MODEL,
    batchSize: project?.batchSize ?? session.batchSize ?? 1,
    promptPreviewMode: project?.promptPreviewMode ?? session.promptPreviewMode ?? false,
    refs: hydratedRefs,
    lockedElements: orderedLocked.map((el) => ({
      id: el.id,
      text: el.text,
      enabled: el.enabled,
    })),
    outputs: normalizedOutputs,
    winners: orderedWinners,
```

- [ ] **Step 3: Update saveSessionFields to write to project**

Find `saveSessionFields` (line ~345):
```javascript
export async function saveSessionFields(sessionId, updates) {
  const session = await db.get('sessions', sessionId)
  if (!session) return
  await db.put('sessions', { ...session, ...updates, updatedAt: Date.now() })

  // Also touch the project's updatedAt
  const project = await db.get('projects', session.projectId)
  if (project) {
    await db.put('projects', { ...project, updatedAt: Date.now() })
  }
}
```

Replace with:
```javascript
export async function saveSessionFields(sessionId, updates) {
  // Write to session for backward compat
  const session = await db.get('sessions', sessionId)
  if (session) {
    await db.put('sessions', { ...session, ...updates, updatedAt: Date.now() })
  }

  // Write to project (project is now primary data unit)
  const projectId = session?.projectId
  if (projectId) {
    const project = await db.get('projects', projectId)
    if (project) {
      await db.put('projects', { ...project, ...updates, updatedAt: Date.now() })
    }
  }
}
```

- [ ] **Step 4: Update updateOutputIds to write to project**

Find `updateOutputIds` (line ~427):
```javascript
export async function updateOutputIds(sessionId, ids) {
  const session = await db.get('sessions', sessionId)
  if (!session) return
  const diskIds = session.outputIds || []
  const browserSet = new Set(ids)
  const operatorOnlyIds = diskIds.filter((id) => !browserSet.has(id))
  const merged = [...operatorOnlyIds, ...ids]
  await db.put('sessions', { ...session, outputIds: merged, updatedAt: Date.now() })
  const project = await db.get('projects', session.projectId)
  if (project) await db.put('projects', { ...project, updatedAt: Date.now() })
}
```

Replace with:
```javascript
export async function updateOutputIds(sessionId, ids) {
  // Update session (backward compat)
  const session = await db.get('sessions', sessionId)
  if (session) {
    const diskIds = session.outputIds || []
    const browserSet = new Set(ids)
    const operatorOnlyIds = diskIds.filter((id) => !browserSet.has(id))
    const merged = [...operatorOnlyIds, ...ids]
    await db.put('sessions', { ...session, outputIds: merged, updatedAt: Date.now() })
  }

  // Update project (primary data unit) with same union-merge logic
  const projectId = session?.projectId
  if (projectId) {
    const project = await db.get('projects', projectId)
    if (project) {
      const diskIds = project.outputIds || []
      const browserSet = new Set(ids)
      const operatorOnlyIds = diskIds.filter((id) => !browserSet.has(id))
      const merged = [...operatorOnlyIds, ...ids]
      await db.put('projects', { ...project, outputIds: merged, updatedAt: Date.now() })
    }
  }
}
```

- [ ] **Step 5: Update updateWinnerIds to write to project**

Find `updateWinnerIds` (line ~458):
```javascript
export async function updateWinnerIds(sessionId, ids) {
  await saveSessionFields(sessionId, { winnerIds: ids })
}
```

Replace with:
```javascript
export async function updateWinnerIds(sessionId, ids) {
  // saveSessionFields now writes to both session and project
  await saveSessionFields(sessionId, { winnerIds: ids })
}
```

This one is already handled by `saveSessionFields` update — no change needed unless `saveSessionFields` doesn't handle it. Verify by checking that `saveSessionFields` passes `winnerIds` through. It does (it spreads `updates`). ✓

- [ ] **Step 6: Reload the app in the browser and verify the active project loads correctly**

Open `http://localhost:5173` in the browser. Check:
- The goal field shows the correct text for the active project
- Outputs load correctly
- Winners are shown correctly
- No console errors

```
Open browser DevTools → Console. Look for any errors.
Expected: no errors, project loads with correct data.
```

- [ ] **Step 7: Switch between projects in the project picker**

Click the project picker, switch to a different project (e.g., French Tip Cat-Eye), switch back. Verify:
- Goal changes correctly on switch
- Outputs update on switch
- No console errors

- [ ] **Step 8: Commit**

```bash
git add src/storage/session.js
git commit -m "feat: frontend persist layer reads/writes collection fields from project record"
```

---

## Task 6: Verify end-to-end and update memory

**Files:**
- Modify: `memory/project_handoff_next_session.md`

- [ ] **Step 1: Run a full operator generation to verify outputIds write to project**

With the dev server running, run the operator for a project:
```bash
node --env-file=.env operator/run.js --project $(node -e "const p=require('./data/projects.json');console.log(p.find(x=>x.name.includes('Zodiac')).id)") 2>&1 | tail -20
```

After generation completes, verify the project record has the new outputId at the front:
```bash
node -e "
const p = require('./data/projects.json');
const zodiac = p.find(x => x.name.includes('Zodiac'));
console.log('outputIds count:', zodiac.outputIds?.length);
console.log('first outputId:', zodiac.outputIds?.[0]);
"
```

- [ ] **Step 2: Open the app and verify the new output appears without a browser refresh**

The live-sync mechanism polls for changes. Wait up to 5 seconds. The new output should appear in the image strip.

- [ ] **Step 3: Update the build handoff memory**

Edit `memory/project_handoff_next_session.md` — add to the "What's Done" section:

```markdown
### Collections as Primary Data Unit (COMPLETE — 2026-04-28)
- ✅ Startup migration: session fields lifted onto project records
- ✅ server/storage.js: union-merge extended to projects
- ✅ operator/analyze.js: filters by projectId directly, no session join
- ✅ operator/run.js: reads goal/outputIds from project, writes to project after generation
- ✅ src/storage/session.js: loadProjectState and saveSessionFields read/write from project
```

And update "What's Next" to Phase 3.

- [ ] **Step 4: Commit**

```bash
git add memory/project_handoff_next_session.md
git commit -m "docs: mark collections-as-primary-unit complete in build handoff"
```

---

## Self-Review

**Spec coverage:**
- ✅ Project absorbs session fields → Task 1 (migration)
- ✅ union-merge for projects → Task 2
- ✅ analyze.js filters by projectId → Task 3
- ✅ run.js reads/writes from project → Task 4
- ✅ Frontend persist layer reads from project → Task 5
- ✅ Sessions kept as backward-compat run log → achieved by writing to both in Tasks 4+5
- ✅ No data lost — all tasks preserve existing records

**Placeholder scan:** None found.

**Type consistency:**
- `project.outputIds` — array of strings — used consistently across Tasks 1, 2, 4, 5
- `project.goal` — string — used in Tasks 1, 4, 5
- `project._sessionMigrated` — boolean — used in Tasks 1, 5
- `mergeIds(a, b)` defined in Task 1, used only in Task 1 (server-side)
- Union-merge in session.js (Task 5 Step 4) replicates the same logic inline — consistent with existing pattern in that file
