import { http, createConfig, fallback } from "wagmi";
import { bsc } from "wagmi/chains";
import { walletConnect, injected } from "wagmi/connectors";

export const projectId = "0e067b77e88bde54e08e5d0a94da2cc6";

const metadata = {
  name: "Sphygmos",
  description: "Sphygmos mining dApp",
  url: "https://smostoken.netlify.app",
  icons: ["https://smostoken.netlify.app/logo.png"],
};

export const wagmiConfig = createConfig({
  chains: [bsc],
  connectors: [
    injected(),
    walletConnect({ projectId, metadata, showQrModal: false }),
  ],
  transports: {
    // Logic: If the first RPC fails or times out, it moves to the next one automatically.
    [bsc.id]: fallback([
      // 1. High Security (MEV Protection)
      http("https://bsc-mev.pancakeswap.finance"),
      // 1.b. next option
      http("https://bsc.mev-share.flashbots.net"),
      // 2. High Reliability (PancakeSwap Private Node)
      http("https://bscrpc.pancakeswap.finance"),
      // 3. Ultimate Fallback (Public BSC Node)
      http("https://binance.llamarpc.com") 
    ]),
  },
  ssr: true, 
});
