# Lessons Learned

Lesson:
Reference images dramatically improve fidelity.
Context:
Reverse-engineering existing handmade sets into on-hand images or other formats.
What failed:
No-reference generations guessed motifs, simplified the art, or drifted into a generic fantasy version.
What worked better:
Using a design reference and a pose reference produced far closer results, especially when the design reference was treated as mandatory.
Confidence: high
Reuse value:
High-value default rule for nearly every serious generation workflow.

Lesson:
Reference-role separation matters almost as much as having references.
Context:
Two-reference nail generations.
What failed:
Even with good references, the model still blended them and redesigned the set when roles were not explicit.
What worked better:
Stating that image 1 controls the nail design and image 2 controls pose, crop, lighting, and scene only.
Confidence: high
Reuse value:
Prevents one of the most common multi-reference drift patterns.

Lesson:
Packaging scenes drift when they become too complete and self-contained.
Context:
Embroidered pouch concepts with richer scenes.
What failed:
Centered, fully visible, nicely finished scenes started reading like badges, patches, or storybook emblems.
What worked better:
Harder crop, partial subject cutoff, more edge bleed, and the feeling of a fragment from a larger artwork.
Confidence: high
Reuse value:
Core anti-generic tactic for packaging prompts.

Lesson:
"More detail" should not mean "more objects."
Context:
Packaging prompt refinement.
What failed:
Adding more objects often made scenes busier but flatter.
What worked better:
Using stronger foreground, midground, background, overlap, and tonal separation.
Confidence: high
Reuse value:
Important translation rule for future prompt expansion.

Lesson:
Embroidery prompts fail when the surface is too smooth.
Context:
Packaging outputs that looked illustrated rather than embroidered.
What failed:
Smooth gradients, soft blending, and polished surfaces made the art feel printed.
What worked better:
Visible stitch direction, chunkier satin fills, raised thread relief, thread-built elements, and slightly simplified forms.
Confidence: high
Reuse value:
Core realism fix for all embroidery scenes.

Lesson:
Hidden branding works only when it behaves like the surrounding scene logic.
Context:
YPS easter eggs in ripples, water, stars, vines, reeds, and other scene systems.
What failed:
YPS looked like faint text placed on top of the scene or carved into it.
What worked better:
Building YPS from the same geometry, stitch behavior, color family, and movement as the surrounding structure.
Confidence: high
Reuse value:
Critical for subtle branding without breaking immersion.

Lesson:
The "wide cateye" description can accidentally create a donut.
Context:
Cateye nail collection refinement.
What failed:
The model interpreted "wide" as a bordered oval or halo with a hollow center.
What worked better:
Describing the effect as a continuous filled central magnetic field with no outline, no hollow center, and no perimeter line.
Confidence: high
Reuse value:
Key wording fix for future cateye prompts.

Lesson:
Locking one approved cateye month as the reference stabilizes the whole collection.
Context:
Monthly birthstone cateye set development.
What failed:
Rewriting each month from scratch caused angle, glare, and geometry drift.
What worked better:
Using the approved month as the exact camera and reflection reference and changing only the colorway.
Confidence: high
Reuse value:
Strong collection-consistency tactic.

Lesson:
Local problems should get local fixes.
Context:
Flatlays and iterative nail corrections.
What failed:
Full reruns often broke composition or nails that were already correct.
What worked better:
Editing only the single wrong nail or charm placement while freezing the rest.
Confidence: high
Reuse value:
Saves time and reduces regression.

Lesson:
Do not force the model to reconstruct hidden nails from unclear source photos.
Context:
Hand-shot to flatlay conversion when not all nails were visible.
What failed:
The model guessed missing nails and broke continuity.
What worked better:
Restricting the task to clearly visible nails first or using a blueprint of isolated visible nails.
Confidence: high
Reuse value:
Good guardrail for incomplete-source workflows.

Lesson:
A source hand photo is often enough for flatlay conversion.
Context:
Converting worn-hand nail images into product flatlays.
What failed:
Adding unnecessary extra references increased drift instead of helping.
What worked better:
Using the original hand photo as the sole design source for a simple flatlay task.
Confidence: medium
Reuse value:
Useful simplification rule when the target layout is very controlled.

Lesson:
Slight imperfection helps realism in handmade nails.
Context:
Photoreal nail imagery and product shots.
What failed:
Overly perfect results started to look AI-made, factory-made, or overly retouched.
What worked better:
Keeping believable gel thickness, slight asymmetry, human-painted variation, and controlled but not sterile finish.
Confidence: medium
Reuse value:
Important realism cue across multiple nail workflows.
