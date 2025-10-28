import Router from '@koa/router'
import { address, createSolanaRpc } from '@solana/kit'

const solanaRouter = new Router({ prefix: '/solana' })

const ZAN_SOLANA_RPC = `https://api.zan.top/node/v1/solana/devnet/96b981aa6d1d4f8aa889480f6fed193a`
// const ZAN_SOLANA_RPC_WS = "wss://api.zan.top/node/ws/v1/solana/devnet/96b981aa6d1d4f8aa889480f6fed193a"

// 创建 RPC 客户端
const rpc = createSolanaRpc(ZAN_SOLANA_RPC)

solanaRouter.get('/get-balance', async ctx => {
  try {
    // 从查询参数获取钱包地址
    const walletAddress = ctx.query.address as string

    console.log('address:', walletAddress);
    
    if (!walletAddress) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: 'Missing wallet address parameter'
      }
      return
    }

    // 验证地址格式
    let solanaAddress
    try {
      solanaAddress = address(walletAddress)
    } catch (error) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: 'Invalid Solana address format'
      }
      return
    }

    // 获取余额
    const balanceResponse = await rpc.getBalance(solanaAddress).send()
    
    // 余额以 lamports 为单位，1 SOL = 1,000,000,000 lamports
    const balanceInLamports = balanceResponse.value
    const balanceInSOL = Number(balanceInLamports) / 1_000_000_000

    ctx.body = {
      success: true,
      data: {
        address: walletAddress,
        balance: {
          lamports: balanceInLamports.toString(),
          sol: balanceInSOL.toFixed(9)
        }
      }
    }
  } catch (error) {
    console.error('Error fetching balance:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: 'Failed to fetch balance from Solana network'
    }
  }
})

function wait(timeout: number) {
  return new Promise<void>(resolve => {
    setTimeout(() => {
      resolve()
    }, timeout);
  })
}

// 序列化 BigInt 的辅助函数
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'bigint') return obj.toString()
  if (Array.isArray(obj)) return obj.map(serializeBigInt)
  if (typeof obj === 'object') {
    const result: any = {}
    for (const key in obj) {
      result[key] = serializeBigInt(obj[key])
    }
    return result
  }
  return obj
}

solanaRouter.get('/get-transactions', async ctx => {
  try {
    // 从查询参数获取钱包地址
    const walletAddress = ctx.query.address as string

    console.log('address:', walletAddress);
    
    if (!walletAddress) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: 'Missing wallet address parameter'
      }
      return
    }

    // 验证地址格式
    let solanaAddress
    try {
      solanaAddress = address(walletAddress)
    } catch (error) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: 'Invalid Solana address format'
      }
      return
    }

    // 获取最近的交易签名（最多10条）
    const signaturesResponse = await rpc.getSignaturesForAddress(solanaAddress, {
      limit: 10
    }).send()

    console.log('signaturesResponse:', signaturesResponse);

    // 获取详细的交易信息
    const transactions = await Promise.all(
      signaturesResponse.map(async (signatureInfo, index) => {
        await wait(300 * index)
        try {
          const transactionResponse = await rpc.getTransaction(signatureInfo.signature).send()
          return {
            signature: signatureInfo.signature,
            slot: signatureInfo.slot,
            blockTime: signatureInfo.blockTime,
            confirmationStatus: signatureInfo.confirmationStatus,
            transaction: transactionResponse ? serializeBigInt(transactionResponse) : null
          }
        } catch (error) {
          console.error(`Error fetching transaction ${signatureInfo.signature}:`, error)
          return {
            signature: signatureInfo.signature,
            slot: signatureInfo.slot,
            blockTime: signatureInfo.blockTime,
            confirmationStatus: signatureInfo.confirmationStatus,
            transaction: null,
            error: 'Failed to fetch transaction details'
          }
        }
      })
    )

    console.log('transitions:', transactions);

    ctx.body = {
      success: true,
      data: {
        address: walletAddress,
        transactions: serializeBigInt(transactions),
        count: transactions.length
      }
    }
  } catch (error) {
    console.error('Error fetching transactions:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: 'Failed to fetch transactions from Solana network'
    }
  }
})

export default solanaRouter
