import Koa from 'koa'
import Router from '@koa/router'
import cors from '@koa/cors'
import bodyParser from '@koa/bodyparser';

const app = new Koa()
const router = new Router()

// Middleware
app.use(async (ctx, next) => {
  console.log(`${new Date().toISOString()} - ${ctx.method} ${ctx.url}`)
  await next()
})

app.use(cors())
app.use(bodyParser())

// Routes
router.get('/health', (ctx) => {
  ctx.body = { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Server is running correctly'
  }
})

router.get('/api/hello', (ctx) => {
  ctx.body = { message: 'Hello from X402 Solana Demo Server!' }
})

router.post('/api/data', (ctx) => {
  const data = ctx.request.body
  ctx.body = { success: true, received: data }
})

app.use(router.routes())
app.use(router.allowedMethods())

// 404 handler
app.use(async (ctx) => {
  ctx.status = 404
  ctx.body = { error: 'Not Found' }
})

const PORT = process.env.PORT || 3022
const HOST = process.env.HOST || '0.0.0.0'

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`)
  console.log(`📊 Health check: http://${HOST}:${PORT}/health`)
  console.log(`🔧 API endpoint: http://${HOST}:${PORT}/api/hello`)
})

console.log('Server setup completed successfully')