import { createWeb3Modal } from '@web3modal/wagmi/react'
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'
import { WagmiProvider } from 'wagmi'
import { bscTestnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

// 1. Get ProjectID at https://cloud.reown.com/
const projectId = '0e067b77e88bde54e08e5d0a94da2cc6'

// 2. Configure wagmi
const metadata = {
  name: 'Sphygmos dApp',
  description: 'Sphygmos Telegram Mini App',
  url: 'https://smostoken.netlify.app',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

const chains = [bscTestnet]
const config = defaultWagmiConfig({ chains, projectId, metadata })

// 3. Create modal
createWeb3Modal({ wagmiConfig: config, projectId, chains })

export function Web3ModalProvider({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
