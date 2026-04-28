/**
 * Get the display URL for an output image.
 * Handles both legacy inline dataUrl and new file-based imagePath.
 */
export function getImageUrl(output) {
  if (!output) return null
  if (output.dataUrl) return output.dataUrl
  if (output.imagePath) return `/api/images/${output.id}`
  return null
}
