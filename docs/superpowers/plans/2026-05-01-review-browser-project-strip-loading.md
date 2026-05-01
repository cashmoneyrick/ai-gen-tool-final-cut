# Review Browser Project Strip And Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved review browser fix so the strip is project-only, image selection survives live sync, and nearby big images preload.

**Architecture:** Add small pure navigation helpers with node tests, then wire `App.jsx` and `ReviewConsole.jsx` so the review view uses project-scoped outputs. Keep the current UI and storage model intact.

**Tech Stack:** React 19, Vite, built-in Node test runner for helper tests, existing browser verification.

---

### Task 1: Add Review Navigation Helpers

**Files:**
- Create: `src/v3/reviewNavigation.js`
- Test: `src/v3/reviewNavigation.test.js`

- [ ] **Step 1: Write failing helper tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findOutputIndexById,
  resolveSelectedOutputId,
  getNearbyImageUrls,
} from './reviewNavigation.js'

test('findOutputIndexById finds the selected output by id', () => {
  assert.equal(findOutputIndexById([{ id: 'a' }, { id: 'b' }], 'b'), 1)
})

test('resolveSelectedOutputId keeps selected id after new outputs arrive before it', () => {
  const outputs = [{ id: 'new' }, { id: 'old' }]
  assert.equal(resolveSelectedOutputId(outputs, 'old', 1), 'old')
})

test('resolveSelectedOutputId falls back to nearest valid output when selected id is missing', () => {
  const outputs = [{ id: 'a' }, { id: 'b' }]
  assert.equal(resolveSelectedOutputId(outputs, 'missing', 1), 'b')
})

test('getNearbyImageUrls returns nearby image URLs without the current image', () => {
  const outputs = [
    { id: 'a', imagePath: 'a.jpg' },
    { id: 'b', imagePath: 'b.jpg' },
    { id: 'c', imagePath: 'c.jpg' },
  ]
  assert.deepEqual(getNearbyImageUrls(outputs, 1, 1), ['/api/images/a', '/api/images/c'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/v3/reviewNavigation.test.js`
Expected: fail because `reviewNavigation.js` does not exist.

- [ ] **Step 3: Implement helper functions**

Add functions for ID lookup, selected-ID preservation, fallback selection, and nearby image URLs.

- [ ] **Step 4: Run helper tests**

Run: `node --test src/v3/reviewNavigation.test.js`
Expected: pass.

### Task 2: Use Project Outputs For Review Navigation

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/v3/ReviewConsole.jsx`

- [ ] **Step 1: Pass project-scoped outputs into the review console**

Use `projectOutputCatalog` as the review navigation list instead of the current session-only list/sitewide strip.

- [ ] **Step 2: Make `ReviewConsole` selection ID-based**

Store selected output ID, derive the current index from the current project output list, and preserve it through live-sync refreshes.

- [ ] **Step 3: Keep existing review actions working**

When rating, marking winners, or saving notes on a project-catalog output, keep the active project/session IDs and existing persistence behavior.

### Task 3: Preload Nearby Big Images

**Files:**
- Modify: `src/v3/ReviewConsole.jsx`

- [ ] **Step 1: Preload nearby image URLs**

Use the helper to preload previous/next project images when selection changes.

- [ ] **Step 2: Keep loading UI simple**

Use existing image behavior unless the URL is unavailable. Do not redesign the viewer.

### Task 4: Verify

**Files:**
- Modify if needed: `DEVLOG.md`

- [ ] **Step 1: Run focused tests**

Run: `node --test src/v3/reviewNavigation.test.js`
Expected: pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Start dev server and inspect in browser**

Run: `npm run dev -- --host 127.0.0.1 --port 5174`
Open `http://localhost:5174/`.
Expected: review screen loads.

- [ ] **Step 4: Update DEVLOG**

Add a short note describing the review browser fix.
