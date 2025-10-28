import {
  createSigner,
  decodeXPaymentResponse,
  wrapFetchWithPayment,
} from 'x402-fetch'

async function main() {
  const signer = await createSigner(
    'solana-devnet',
    '39f3FmcVtkaLJUbr18zxxn8yFb8GzTyWUs2N7Fss4sGBCxURHZ8v2UKqC6iyH14WfaNLVWyeCMX1U4zkAWGxAg2c'
  )
  const fetchWithPayment = wrapFetchWithPayment(
    fetch,
    signer,
    undefined,
    undefined,
    {
      svmConfig: {
        rpcUrl:
          'https://api.zan.top/node/v1/solana/devnet/96b981aa6d1d4f8aa889480f6fed193a',
      },
    }
  )
  const response = await fetchWithPayment(
    'http://localhost:3022/solana/get-balance?address=7a4tEdJBUIV2pXDxTg8eDZ1r4xbaVyyghEHKcG3c4YmeR',
    { method: 'GET' }
  )
  console.log('xxx')
  const body = await response.json()

  console.log('body:', body)

  const paymentResponse = decodeXPaymentResponse(
    response.headers.get('x-payment-response')!
  )
  console.log('paymentResponse:', paymentResponse)
}

main().catch(error => {
  console.log('==================== ERROR ====================')
  console.error(error?.response?.data?.error ?? error)
  process.exit(1)
})
