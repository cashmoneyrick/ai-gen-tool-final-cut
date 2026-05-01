import { getImageUrl } from '../utils/imageUrl.js'

export function findOutputIndexById(outputs, outputId) {
  if (!outputId || !Array.isArray(outputs)) return -1
  return outputs.findIndex((output) => output?.id === outputId)
}

export function resolveSelectedOutputId(outputs, selectedOutputId, fallbackIndex = 0) {
  if (!Array.isArray(outputs) || outputs.length === 0) return null
  if (findOutputIndexById(outputs, selectedOutputId) >= 0) return selectedOutputId

  const safeIndex = Math.max(0, Math.min(fallbackIndex, outputs.length - 1))
  return outputs[safeIndex]?.id || outputs[0]?.id || null
}

export function getNearbyImageUrls(outputs, currentIndex, radius = 2) {
  if (!Array.isArray(outputs) || outputs.length === 0) return []
  if (currentIndex < 0) return []

  const urls = []
  const start = Math.max(0, currentIndex - radius)
  const end = Math.min(outputs.length - 1, currentIndex + radius)

  for (let index = start; index <= end; index += 1) {
    if (index === currentIndex) continue
    const url = getImageUrl(outputs[index])
    if (url) urls.push(url)
  }

  return urls
}
