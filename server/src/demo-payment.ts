import { demonstratePaymentClient } from './payment-client.js'

// 演示 X402 付费流程
async function runPaymentDemo() {
  console.log('🚀 Starting X402 Payment Demo')
  console.log('=====================================')

  try {
    // 运行完整的付费演示
    await demonstratePaymentClient()
    
    console.log('✅ Payment demo completed successfully!')
  } catch (error) {
    console.error('❌ Payment demo failed:', error)
  }
}

// 如果直接运行此文件，执行演示
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaymentDemo().catch(console.error)
}

export { runPaymentDemo }