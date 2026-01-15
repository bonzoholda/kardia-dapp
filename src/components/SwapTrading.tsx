import { useState, useEffect } from "react"; // Added useEffect
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

const ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS as `0x${string}` | undefined;
const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS as `0x${string}` | undefined;
const SMOS_ADDRESS = import.meta.env.VITE_SMOS_ADDRESS as `0x${string}` | undefined;

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

  const tokenIn = isBuy ? USDT_ADDRESS : SMOS_ADDRESS;
  const tokenOut = isBuy ? SMOS_ADDRESS : USDT_ADDRESS;

  /* ───────── Wallet Balances ───────── */
  // Extracted refetch functions
  const { data: usdtData, refetch: refetchUsdt } = useBalance({ address, token: USDT_ADDRESS });
  const { data: smosData, refetch: refetchSmos } = useBalance({ address, token: SMOS_ADDRESS });

  /* ───────── Price & Quote ───────── */
  // Extracted refetch functions for contract reads
  const { data: priceData, refetch: refetchPrice } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [parseUnits("1", 18), [SMOS_ADDRESS, USDT_ADDRESS]],
  });

  const { data: quoteData, refetch: refetchQuote } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: amountIn && Number(amountIn) > 0 ? [parseUnits(amountIn, 18), [tokenIn, tokenOut]] : undefined,
  });

  const smosPriceUSDT = priceData ? Number(formatUnits(priceData[1], 18)).toFixed(4) : "0.00";
  const estimatedOut = quoteData ? Number(formatUnits(quoteData[1], 18)).toFixed(4) : "0.0000";

  /* ───────── Swap Execution ───────── */
  const { writeContractAsync, isPending } = useWriteContract(); // Use writeContractAsync for easier hash handling
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Auto-refresh logic
  useEffect(() => {
    if (isSuccess) {
      refetchUsdt();
      refetchSmos();
      refetchPrice();
      refetchQuote();
      setAmountIn("");
      setTxHash(undefined);
    }
  }, [isSuccess, refetchUsdt, refetchSmos, refetchPrice, refetchQuote]);

  const handleSwap = async () => {
    if (!quoteData || !address) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const minOut = (quoteData[1] * 95n) / 100n; // 5% Slippage

    try {
      const hash = await writeContractAsync({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
        args: [parseUnits(amountIn, 18), minOut, [tokenIn, tokenOut], address, deadline],
      });
      setTxHash(hash);
    } catch (err) {
      console.error("Swap failed", err);
    }
  };

  return (
    <div className="glass-card p-6 space-y-6 border-t-2 border-yellow-500/30">
      <div className="flex justify-between items-start">
        <div>
          <p className="panel-title">Trading Hub</p>
          <p className="text-xs font-mono text-yellow-400 mt-1">
            Price: 1 SMOS = {smosPriceUSDT} USDT
          </p>
        </div>

        <button
          onClick={() => {
            setIsBuy(!isBuy);
            setAmountIn("");
          }}
          className="text-[10px] bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 px-3 py-1 rounded-full font-bold uppercase"
        >
          {isBuy ? "Switch to Sell" : "Switch to Buy"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <BalanceChip label="USDT" val={usdtData?.formatted} />
        <BalanceChip label="SMOS" val={smosData?.formatted} neon />
      </div>

      <div className="space-y-3">
        <div className="bg-black/40 p-4 rounded-xl border border-white/10">
          <input
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0.0"
            className="w-full bg-transparent text-2xl font-black outline-none text-white"
          />
          <p className="text-[10px] text-slate-500 uppercase mt-1 font-bold">
            {isBuy ? "Pay USDT" : "Pay SMOS"}
          </p>
        </div>

        <div className="bg-black/20 p-4 rounded-xl border border-white/5 border-dashed">
          <p className="text-2xl font-black text-slate-400">{estimatedOut}</p>
          <p className="text-[10px] text-slate-500 uppercase mt-1 font-bold">
            Receive (Estimated)
          </p>
        </div>
      </div>

      <TokenApprovalGuard
        tokenAddress={tokenIn}
        spenderAddress={ROUTER_ADDRESS}
        amountRequired={amountIn || "0"}
      >
        <button
          onClick={handleSwap}
          disabled={!amountIn || estimatedOut === "0.0000" || isPending || isConfirming}
          className="btn btn-outline w-full"
        >
          {isPending || isConfirming ? "Processing..." : isBuy ? "Buy SMOS" : "Sell SMOS"}
        </button>
      </TokenApprovalGuard>

      <TxStatus hash={txHash} />

      {estimatedOut === "0.0000" && amountIn && (
        <p className="text-[10px] text-red-500 text-center uppercase font-bold italic">
          No Liquidity Found
        </p>
      )}
    </div>
  );
}

function BalanceChip({ label, val, neon }: { label: string; val?: string; neon?: boolean }) {
  return (
    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
      <p className="text-[8px] text-slate-500 uppercase">{label} Balance</p>
      <p className={`text-xs font-mono font-bold ${neon ? "text-neon" : "text-white"}`}>
        {Number(val || 0).toFixed(2)}
      </p>
    </div>
  );
}
