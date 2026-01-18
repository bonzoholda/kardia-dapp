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

const ROUTER_ADDRESS = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const BTCB_ADDRESS = "0x7130d2A12B9BCbFAe4f2634d864A1ee1Ce3Ead9c";
const KDIA_ADDRESS = import.meta.env.VITE_KDIA_ADDRESS as `0x${string}`;
const KDIA_BTCB_PAIR = "0xD11c2c4881a69f9943D85d6317432Eb8Ec8aaAa2";

const PAIR_ABI = [
  {
    inputs: [],
    name: "getReserves",
    outputs: [{ name: "_reserve0", type: "uint112" }, { name: "_reserve1", type: "uint112" }, { name: "_blockTimestampLast", type: "uint32" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "token0", outputs: [{ type: "address" }], stateMutability: "view", type: "function" }
] as const;

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

  // 1. Fetch Reserves for KDIA/BTCB (Display Price)
  const { data: reserves } = useReadContract({
    address: KDIA_BTCB_PAIR,
    abi: PAIR_ABI,
    functionName: "getReserves",
    query: { refetchInterval: 5000 }
  });

  const { data: token0 } = useReadContract({ address: KDIA_BTCB_PAIR, abi: PAIR_ABI, functionName: "token0" });

  // 2. Fetch BTCB Price in USDT
  const { data: btcPriceData } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [parseUnits("1", 18), [BTCB_ADDRESS, USDT_ADDRESS]],
  });

  // 3. Mathematical Price Calculation (This mirrors DexScreener)
  const kdiaPriceUSDT = useMemo(() => {
    if (!reserves || !btcPriceData || !token0) return "0.00";
    const r0 = Number(formatUnits(reserves[0], 18));
    const r1 = Number(formatUnits(reserves[1], 18));
    const btcPrice = Number(formatUnits(btcPriceData[1], 18));
    const isKdiaToken0 = token0.toLowerCase() === KDIA_ADDRESS.toLowerCase();
    const kdiaRes = isKdiaToken0 ? r0 : r1;
    const btcbRes = isKdiaToken0 ? r1 : r0;
    return kdiaRes > 0 ? ((btcbRes / kdiaRes) * btcPrice).toFixed(4) : "0.00";
  }, [reserves, btcPriceData, token0]);

  // 4. Trade Logic (Direct path via BTCB)
  const smartPath = useMemo(() => isBuy 
    ? [USDT_ADDRESS, BTCB_ADDRESS, KDIA_ADDRESS] 
    : [KDIA_ADDRESS, BTCB_ADDRESS, USDT_ADDRESS], [isBuy]);

  const { data: quoteData } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "getAmountsOut",
    args: amountIn && Number(amountIn) > 0 ? [parseUnits(amountIn, 18), smartPath] : undefined,
    query: { enabled: !!amountIn && Number(amountIn) > 0 }
  });

  const estimatedOut = quoteData ? Number(formatUnits(quoteData[quoteData.length - 1], 18)).toFixed(4) : "0.0000";

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex justify-between items-center border-b border-red-500/10 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tighter text-white font-['Orbitron']">SWAP HUB</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="live-indicator"></span>
            <p className="text-[10px] font-medium text-red-500/80 uppercase">
               1 KDIA ≈ ${kdiaPriceUSDT}
            </p>
          </div>
        </div>
        <button onClick={() => setIsBuy(!isBuy)} className="btn-outline text-[10px] px-4 py-2 rounded-lg">
          {isBuy ? "SELL KDIA" : "BUY KDIA"}
        </button>
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
          <p className="text-3xl font-bold mt-2 text-white">{estimatedOut}</p>
        </div>
      </div>

      <TokenApprovalGuard tokenAddress={tokenIn} spenderAddress={ROUTER_ADDRESS} amountRequired={amountIn || "0"}>
        <button onClick={() => {/* Handle Swap Logic */}} className="btn">
          {isPending ? "PROCESSING..." : "CONFIRM SWAP"}
        </button>
      </TokenApprovalGuard>
      <TxStatus hash={txHash} />
    </div>
  );
}
