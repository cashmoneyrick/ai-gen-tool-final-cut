# DEVLOG.md

## 2026-04

- Added repo-level mode separation between `BUILDER MODE` and `OPERATOR MODE`.
- Added root `OPERATOR.md` for app-operator behavior and kept `/operator/OPERATOR.md` as the specialized image-generation appendix.
- Replaced the old duplicated agent docs structure with a clearer source-of-truth system across `AGENTS.md`, `CLAUDE.md`, `PROJECT_STATUS.md`, `ROADMAP.md`, `DEVLOG.md`, and `README.md`.
- Prompt Preview was introduced as a separate workflow path in the app.
- Structured prompt-core replacement was implemented around `Subject / Style / Lighting / Composition / Technical Refinements`.
- Prompt Preview was decoupled from requiring a Gemini key for prompt-only and dry-run paths.
- Metadata popover positioning was hardened by rendering it through a body portal and anchoring it from measured viewport position instead of fragile guessed placement.
- The default image-generation model was switched from Flash to Nano Banana Pro across shared defaults, sessions, operator fallbacks, and model labels.
- Added a layered learning step above projects by introducing category-level analysis and prompt guidance, so global taste can influence nails/logos/packaging separately instead of one shared memory blob polluting everything.
- The left thumbnail strip was changed from active-project-only to a sitewide newest-first feed, and clicking a thumbnail from another project now switches into that exact output.
- Rebalanced the main review layout so the sitewide thumbnail strip is larger, the right review rail is slimmer, and the image stage hugs the actual image instead of spanning excess width, which pulls the nav arrows back to the image edge and reduces dead stage space.
- Cleaned up the V3 review screen by moving live/session summary into the review rail, reducing header clutter, and adding a left/right/float review dock mode so the rating panel can be repositioned without breaking layout.
- Fixed the saved `Left` review-dock mode so it stays beside the image instead of dropping onto a second row and sliding off-screen.
- Restyled the project-picker `+ New Project` footer button from a faint dashed placeholder into a clear primary action so it reads clickable in the dark modal.
- Fixed the project-picker `+ New Project` flow so it creates a distinct default project name, switches directly into that new workspace, and closes the picker instead of leaving the result ambiguous among duplicate `New Project` entries.
- Fixed browser-side ID creation on non-localhost HTTP dev URLs by replacing direct frontend `crypto.randomUUID()` calls with a safe helper, restoring `+ New Project` and related create actions on the `100.110...` app address.
- Phase 1+2 shipped 2026-04-28: feedback loop, winner carry-forward, prompt injection cleanup, multi-session reads, brief staleness check, nail knowledge base, visual annotation system, questioning pre-flight, personalStandards in briefs.
- Collections are now the primary data unit: startup migration lifts all session fields (goal, outputIds, winnerIds, model, buckets, etc.) onto project records. Sessions remain as backward-compat run log. operator/run.js, operator/analyze.js, and src/storage/session.js all read/write from project records first.
- Continued Phase 5 pipeline work: added variation-plan progress display in CollectionProgress, documented 2D variation / 3D render / on-hand operator workflows, added evaluation criteria for downstream photography stages, and reset variants back to pending when a real generation run fails.
