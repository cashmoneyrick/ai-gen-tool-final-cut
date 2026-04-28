import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleGenerate, handleConfig } from './server/generate.js'
import { handlePlan } from './server/plan.js'
import { handleStoreAPI } from './server/api.js'
import { handleLiveSync, startFileWatcher } from './server/live-sync.js'
import { handleRewrite } from './server/rewrite.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_ ones) for server-side use
  const env = loadEnv(mode, process.cwd(), '')
  if (env.GEMINI_MODEL) {
    process.env.GEMINI_MODEL = env.GEMINI_MODEL
  }
  if (env.GEMINI_PLAN_MODEL) {
    process.env.GEMINI_PLAN_MODEL = env.GEMINI_PLAN_MODEL
  }
  if (env.GOOGLE_GENAI_USE_VERTEXAI) {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = env.GOOGLE_GENAI_USE_VERTEXAI
  }
  if (env.GOOGLE_CLOUD_PROJECT) {
    process.env.GOOGLE_CLOUD_PROJECT = env.GOOGLE_CLOUD_PROJECT
  }
  if (env.GOOGLE_CLOUD_LOCATION) {
    process.env.GOOGLE_CLOUD_LOCATION = env.GOOGLE_CLOUD_LOCATION
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = env.GOOGLE_APPLICATION_CREDENTIALS
  }

  return {
    plugins: [
      react(),
      {
        name: 'api-server',
        configureServer(server) {
          // Start file watcher for live sync
          startFileWatcher()

          // SSE endpoint for live sync
          server.middlewares.use('/api/live-sync', (req, res) => {
            handleLiveSync(req, res)
          })

          // Shared storage CRUD (must be before specific routes)
          server.middlewares.use((req, res, next) => {
            if (req.url.startsWith('/api/store/') || req.url.startsWith('/api/meta/') || req.url === '/api/migrate' || req.url.startsWith('/api/handoff') || req.url === '/api/project-stats' || req.url === '/api/restrictions' || req.url.startsWith('/api/operator/') || req.url === '/api/upscale-queue' || req.url === '/api/session-end' || req.url.startsWith('/api/briefs/') || req.url.startsWith('/api/analyze/') || req.url === '/api/global-state' || req.url === '/api/vocabulary' || req.url.startsWith('/api/ref-analysis/') || req.url.startsWith('/api/templates') || req.url.startsWith('/api/recommendations/') || req.url === '/api/brand-dna' || req.url.startsWith('/api/images/')) {
              return handleStoreAPI(req, res, next)
            }
            next()
          })
          server.middlewares.use('/api/config', (req, res, next) => {
            if (req.method === 'GET') {
              handleConfig(req, res)
            } else {
              next()
            }
          })
          server.middlewares.use('/api/generate', (req, res, next) => {
            if (req.method === 'POST') {
              handleGenerate(req, res)
            } else {
              next()
            }
          })
          server.middlewares.use('/api/rewrite', (req, res, next) => {
            if (req.method === 'POST') {
              handleRewrite(req, res)
            } else {
              next()
            }
          })
          server.middlewares.use('/api/plan', (req, res, next) => {
            if (req.method === 'POST') {
              handlePlan(req, res)
            } else {
              next()
            }
          })
        },
      },
    ],
  }
})
