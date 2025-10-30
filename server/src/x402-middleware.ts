import { Context, Next } from 'koa'
import { PaymentRequirements, PaymentPayload, PaymentPayloadSchema, SupportedSVMNetworks } from 'x402/types'
import { verify, settle } from 'x402/facilitator'
import { safeBase64Decode, toJsonSafe } from 'x402/shared'
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
  network?: (typeof SupportedSVMNetworks)[number]
  settlePayment?: boolean
}) {
  const {
    amount,
    description,
    resource,
    mimeType,
    // [NOTE]
    maxAmountRequired = amount * 10,
    payTo,
    maxTimeoutSeconds = 60,
    // 使用 SPL Token：x402 exact(SVM) 当前基于 Token TransferChecked 校验，asset 必填为 Mint 地址
    asset = '9gKBTRXgVTszU31A12oJKKSy6aje8LyoVvNfSimembHo',
    network = 'solana-devnet',
    settlePayment = true,
  } = options

  return async (ctx: Context, next: Next) => {
    console.log('middleware: ', ctx.request.url)

    try {
      const resolvedFeePayer = await getFeePayer()
      // 从请求头获取支付负载
      const paymentHeader = ctx.headers['x-payment'] as string | undefined
      console.log('x-payment header:', paymentHeader)

      if (!paymentHeader) {
        console.log('Error, need x-payment header, headers:', ctx.request.headers)
        // 没有支付头，返回支付要求
        // 如果没有显式 payTo 且无法解析 feePayer，则返回服务端配置错误，避免生成不可支付的 402 要求
        if (!payTo && !resolvedFeePayer) {
          ctx.status = 500
          ctx.body = {
            error: 'Server configuration error: missing fee payer (WALLET_KEYPAIR)',
          }
          return
        }
        const paymentRequirements: PaymentRequirements = {
          network,
          scheme: 'exact',
          description,
          // resource,
          resource: `http://localhost:3022${resource}`, // x402-fetch 要求为可解析的完整 URL
          mimeType,
          // maxAmountRequired: maxAmountRequired.toString(), // 浮点字符串（如 0.1）会校验失败
          maxAmountRequired: String(Math.trunc(Number(maxAmountRequired)) || 1000), // 使用整数字符串，单位为资产的最小单位
          payTo: payTo || resolvedFeePayer!,
          maxTimeoutSeconds,
          asset, // 资产为 SPL Token 的 Mint（exact/SVM 必需）
          extra: {
            feePayer: resolvedFeePayer,
          },
        }

        ctx.status = 402
        ctx.set('X402-Payment-Required', JSON.stringify(paymentRequirements))
        ctx.set('X-PAYMENT-REQUIRED', JSON.stringify(paymentRequirements))
        ctx.body = {
          x402Version: 1,
          error: 'Payment required',
          // paymentRequirements: toJsonSafe(paymentRequirements),
          accepts: toJsonSafe([paymentRequirements]),
          amount,
        }
        return
      }

      console.log('ready to parse payment payload data')

      // 解析支付负载
      let paymentPayload: PaymentPayload
      try {
        const paymentHeaderJson = safeBase64Decode(paymentHeader)
        paymentPayload = PaymentPayloadSchema.parse(JSON.parse(paymentHeaderJson))
      } catch (error) {
        console.log('error:', error)
        console.log('Error: Invalid payment payload format')
        ctx.status = 400
        ctx.body = {
          error: 'Invalid payment payload format',
        }
        return
      }

      console.log('create payment requirements data')

      // 创建支付要求用于验证
      const paymentRequirements: PaymentRequirements = {
        network,
        scheme: 'exact',
        description,
        // resource,
        resource: `http://localhost:3022${resource}`,
        mimeType,
        // maxAmountRequired: maxAmountRequired.toString(),
        maxAmountRequired: String(Math.trunc(Number(maxAmountRequired)) || 600000),
        payTo: payTo || resolvedFeePayer || '',
        maxTimeoutSeconds,
        asset,
        extra: {
          feePayer: resolvedFeePayer,
        },
      }

      // 验证支付
      const privateKey = parsePrivateKey()
      if (!privateKey) {
        console.log('Error: Server configuration error')
        ctx.status = 500
        ctx.body = {
          error: 'Server configuration error',
        }
        return
      }

      const client = await createSigner(network, privateKey)
      // 验证支付有效性
      const isValid = await verify(client, paymentPayload, paymentRequirements, {
        svmConfig: {
          // rpcUrl: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
          rpcUrl:
            process.env.SOLANA_RPC || 'https://api.zan.top/node/v1/solana/devnet/96b981aa6d1d4f8aa889480f6fed193a',
        },
      })

      console.log('valid result:', isValid)

      if (!isValid) {
        console.log('Error: Invalid payment')
        ctx.status = 402
        ctx.body = {
          error: 'Invalid payment',
        }
        return
      }

      // 如果需要，执行支付结算
      if (settlePayment) {
        console.log('process.env.SOLANA_RPC:', process.env.SOLANA_RPC)
        try {
          const settleResult = await settle(client, paymentPayload, paymentRequirements, {
            svmConfig: {
              rpcUrl: process.env.SOLANA_RPC,
            },
          })

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
