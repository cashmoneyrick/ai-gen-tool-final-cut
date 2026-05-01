# Review Browser Project Strip And Loading Design

Date: 2026-05-01

## Goal

Fix the review browser so Rick only sees images from the selected project, big-image switching feels faster, and the viewer does not lose track of newly synced images while generation is still running.

## User-Facing Behavior

- The left thumbnail strip shows images from the selected project only.
- The main viewer and the thumbnail strip use the same project-scoped image list.
- Clicking a thumbnail selects that exact image, not just a numeric position in the list.
- When new images sync in, the app keeps the currently viewed image selected if it still exists.
- If the selected image disappears or is not available yet, the viewer falls back to the nearest valid project image.
- The app preloads nearby full-size images so clicking the previous, next, or nearby thumbnails feels faster.
- The review layout, ratings, winners, notes, and existing buttons stay the same.

## Recommended Approach

Use the existing review UI, but tighten the data flow:

1. Pass the current project's output catalog into the thumbnail strip instead of the sitewide catalog.
2. Make image selection ID-based, with index as a derived value.
3. Keep the current output ID stable across live-sync refreshes.
4. Preload full-size image URLs near the selected image.

This is intentionally smaller than a full review-browser rewrite. It targets the actual pain without changing the workflow.

## Components

### App State

`App.jsx` already loads:

- active project outputs
- sitewide outputs
- current session outputs
- winners

For this feature, the review browser should treat project outputs as the navigation source for the strip. Sitewide outputs can still exist for other features, but they should not drive the visible review strip.

### Thumbnail Strip

`ThumbnailStrip` should receive only project-scoped outputs. It can keep its current grouping, ratings, winner badges, and color separators.

Expected result: the strip no longer shows images from unrelated projects.

### Main Viewer Selection

The current viewer state uses `currentIndex`. That is fragile during sync because new outputs can be inserted before the current image and shift positions.

The safer model is:

- store the selected output ID
- derive the selected index from the current output list
- clamp only when the selected ID is missing

This should fix the bug where the app appears to think newer images do not exist.

### Image Loading

The first speed pass should focus on big-image switching:

- when the current image changes, preload the next few project image URLs
- preload the previous few project image URLs
- keep existing thumbnail rendering simple
- add a lightweight loading state only if the current image URL is not ready

This avoids a larger caching system while addressing the main annoyance: waiting after clicking.

## Sync Handling

Live sync can update outputs while images are still generating. The review browser should handle this by:

- preserving selected output ID through refreshes
- accepting newly synced project outputs into the strip
- avoiding stale sitewide navigation for the active review view
- falling back gracefully if a selected output is not yet fully available

If an output record exists but the image file has not finished becoming available, the UI should show a simple loading state instead of acting like the image does not exist.

## Out Of Scope

- No UI redesign.
- No new project direction.
- No changes to ratings, winners, notes, or operator generation behavior.
- No broad storage rewrite.
- No production-grade cache or background worker system.

## Test Plan

Manual tests:

1. Open a project with many images and confirm the left strip only shows that project.
2. Switch to another project and confirm the strip changes to that project only.
3. Click several thumbnails and confirm the main image changes correctly.
4. Generate images while the app is open and wait for live sync.
5. Confirm the current image stays selected while new images arrive.
6. Confirm newly arrived images become selectable.
7. Confirm clicking nearby images feels faster than before.

Technical checks:

- Run the repo lint command.
- Run the repo build command.
- Use the in-app browser at `http://localhost:5173/` to verify the review screen behavior.

## Risks

- Some older output records may have incomplete image metadata. The viewer should show a loading or empty state for those records instead of breaking navigation.
- If current session outputs and project catalog outputs differ, the implementation must choose project catalog for review navigation and keep session-only state updates from overriding it.
