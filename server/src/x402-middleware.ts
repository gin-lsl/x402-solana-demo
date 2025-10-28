import { Context, Next } from 'koa'
import {
  PaymentRequirements,
  PaymentPayload,
  PaymentPayloadSchema,
  SupportedSVMNetworks,
} from 'x402/types'
import { verify, settle } from 'x402/facilitator'
import {toJsonSafe} from 'x402/shared'
import { createSigner, isSvmSignerWallet } from 'x402/types'
import { base58 } from '@scure/base'

// 解析私钥
function parsePrivateKey() {
  const keypair = process.env.WALLET_KEYPAIR
  if (!keypair) return undefined
  const keypairBytes = new Uint8Array(JSON.parse(keypair.toString()))
  return base58.encode(keypairBytes)
}

// 创建 x402 facilitator 中间件
export function createX402Middleware(options: {
  amount: number
  description: string
  resource: string
  mimeType: string
  maxAmountRequired?: number
  payTo?: string
  maxTimeoutSeconds?: number
  asset?: string
  network?: typeof SupportedSVMNetworks[number]
  settlePayment?: boolean
}) {
  const { 
    amount, 
    description, 
    resource, 
    mimeType, 
    maxAmountRequired = amount,
    payTo,
    maxTimeoutSeconds = 60,
    asset = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    network = 'solana-devnet',
    settlePayment = true
  } = options

  return async (ctx: Context, next: Next) => {
    console.log('middleware: ', ctx.request.url);
    try {
      // 从请求头获取支付负载
      const paymentHeader = ctx.headers['x402-payment']
      if (!paymentHeader) {
        console.log('没有支付头，返回支付要求', ctx.request.headers);
        // 没有支付头，返回支付要求
        const paymentRequirements: PaymentRequirements = {
          network,
          scheme: 'exact',
          description,
          resource: `http://localhost:3022${resource}`,
          mimeType,
          // maxAmountRequired: maxAmountRequired.toString(),
          maxAmountRequired: '1000',
          payTo: payTo || await getFeePayer() || '',
          maxTimeoutSeconds,
          asset,
          extra: {
            feePayer: await getFeePayer(),
          },
        }

        ctx.status = 402
        ctx.set('X402-Payment-Required', JSON.stringify(paymentRequirements))
        ctx.body = {
          error: 'Payment required',
          // paymentRequirements,
          accepts: toJsonSafe([paymentRequirements]),
          amount,
        }
        return
      }

      console.log('fk2');

      // 解析支付负载
      let paymentPayload: PaymentPayload
      try {
        paymentPayload = PaymentPayloadSchema.parse(JSON.parse(paymentHeader as string))
      } catch (error) {
        console.log('Error: Invalid payment payload format');
        ctx.status = 400
        ctx.body = {
          error: 'Invalid payment payload format',
        }
        return
      }

      // 创建支付要求用于验证
      const paymentRequirements: PaymentRequirements = {
        network,
        scheme: 'exact',
        description,
        resource,
        mimeType,
        maxAmountRequired: maxAmountRequired.toString(),
        payTo: payTo || await getFeePayer() || '',
        maxTimeoutSeconds,
        asset,
        extra: {
          feePayer: await getFeePayer(),
        },
      }

      // 验证支付
      const privateKey = parsePrivateKey()
      if (!privateKey) {
        console.log('Error: Server configuration error');
        ctx.status = 500
        ctx.body = {
          error: 'Server configuration error',
        }
        return
      }

      const client = await createSigner(network, privateKey)
      
      // 验证支付有效性
      const isValid = await verify(
        client,
        paymentPayload,
        paymentRequirements,
        {
          svmConfig: {
            rpcUrl: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
          },
        }
      )

      if (!isValid) {
        console.log('Error: Invalid payment');
        ctx.status = 402
        ctx.body = {
          error: 'Invalid payment',
        }
        return
      }

      // 如果需要，执行支付结算
      if (settlePayment) {
        try {
          const settleResult = await settle(
            client,
            paymentPayload,
            paymentRequirements,
            {
              svmConfig: {
                rpcUrl: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
              },
            }
          )
          
          console.log('Payment settled:', settleResult)
          
          // 将结算结果存储在上下文中，供后续使用
          ctx.state.paymentSettled = settleResult
        } catch (settleError) {
          console.error('Payment settlement failed:', settleError)
          // 结算失败但仍然允许访问，因为验证已经通过
          ctx.state.paymentSettlementError = settleError
        }
      }

      // 将支付信息存储在上下文中，供路由处理程序使用
      ctx.state.paymentPayload = paymentPayload
      ctx.state.paymentRequirements = paymentRequirements
      ctx.state.paymentAmount = amount

      // 支付验证通过，继续处理请求
      await next()
    } catch (error) {
      console.error('X402 middleware error:', error)
      ctx.status = 500
      ctx.body = {
        error: 'Payment verification failed',
      }
    }
  }
}

// 获取费用支付者地址
async function getFeePayer(): Promise<string | undefined> {
  try {
    const privateKey = parsePrivateKey()
    if (!privateKey) return undefined
    
    const signer = await createSigner('solana-devnet', privateKey)
    return isSvmSignerWallet(signer) ? signer.address : undefined
  } catch (error) {
    console.error('Error getting fee payer:', error)
    return undefined
  }
}