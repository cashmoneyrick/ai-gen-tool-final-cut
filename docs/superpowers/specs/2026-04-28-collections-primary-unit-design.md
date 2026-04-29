# Collections as Primary Data Unit — Design Spec

**Date:** 2026-04-28  
**Status:** Approved

---

## Problem

The app organizes everything around two records per collection: a "project" (name + metadata only) and a "session" (all meaningful data: goal, refs, locked elements, outputs, winners, model, batch size). They are always 1:1. The session was meant to support multiple runs per project, but that never happened — every project has exactly one session. The indirection adds complexity with no benefit: the operator has to look up a session to find the project's data, the analysis engine filters outputs by session ID instead of project ID, and the frontend tracks two IDs (activeProjectId and activeSessionId) when one would do.

## Goal

Make the project record the single source of truth for collection-level data. Sessions become a transparent background detail — never exposed to the user or the operator.

## What Changes

### Project record absorbs session fields

After migration, each project record contains all collection-level fields currently stored on the session:

```
goal, buckets, assembledPrompt, assembledPromptDirty, roughNotes,
lockedElementIds, refIds, outputIds, winnerIds,
model, batchSize, planStatus, approvedPlan, promptPreviewMode
```

### Session becomes a run log

Sessions are not deleted. They keep their existing data and serve as a backward-compatible run history. No new code writes to sessions as the primary record. Sessions are not exposed in the UI or operator output.

### Data already partially correct

Outputs and winners already carry `projectId` on every record. Analysis can filter by `projectId` directly today — no migration needed for those records. Refs and lockedElements carry only `sessionId` — these continue to use sessionId internally (existing records unchanged, new records tagged with both).

## Migration

A one-time idempotent startup migration runs in `server/api.js`. For each project without `_sessionMigrated: true`, it finds the associated session and copies its fields onto the project record. Sets `_sessionMigrated: true` when done. Safe to run on every startup — the flag prevents double-processing.

## What Doesn't Change

- All existing data files (projects.json, sessions.json, outputs.json, winners.json, refs.json) — no records are deleted or destructured
- The UI — no visual changes, no renamed labels
- The API surface — same routes, same payloads
- Refs and lockedElements — still indexed by sessionId internally

## Files Changed

| File | Change |
|------|--------|
| `server/api.js` | Add startup migration function |
| `server/storage.js` | Extend union-merge to projects |
| `operator/analyze.js` | Filter outputs/winners by projectId, remove session lookup |
| `operator/run.js` | Read goal/outputIds/winnerIds from project, write to project |
| `src/storage/session.js` | loadProjectState/saveSessionFields/updateOutputIds/updateWinnerIds use project |

## Success Criteria

1. After running the app, every project record has `goal`, `outputIds`, `winnerIds` populated
2. The operator reads `project.goal` directly — no `sessions.find()` call needed for goal
3. `operator/analyze.js` produces identical results without the session-ID join
4. `persist.loadProjectState` returns correct data from project record
5. A new generation updates `project.outputIds` directly
6. No data is lost — all existing outputs, winners, refs, locked elements still load correctly
