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
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const KDIA_ADDRESS = import.meta.env.VITE_KDIA_ADDRESS as `0x${string}`;
const BTCB_ADDRESS = "0x7130d2A12B9BCbFAe4f2634d864A1ee1Ce3Ead9c";

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
  
  // path logic mirroring your SMOS setup but using BTCB as the link
  const smartPath = useMemo(() => {
    return isBuy 
      ? [USDT_ADDRESS, BTCB_ADDRESS, KDIA_ADDRESS] 
      : [KDIA_ADDRESS, BTCB_ADDRESS, USDT_ADDRESS];
  }, [isBuy]);

  const { data: usdtData, refetch: refetchUsdt } = useBalance({ address, token: USDT_ADDRESS });
  const { data: kdiaData, refetch: refetchKdia } = useBalance({ address, token: KDIA_ADDRESS });

  // FETCH PRICE: KDIA -> BTCB -> USDT
  const { data: priceData } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    // We use a small amount (0.1) for the check if 1.0 is failing due to liquidity depth
    args: [parseUnits("1", 18), [KDIA_ADDRESS, BTCB_ADDRESS, USDT_ADDRESS]],
    query: { enabled: !!ROUTER_ADDRESS, refetchInterval: 10000 }
  });

  const { data: quoteData } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: amountIn && Number(amountIn) > 0 ? [parseUnits(amountIn, 18), smartPath] : undefined,
    query: { enabled: !!amountIn && Number(amountIn) > 0 }
  });

  // Calculate price from the last index of the returned array
  const kdiaPriceUSDT = useMemo(() => {
    if (!priceData || priceData.length < 3) return "0.00";
    return Number(formatUnits(priceData[2], 18)).toFixed(4);
  }, [priceData]);

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
    const minOut = (estimatedOutRaw * 9000n) / 10000n; // 10% slippage for low liquidity stability
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
          <h2 className="text-xl font-bold tracking-tighter text-white font-['Orbitron'] uppercase">Swap Hub</h2>
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
            className="w-full bg-transparent text-3xl font-bold outline-none text-white mt-2 font-['Inter']"
          />
        </div>

        <div className="panel bg-white/[0.02]">
          <p className="panel-title">Receive (Est.)</p>
          <p className={`text-3xl font-bold mt-2 ${estimatedOut !== "0.0000" ? "text-white" : "text-gray-600"}`}>
             {Number(estimatedOut).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
          </p>
        </div>
      </div>

      <TokenApprovalGuard tokenAddress={isBuy ? USDT_ADDRESS : KDIA_ADDRESS} spenderAddress={ROUTER_ADDRESS} amountRequired={amountIn || "0"}>
        <button onClick={handleSwap} disabled={!amountIn || estimatedOut === "0.0000" || isPending} className="btn">
          {isPending ? "PROCESSING..." : isBuy ? "CONFIRM PURCHASE" : "CONFIRM LIQUIDATION"}
        </button>
      </TokenApprovalGuard>

      <TxStatus hash={txHash} />
    </div>
  );
}

function BalanceChip({ label, val, neon }: { label: string; val?: string; neon?: boolean }) {
  return (
    <div className="panel p-3">
      <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${neon ? "text-neon" : "text-white"}`}>
        {Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}
