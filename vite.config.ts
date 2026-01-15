import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    // Fixes "Buffer is not defined" or "global is not defined" errors
    // which are common in Web3/Telegram SDKs
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  define: {
    // Ensures 'global' maps to 'window' for libraries that don't use polyfills
    global: "window",
  },
  build: {
    target: "esnext", // Allows for modern JS features used in TMA SDK
    commonjsOptions: {
      transformMixedEsModules: true, // Crucial for bundling Wagmi + Telegram SDK
    },
  },
  optimizeDeps: {
    // Forces Vite to pre-bundle these so they are ready instantly in the TMA
    include: ["@telegram-apps/sdk-react", "wagmi", "viem"],
  },
});
