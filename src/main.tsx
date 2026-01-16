import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./config/wagmi";
import { createWeb3Modal } from "@web3modal/wagmi/react";

import { init, openLink } from "@telegram-apps/sdk-react";

// ---- Telegram setup (SAFE) ----
if (typeof window !== "undefined") {
  (window as any).global = window;

  const tg = (window as any).Telegram?.WebApp;
  // Initialize only if we are in a Telegram environment
  if (tg && tg.platform !== "unknown") {
    if (tg.platform === "android" || tg.platform === "ios") {
      document.body.classList.add("telegram-mobile");
    }
    try {
      init();
    } catch (e) {
      console.warn("Telegram SDK Init failed", e);
    }
  }
}

// ---- Web3Modal ----
const projectId = "0e067b77e88bde54e08e5d0a94da2cc6";

createWeb3Modal({
  wagmiConfig,
  projectId,
  enableAnalytics: true,
  themeMode: "dark",
});

// ---- Telegram-safe WalletConnect escape ----
if (typeof window !== "undefined") {
  const tg = (window as any).Telegram?.WebApp;

  if (tg && (tg.platform === "android" || tg.platform === "ios")) {
    const originalOpen = window.open;

    window.open = (url?: string | URL, target?: string) => {
      const str = typeof url === "string" ? url : url?.toString();

      // 1. Detect WalletConnect OR direct wallet schemes (metamask:, trust:, tpouter:, etc.)
      const isWalletLink = str && (
        str.startsWith("wc:") || 
        str.includes("walletconnect") || 
        str.includes("link.walletconnect") ||
        /^(metamask:|trust:|tpouter:|bitkeep:|imtoken:)/i.test(str)
      );

      if (isWalletLink) {
        // 2. Escape the WebView using the Telegram Native Bridge
        // tryBrowser: 'chrome' is the industry proven flag to force Android app-switching
        try {
          openLink(str, { tryBrowser: 'chrome' } as any);
          return null; 
        } catch (err) {
          console.error("Telegram openLink failed, using fallback", err);
          return originalOpen(str, "_blank");
        }
      }

      return originalOpen(url as any, target);
    };
  }
}

// ---- React render ----
const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
