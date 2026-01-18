import { useState, useEffect, useMemo } from "react";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { TokenApprovalGuard } from "./TokenApprovalGuard";
import { TxStatus } from "./TxStatus";

// ADDRESSES (Matches your .env)
const ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS as `0x${string}`;
const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS as `0x${string}`;
const KDIA_ADDRESS = import.meta.env.VITE_KDIA_ADDRESS as `0x${string}`;
const WBTC_ADDRESS = import.meta.env.VITE_WBTC_ADDRESS as `0x${string}`;
const PAIR_ADDRESS = "0xD11c2c4881a69f9943D85d6317432Eb8Ec8aaAa2"; // Your KDIA/BTCB Pool

const PAIR_ABI = [{
  inputs: [],
  name: "getReserves",
  outputs: [{ name: "_reserve0", type: "uint112" }, { name: "_reserve1", type: "uint112" }, { name: "_blockTimestampLast", type: "uint32" }],
  stateMutability: "view",
  type: "function",
}] as const;

const ROUTER_ABI = [
  {
    inputs: [{ name: "amountIn", type: "uint256" }, { name: "path", type: "address[]" }],
    name: "getAmountsOut",
    outputs: [{ name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    name: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export function SwapTrading() {
  const { address } = useAccount();
  const [isBuy, setIsBuy] = useState(true);
  const [amountIn, setAmountIn] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  
  const tokenIn = isBuy ? USDT_ADDRESS : KDIA_ADDRESS;

  // 1. BALANCES (Restored from your working version)
  const { data: usdtData, refetch: refetchUsdt } = useBalance({ address, token: USDT_ADDRESS });
  const { data: kdiaData, refetch: refetchKdia } = useBalance({ address, token: KDIA_ADDRESS });

  // 2. FETCH POOL DATA (The "Fail-Safe" way)
  const { data: reserves } = useReadContract({
    address: PAIR_ADDRESS,
    abi: PAIR_ABI,
    functionName: "getReserves",
  });

  // 3. FETCH BTCB PRICE IN USDT
  const { data: btcToUsdt } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [parseUnits("1", 18), [WBTC_ADDRESS, USDT_ADDRESS]],
  });

  // 4. MANUAL PRICE MATH (Bypasses Router Reverts)
  const kdiaPriceUSDT = useMemo(() => {
    if (!reserves || !btcToUsdt) return "0.00";
    // reserve0 = KDIA, reserve1 = BTCB (Standard for this pair)
    const kdiaRes = Number(formatUnits(reserves[0], 18));
    const btcbRes = Number(formatUnits(reserves[1], 18));
    const btcPrice = Number(formatUnits(btcToUsdt[1], 18));

    if (kdiaRes === 0) return "0.00";
    const kdiaInBtc = btcbRes / kdiaRes;
    return (kdiaInBtc * btcPrice).toFixed(4);
  }, [reserves, btcToUsdt]);

  // 5. QUOTING LOGIC
  const smartPath = useMemo(() => isBuy 
    ? [USDT_ADDRESS, WBTC_ADDRESS, KDIA_ADDRESS] 
    : [KDIA_ADDRESS, WBTC_ADDRESS, USDT_ADDRESS], [isBuy]);

  const { data: quoteData } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: amountIn && Number(amountIn) > 0 ? [parseUnits(amountIn, 18), smartPath] : undefined,
    query: { enabled: !!amountIn && Number(amountIn) > 0 }
  });

  const estimatedOut = quoteData ? Number(formatUnits(quoteData[quoteData.length - 1], 18)).toFixed(4) : "0.0000";

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex justify-between items-center border-b border-red-500/10 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tighter text-white font-['Orbitron']">SWAP HUB</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="live-indicator"></span>
            <p className="text-[10px] font-medium text-red-500/80 uppercase">1 KDIA ≈ {kdiaPriceUSDT} USDT</p>
          </div>
        </div>
        <button onClick={() => { setIsBuy(!isBuy); setAmountIn(""); }} className="btn-outline text-[10px] px-4 py-2 rounded-lg">
          {isBuy ? "SELL KDIA" : "BUY KDIA"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BalanceChip label="USDT" val={usdtData?.formatted} />
        <BalanceChip label="KDIA" val={kdiaData?.formatted} neon />
      </div>

      <div className="space-y-3">
        <div className="panel">
          <p className="panel-title">{isBuy ? "Pay USDT" : "Pay KDIA"}</p>
          <input
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent text-3xl font-bold outline-none text-white mt-2"
          />
        </div>
        <div className="panel bg-white/[0.02]">
          <p className="panel-title">Receive (Est.)</p>
          <p className="text-3xl font-bold mt-2 text-white">{estimatedOut}</p>
        </div>
      </div>

      <TokenApprovalGuard tokenAddress={tokenIn} spenderAddress={ROUTER_ADDRESS} amountRequired={amountIn || "0"}>
        <button className="btn" disabled={!amountIn || estimatedOut === "0.0000"}>
          {isBuy ? "CONFIRM PURCHASE" : "CONFIRM LIQUIDATION"}
        </button>
      </TokenApprovalGuard>
    </div>
  );
}

function BalanceChip({ label, val, neon }: { label: string; val?: string; neon?: boolean }) {
  return (
    <div className="panel p-3">
      <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">{label} Balance</p>
      <p className={`text-lg font-semibold mt-1 ${neon ? "text-neon" : "text-white"}`}>
        {Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}
