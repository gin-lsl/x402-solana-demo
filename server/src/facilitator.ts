import Router from '@koa/router'
import { base58 } from '@scure/base'
import { ZodError } from 'zod'
import {
  ConnectedClient,
  createSigner,
  isSvmSignerWallet,
  PaymentPayloadSchema,
  PaymentRequirementsSchema,
  Signer,
  SupportedPaymentKind,
  SupportedSVMNetworks,
} from 'x402/types'
import { settle, verify } from 'x402/facilitator'

function parsePrivateKey() {
  const keypair = process.env.WALLET_KEYPAIR

  if (!keypair) return undefined

  const keypairBytes = new Uint8Array(JSON.parse(keypair.toString()))
  return base58.encode(keypairBytes)
}

function isZodError(error: unknown): error is ZodError {
  return (
    typeof error === 'object' &&
    error !== null &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error as any).name === 'ZodError' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Array.isArray((error as any).issues)
  )
}

const facilitatorRouter = new Router({
  prefix: '/facilitator',
})

facilitatorRouter.use(async (ctx, next) => {
  try {
    await next()
  } catch (error) {
    console.log('----------------------------------------------------')
    console.log('error:', error)
    console.log('----------------------------------------------------')

    // Zod v3
    if (isZodError(error)) {
      ctx.status = 400
      ctx.body = {
        error: 'Validation Error',
        details: error.issues?.map(issue => ({
          path: Array.isArray(issue.path)
            ? issue.path.join('.')
            : String(issue.path),
          message: issue.message || 'Validation failed',
        })) || ['Validation failed'],
      }

      return
    }

    ctx.status = 500
    ctx.body = {
      error: 'Internal Server Error',
    }
  }
})

facilitatorRouter.get('/supported', async ctx => {
  const kinds: SupportedPaymentKind[] = []
  const privateKey = parsePrivateKey()

  if (privateKey) {
    const signer = await createSigner('solana-devnet', privateKey)
    const feePayer = isSvmSignerWallet(signer) ? signer.address : undefined

    kinds.push({
      network: 'solana-devnet',
      x402Version: 1,
      scheme: 'exact',
      extra: {
        feePayer,
      },
    })
  }

  ctx.body = kinds
})

facilitatorRouter.get('/verify', ctx => {
  ctx.body = {
    endpoint: ctx.path,
    description: 'POST to verify x402 payments',
    body: {
      paymentPayload: 'PaymentPayload',
      paymentRequirements: 'PaymentRequirements',
    },
  }
})

facilitatorRouter.get('/settle', ctx => {
  ctx.body = {
    endpoint: ctx.path,
    description: 'POST to settle x402 payments',
    body: {
      paymentPayload: 'PaymentPayload',
      paymentRequirements: 'PaymentRequirements',
    },
  }
})

facilitatorRouter.post('/verify', async ctx => {
  const data = ctx.request.body
  const paymentPayload = PaymentPayloadSchema.parse(data.paymentPayload)
  const paymentRequirements = PaymentRequirementsSchema.parse(
    data.paymentRequirements
  )

  let client: Signer | ConnectedClient
  if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
    client = await createSigner(paymentRequirements.network, parsePrivateKey()!)
  } else {
    throw new Error('Invalid network')
  }

  const valid = await verify(client, paymentPayload, paymentRequirements, {
    svmConfig: {
      rpcUrl: process.env.SOLANA_RPC,
    },
  })

  console.log('data:', data)

  ctx.body = valid
})

facilitatorRouter.post('/settle', async ctx => {
  const data = ctx.request.body
  const paymentPayload = PaymentPayloadSchema.parse(data.paymentPayload)
  const paymentRequirements = PaymentRequirementsSchema.parse(
    data.paymentRequirements
  )

  let signer: Signer

  if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
    signer = await createSigner(paymentRequirements.network, parsePrivateKey()!)
  } else {
    throw new Error('Invalid network')
  }

  const result = await settle(signer, paymentPayload, paymentRequirements, {
    svmConfig: {
      rpcUrl: process.env.SOLANA_RPC,
    },
  })
  ctx.body = result
})

export default facilitatorRouter
