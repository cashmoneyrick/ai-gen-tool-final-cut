# Workflows

Workflow name:
Two-reference generation
Use when:
You need to translate a nail set into a new pose, scene, or format without redesigning it.
Inputs needed:

* design reference image
* pose or scene reference image
* target output type
  Steps:

1. State that the design reference is the hard source of truth.
2. State that the pose reference controls only pose, framing, lighting, crop, and background.
3. Lock the output type clearly, such as on-hand lifestyle photo, flatlay, or product shot.
4. Add explicit keep and avoid constraints.
5. Generate once.
6. If fidelity is close but not perfect, reuse the best output as the next reference instead of starting over.
   Common failure modes:

* model blends both references
* art gets simplified or redesigned
* pose reference contaminates nail design
  Fixes:
* restate reference roles more aggressively
* add "do not copy nail design from pose reference"
* use the best approved output as the new design anchor

Workflow name:
Hand-shot to white row flatlay
Use when:
A real worn-hand photo needs to become a clean product flatlay.
Inputs needed:

* source hand photo showing the real nails
  Steps:

1. Treat the source hand photo as the only source of truth unless a second reference is truly needed.
2. Preserve the exact visible nail designs, order, placement, and proportions.
3. Convert to five loose nails in one straight horizontal row.
4. Use a pure white background and camera perfectly perpendicular to the nail faces.
5. Keep spacing even, shadows minimal, and glare controlled.
6. If a first output gets most nails right, use that approved flatlay as the new source for small corrections.
   Common failure modes:

* design drift
* charm placement moves
* one nail changes shape or art
* glare becomes distracting
  Fixes:
* restate exact-design fidelity
* target only the wrong nail in a follow-up edit
* use stronger anti-glare constraints
* promote the approved flatlay to source-of-truth status

Workflow name:
Approved-image edit pass
Use when:
A generated image is mostly right and needs a local fix.
Inputs needed:

* approved output image
* one clear correction target
  Steps:

1. Declare the approved image the current source of truth.
2. Ask for only the local change.
3. Lock composition, spacing, lighting, and all other elements.
4. Edit only the defective region or nail.
   Common failure modes:

* model reinterprets the whole image
* fixed element moves but good elements also change
  Fixes:
* specify "change only X"
* repeat what must stay locked
* avoid rerolling from the older original

Workflow name:
Visible-only blueprint workflow
Use when:
The source photo does not clearly show every nail.
Inputs needed:

* incomplete source photo
* optionally a simple blueprint sheet of only visible nails
  Steps:

1. Identify which nails are clearly visible.
2. Build a reduced-scope blueprint if needed.
3. Generate only the visible nails first.
4. Add missing nails later only when better source information exists.
   Common failure modes:

* model invents unseen nails
* continuity breaks across the set
  Fixes:
* explicitly forbid guessing
* narrow the task to visible nails only

Workflow name:
Packaging scene construction
Use when:
Building or expanding an embroidered pouch scene.
Inputs needed:

* pouch continuity settings
* concept name
* chosen scene elements
* mood
* crop
* density
* hidden YPS placement choice
  Steps:

1. Lock pouch continuity first: suede or microsuede pouch, clean white background, slight angle.
2. Define the world as a cropped fragment, not a badge.
3. Pick one main focal idea and supporting elements.
4. Build foreground, midground, and background separation.
5. Add overlap, tonal separation, and scene bleed around the edges.
6. Simplify forms for embroidery feasibility.
7. Make YPS subtle and born from scene logic if used.
   Common failure modes:

* scene feels boxed in
* subject feels like a mascot or emblem
* too much detail for embroidery
* hidden YPS looks like text added on top
  Fixes:
* crop harder
* partially cut off the subject
* reduce micro-detail
* integrate YPS into ripples, vines, reeds, stars, or ironwork instead of writing it out

Workflow name:
Embroidery texture correction
Use when:
A packaging scene looks printed, painted, or too smooth.
Inputs needed:

* current prompt or generated image
  Steps:

1. Increase stitch direction visibility.
2. Ask for chunkier satin fills and raised thread relief.
3. Replace smooth shading with stitched masses and simplified forms.
4. Keep scene readability while letting thread texture dominate.
   Common failure modes:

* art looks like illustration on fabric
* water or sky looks smoothly blended
* feather or flower detail looks painted
  Fixes:
* call for stitched ripple bands, stitched feather groupings, thread-built foliage
* reduce soft gradient language
* simplify shapes so the texture reads first

Workflow name:
Cateye master-style generation
Use when:
Creating a month in the cateye collection or restoring house-style continuity.
Inputs needed:

* approved house-style reference if available
* birthstone color target
  Steps:

1. Lock the house style: Wide Cat Eye, black base, silver magnetic layer, translucent color cover.
2. Keep a single straight-on nail on a near-white background.
3. Lock composition, angle, and reflection behavior.
4. Describe the magnetic field as a broad filled vertical sheen, not an outlined shape.
5. Swap only the birthstone color behavior while keeping geometry and lighting stable.
   Common failure modes:

* donut or halo effect
* angle drift
* too much glare
* color becomes too bright, minty, chrome, or metallic
  Fixes:
* say "continuous filled central field"
* restate exact straight-on view
* cap reflection to one tiny soft dash
* deepen outer thirds and darken the base tone

Workflow name:
Month-to-month cateye continuity
Use when:
Extending the cateye collection after one month is approved.
Inputs needed:

* approved previous month output
* next month color target
  Steps:

1. Use the approved month as the exact reflection and camera reference.
2. Keep the same angle, highlight behavior, framing, and magnetic geometry.
3. Change only the colorway and supporting color language.
4. Verify that the new month still reads as the same collection.
   Common failure modes:

* lighting changes
* highlight size changes
* magnetic field shifts shape
  Fixes:
* explicitly say "change only the colorway"
* reference the approved output as the strict house-style anchor
