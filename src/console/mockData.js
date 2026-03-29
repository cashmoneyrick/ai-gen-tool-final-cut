// Mock data shaped exactly like real repo structures for shell-only testing
// Replace these imports with real state props during wiring phase

const now = Date.now()

// SVG placeholder images (colored rectangles, minimal)
const svgBlue = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect fill='%234a7c9e' width='512' height='512'/%3E%3Ctext x='256' y='256' fill='%23fff' font-size='48' text-anchor='middle' dominant-baseline='middle'%3E1%3C/text%3E%3C/svg%3E`
const svgGreen = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect fill='%235aaa6a' width='512' height='512'/%3E%3Ctext x='256' y='256' fill='%23fff' font-size='48' text-anchor='middle' dominant-baseline='middle'%3E2%3C/text%3E%3C/svg%3E`
const svgPurple = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect fill='%238b5a9e' width='512' height='512'/%3E%3Ctext x='256' y='256' fill='%23fff' font-size='48' text-anchor='middle' dominant-baseline='middle'%3E3%3C/text%3E%3C/svg%3E`
const svgOrange = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect fill='%23c49a5a' width='512' height='512'/%3E%3Ctext x='256' y='256' fill='%23fff' font-size='48' text-anchor='middle' dominant-baseline='middle'%3E4%3C/text%3E%3C/svg%3E`
const svgRed = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect fill='%23c45a5a' width='512' height='512'/%3E%3Ctext x='256' y='256' fill='%23fff' font-size='48' text-anchor='middle' dominant-baseline='middle'%3E5%3C/text%3E%3C/svg%3E`

export const MOCK_PROJECT = {
  id: 'project-operator-demo',
  name: 'Operator Demo Project',
}

export const MOCK_SESSION = {
  id: 'session-operator-demo',
  projectId: 'project-operator-demo',
  goal: 'Create luxury perfume product photography with precise composition and lighting.',
  model: 'gemini-3.1-flash-image-preview',
  buckets: {
    subject: 'luxury glass perfume bottle with gold accents',
    style: 'high-end product photography, clean minimalist aesthetic',
    lighting: 'soft directional light from upper left, shallow depth of field',
    composition: 'centered bottle, white background, gold reflection',
    technical: '35mm equivalent focal length, shallow DOF, product-grade sharpness',
  },
  assembledPrompt:
    'luxury glass perfume bottle with gold accents. high-end product photography, clean minimalist aesthetic. soft directional light from upper left, shallow depth of field. centered bottle, white background, gold reflection. 35mm equivalent focal length, shallow DOF, product-grade sharpness.',
}

export const MOCK_LOCKED_ELEMENTS = [
  {
    id: 'locked-1',
    text: 'product on white background',
    enabled: true,
  },
  {
    id: 'locked-2',
    text: 'no text or labels in image',
    enabled: true,
  },
]

export const MOCK_OUTPUTS = [
  {
    id: 'output-1-latest',
    dataUrl: svgBlue,
    model: 'gemini-3.1-flash-image-preview',
    feedback: 'up',
    finalPromptSent:
      'luxury glass perfume bottle with gold accents. high-end product photography, clean minimalist aesthetic. soft directional light from upper left, shallow depth of field. centered bottle, white background, gold reflection. 35mm equivalent focal length, shallow DOF, product-grade sharpness.',
    status: 'succeeded',
    createdAt: now - 2 * 60 * 1000, // 2 min ago
    iterationPreamble:
      '[Supporting iteration guidance — keep: subject, style, lighting direction. Try: warmer gold tones, stronger shadow definition.]',
    activeLockedElementsSnapshot: ['product on white background', 'no text or labels in image'],
    sentRefs: [],
    operatorDecision: {
      operatorMode: true,
      intent: 'refine lighting and shadow detail based on winner feedback',
      reason: 'previous output was good on composition but light was too flat',
      resolvedModel: 'gemini-3.1-flash-image-preview',
      resolvedPromptSource: 'session',
      contextSnapshot: {
        winnersCount: 1,
        carryForwardSummary:
          '[Supporting iteration guidance — keep: subject, style. Try: warmer tones.]',
        lockedCount: 2,
        refsCount: 0,
      },
    },
    metadata: {
      model: 'gemini-3.1-flash-image-preview',
      durationMs: 18453,
      tokenUsage: {
        prompt: 142,
        output: 1847,
        total: 1989,
      },
      finishReason: 'STOP',
      generatedAt: now - 2 * 60 * 1000,
    },
  },
  {
    id: 'output-2-prev',
    dataUrl: svgGreen,
    model: 'gemini-3.1-flash-image-preview',
    feedback: 'up',
    finalPromptSent:
      'luxury glass perfume bottle with gold accents. high-end product photography, clean minimalist aesthetic.',
    status: 'succeeded',
    createdAt: now - 8 * 60 * 1000, // 8 min ago
    iterationPreamble: '[Supporting iteration guidance — keep: subject, style.]',
    activeLockedElementsSnapshot: ['product on white background'],
    sentRefs: [],
    operatorDecision: {
      operatorMode: true,
      intent: 'add lighting direction and composition guidance',
      reason: 'iterating on subject and style foundation',
      resolvedModel: 'gemini-3.1-flash-image-preview',
      resolvedPromptSource: 'session',
      contextSnapshot: {
        winnersCount: 0,
        carryForwardSummary: '[Supporting iteration guidance — keep: subject, style.]',
        lockedCount: 1,
        refsCount: 0,
      },
    },
    metadata: {
      model: 'gemini-3.1-flash-image-preview',
      durationMs: 15847,
      tokenUsage: {
        prompt: 98,
        output: 1623,
        total: 1721,
      },
      finishReason: 'STOP',
      generatedAt: now - 8 * 60 * 1000,
    },
  },
  {
    id: 'output-3-older',
    dataUrl: svgPurple,
    model: 'gemini-3.1-flash-image-preview',
    feedback: 'down',
    finalPromptSent: 'luxury perfume bottle',
    status: 'succeeded',
    createdAt: now - 15 * 60 * 1000,
    iterationPreamble: null,
    activeLockedElementsSnapshot: [],
    sentRefs: [],
    operatorDecision: null,
    metadata: {
      model: 'gemini-3.1-flash-image-preview',
      durationMs: 14220,
      tokenUsage: {
        prompt: 12,
        output: 1512,
        total: 1524,
      },
      finishReason: 'STOP',
      generatedAt: now - 15 * 60 * 1000,
    },
  },
  {
    id: 'output-4',
    dataUrl: svgOrange,
    model: 'gemini-3.1-flash-image-preview',
    feedback: null,
    finalPromptSent: 'luxury glass bottle product shot',
    status: 'succeeded',
    createdAt: now - 22 * 60 * 1000,
    iterationPreamble: null,
    activeLockedElementsSnapshot: [],
    sentRefs: [],
    operatorDecision: null,
    metadata: {
      model: 'gemini-3.1-flash-image-preview',
      durationMs: 13567,
      tokenUsage: {
        prompt: 8,
        output: 1389,
        total: 1397,
      },
      finishReason: 'STOP',
      generatedAt: now - 22 * 60 * 1000,
    },
  },
  {
    id: 'output-5',
    dataUrl: svgRed,
    model: 'gemini-3.1-flash-image-preview',
    feedback: null,
    finalPromptSent: 'perfume bottle on white',
    status: 'succeeded',
    createdAt: now - 30 * 60 * 1000,
    iterationPreamble: null,
    activeLockedElementsSnapshot: [],
    sentRefs: [],
    operatorDecision: null,
    metadata: {
      model: 'gemini-3.1-flash-image-preview',
      durationMs: 12891,
      tokenUsage: {
        prompt: 5,
        output: 1203,
        total: 1208,
      },
      finishReason: 'STOP',
      generatedAt: now - 30 * 60 * 1000,
    },
  },
]

export const MOCK_WINNERS = [
  {
    id: 'winner-1',
    outputId: 'output-2-prev',
    dataUrl: svgGreen,
    model: 'gemini-3.1-flash-image-preview',
    feedback: 'up',
    notes: 'Great color saturation and composition. Keep this style direction.',
    prompt: 'luxury glass perfume bottle with gold accents. high-end product photography.',
    createdAt: now - 9 * 60 * 1000,
  },
]

export const MOCK_REFS = []
