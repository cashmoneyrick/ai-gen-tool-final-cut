# Nail Quality Evaluation Guide

## Shape Definitions

### Coffin (Ballerina)
- Long length with tapered sides and a FLAT squared-off tip
- Tip width is approximately 1/3 of nail width at the base
- Sidewalls taper inward gradually, then terminate flat
- PASS: flat tip, gradual taper, clean flat edge
- FAIL: pointed tip (stiletto-like), rounded tip, sidewalls don't taper, tip too narrow

### Almond
- Medium-long oval body tapering to a gently rounded point
- Sides curve inward symmetrically, tip is rounded like an almond
- PASS: symmetrical taper, rounded (not sharp) tip
- FAIL: too pointy (stiletto), too blunt (oval/square), asymmetrical taper

### Stiletto
- Long, dramatically tapered to a SHARP point
- Entire nail narrows continuously from base to tip — no flat area
- PASS: sharp distinct point, continuous taper from base
- FAIL: tip rounded, not sharp enough, sides don't taper fully

### Square
- Straight sidewalls (no taper), flat tip at 90° to the sidewalls
- PASS: parallel sides, crisp flat tip, square corners
- FAIL: rounded corners, tapered sides, angled tip

### Oval
- Straight sidewalls, tip follows a smooth rounded curve
- PASS: straight sides, cleanly rounded tip, no points or angles
- FAIL: pointed tip, angular corners, tapering sides

## Finish Types

### Cat Eye
- A linear shimmer streak/gradient running down the CENTER of the nail
- Effect is SOFT and DIFFUSED — NOT a harsh spotlight or hard-edged circle of light
- Shimmer transitions gradually from bright center to darker edges
- Colors should be deep jewel tones: burgundy, navy, forest, black, plum
- PASS: gradient shimmer, linear movement, jewel-tone depth, soft edges
- FAIL: spotlight effect (hard-edged circle of light), no gradient, shimmer all over, washed-out color

### Chrome / Mirror
- Highly reflective metallic surface — reflects light like a mirror
- Surface is smooth and even, no brush strokes or texture
- PASS: clear reflections visible, smooth uniform surface
- FAIL: dull, matte areas, visible brush strokes, patchy coverage

### French Tip
- White (or colored) strip at the tip ONLY — clean line where tip meets nail bed
- Strip should be even width across all nails in the image
- PASS: clean edge, consistent width, correct placement at tip only
- FAIL: uneven width across nails, too thick, bleeds into nail bed

### Glitter
- Even coverage without bare patches
- For full glitter: entire surface covered uniformly
- PASS: consistent coverage, no bare nail visible through glitter
- FAIL: patchy coverage, too sparse, clumping

### Gel / Acrylic Surface
- Gel: glassy, smooth, high-shine surface with depth
- Acrylic: solid, matte-smooth, no surface texture
- PASS: appropriate surface texture for requested finish
- FAIL: nail polish streaks visible, surface looks inconsistent

## Universal Quality Criteria

- All nails in the image should be the SAME shape
- Nail length should be CONSISTENT across all fingers
- Cuticle area should be clean — no visible product gaps
- Tips should be sharp and clean, not soft or fuzzy
- The hand/nails should be the only subject — no plates, props, or backgrounds unless specified

## Evaluation Output Format

When evaluating an image, produce one result per image:
- pass: true if acceptable, false if something specific failed
- note: one-line specific reason if failing, empty string if passing
- category: shape | finish | color | technique | other

## 3D Render Quality Criteria

A 3D render is a photorealistic nail photograph generated from a 2D flat design.

### Photographic Realism
- PASS: Looks like a photograph. Natural depth, surface texture, light interaction visible on nails.
- FAIL: Flat, illustrative, or CGI look. No sense of three-dimensionality. Looks painted or rendered.

### Lighting
- PASS: Soft directional light with natural shadows. Specular highlight on glossy nails. Clear depth.
- FAIL: Flat even lighting. No shadows. Overexposed. Looks like a screenshot, not a photo.

### Hand Realism
- PASS: Hand looks human: natural skin texture, normal finger proportions, subtle variation.
- FAIL: Hand looks synthetic, too perfect, distorted proportions, uncanny valley quality.

### Design Fidelity to 2D Ref
- PASS: Nail color, finish, and technique visually match the 2D input reference.
- FAIL: Color has drifted, wrong technique applied, or elements added that were not in the 2D ref.

### Universal Quality
- All nails same shape and consistent length.
- No props or background distractions unless specified.

## On-Hand Photography Quality Criteria

An on-hand photograph is a styled lifestyle or product image.

### Shot Type Fidelity

**Product shot:** Clean background (white/cream). Subject is the nails.
- FAIL: Background has color, texture, or props competing with the nails.

**Lifestyle shot:** Contextual background (marble, fabric). Aspirational, not busy.
- FAIL: Background overpowers nails. Too distracting. Does not feel aspirational.

**Social shot:** Editorial, styled, on-trend. Clear visual concept.
- FAIL: Generic composition. Looks like an unlabeled product shot. No visual intention.

### Nail Visibility
- PASS: All five nails clearly visible, facing camera, in focus.
- FAIL: Hand obscures nails, nails turned away, important nails out of focus.

### Design Fidelity to 3D Render Ref
- PASS: Nail design (color, finish, shape) visually consistent with the 3D render input.
- FAIL: Design has drifted in the lifestyle context: different color or wrong finish.

### Photographic Quality
- PASS: Looks like a real photograph. Could be an Instagram post or product page.
- FAIL: Clearly AI-generated artifacts, uncanny skin, over-processed look.
