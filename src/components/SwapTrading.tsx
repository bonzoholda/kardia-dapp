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

// Ensure these match your .env precisely
const ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS as `0x${string}`;
const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS as `0x${string}`;
const KDIA_ADDRESS = import.meta.env.VITE_KDIA_ADDRESS as `0x${string}`;
const WBTC_ADDRESS = import.meta.env.VITE_WBTC_ADDRESS as `0x${string}`;

const ROUTER_ABI = [
  {
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
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
  
  // Safety: 1% Tax + 1% Buffer = 2% Slippage
  const SLIPPAGE_BPS = 9800n; // Represents 98% (2% slippage)

  const tokenIn = isBuy ? USDT_ADDRESS : KDIA_ADDRESS;
  const tokenOut = isBuy ? KDIA_ADDRESS : USDT_ADDRESS;

  // Path Logic: USDT <-> WBTC <-> KDIA
  const smartPath = useMemo(() => {
    if (!USDT_ADDRESS || !KDIA_ADDRESS || !WBTC_ADDRESS) return [];
    return isBuy 
      ? [USDT_ADDRESS, WBTC_ADDRESS, KDIA_ADDRESS] 
      : [KDIA_ADDRESS, WBTC_ADDRESS, USDT_ADDRESS];
  }, [isBuy]);

  const { data: usdtData, refetch: refetchUsdt } = useBalance({ address, token: USDT_ADDRESS });
  const { data: kdiaData, refetch: refetchKdia } = useBalance({ address, token: KDIA_ADDRESS });

  // Price Quote (1 KDIA to USDT)
  const { data: priceData } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [parseUnits("1", 18), [KDIA_ADDRESS, WBTC_ADDRESS, USDT_ADDRESS]],
    query: { enabled: !!ROUTER_ADDRESS }
  });

  // Current Input Quote
  const { data: quoteData } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: amountIn && Number(amountIn) > 0 ? [parseUnits(amountIn, 18), smartPath] : undefined,
    query: { enabled: !!amountIn && Number(amountIn) > 0 }
  });

  const kdiaPriceUSDT = priceData ? Number(formatUnits(priceData[2], 18)).toFixed(4) : "0.00";
  const estimatedOutRaw = quoteData ? quoteData[quoteData.length - 1] : 0n;
  const estimatedOut = estimatedOutRaw ? Number(formatUnits(estimatedOutRaw, 18)).toFixed(4) : "0.0000";

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      refetchUsdt();
      refetchKdia();
      setAmountIn("");
      setTxHash(undefined);
    }
  }, [isSuccess]);

  const handleSwap = async () => {
    if (!estimatedOutRaw || !address) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const minOut = (estimatedOutRaw * SLIPPAGE_BPS) / 10000n;

    try {
      const hash = await writeContractAsync({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
        args: [parseUnits(amountIn, 18), minOut, smartPath, address, deadline],
      });
      setTxHash(hash);
    } catch (err) {
      console.error("Swap Error:", err);
    }
  };

  return (
    <div className="glass-card p-6 space-y-6 border-t-2 border-yellow-500/30 relative overflow-hidden">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="panel-title text-xl font-black italic tracking-tighter">SWAP HUB</h2>
          <p className="text-[10px] font-mono text-yellow-400">1 KDIA ≈ {kdiaPriceUSDT} USDT</p>
        </div>
        <button 
          onClick={() => { setIsBuy(!isBuy); setAmountIn(""); }}
          className="bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-[9px] px-3 py-1 rounded-full hover:bg-yellow-400/20 transition-all uppercase font-bold"
        >
          {isBuy ? "Switch to Sell" : "Switch to Buy"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <BalanceChip label="USDT" val={usdtData?.formatted} />
        <BalanceChip label="KDIA" val={kdiaData?.formatted} neon />
      </div>

      <div className="space-y-2">
        <div className="bg-black/40 p-4 rounded-xl border border-white/10 group focus-within:border-yellow-500/50 transition-all">
          <input
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0.0"
            className="w-full bg-transparent text-3xl font-black outline-none text-white placeholder:text-white/10"
          />
          <div className="flex justify-between mt-2">
             <span className="text-[10px] text-slate-500 font-bold uppercase">{isBuy ? "Pay USDT" : "Pay KDIA"}</span>
             <span className="text-[10px] text-yellow-400/50 font-mono italic">Slippage: 2.0%</span>
          </div>
        </div>

        <div className="bg-white/5 p-4 rounded-xl border border-white/5 border-dashed">
          <p className="text-3xl font-black text-slate-400">{estimatedOut}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Receive (Est.)</p>
        </div>
      </div>

      <TokenApprovalGuard tokenAddress={tokenIn} spenderAddress={ROUTER_ADDRESS} amountRequired={amountIn || "0"}>
        <button
          onClick={handleSwap}
          disabled={!amountIn || estimatedOut === "0.0000" || isPending || isConfirming}
          className="btn-primary w-full py-4 font-black italic uppercase tracking-widest disabled:opacity-30"
        >
          {isPending || isConfirming ? "Broadcasting..." : isBuy ? "Confirm Buy" : "Confirm Sell"}
        </button>
      </TokenApprovalGuard>

      <TxStatus hash={txHash} />

      {estimatedOut === "0.0000" && amountIn && (
        <p className="text-[9px] text-red-500/80 text-center font-bold animate-pulse">
          ⚠️ NO LIQUIDITY PATH FOUND FOR THIS PAIR
        </p>
      )}
    </div>
  );
}

function BalanceChip({ label, val, neon }: { label: string; val?: string; neon?: boolean }) {
  return (
    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
      <p className="text-[8px] text-slate-500 uppercase font-bold">{label} Balance</p>
      <p className={`text-xs font-mono font-bold ${neon ? "text-yellow-400" : "text-white"}`}>
        {Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}
