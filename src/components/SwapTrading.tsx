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

const ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS as `0x${string}`;
const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS as `0x${string}`;
const KDIA_ADDRESS = import.meta.env.VITE_KDIA_ADDRESS as `0x${string}`;
const WBTC_ADDRESS = import.meta.env.VITE_WBTC_ADDRESS as `0x${string}`; // This is BTCB
const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

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
  
  const SLIPPAGE_BPS = 9500n; // Adjusted to 5% for small liquidity stability
  const tokenIn = isBuy ? USDT_ADDRESS : KDIA_ADDRESS;

  // Path: KDIA <-> BTCB <-> USDT (Standard 3-hop)
  // If this returns 0, it means PancakeSwap's USDT/BTCB liquidity is low.
  const smartPath = useMemo(() => {
    if (!USDT_ADDRESS || !KDIA_ADDRESS || !WBTC_ADDRESS) return [];
    return isBuy 
      ? [USDT_ADDRESS, WBTC_ADDRESS, KDIA_ADDRESS] 
      : [KDIA_ADDRESS, WBTC_ADDRESS, USDT_ADDRESS];
  }, [isBuy]);

  const { data: usdtData, refetch: refetchUsdt } = useBalance({ address, token: USDT_ADDRESS });
  const { data: kdiaData, refetch: refetchKdia } = useBalance({ address, token: KDIA_ADDRESS });

  // Get price through the same path we trade
  const { data: priceData } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [parseUnits("1", 18), [KDIA_ADDRESS, WBTC_ADDRESS, USDT_ADDRESS]],
    query: { 
        enabled: !!ROUTER_ADDRESS,
        refetchInterval: 10000 
    }
  });

  const { data: quoteData } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: amountIn && Number(amountIn) > 0 ? [parseUnits(amountIn, 18), smartPath] : undefined,
    query: { enabled: !!amountIn && Number(amountIn) > 0 }
  });

  const kdiaPriceUSDT = priceData ? Number(formatUnits(priceData[priceData.length - 1], 18)).toFixed(4) : "0.00";
  const estimatedOutRaw = quoteData ? quoteData[quoteData.length - 1] : 0n;
  const estimatedOut = estimatedOutRaw ? Number(formatUnits(estimatedOutRaw, 18)).toFixed(4) : "0.0000";

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      refetchUsdt(); refetchKdia();
      setAmountIn(""); setTxHash(undefined);
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
    } catch (err) { console.error(err); }
  };

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex justify-between items-center border-b border-red-500/10 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tighter text-white font-['Orbitron']">SWAP HUB</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="live-indicator"></span>
            <p className="text-[10px] font-medium text-red-500/80 uppercase tracking-widest">
              1 KDIA ≈ {kdiaPriceUSDT} USDT
            </p>
          </div>
        </div>
        <button 
          onClick={() => { setIsBuy(!isBuy); setAmountIn(""); }}
          className="btn-outline text-[10px] px-4 py-2 rounded-lg"
        >
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
            className="w-full bg-transparent text-3xl font-bold outline-none text-white placeholder:text-red-500/10 mt-2 font-['Inter']"
          />
        </div>

        <div className="panel bg-white/[0.02]">
          <p className="panel-title">Receive (Est.)</p>
          <p className={`text-3xl font-bold mt-2 ${estimatedOut !== "0.0000" ? "text-white" : "text-gray-600"}`}>
            {Number(estimatedOut).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
          </p>
        </div>
      </div>

      <TokenApprovalGuard tokenAddress={tokenIn} spenderAddress={ROUTER_ADDRESS} amountRequired={amountIn || "0"}>
        <button
          onClick={handleSwap}
          disabled={!amountIn || estimatedOut === "0.0000" || isPending || isConfirming}
          className="btn"
        >
          {isPending || isConfirming ? "PROCESSING..." : isBuy ? "CONFIRM PURCHASE" : "CONFIRM LIQUIDATION"}
        </button>
      </TokenApprovalGuard>

      <TxStatus hash={txHash} />

      {estimatedOut === "0.0000" && amountIn && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-[10px] text-red-500 text-center font-bold tracking-widest uppercase">
             Route Not Found / Low Liquidity
          </p>
        </div>
      )}
    </div>
  );
}

function BalanceChip({ label, val, neon }: { label: string; val?: string; neon?: boolean }) {
  return (
    <div className="panel p-3">
      <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">{label} Balance</p>
      <p className={`text-lg font-semibold mt-1 ${neon ? "text-neon" : "text-white"}`}>
        {Number(val || 0).toLocaleString('en-US', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })}
      </p>
    </div>
  );
}
