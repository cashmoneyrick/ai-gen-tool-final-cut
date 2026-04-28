export const FAST_IMAGE_MODEL = 'gemini-2.5-flash-image'
export const PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview'
export const DEFAULT_IMAGE_MODEL = PRO_IMAGE_MODEL

export const AVAILABLE_IMAGE_MODELS = [
  { id: FAST_IMAGE_MODEL, label: 'Nano Banana Flash' },
  { id: PRO_IMAGE_MODEL, label: 'Nano Banana Pro' },
]

const LEGACY_IMAGE_MODEL_ALIASES = {
  'gemini-3.1-flash-image-preview': FAST_IMAGE_MODEL,
  'gemini-2.5-flash-image-preview': FAST_IMAGE_MODEL,
  'gemini-3-pro-image-preview': PRO_IMAGE_MODEL,
}

export function resolveImageModel(model) {
  if (!model) return DEFAULT_IMAGE_MODEL
  return LEGACY_IMAGE_MODEL_ALIASES[model] || model
}

export function getImageModelLocation(model, defaultLocation = 'us-central1') {
  const resolvedModel = resolveImageModel(model)
  if (resolvedModel === PRO_IMAGE_MODEL) {
    return 'global'
  }
  return defaultLocation
}
