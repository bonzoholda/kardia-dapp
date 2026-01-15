import { useState, useEffect, useMemo } from "react";
import { ConnectWallet } from "./components/ConnectWallet";
import { useController } from "./hooks/useController";
import { Actions } from "./components/Actions";
import Stats from "./components/Stats";
import DripStats from "./components/DripStats";
import { fmt } from "./utils/format";
import Logo from "./assets/logo.svg";

// Web3 & Telegram Imports
import { useAccount } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { TokenApprovalGuard } from "./components/TokenApprovalGuard";
import { SwapTrading } from "./components/SwapTrading";

/**
 * CONFIGURATION
 */
const CONTROLLER_ADDRESS = import.meta.env.VITE_CONTROLLER_ADDRESS as `0x${string}` | undefined;
const MOCK_USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS as `0x${string}` | undefined;
const SMOS_ADDRESS = import.meta.env.VITE_SMOS_ADDRESS as `0x${string}` | undefined;

export default function App() {
  const { minersPool, rewardPool, totalPU } = useController();
  const [activeTab, setActiveTab] = useState<"mining" | "trade">("mining");
  
  // Web3 Hooks
  const { isConnected } = useAccount();
  const { open } = useWeb3Modal();

  // Optimized Telegram Detection
  const tg = useMemo(() => {
    const telegramApp = (window as any).Telegram?.WebApp;
    // Only return if we are actually inside the Telegram environment
    return telegramApp?.platform !== 'unknown' ? telegramApp : null;
  }, []);

  /**
   * Telegram Native Integration
   * This effect manages the Telegram Main Button and App Expansion
   */
  useEffect(() => {
    if (!tg) return;

    tg.ready();
    tg.expand();

    if (!isConnected) {
      tg.MainButton.setText("CONNECT WALLET");
      tg.MainButton.show();
      
      const handleMainButtonClick = () => {
        // Haptic feedback for the click
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
        open();
      };

      tg.MainButton.onClick(handleMainButtonClick);
      return () => {
        tg.MainButton.offClick(handleMainButtonClick);
        tg.MainButton.hide();
      };
    } else {
      tg.MainButton.hide();
    }
  }, [tg, isConnected, open]);

  // Enhanced Tab Switcher with Haptic Feedback
  const toggleTab = (tab: "mining" | "trade") => {
    setActiveTab(tab);
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred("medium");
    }
  };

  return (
    <div className="min-h-screen bg-black bg-grid p-4 pb-24 md:p-6">
      {/* ───── Logo ───── */}
      <div className="flex justify-center mb-8">
        <div className="pulse-glow">
          <img
            src={Logo}
            alt="Sphygmos Network"
            className="relative z-10 mx-auto w-full max-w-[280px] h-auto"
          />
        </div>
      </div>

      <div className="max-w-md mx-auto space-y-6">
        {/* ───── Tab Navigation ───── */}
        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-yellow-400/20 shadow-inner">
          <button
            onClick={() => toggleTab("mining")}
            className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all duration-300 ${
              activeTab === "mining" 
                ? "bg-yellow-400 text-black shadow-lg shadow-yellow-400/20" 
                : "text-slate-400 hover:text-white"
            }`}
          >
            MINING HUB
          </button>
          <button
            onClick={() => toggleTab("trade")}
            className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all duration-300 ${
              activeTab === "trade" 
                ? "bg-yellow-400 text-black shadow-lg shadow-yellow-400/20" 
                : "text-slate-400 hover:text-white"
            }`}
          >
            TRADE SMOS
          </button>
        </div>

        {/* ───── Content Rendering ───── */}
        {activeTab === "mining" ? (
          <div className="glass-card p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-center text-sm text-slate-400">
              The Heartbeat of Perpetual DeFi
            </h3>

            {/* FIX: Ensure the button is visible everywhere if the MainButton isn't showing */}
            <div className="flex justify-center">
              <ConnectWallet />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <Stat label="Miners Pool" value={minersPool.data} decimals={18} />
              <Stat label="Reward Pool" value={rewardPool.data} decimals={18} />
              <Stat label="Total PU" value={totalPU.data} decimals={18} />
            </div>

            <Stats />
            <DripStats />

            <hr className="border-yellow-400/10" />

            {/* Smart Contract Interaction Guards */}
            {CONTROLLER_ADDRESS && (
              <TokenApprovalGuard 
                tokenAddress={MOCK_USDT_ADDRESS}
                spenderAddress={CONTROLLER_ADDRESS}
                amountRequired="0.1" 
              >
                <TokenApprovalGuard
                  tokenAddress={SMOS_ADDRESS}
                  spenderAddress={CONTROLLER_ADDRESS}
                  amountRequired="0.1"
                >
                  <Actions />
                </TokenApprovalGuard>
              </TokenApprovalGuard> 
            )}
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <SwapTrading />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Re-usable Stat Component
 */
function Stat({ label, value, decimals }: { label: string; value?: bigint; decimals: number; }) {
  return (
    <div className="rounded-xl bg-black/70 border border-yellow-400/20 p-3 text-center">
      <div className="text-xs text-yellow-400/70">{label}</div>
      <div className="mt-1 text-base font-semibold text-white">
        {value !== undefined ? fmt(value, decimals, 2) : "—"}
      </div>
    </div>
  );
}
