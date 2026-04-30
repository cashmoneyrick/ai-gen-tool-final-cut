# Operator Guide — Image Generation

This file is the specialized image-generation appendix for Operator Mode.
Repo-level operator behavior lives in `/OPERATOR.md`.

Read this file when running generation sessions. Not needed for building/debugging the app.

## Workflow

**Starting a project:**
1. Ask about constraints (shape, length, finish, style, colors, shot type)
2. Ask if Rick has reference images — if so, analyze them as art director
3. Confirm the vision before first generation

**Every generation cycle:**
1. Announce your settings (model, size, ratio). Rick will stop you if wrong.
2. **Read ratings and winners from storage BEFORE generating.** The operator prints a summary — LOOK AT IT.
3. Generate with `--intent` and `--reason` flags.
4. Show the result via preview screenshot.
5. Wait for feedback (rating in app + verbal in chat).
6. Iterate based on combined signal.

**Signals from Rick:**
- "next" = move on, good enough
- "skip" = drop it, revisit later
- "again" / "retry" = same item, different attempt
- Reference images or hex codes = color/style correction
- Rating 1-2 = significant miss, something fundamental is wrong
- Rating 3 = direction is right, details are off
- Rating 4 = almost there, minor tweaks
- Rating 5 = nailed it
- Winner button = gold standard, lock the recipe

## Defaults

Settings are operator-managed. Defaults (hardcoded in run.js):
- Model: Flash (`gemini-3.1-flash-image-preview`)
- Size: 1K
- Ratio: 1:1 (Rick changes this most often — always announce)
- Thinking: minimal
- Search: off
- Batch: 1 image

Override only via CLI flags or decision file. Rick tells you verbally if he wants different settings.

## Pivot Detection (Operator Responsibility)

The app cannot tell the difference between iterating on a design and starting a completely new one. The operator must detect this from what Rick says and act accordingly.

**Pivot signals — use `--pivot` flag:**
- Shows a new reference image with a different design
- Says "try this one", "new design", "switch to X", "let's do X instead"
- Changes nail shape, tip style, or nail art concept entirely

**Iteration signals — no flag needed:**
- "try again", "retry", "again"
- "change the X", "make it more Y", "less Z"
- Rating feedback on the current design
- Color/texture tweak on the same design

When `--pivot` is used, the runner clears winner bucket carry-forward so old design directions don't contaminate the new prompt. Rating signals are kept. The operator announces the pivot in chat.

## How to Run

```bash
node --env-file=.env operator/run.js
node --env-file=.env operator/run.js --project <id>
node --env-file=.env operator/run.js --model gemini-3-pro-image-preview
node --env-file=.env operator/run.js --prompt "custom prompt text"
node --env-file=.env operator/run.js --intent "what you're trying" --reason "why"
node --env-file=.env operator/run.js --decision-file /tmp/decision.json
node --env-file=.env operator/run.js --dry-run --prompt "preview this prompt"
node --env-file=.env operator/run.js --pivot --prompt "..."   # new design direction
node --env-file=.env operator/run.js --batch 3               # generate 3 images
```

### Dry Run (Prompt Preview)

Add `--dry-run` to see the full assembled prompt broken into sections WITHOUT calling Gemini. Use this to verify the prompt before spending money.

### Decision File

```json
{ "prompt": "...", "model": "...", "intent": "...", "reason": "..." }
```

All fields optional. Precedence: CLI flags > decision file > session state.

## Gemini Prompt Lessons

### Cat Eye Nail Polish
Cat eye is a GRADIENT, GLITTERY, IRIDESCENT effect from magnetic particles — NOT a harsh spotlight.
- Say: "soft iridescent shimmer, glittery, gentle gradient glow, visible fine glitter particles"
- Never say: "bright white-gold glow", "knife-edge sharp", "light trapped inside"

### Colors
Gemini interprets color names loosely. After 2 failed attempts, ask Rick for hex codes or a reference image.
- Hex codes work best (#466e19 is more precise than "peridot green")
- Pop culture references work surprisingly well ("Shrek green")

### Backgrounds
Always lock backgrounds explicitly or Gemini will add props:
```
BACKGROUND: Pure clean white background. No plates, no surfaces, no props, no shadows. Only the nails on seamless white.
```

### Reference Images
- Refs HELP when extracting specific elements (replicate this gradient, match this pattern)
- Refs HURT for loose inspiration (Gemini doesn't understand "be inspired by this")
- For inspiration: describe in words. For replication: send the image with targeted filtering.

## Prompt Assembly Order

```
1. Locked elements (highest priority — always first)
2. Project memory directives (active memories formatted by type)
3. Anchored ref notes (notes attached to specific reference images)
4. Carry-forward preamble (iteration guidance from winners)
5. Cross-session lessons (prior session winner insights)
6. Soft ref notes (general reference image notes)
7. Assembled prompt / user prompt (lowest priority)
```

## Pre-Flight Checks

1. **Read analysis insights.** The operator prints ANALYSIS INSIGHTS — what works, what fails, winner DNA. Use this.
2. **Read manual notes.** Check `brief.manualNotes.liked` and `brief.manualNotes.hated`. Never generate something Rick flagged as hated.
3. **Read ratings and winners.** Look for patterns (scores going up = converging, flat/down = change approach).
4. **Is there a prompt?** Check that locked elements or assembled prompt produce non-empty text.
5. **Are refs intentional?** Decide whether to send the image or describe it in words.
6. **Is background locked?** Include explicit background constraints in every prompt.
7. **Announce settings** before generating so Rick can override.

## Model Selection

### Flash (`gemini-3.1-flash-image-preview`)
Default. Fast, good for iteration and exploration.

### Pro (`gemini-3-pro-image-preview`)
Slower, higher quality. Use for final versions or when Flash results plateau.

## Data Interpretation

### Ratings (1-5)
- 5 = love it, preserve everything
- 4 = almost there, minor tweaks
- 3 = direction right, details off
- 2 = off track, fundamental change needed
- 1 = not it, major rethink
- null = not reviewed, don't assume
- Legacy 'up' → 4, 'down' → 2

### Winners
Gold standard. Recipe saved for replication. Rating 4-5 + Winner = strongest signal. Winners drive carry-forward.

### UI Signals
Recipe/Save/Copy/UseAsRef clicks are implicit positive signals tracked on the output record.

### Locked Elements
User-pinned text blocks. Go into EVERY prompt at highest priority.

### Carry-Forward
Auto-extracts preserve/change signals from winners and injects into prompt. Automatic.

## Analysis Engine

Runs automatically on every `operator/run.js` execution. Generates:

**Project brief** (`data/briefs/{projectId}.json`):
- `whatWorks` / `whatFails` — keyword-rating correlations
- `winnerDNA` — keywords in 50%+ of winners
- `modelComparison` — avg rating per model
- `colors` — hex codes and their avg ratings
- `manualNotes.liked` / `manualNotes.hated` — Rick's explicit preferences
- `winnerRecipes` — recent winner prompts

**Global state** (`data/global-state.json`):
- `tasteProfile.alwaysHigh` / `alwaysLow` — cross-project patterns
- `vocabulary` — Rick's terms → prompt language

API: `GET/POST /api/briefs/:projectId`, `GET /api/global-state`, `POST /api/vocabulary`, `POST /api/analyze/:projectId`

Standalone: `node operator/analyze.js [project-id]`

## Intelligence Behaviors

### Ref Reverse Engineering
When Rick uploads a ref, analyze it into structured buckets:
1. **Colors** — name, hex code, role (dominant/accent)
2. **Textures** — surface qualities (glossy gel, matte, shimmer, etc.)
3. **Composition** — framing, arrangement, camera angle
4. **Lighting** — quality and direction
5. **Style** — specific design elements (french tip, cat eye, coffin, etc.)
6. **Mood** — overall feel
7. **Prompt suggestion** — how to translate the analysis into prompt text

Save the analysis via `POST /api/ref-analysis/:refId`. It gets stored on the ref record and automatically included in prompt assembly when that ref is sent to Gemini.

Rick can say "use the colors from ref A and the texture from ref B" — the structured buckets make this possible.

Also recommend whether to SEND the image to Gemini or DESCRIBE it in words based on the analysis.

### Per-Collection Cheat Sheets
After a winner, save: winning prompt formula, color hex ranges, what to include/avoid, ref strategy.

### Auto-Session Distillation
On End Session: read ratings, identify patterns (4-5 vs 1-2), save color/style learnings, update vocabulary, note where we left off.

### Vocabulary Learning
When Rick uses a subjective term, check vocabulary glossary first. If missing, ask and save the translation.

### Stalled Iteration Detection
After 2+ consecutive 1-2 ratings: stop guessing, ask for hex codes or reference images. Built into run.js.

### Smart Model Switching
Built into run.js. After 3 consecutive outputs scoring 2-3 on Flash, suggests switching to Pro. After 3 on Pro still scoring 2-3, suggests changing prompt approach instead. This is a printed suggestion, not automatic.

## Brand DNA

The analysis engine mines ALL winners across all projects to find Rick's "brand fingerprint" — keywords that appear significantly more in winners than non-winners. Saved to `global-state.json` as `brandDNA`.

Standalone: `GET /api/brand-dna`

## Recommendations

Before every generation, the operator prints actionable recommendations combining:
- Project-level patterns (what works / what fails)
- Manual liked/hated notes
- Cross-project taste profile
- Brand DNA keywords
- Model comparison

API: `GET /api/recommendations/:projectId`

## Collection Templates

Save winning recipes as reusable templates with swappable variable slots.

```bash
# Create: POST /api/templates
{ "name": "Zodiac Cat Eye", "prompt": "...{{COLOR}}...", "model": "...",
  "variables": [{"name":"color","placeholder":"{{COLOR}}","defaultValue":"garnet red"}] }

# List: GET /api/templates?projectId=...
# Apply: POST /api/templates/apply
{ "templateId": "tmpl-xxx", "variables": {"color": "sapphire blue"} }
# Delete: DELETE /api/templates/:id
```

The operator can create templates from winners and generate variants by swapping variables.

## Reading Project State

```js
import { buildOperatorContext } from './operator/context.js'
const ctx = buildOperatorContext()  // uses active project
const ctx = buildOperatorContext('project-id')  // specific project
```

Context includes: project, session, buckets, locked elements, refs, recent outputs, winners, carry-forward, memories, feedback summary, stats, brief, globalState.

## Pipeline Modes

The operator has three production modes for systematic collection generation. Each is a job type triggered by `--job-type`. Use these after the searching phase is done and a winner has been confirmed.

### Mode: 2D Variation (`--job-type 2d-variation`)

Produces systematic color/finish variants of a confirmed base design.

**Setup: create a variation plan once per collection**

```bash
PROJECT_ID=$(node --input-type=module -e "import { getActiveProject } from './server/storage.js'; console.log(getActiveProject())")

curl -s -X POST "http://localhost:5173/api/variation-plan/${PROJECT_ID}" \
  -H 'Content-Type: application/json' \
  -d '{
    "baseOutputId": "<winner output ID>",
    "basePrompt": "<winner prompt with {color} placeholder>",
    "jobType": "2d-variation",
    "variants": [
      { "id": "v_001", "label": "Garnet / January", "colorSpec": "#6B0F1A", "finishOverride": null, "status": "pending", "outputId": null },
      { "id": "v_002", "label": "Amethyst / February", "colorSpec": "#9B59B6", "finishOverride": null, "status": "pending", "outputId": null }
    ]
  }'
```

**Run variants**

```bash
node --env-file=.env operator/run.js --variant-id v_001
node --env-file=.env operator/run.js --variant-id v_002
```

Each run builds the variant prompt, sends the base winner as a visual ref, generates, and marks the variant as generated. Check the insights panel in the UI for plan progress.

To extract `basePrompt` from a winner, read its `finalPromptSent` field from `data/outputs.json` or `/api/store/outputs/:id`. Replace the color reference with `{color}`.

### Mode: 3D Render (`--job-type 3d-render`)

Produces a photorealistic nail photograph from a confirmed 2D variant winner.

```bash
node --env-file=.env operator/run.js \
  --job-type 3d-render \
  --ref-output-id <2D winner output ID> \
  --design "French tip cat eye, garnet red #6B0F1A, coffin shape, long"
```

The `--ref-output-id` image is sent to Gemini as a visual anchor. The `--design` text supplements it. Evaluate results against "3D Render Quality Criteria" in `nailKnowledge.md`.

### Mode: On-Hand Photography (`--job-type on-hand`)

Produces a styled lifestyle or product photograph from a confirmed 3D render winner.

```bash
node --env-file=.env operator/run.js \
  --job-type on-hand \
  --ref-output-id <3D render output ID> \
  --shot-type lifestyle \
  --background "white marble surface"
```

Shot types: `product` (default), `lifestyle`, `social`. Evaluate against "On-Hand Photography Quality Criteria" in `nailKnowledge.md`.

### Full Pipeline Example

```bash
# Step 1: Confirm 2D winner, then create a variation plan.

# Step 2: Run all 2D variants.
node --env-file=.env operator/run.js --variant-id v_001
node --env-file=.env operator/run.js --variant-id v_002

# Step 3: For each 2D winner, generate a 3D render.
node --env-file=.env operator/run.js \
  --job-type 3d-render \
  --ref-output-id <2D winner ID> \
  --design "French tip cat eye, garnet red #6B0F1A, coffin shape, long"

# Step 4: For each 3D render winner, generate an on-hand shot.
node --env-file=.env operator/run.js \
  --job-type on-hand \
  --ref-output-id <3D render winner ID> \
  --shot-type product
```
