# Phase 3: Reference System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Winners automatically become project-scoped visual refs that the operator reads from disk and sends to Gemini as actual image files.

**Architecture:** Each ref record gains `projectId` and `refType` fields. A startup migration backfills these on existing refs. The operator auto-creates ref records for winners on each run, reads refs by projectId (not sessionId), and resolves `imagePath`-based refs by reading the file from disk instead of requiring a browser-uploaded blob. The UI shows the ref type on each card and lets Rick mark uploads as on-hand photos.

**Tech Stack:** Node.js ESM (server/operator), React (frontend), JSON flat-file storage via server/storage.js and src/storage/db.js

---

## Files

| File | Action |
|------|--------|
| `server/api.js` | Modify — add ref migration to startup (backfill projectId + refType) |
| `operator/run.js` | Modify — (1) auto-promote winners to refs, (2) read refs by projectId, (3) read imagePath refs from disk |
| `src/storage/session.js` | Modify — saveRef accepts projectId; loadProjectState reads refs by projectId |
| `src/App.jsx` | Modify — pass projectId to saveRef; set refType:'winner' on "Use as Ref" |
| `src/v3/RefsPanel.jsx` | Modify — show refType badge; add type picker; add on-hand upload section |

---

## Task 1: Migrate existing refs to project-scope + add refType

**Files:**
- Modify: `server/api.js`

Existing refs only have `sessionId`. We need `projectId` (to read them by project in the operator) and `refType` (to display type in the UI). This migration runs once at startup alongside the existing collection migration.

- [ ] **Step 1: Read the current runCollectionMigration block in server/api.js**

```bash
grep -n "runCollectionMigration\|runRefMigration\|ref.*migrat" server/api.js
```

Find where `runCollectionMigration()` is called at the bottom of the file.

- [ ] **Step 2: Add runRefMigration function before the startup call**

In `server/api.js`, directly after the closing `}` of `runCollectionMigration`, add:

```javascript
export function runRefMigration() {
  const refs = storage.getAll('refs')
  const sessions = storage.getAll('sessions')
  const sessionProjectMap = new Map(sessions.map(s => [s.id, s.projectId]))

  let migrated = 0
  for (const ref of refs) {
    if (ref.projectId) continue
    const projectId = sessionProjectMap.get(ref.sessionId)
    if (!projectId) continue
    storage.put('refs', {
      ...ref,
      projectId,
      refType: ref.refType || 'general',
    })
    migrated++
  }
  if (migrated > 0) {
    console.log(`[migrate] Backfilled projectId+refType on ${migrated} ref(s)`)
  }
  return migrated
}
```

- [ ] **Step 3: Call runRefMigration at startup**

Find the two lines at the bottom of `server/api.js`:
```javascript
// Run on startup
runCollectionMigration()
```

Change to:
```javascript
// Run on startup
runCollectionMigration()
runRefMigration()
```

- [ ] **Step 4: Verify migration runs**

```bash
node --env-file=.env -e "import('./server/api.js').then(m => { m.runRefMigration(); console.log('done') })" 2>&1
```

Expected: `done` (migration already ran from module-level call on import; second call returns 0)

- [ ] **Step 5: Verify refs now have projectId**

```bash
node -e "
const fs = require('fs');
const refs = JSON.parse(fs.readFileSync('data/refs.json', 'utf8'));
console.log('Total refs:', refs.length);
console.log('With projectId:', refs.filter(r => r.projectId).length);
console.log('Sample refType:', refs[0]?.refType);
"
```

Expected: all refs have `projectId`, `refType` is `'general'`.

- [ ] **Step 6: Commit**

```bash
git add server/api.js
git commit -m "feat: migrate refs to project-scope, add refType field"
```

---

## Task 2: Auto-promote winner outputs to project refs on operator startup

**Files:**
- Modify: `operator/run.js` (around line 129, after allRefs is loaded)

Each time the operator starts, it checks whether each winner output already has a ref record. If not, it creates one with `refType: 'winner'` and `send: false`. Rick then opts in to send specific winner refs.

- [ ] **Step 1: Read how allRefs and allWinners are loaded**

```bash
sed -n '125,140p' operator/run.js
```

You will see:
```javascript
const allRefs = storage.getAllByIndex('refs', 'sessionId', session.id)
```
and allWinners loaded earlier.

- [ ] **Step 2: Change allRefs to read by projectId**

Find:
```javascript
const allRefs = storage.getAllByIndex('refs', 'sessionId', session.id)
```

Replace with:
```javascript
const allRefs = storage.getAllByIndex('refs', 'projectId', projectId)
```

- [ ] **Step 3: Add winner auto-promotion block**

Directly after the `allRefs` line, add:

```javascript
// Auto-promote winner outputs to project refs (refType: 'winner')
const existingRefOutputIds = new Set(allRefs.filter(r => r.sourceOutputId).map(r => r.sourceOutputId))
const winnerOutputsForRef = allWinners
  .map(w => outputMap.get(w.outputId || w.id))
  .filter(o => o && o.imagePath && !existingRefOutputIds.has(o.id))

for (const output of winnerOutputsForRef) {
  const newRef = {
    id: `ref-winner-${output.id}`,
    projectId,
    sessionId: session.id,
    sourceOutputId: output.id,
    refType: 'winner',
    imagePath: output.imagePath,
    name: `Winner ${output.displayId || output.id.slice(0, 8)}`,
    send: false,
    createdAt: Date.now(),
  }
  storage.put('refs', newRef)
  allRefs.push(newRef)
}

if (winnerOutputsForRef.length > 0) {
  console.log(`[operator] Auto-promoted ${winnerOutputsForRef.length} winner(s) to project refs`)
}
```

- [ ] **Step 4: Verify outputMap is defined before this block**

```bash
grep -n "outputMap" operator/run.js | head -5
```

`outputMap` should be defined before the `allRefs` line. If it isn't, move the auto-promotion block to after `outputMap` is defined.

- [ ] **Step 5: Test dry-run — refs should include auto-promoted winners**

```bash
node --env-file=.env operator/run.js --dry-run 2>&1 | grep -E "ref|winner|promote"
```

Expected output includes:
```
[operator] Auto-promoted N winner(s) to project refs
```
On second run: no promote line (already exists).

- [ ] **Step 6: Commit**

```bash
git add operator/run.js
git commit -m "feat: auto-promote winner outputs to project refs on operator startup"
```

---

## Task 3: Operator reads imagePath refs from disk

**Files:**
- Modify: `operator/run.js` (around line 411, refPayloads block)

Winner refs have `imagePath` but no `blobBase64`. We read the file from disk and base64-encode it.

- [ ] **Step 1: Find the refPayloads block**

```bash
sed -n '408,425p' operator/run.js
```

You will see:
```javascript
const refPayloads = sendingRefs
  .filter((r) => r.blobBase64)
  .map((r) => ({
    base64: r.blobBase64,
    mimeType: r.type || 'image/png',
  }))
```

- [ ] **Step 2: Check fs is imported at the top of run.js**

```bash
grep -n "^import.*fs\|createRequire\|readFileSync" operator/run.js | head -5
```

If `fs` is not imported, find the import block at the top of run.js and add:
```javascript
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
```

(Check if `fileURLToPath` is already imported — it likely is.)

- [ ] **Step 3: Add helper to resolve imagePath to absolute path**

Find the line `import { fileURLToPath } from 'url'` (or wherever URL utilities are imported). After it, add:

```javascript
const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url))
```

(Check if `DATA_DIR` or similar constant already exists — grep for it. If it does, use that instead.)

- [ ] **Step 4: Replace the refPayloads block**

Replace:
```javascript
const refPayloads = sendingRefs
  .filter((r) => r.blobBase64)
  .map((r) => ({
    base64: r.blobBase64,
    mimeType: r.type || 'image/png',
  }))
```

With:
```javascript
const refPayloads = sendingRefs.flatMap((r) => {
  if (r.blobBase64) {
    return [{ base64: r.blobBase64, mimeType: r.type || 'image/png' }]
  }
  if (r.imagePath) {
    try {
      const absPath = `${DATA_DIR}/${r.imagePath}`
      const buf = readFileSync(absPath)
      const base64 = buf.toString('base64')
      const mimeType = r.imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
      return [{ base64, mimeType }]
    } catch {
      console.warn(`[operator] Could not read ref image: ${r.imagePath}`)
      return []
    }
  }
  return []
})
```

- [ ] **Step 5: Verify sendingRefs now includes winner refs when send: true**

In the test, manually flip one winner ref to `send: true` in `data/refs.json`, then dry-run:

```bash
node -e "
const fs = require('fs');
const refs = JSON.parse(fs.readFileSync('data/refs.json', 'utf8'));
const winnerRef = refs.find(r => r.refType === 'winner');
if (winnerRef) {
  winnerRef.send = true;
  fs.writeFileSync('data/refs.json', JSON.stringify(refs, null, 2));
  console.log('Flipped ref to send:', winnerRef.id);
}
"
```

Then:
```bash
node --env-file=.env operator/run.js --dry-run 2>&1 | grep -E "ref|Ref"
```

Expected: `Refs sending: 1` (the winner ref) — confirms imagePath reads work.

Reset it afterward:
```bash
node -e "
const fs = require('fs');
const refs = JSON.parse(fs.readFileSync('data/refs.json', 'utf8'));
const r = refs.find(r => r.refType === 'winner' && r.send);
if (r) { r.send = false; fs.writeFileSync('data/refs.json', JSON.stringify(refs, null, 2)); }
"
```

- [ ] **Step 6: Commit**

```bash
git add operator/run.js
git commit -m "feat: operator reads imagePath-based refs from disk, auto-promote uses project refs"
```

---

## Task 4: Frontend — project-scope saveRef + refType on Use as Ref

**Files:**
- Modify: `src/storage/session.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Update saveRef to accept and store projectId**

In `src/storage/session.js`, find `saveRef` (line ~401):

```javascript
export async function saveRef(sessionId, ref) {
  ...
  await db.put('refs', { ...persistable, sessionId, blobBase64 })
}
```

Change signature and storage to include projectId:

```javascript
export async function saveRef(sessionId, ref, projectId = null) {
  const { previewUrl: _previewUrl, file: _file, blob, ...persistable } = ref
  let blobBase64 = persistable.blobBase64 || null
  if (blob && !blobBase64) {
    try {
      blobBase64 = await blobToBase64(blob)
    } catch {
      console.warn('[session] failed to convert ref blob to base64')
    }
  }
  await db.put('refs', { ...persistable, sessionId, projectId, blobBase64 })
}
```

- [ ] **Step 2: Update loadProjectState to read refs by projectId**

In `src/storage/session.js`, find `loadProjectState` (line ~229). Find this line:

```javascript
db.getAllByIndex('refs', 'sessionId', sessionId),
```

Replace with:

```javascript
projectId
  ? db.getAllByIndex('refs', 'projectId', projectId)
  : db.getAllByIndex('refs', 'sessionId', sessionId),
```

- [ ] **Step 3: Update App.jsx handleAddRefs to pass projectId and refType**

In `src/App.jsx`, find `handleAddRefs` (line ~517). Find:

```javascript
await persist.saveRef(activeSessionId, ref)
```

Replace with:

```javascript
await persist.saveRef(activeSessionId, { ...ref, refType: ref.refType || 'general' }, activeProjectId)
```

- [ ] **Step 4: Update onUseAsRef in App.jsx to set refType: 'winner'**

In `src/App.jsx`, find the `onUseAsRef` handler passed to ReviewConsole (line ~833, inside the JSX). Find the `onAddRefs(dt.files)` call inside it (in `src/v3/ReviewConsole.jsx` line ~379):

Actually the `onUseAsRef` handler in ReviewConsole (line ~368) creates a `File` and calls `onAddRefs(dt.files)`. That goes through `handleAddRefs` in App.jsx which saves with `refType: 'general'`.

We need to pass `refType: 'winner'` for this path. The cleanest fix: instead of using `onAddRefs` (which treats everything as a file), add a separate `onUseAsRef` handler in `src/App.jsx` that calls `saveRef` directly with the output's `imagePath`:

In `src/App.jsx`, after `handleAddRefs`, add:

```javascript
const handleUseOutputAsRef = useCallback(async (output) => {
  if (!activeSessionId || !activeProjectId) return
  const ref = {
    id: `ref-winner-${output.id}`,
    name: `Winner ${output.displayId || output.id.slice(0, 8)}`,
    refType: 'winner',
    sourceOutputId: output.id,
    imagePath: output.imagePath,
    send: false,
    createdAt: Date.now(),
    type: output.mimeType || 'image/jpeg',
    size: 0,
  }
  try {
    await persist.saveRef(activeSessionId, ref, activeProjectId)
    setRefs((prev) => {
      if (prev.some(r => r.sourceOutputId === output.id)) return prev
      const previewUrl = output.imagePath
        ? `/api/images/${output.imagePath.split('/').pop()}`
        : null
      return [...prev, { ...ref, previewUrl }]
    })
  } catch (err) {
    console.warn('[refs] failed to save winner ref', err)
  }
}, [activeSessionId, activeProjectId])
```

Then find where `onUseAsRef` is wired in App.jsx JSX (around line 833):

```bash
grep -n "onUseAsRef\|ReviewConsole" src/App.jsx | head -10
```

Pass the new handler: replace whatever `onUseAsRef` currently gets with `onUseAsRef={handleUseOutputAsRef}`.

- [ ] **Step 5: Update updateRefIds to also write projectId-indexed refs**

In `src/storage/session.js`, `updateRefIds` calls `saveSessionFields(sessionId, { refIds: ids })`. This still works for backward compat. No change needed — refIds on session is still the ordering mechanism.

- [ ] **Step 6: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: build succeeds, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/storage/session.js src/App.jsx
git commit -m "feat: saveRef writes projectId; Use-as-Ref creates winner ref with imagePath"
```

---

## Task 5: Show refType badge in RefsPanel

**Files:**
- Modify: `src/v3/RefsPanel.jsx`

Add a small colored badge showing the ref type on each ref card.

- [ ] **Step 1: Find the ref card render block in RefsPanel.jsx**

```bash
grep -n "ref\.name\|ref-card\|refCard\|blobBase64\|previewUrl" src/v3/RefsPanel.jsx | head -10
```

Find where individual refs are rendered (the `.map()` over refs array).

- [ ] **Step 2: Add REF_TYPE_LABELS constant**

At the top of `src/v3/RefsPanel.jsx`, after the existing `REF_MODES` constant, add:

```javascript
export const REF_TYPE_LABELS = {
  winner:   { label: '★ Winner',  color: '#c8a84b' },
  'on-hand': { label: '📷 On-hand', color: '#5b8c5a' },
  general:  { label: 'Ref',       color: '#666' },
}
```

- [ ] **Step 3: Add badge to each ref card**

Inside the ref card render, find where `ref.name` is displayed. Immediately after the name element, add:

```jsx
{ref.refType && REF_TYPE_LABELS[ref.refType] && (
  <span style={{
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '0.03em',
    color: REF_TYPE_LABELS[ref.refType].color,
    textTransform: 'uppercase',
    display: 'block',
    marginTop: 1,
  }}>
    {REF_TYPE_LABELS[ref.refType].label}
  </span>
)}
```

- [ ] **Step 4: Add on-hand photo upload section**

In RefsPanel.jsx, find the upload button/drop area. Below the existing upload area, add a second upload button specifically for on-hand photos:

```jsx
<label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#5b8c5a', marginTop: 6 }}>
  <PlusIcon />
  Add on-hand photo
  <input
    type="file"
    accept="image/*"
    multiple
    style={{ display: 'none' }}
    onChange={(e) => {
      if (!onAddRefs || !e.target.files?.length) return
      // Tag files as on-hand by passing a custom property
      const files = Array.from(e.target.files)
      // We need to communicate refType to App.jsx — use a custom FileList workaround:
      // Call onAddRefs with a flag object instead
      onAddOnHandRefs?.(e.target.files)
      e.target.value = ''
    }}
  />
</label>
```

- [ ] **Step 5: Wire onAddOnHandRefs through the component tree**

In `src/v3/RefsPanel.jsx`, add `onAddOnHandRefs` to the props destructuring:

```javascript
export default function RefsPanel({ refs, onAddRefs, onRemoveRef, onToggleRefSend, onUpdateRefMode, onUpdateRefNotes, onReorderRefs, onAddOnHandRefs }) {
```

In `src/App.jsx`, add a handler:

```javascript
const handleAddOnHandRefs = useCallback(async (files) => {
  // Same as handleAddRefs but forces refType: 'on-hand'
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  for (const file of imageFiles) {
    const url = URL.createObjectURL(file)
    const ref = {
      id: createId(),
      file,
      blob: file,
      name: file.name,
      size: file.size,
      type: file.type,
      previewUrl: url,
      refType: 'on-hand',
      send: true,
      createdAt: Date.now(),
    }
    if (activeSessionId) {
      try {
        await persist.saveRef(activeSessionId, ref, activeProjectId)
      } catch {
        URL.revokeObjectURL(url)
        continue
      }
    }
    setRefs(prev => [...prev, ref])
  }
}, [activeSessionId, activeProjectId])
```

Find where `RefsPanel` or `onAddRefs` is passed in App.jsx JSX and add `onAddOnHandRefs={handleAddOnHandRefs}`.

Also find where `RefsPanel` is used in `src/v3/RefsPopover.jsx` and `src/v3/StudioPopover.jsx`:

```bash
grep -n "RefsPanel\|onAddRefs" src/v3/RefsPopover.jsx src/v3/StudioPopover.jsx | head -10
```

Pass `onAddOnHandRefs` through in those components too (add to their props and forward to RefsPanel).

- [ ] **Step 6: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 7: Start dev server and verify**

Open `http://localhost:5173`. Check:
- Each ref card shows a type badge (★ Winner, Ref, etc.)
- Winner refs auto-created by operator are visible in the refs panel
- "Add on-hand photo" button appears and uploads save with type badge "📷 On-hand"

- [ ] **Step 8: Commit**

```bash
git add src/v3/RefsPanel.jsx src/v3/RefsPopover.jsx src/v3/StudioPopover.jsx src/App.jsx
git commit -m "feat: show refType badge in refs panel, add on-hand photo upload"
```

---

## Task 6: Update OPERATOR.md and memory

**Files:**
- Modify: `OPERATOR.md`
- Modify: `memory/project_handoff_next_session.md`

- [ ] **Step 1: Add winner-refs section to OPERATOR.md**

In `OPERATOR.md`, after the **Image Evaluation** section, add:

```markdown
## Winner Refs

After every operator run, winner outputs are automatically added as project refs with `send: false`.

To use a winner image as a visual ref for the next generation:
1. Open the refs panel
2. Find the winner ref (marked ★ Winner)
3. Toggle it to "send"

The operator will then include the actual winner image as a visual input to Gemini alongside the prompt.
```

- [ ] **Step 2: Update build handoff memory**

Edit `memory/project_handoff_next_session.md`:

In "What's Done", add under Phase 3:

```markdown
### Phase 3 — Reference System (COMPLETE — 2026-04-29)
- ✅ Refs migrated to project-scope (projectId + refType backfilled on all existing refs)
- ✅ Winners auto-promoted to project refs on each operator run (refType: 'winner', send: false)
- ✅ Operator reads imagePath-based refs from disk (no browser blob needed)
- ✅ saveRef writes projectId; loadProjectState reads refs by projectId
- ✅ Use-as-Ref now creates a winner ref with imagePath instead of fetching the blob
- ✅ refType badge shown on each ref card (★ Winner, 📷 On-hand, Ref)
- ✅ Dedicated on-hand photo upload section
```

In "What's Next", update to Phase 4.

- [ ] **Step 3: Commit**

```bash
git add OPERATOR.md
git commit -m "docs: add winner refs section to OPERATOR.md, mark Phase 3 complete in handoff"
```

---

## Self-Review

**Spec coverage:**
- ✅ Winners auto-become refs → Tasks 2, 4
- ✅ Refs organized by type → Tasks 1, 5
- ✅ Claude passes actual image files to Gemini (not text descriptions) → Task 3
- ✅ On-hand photography gets its own ref library → Task 5

**Placeholder scan:** None found.

**Type consistency:**
- `ref.refType` — string — values `'winner' | 'on-hand' | 'general'` — consistent across Tasks 1, 2, 4, 5
- `ref.projectId` — string — consistent across Tasks 1, 3, 4
- `ref.sourceOutputId` — string (output id) — defined in Task 2, used in Task 4 dedup check
- `ref.imagePath` — string (relative to data/) — defined by operator in Task 2, read from disk in Task 3
- `saveRef(sessionId, ref, projectId)` — signature defined in Task 4 Step 1, called in Tasks 4 Steps 3, 5
- `handleUseOutputAsRef` — defined in Task 4 Step 4, wired in App.jsx JSX in same step
- `DATA_DIR` — defined in Task 3 Step 3, used in Task 3 Step 4
- `onAddOnHandRefs` — defined in Task 5 Step 4, threaded through in Task 5 Step 5
