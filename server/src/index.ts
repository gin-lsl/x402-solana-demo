import Koa from 'koa'
import Router from '@koa/router'
import cors from '@koa/cors'
import bodyParser from '@koa/bodyparser'
import { config } from 'dotenv'
import facilitatorRouter from './facilitator.js'
import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
} from '@solana/kit'
import { base58 } from '@scure/base'

config()

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
router.get('/health', ctx => {
  ctx.body = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Server is running correctly',
  }
})

router.get('/api/hello', async ctx => {
  const walletKeypair = process.env.WALLET_KEYPAIR

  console.log('keypair:', walletKeypair)

  if (!walletKeypair) {
    ctx.body = {
      success: false,
    }
    return
  }

  const keypairBytes = new Uint8Array(JSON.parse(walletKeypair.toString()))

  const keys = base58.encode(keypairBytes)
  console.log('keys:', keys)

  const keypairSigner = await createKeyPairSignerFromBytes(keypairBytes)

  const privateKey = await createKeyPairSignerFromPrivateKeyBytes(
    keypairBytes.slice(0, 32)
  )

  ctx.body = {
    message: 'Hello from X402 Solana Demo Server!',
    data: {
      address: keypairSigner.address,
      privateKey: privateKey,
      publicKey: keypairSigner.keyPair.publicKey,
    },
  }
})

router.post('/api/data', ctx => {
  const data = ctx.request.body
  ctx.body = { success: true, received: data }
})

app.use(facilitatorRouter.routes()).use(facilitatorRouter.allowedMethods())
app.use(router.routes()).use(router.allowedMethods())

// 404 handler
app.use(async ctx => {
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
