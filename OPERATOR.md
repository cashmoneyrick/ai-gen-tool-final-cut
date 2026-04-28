# OPERATOR.md

Use this file when acting as the app operator rather than a code editor.

## Purpose

Operator Mode means: use the app, current project state, and workflow data to help the user make better attempts. Do not edit source code in this mode.

## Operator Rules

- Do not edit app source code.
- Do not switch into Builder Mode unless the user explicitly asks for a code change.
- If the app is missing a feature, say so plainly.
- Preserve what the user liked.
- Change only what the user disliked.
- Keep the next attempt specific: prompt, model, refs, image count, and reasoning.
- Locked elements are hard constraints. Preserve them unless the user explicitly unlocks or changes them.

## What To Read

Before deciding the next attempt, check:

- current project/session state
- recent outputs
- ratings
- winners
- rejected outputs
- saved notes
- locked elements
- references and ref roles
- handoff/decision files if they exist

## Feedback Handling

**Saving verbal feedback (do this first, every time):**
When Rick gives any feedback about images — what he liked, what was wrong, what to fix — save it immediately before doing anything else:

```
POST http://localhost:5173/api/operator/feedback
{ "notesKeep": "what was good", "notesFix": "what was wrong" }
```

This saves to the most recently generated batch. Rick doesn't specify individual images — assume feedback applies to the last batch. Confirm it saved before moving on. If the server isn't running, note the feedback explicitly so it's not lost.

- Read ratings first.
- Use written notes when they are available (now includes verbally saved notes from above).
- Treat winners as source-of-truth examples.
- Treat rejected outputs as negative constraints.
- Translate rejected outputs into explicit avoid rules for the next attempt. If the user rejected an output for being too glossy, too perfect, too glittery, too CGI, too cluttered, or the wrong color, the next attempt should directly avoid that failure.
- Reuse winners and liked outputs for successful composition, lighting, realism level, color behavior, material finish, and prompt structure when those qualities are still relevant.
- If feedback is local, make a local change. Do not reroll everything.

## Image Evaluation (do this after every generation)

After each operator run completes, evaluate the new images before Rick rates them:

1. Read `data/last-batch.json` to get the new output IDs
2. Read each output record to get its `imagePath`
3. Read each image file and evaluate it against `operator/nailKnowledge.md`
4. Check: shape correct? Finish correct? All nails consistent?

Save the result for each output:
```
POST http://localhost:5173/api/operator/annotation
{ "outputId": "...", "pass": true/false, "note": "one-line reason if failing", "category": "shape|finish|color|technique|other" }
```

Report findings to Rick verbally before moving to the next attempt. Passing images need no comment — only flag failures.

If Rick says an annotation was wrong, acknowledge it. The correction is saved automatically via the Correct button in the review UI and feeds back into the personal standards layer over time.

## Prompt / Attempt Discipline

- Be explicit about what stays locked.
- Be explicit about what changes next.
- Keep references role-specific when possible.
- Prefer one-variable changes over broad reinventions.
- Explain the next attempt in plain English before or alongside the prompt/handoff.

Recommended operator decision format:

- Intent:
- What to preserve:
- What to change:
- Negative instructions:
- Model:
- Image count:
- References to use:
- Handoff update needed: yes/no
- Plain-English reason:

## Handoff Behavior

- Update handoff/decision files only if the workflow requires them.
- Do not write handoff decisions just for documentation.
- Keep handoff text concrete, short, and actionable.
- Include intent, reason, model choice, prompt source, locked elements, and what changed only when that information is useful to the workflow.
- If a prompt or plan becomes the new source of truth, say so clearly.

## Limits

- If the workflow needs a missing feature, report the limitation.
- Do not start coding because the workflow would be easier with a new tool.
- Operator Mode means using the app/workflow, not changing the code.

## Specialized Appendix

For the image-generation workflow details, model behavior, prompt lessons, and operator runtime specifics, also read:

- `/operator/OPERATOR.md`
