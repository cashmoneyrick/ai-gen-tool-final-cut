# AI GEN TOOL FINAL CUT

Internal AI image workflow app for generating, reviewing, rating, organizing, and iterating on image outputs.

## What This Repo Is

- `Builder Mode`: edit the app
- `Operator Mode`: use the app/workflow to improve outputs

Repo instruction docs:

- `AGENTS.md` for all coding agents
- `CLAUDE.md` for Claude Code-specific behavior
- `OPERATOR.md` for app-operator behavior
- `PROJECT_STATUS.md` for current work
- `ROADMAP.md` for future plans
- `DEVLOG.md` for completed work and decisions

## App Shape

- `src/` active React UI
- `server/` local API, storage, sync
- `operator/` operator runtime and prompt/generation logic
- `data/` local-only project state

## Quick Start

```bash
npm install
npm run dev
npm run build
npm run lint
```

Dev server:

- [http://localhost:5173](http://localhost:5173)
