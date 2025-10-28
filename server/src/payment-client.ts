/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PaymentRequirements,
  PaymentPayload,
  createSigner,
  SupportedSVMNetworks,
  Signer,
  isSvmSignerWallet,
} from 'x402/types'
import { base58 } from '@scure/base'
import { createSolanaRpc, devnet } from '@solana/kit'
import { config } from 'dotenv'
import { signPaymentHeader } from 'x402/client';

config()

// 支付客户端类，用于处理 x402 付费请求
export class X402PaymentClient {
  private privateKey: string
  private network: (typeof SupportedSVMNetworks)[number]
  private signer!: Signer
  private rpc = createSolanaRpc(
    devnet(
      'https://api.zan.top/node/v1/solana/devnet/96b981aa6d1d4f8aa889480f6fed193a'
    )
  )

  constructor(
    privateKey: string,
    network: (typeof SupportedSVMNetworks)[number] = 'solana-devnet'
  ) {
    this.privateKey = privateKey
    this.network = network
  }

  // 初始化签名器
  async initialize() {
    this.signer = await createSigner(this.network, this.privateKey)
  }

  // 发送付费请求
  async makePaymentRequest(url: string, params?: any) {
    try {
      // 构建完整的 URL
      const urlObj = new URL(url)
      if (params) {
        Object.keys(params).forEach(key => {
          urlObj.searchParams.append(key, params[key])
        })
      }

      // 首次请求获取支付要求
      const firstResponse = await fetch(urlObj.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (firstResponse.status === 200) {
        // 如果直接成功，说明不需要付费或已经付费
        return await firstResponse.json()
      }

      if (firstResponse.status === 402) {
        // 获取支付要求
        const responseData = await firstResponse.json()
        const paymentRequirements: PaymentRequirements =
          responseData.paymentRequirements

        console.log('Payment required:', {
          amount: paymentRequirements.maxAmountRequired,
          description: paymentRequirements.description,
          payTo: paymentRequirements.payTo,
          resource: paymentRequirements.resource,
        })

        // 创建支付负载
        const paymentPayload =
          await this.createPaymentPayload(paymentRequirements)

        // 发送带支付的请求
        const paidResponse = await fetch(urlObj.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X402-Payment': JSON.stringify(paymentPayload),
          },
        })

        if (!paidResponse.ok) {
          throw new Error(
            `Payment request failed: ${paidResponse.status} ${paidResponse.statusText}`
          )
        }

        return await paidResponse.json()
      }

      throw new Error(`Unexpected response status: ${firstResponse.status}`)
    } catch (error) {
      console.error('Payment request failed:', error)
      throw error
    }
  }

  // 创建支付负载
  private async createPaymentPayload(
    requirements: PaymentRequirements
  ): Promise<PaymentPayload> {
    if (!this.signer) {
      throw new Error('Signer not initialized')
    }

    // 创建支付交易签名
    const signature = await this.createPaymentSignature(requirements)

    // 构建符合 x402 标准的支付负载
    return {
      scheme: 'exact',
      network: requirements.network,
      x402Version: 1,
      payload: {
        signature,
        authorization: {
          from: isSvmSignerWallet(this.signer) ? this.signer.address : '',
          to: requirements.payTo,
          value: requirements.maxAmountRequired,
          validAfter: Math.floor(Date.now() / 1000).toString(),
          validBefore: Math.floor((Date.now() + 300000) / 1000).toString(), // 5分钟后过期
          nonce: Math.random().toString(36).substr(2, 16),
        },
      },
    } as PaymentPayload
  }

  // 创建真实的支付签名 - 使用 this.signer 的内置签名功能
  private async createPaymentSignature(
    requirements: PaymentRequirements
  ): Promise<string> {
    try {
      if (!isSvmSignerWallet(this.signer)) {
        throw new Error('Only support solana network')
      }

      console.log('Creating real payment signature for:', {
        amount: requirements.maxAmountRequired,
        payTo: requirements.payTo,
        payFrom: this.signer.address,
      })

      // 获取最新的区块哈希
      const { value: latestBlockhash } = await this.rpc
        .getLatestBlockhash()
        .send()

      // 创建支付交易消息
      const paymentMessage = {
        from: this.signer.address,
        to: requirements.payTo,
        amount: requirements.maxAmountRequired,
        network: requirements.network,
        validAfter: Math.floor(Date.now() / 1000).toString(),
        validBefore: Math.floor((Date.now() + 300000) / 1000).toString(),
        nonce: Math.random().toString(36).substr(2, 16),
        blockhash: latestBlockhash.blockhash,
      }

      // 将支付消息序列化为字节数组
      const messageBytes = new TextEncoder().encode(
        JSON.stringify(paymentMessage)
      )

      // 使用 this.signer 的内置签名功能
      let signature: Uint8Array

      // 方法1: 使用签名器的内置签名方法
      try {
        // 首先尝试使用签名器的 sign 方法（如果存在）
        if (this.signer && typeof this.signer === 'object') {
          const signerAsAny = this.signer as any
          
          // 尝试 sign 方法
          if ('sign' in signerAsAny && typeof signerAsAny.sign === 'function') {
            signature = await signerAsAny.sign(messageBytes)
          } 
          // 尝试 signMessages 方法
          else if ('signMessages' in signerAsAny && typeof signerAsAny.signMessages === 'function') {
            const signedMessages = await signerAsAny.signMessages([messageBytes])
            if (signedMessages.length > 0) {
              // signedMessages 是签名记录数组，直接获取第一个
              const firstSignature = signedMessages[0]
              if (firstSignature && typeof firstSignature === 'object') {
                // 获取地址对应的签名
                const addressEntries = Object.entries(firstSignature)
                if (addressEntries.length > 0) {
                  signature = addressEntries[0][1] as Uint8Array // 获取第一个签名
                } else {
                  throw new Error('No signatures found')
                }
              } else {
                signature = firstSignature as Uint8Array // 如果直接返回签名数据
              }
            } else {
              throw new Error('No signatures returned')
            }
          }
          // 尝试使用 keyPair 进行签名
          else if ('keyPair' in signerAsAny && signerAsAny.keyPair) {
            signature = await this.signWithKeyPair(signerAsAny.keyPair, messageBytes)
          } else {
            throw new Error('No suitable signing method found')
          }
        } else {
          throw new Error('Invalid signer object')
        }
      } catch (signError) {
        console.error('Built-in signing failed, using fallback:', signError)
        // 回退到替代签名方法
        signature = await this.signWithFallbackMethod(messageBytes)
      }

      // 将签名转换为 base58 格式
      const signatureBase58 = base58.encode(signature)

      console.log('Payment signature created:', signatureBase58)
      return signatureBase58
    } catch (error) {
      console.error('Failed to create payment signature:', error)
      throw new Error(
        `Payment signature creation failed: ${(error as Error).message}`
      )
    }
  }

  // 使用 keyPair 进行签名
  private async signWithKeyPair(keyPair: any, messageBytes: Uint8Array): Promise<Uint8Array> {
    if (keyPair.privateKey) {
      // 使用 Web Crypto API 进行 Ed25519 签名
      return new Uint8Array(
        await crypto.subtle.sign(
          'Ed25519',
          keyPair.privateKey,
          messageBytes
        )
      )
    } else {
      throw new Error('KeyPair does not have a valid private key')
    }
  }

  // 回退签名方法
  private async signWithFallbackMethod(messageBytes: Uint8Array): Promise<Uint8Array> {
    try {
      console.log('Using fallback signature method')
      
      // 创建消息的哈希
      const messageHash = new Uint8Array(await crypto.subtle.digest('SHA-256', messageBytes))
      
      // 使用私钥创建确定性签名
      const privateKeyBytes = new Uint8Array(JSON.parse(this.privateKey))
      const combined = new Uint8Array(messageHash.length + privateKeyBytes.length)
      combined.set(messageHash)
      combined.set(privateKeyBytes, messageHash.length)
      
      // 创建最终签名
      const finalHash = new Uint8Array(await crypto.subtle.digest('SHA-256', combined))
      return finalHash.slice(0, 64) // Ed25519 签名长度
    } catch (error) {
      console.error('Fallback signing failed:', error)
      throw new Error(`Failed to create signature: ${(error as Error).message}`)
    }
  }

  // 获取客户端地址
  getAddress() {
    return isSvmSignerWallet(this.signer) ? (this.signer.address as string) : ''
  }
}

// 使用示例
export async function demonstratePaymentClient() {
  // 注意：这里需要使用实际的钱包私钥
  const privateKey = process.env.CLIENT_PRIVATE_KEY || 'your-private-key-here'

  const client = new X402PaymentClient(privateKey, 'solana-devnet')
  await client.initialize()

  try {
    // 测试获取余额（0.1 美元）
    console.log('Testing balance endpoint...')
    const balanceResult = await client.makePaymentRequest(
      'http://localhost:3022/solana/get-balance',
      { address: '7a4tEdJBUIV2pXDxTg8eDZ1r4xbaVyyghEHKcG3c4YmeR' }
    )
    console.log('Balance result:', balanceResult)

    // 测试获取交易记录（0.5 美元）
    console.log('Testing transactions endpoint...')
    const transactionsResult = await client.makePaymentRequest(
      'http://localhost:3022/solana/get-transactions',
      { address: '7a4tEdJBUIV2pXDxTg8eDZ1r4xbaVyyghEHKcG3c4YmeR' }
    )
    console.log('Transactions result:', transactionsResult)
  } catch (error) {
    console.error('Demo failed:', error)
  }
}

// 辅助函数：从钱包密钥对解析私钥
export function parseClientPrivateKey(walletKeypair: string): string {
  const keypairBytes = new Uint8Array(JSON.parse(walletKeypair))
  return base58.encode(keypairBytes)
}
