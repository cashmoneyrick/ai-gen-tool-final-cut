# Hard Rules

Rule:
Treat the best approved output as the new source of truth for future edits or consistency passes.
Applies to:
flatlays, nail edits, iterative refinement, consistency locking
Why it matters:
Once an output gets the composition mostly right, continuing to regenerate from the older source often reintroduces drift. The approved image is the better anchor.
Example:
A flatlay gets four nails correct and one charm is slightly too low. Edit the approved flatlay and change only that one nail instead of rerunning from the original hand photo.

Rule:
When using multiple references, explicitly separate what each reference controls.
Applies to:
reference-driven nail generation, reverse engineering, lifestyle hand shots
Why it matters:
Without role separation, the model blends references and redesigns the set.
Example:
Reference 1 controls nail design, shape, color, art placement, and finish. Reference 2 controls pose, framing, lighting, crop, and background only.

Rule:
For hand-shot to flatlay conversions, preserve the exact visible nail design, order, placement, and proportions from the source image.
Applies to:
flatlay generation from worn-hand shots
Why it matters:
The goal is conversion, not reinterpretation.
Example:
Keep the exact five visible nails, same order, same charm placement, same proportions, then move them into a white row flatlay.

Rule:
Do not guess unseen nails. Reduce scope to only clearly visible nails or build a simple blueprint first.
Applies to:
reverse engineering incomplete source photos
Why it matters:
Guessing missing information causes major drift and fake continuity.
Example:
If only four nails are clearly visible, isolate those first and generate from those instead of forcing the model to invent the hidden fifth nail.

Rule:
Flatlay product shots should default to a perfectly straight horizontal row on pure white with the camera perfectly perpendicular to the nail faces.
Applies to:
nail flatlays, catalog shots, product-ready nail images
Why it matters:
This creates clean comparability, reduces angle drift, and improves product realism.
Example:
Five loose nails, evenly spaced, front-facing, upright, pure white background, minimal shadow, no props, no overlap.

Rule:
Packaging mockups must keep the locked base setup unless intentionally changed.
Applies to:
embroidered pouch packaging mockups
Why it matters:
Continuity is part of the brand system.
Example:
Small premium suede or microsuede drawstring pouch, clean white background, slight angle, premium feminine product-photo feel.

Rule:
Packaging art should read like a cropped fragment from a larger world, not a centered badge, patch, or self-contained emblem.
Applies to:
embroidered packaging scene design
Why it matters:
Centered emblem compositions look generic and AI-made. Fragment logic feels more authored and premium.
Example:
Let reeds, sky, flowers, or architecture continue off the pouch edge instead of fully containing the scene inside a neat square.

Rule:
Hidden YPS branding must be born from the scene logic, not placed on top as obvious text.
Applies to:
packaging scene easter eggs, hidden branding details
Why it matters:
Obvious lettering breaks immersion and feels stamped on.
Example:
Build YPS from ripple geometry, vine flow, ironwork, reed crossings, or star placement so it reads as part of the scene first.

Rule:
Packaging artwork must remain realistic for tiny-scale embroidery production.
Applies to:
embroidered pouch scenes
Why it matters:
The brand target is not just pretty art; it must plausibly translate to real embroidery on a very small pouch.
Example:
Use bold readable shapes, controlled density, simplified forms, visible stitch direction, and tactile thread relief instead of tiny painterly details.

Rule:
Embroidery texture must dominate over smooth illustration.
Applies to:
embroidered pouch scenes
Why it matters:
When the art gets too smooth, it reads like print or painting instead of actual embroidery.
Example:
Use chunkier satin fills, visible stitch direction, raised thread relief, stitched ripple bands, stitched foliage masses, and simplified forms.

Rule:
The cateye collection should default to one locked house style unless a month clearly requires deviation.
Applies to:
cateye nail collection
Why it matters:
The collection works best when camera, shape, lighting, and effect geometry stay stable and only the color behavior changes.
Example:
Wide Cat Eye pattern + black base + silver magnetic layer + translucent birthstone color cover.

Rule:
The cateye magnetic effect must read as a filled broad internal field, not a donut, halo, ring, crescent, or hotspot.
Applies to:
cateye single-nail product shots
Why it matters:
The main failure mode was the model turning "wide cat eye" into a hollow shape.
Example:
Describe the magnetic effect as one continuous filled vertical field occupying roughly the center 55 to 65 percent of the nail width, with feathered darker edges.

Rule:
Cateye product shots must stay straight-on and anti-glare.
Applies to:
cateye single-nail product shots
Why it matters:
Angle drift and glare destroy the house style.
Example:
Single nail, centered, square frame, near-white background, camera perfectly perpendicular, one tiny soft short highlight only, no long white streaks.

Rule:
When a fix is local, make the fix local.
Applies to:
approved flatlays, approved product shots, composition-locked generations
Why it matters:
Full rerolls often break what was already correct.
Example:
If one charm spawns too low on the nail, edit that one nail only while locking the composition and the other nails.
