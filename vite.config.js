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
  if (env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = env.GEMINI_API_KEY
  }
  if (env.GEMINI_MODEL) {
    process.env.GEMINI_MODEL = env.GEMINI_MODEL
  }
  if (env.GEMINI_PLAN_MODEL) {
    process.env.GEMINI_PLAN_MODEL = env.GEMINI_PLAN_MODEL
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
            if (req.url.startsWith('/api/store/') || req.url.startsWith('/api/meta/') || req.url === '/api/migrate' || req.url.startsWith('/api/handoff') || req.url === '/api/project-stats') {
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
