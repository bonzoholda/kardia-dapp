import { http, createConfig, fallback } from "wagmi";
import { bscTestnet } from "wagmi/chains"; // 1. Import bscTestnet
import { walletConnect, injected } from "wagmi/connectors";

export const projectId = "0e067b77e88bde54e08e5d0a94da2cc6";

const metadata = {
  name: "Kardia Testnet",
  description: "Kardia mining dApp - Test Environment",
  url: "https://kdiatoken.netlify.app",
  icons: ["https://kdiatoken.netlify.app/logo.png"],
};

export const wagmiConfig = createConfig({
  chains: [bscTestnet], // 2. Change to bscTestnet
  connectors: [
    injected(),
    walletConnect({ projectId, metadata, showQrModal: false }),
  ],
  transports: {
    // 3. Update to bscTestnet.id and use Testnet-specific RPCs
    [bscTestnet.id]: fallback([
      // Official Binance Testnet RPC
      http("https://data-seed-prebsc-1-s1.binance.org:8545"),
      // Public Fallbacks
      http("https://bsc-testnet.publicnode.com"),
      http("https://binance-smart-chain-testnet.public.blastapi.io")
    ]),
  },
  ssr: true, 
});
