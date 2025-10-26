import './App.css'
import { ConnectButton, Connector } from '@ant-design/web3';
import {
  OKXWallet,
  PhantomWallet,
  solanaDevnet,
  SolanaWeb3ConfigProvider,
} from '@ant-design/web3-solana';

const YOUR_ZAN_API_KEY = '96b981aa6d1d4f8aa889480f6fed193a';

const rpcProvider = () =>
  `https://api.zan.top/node/v1/solana/devnet/${YOUR_ZAN_API_KEY}`

export default function App() {
  return (
    <SolanaWeb3ConfigProvider
      autoAddRegisteredWallets
      balance
      rpcProvider={rpcProvider}
      chains={[solanaDevnet]}
      wallets={[PhantomWallet(), OKXWallet()]}
    >
      <Connector modalProps={{ mode: 'simple', group: false }}>
        <ConnectButton quickConnect />
      </Connector>
    </SolanaWeb3ConfigProvider>
  )
}
