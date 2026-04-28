import { GoogleAuth } from 'google-auth-library'
import { getImageModelLocation, resolveImageModel } from '../src/modelConfig.js'

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] })

function truthyEnv(value) {
  return String(value || '').toLowerCase() === 'true'
}

export function getVertexAISettings() {
  return {
    useVertexAI: truthyEnv(process.env.GOOGLE_GENAI_USE_VERTEXAI),
    project: process.env.GOOGLE_CLOUD_PROJECT || '',
    location: process.env.GOOGLE_CLOUD_LOCATION || '',
  }
}

export function getVertexAIConfigError() {
  const settings = getVertexAISettings()

  if (!settings.useVertexAI) {
    return 'Vertex AI mode is not enabled. Set GOOGLE_GENAI_USE_VERTEXAI=true.'
  }
  if (!settings.project) {
    return 'GOOGLE_CLOUD_PROJECT is not set. Set it to your Google Cloud project ID.'
  }
  if (!settings.location) {
    return 'GOOGLE_CLOUD_LOCATION is not set. Set it to your Vertex AI region, for example us-central1.'
  }

  return null
}

export function assertVertexAIConfigured() {
  const configError = getVertexAIConfigError()
  if (!configError) return

  const err = new Error(configError)
  err.code = 'VERTEX_CONFIG_ERROR'
  err.status = 500
  err.retryable = false
  throw err
}

function wrapAdcError(error) {
  const err = new Error(
    'Application Default Credentials are not ready. Run "gcloud auth application-default login" and make sure your Google Cloud project is configured for Vertex AI.'
  )
  err.code = 'ADC_AUTH_ERROR'
  err.status = 500
  err.retryable = false
  err.detail = error?.message || String(error || '')
  return err
}

export async function getVertexAIRequestHeaders() {
  assertVertexAIConfigured()
  const { project } = getVertexAISettings()

  try {
    const client = await auth.getClient()
    const tokenResponse = await client.getAccessToken()
    const accessToken =
      typeof tokenResponse === 'string'
        ? tokenResponse
        : tokenResponse?.token || tokenResponse?.access_token || null

    if (!accessToken) {
      const err = new Error('ADC returned no access token')
      err.code = 'ADC_NO_ACCESS_TOKEN'
      throw err
    }

    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': project,
    }
  } catch (error) {
    throw wrapAdcError(error)
  }
}

export async function ensureVertexAIAuthReady() {
  await getVertexAIRequestHeaders()
}

export function getVertexGenerateContentEndpoint(model) {
  assertVertexAIConfigured()
  const { project, location } = getVertexAISettings()
  const resolvedModel = resolveImageModel(model)
  const resolvedLocation = getImageModelLocation(resolvedModel, location)
  const host = resolvedLocation === 'global'
    ? 'https://aiplatform.googleapis.com'
    : `https://${resolvedLocation}-aiplatform.googleapis.com`
  return `${host}/v1/projects/${project}/locations/${resolvedLocation}/publishers/google/models/${resolvedModel}:generateContent`
}

export async function postVertexGenerateContent(model, body, { timeoutMs = 90_000 } = {}) {
  const endpoint = getVertexGenerateContentEndpoint(model)
  const headers = await getVertexAIRequestHeaders()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startTime = Date.now()

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  return {
    response,
    durationMs: Date.now() - startTime,
  }
}
