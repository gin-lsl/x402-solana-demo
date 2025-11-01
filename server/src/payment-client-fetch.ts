import { createSigner, decodeXPaymentResponse, wrapFetchWithPayment } from 'x402-fetch'
import { config } from 'dotenv'

config()

async function main() {
  const privateKey = process.env.CLIENT_PRIVATE_KEY!
  const signer = await createSigner('solana-devnet', privateKey)
  const fetchWithPayment = wrapFetchWithPayment(fetch, signer, BigInt(3000 * 100000), undefined, {
    svmConfig: {
      rpcUrl: process.env.SOLANA_RPC,
    },
  })
  const response = await fetchWithPayment(
    // 'http://localhost:3022/solana/get-balance?address=7a4tEdJBUIV2pXDxTg8eDZ1r4xbaVyyghEHKcG3c4YmeR',
    'http://localhost:3022/solana/get-balance?address=8dQE449ozUAS2XPyvao6hEpkAtGALo1A1q4TApayFfCo',
    { method: 'GET' }
  )
  const body = await response.json()

  console.log('headers:', response.headers)
  console.log('body:', JSON.stringify(body, null, 2))

  const xpr = response.headers.get('x-payment-response')
  if (xpr) {
    const paymentResponse = decodeXPaymentResponse(xpr)
    console.log('paymentResponse:', paymentResponse)
  } else {
    console.log('no x-payment-response header, status:', response.status)
    const reqHeader = response.headers.get('x402-payment-required')
    if (reqHeader) console.log('payment-required:', reqHeader)
  }
}

main().catch(error => {
  console.log('==================== ERROR ====================')
  console.error(error?.response?.data?.error ?? error)
  process.exit(1)
})
