import Koa from 'koa'
import Router from 'koa-router'
import bodyParser from 'koa-bodyparser'
import cors from 'koa-cors'
import logger from 'koa-logger'

const app = new Koa()
const router = new Router()

// Middleware
app.use(logger())
app.use(cors())
app.use(bodyParser())

// Routes
router.get('/health', (ctx) => {
  ctx.body = { status: 'ok', timestamp: new Date().toISOString() }
})

router.get('/api/hello', (ctx) => {
  ctx.body = { message: 'Hello from X402 Solana Demo Server!' }
})

router.post('/api/data', (ctx) => {
  const data = ctx.request.body
  console.log('Received data:', data)
  ctx.body = { success: true, received: data }
})

app.use(router.routes())
app.use(router.allowedMethods())

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`🔧 API endpoint: http://localhost:${PORT}/api/hello`)
})