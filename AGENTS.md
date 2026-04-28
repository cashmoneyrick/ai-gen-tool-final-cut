# AGENTS.md

## Mode Check

Before acting, classify the request:

- If the user asks to change files, fix bugs, add features, refactor, install packages, run tests, or modify the repo → `BUILDER MODE`
- If the user asks to generate, evaluate, plan, improve outputs, use feedback, decide next attempts, update handoff decisions, or operate the creative workflow → `OPERATOR MODE`

When in doubt, ask:
`Am I changing the app, or using the app?`

Do not mix these modes unless the user explicitly asks.

## Source Of Truth

- `AGENTS.md` = general rules for all coding agents
- `CLAUDE.md` = Claude Code-specific instructions
- `OPERATOR.md` = rules for using the app as an operator
- `PROJECT_STATUS.md` = current build task and do-not-touch list
- `ROADMAP.md` = future planned work
- `DEVLOG.md` = completed work and decisions
- `README.md` = human-facing overview

## Shared Rules

- When asked to audit, review, or analyze code, do not edit unless explicitly told to.
- Skip unnecessary confirmations. Bias toward action.
- If the user says where to look, start there.
- When debugging, check both frontend and backend before deep-diving one side.
- Avoid touching `data/*.json` unless the user explicitly asks.
- Do not delete outputs, winners, or user data.
- Do not invent new product direction.

## Builder Mode

Read `PROJECT_STATUS.md` before editing.

Builder Mode rules:

- Make the smallest useful code change.
- Do not rewrite the whole app.
- Do not redesign the workflow unless explicitly asked.
- Preserve the existing user workflow.
- Avoid touching `data/*.json` unless explicitly asked.
- Do not invent new product direction.
- Do not add production hardening unless asked.
- Do not optimize or restructure the storage layer unless asked.
- After meaningful changes, update `DEVLOG.md`.

At the end, report:

- files changed
- what changed
- how to test
- what remains or is risky

## Operator Mode

Read `OPERATOR.md` before operating the workflow.

Operator Mode rules:

- Do not edit app source code.
- Use the app’s current state, user feedback, winners, rejected outputs, notes, locked elements, references, and handoff files.
- Preserve what the user liked.
- Change only what the user disliked.
- Be specific about the next prompt, model, refs, image count, and reasoning.
- Save or update handoff/decision files only if the workflow requires it.
- Explain the next attempt in plain English.
- If the app is missing a feature, report the limitation instead of switching into Builder Mode.

Very important rule:

- Never switch from `OPERATOR MODE` to `BUILDER MODE` just because something feels inconvenient.

If the app is missing a feature, say so. Do not start coding unless the user asked for a code change.

## Repo Map

```text
src/        active React UI
server/     local API, storage, live sync
operator/   operator runtime and generation logic
data/       local project state (gitignored)
```

## Quick Start

```bash
npm install
npm run dev
npm run build
npm run lint
```
