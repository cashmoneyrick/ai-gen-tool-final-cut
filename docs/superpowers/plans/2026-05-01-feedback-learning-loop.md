# Feedback Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Rick's readiness labels and reasons into reusable batch lessons that guide the next generation.

**Architecture:** Add a small pure helper that distills reviewed outputs into keep/avoid/ref guidance. Surface that lesson in the review dock with a save button that stores into the existing `projectLessons` store. Keep Claude/operator judgments hidden by default until Rick chooses to reveal them. Load saved lessons into operator context and prompt assembly so future generations can use them.

**Tech Stack:** React 19, existing JSON storage, `projectLessons`, Vite build verification.

---

### Task 1: Batch Lesson Helper

**Files:**
- Create: `src/feedback/batchLessons.js`

- [x] Add `buildBatchLesson(outputs)` that returns reviewed counts, usable counts, keep notes, avoid notes, ref candidate ids, and a concise lesson text.
- [x] Verify with `node --input-type=module` by importing the helper and running it on mock outputs.

### Task 2: Save Lessons From App State

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/v3/ReviewConsole.jsx`
- Modify: `src/v3/ImageViewer.jsx`

- [x] Pass `systemMemory.handlers.saveLesson` into `ReviewConsole`.
- [x] Pass that handler into `ImageViewer`.
- [x] In `ImageViewer`, compute a batch lesson from `outputs` and add a "Save Batch Lesson" button.
- [x] Use signal `preference` for positive lessons.
- [x] Verify with `npm run build`.

### Task 3: Silent Judge Mode

**Files:**
- Modify: `src/v3/ImageViewer.jsx`
- Modify: `src/v3/ReviewConsole.css`

- [x] Hide the Claude/operator comparison card and annotation warning by default.
- [x] Add a compact "Reveal Claude" / "Hide Claude" toggle.
- [x] Keep Rick readiness, score, and reason controls visible.
- [x] Verify with `npm run build`.

### Task 4: Operator Uses Saved Lessons

**Files:**
- Modify: `operator/context.js`
- Modify: `operator/run.js`
- Modify: `operator/promptBuilder.js`

- [x] Load recent project lessons in `operator/context.js`.
- [x] Load active project lessons in `operator/run.js` and pass them to `buildStructuredPrompt`.
- [x] Add project lesson candidates in `operator/promptBuilder.js` with preserve/change roles based on lesson signal.
- [x] Verify with `npm run build`.

### Task 5: Document and Verify

**Files:**
- Modify: `DEVLOG.md`

- [x] Add a short devlog entry.
- [x] Run `npm run build`.
- [x] Run `npm run lint` and record that existing repo-wide lint failures remain out of scope.

---

## Self-Review

- Covers feedback collection, hidden operator ratings, lesson saving, and lesson application.
- Keeps scope inside Phase 1 feedback loop work.
- Does not add new generation modes or mass-production features.
