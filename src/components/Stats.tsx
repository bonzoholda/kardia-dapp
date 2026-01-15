import {
  useAccount,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useEffect, useMemo, useState } from "react";
import { parseUnits, formatUnits } from "viem";
import { fmt } from "../utils/format";
import { SPHYGMOS_CONTROLLER_ABI } from "../abi/SphygmosController";
import { useController } from "../hooks/useController";
import { TxStatus } from "./TxStatus";

const CONTROLLER_ADDRESS = import.meta.env.VITE_CONTROLLER_ADDRESS as `0x${string}`;

function formatLockTime(unlockTs: bigint) {
  if (!unlockTs || unlockTs === 0n) return { status: "Not Staked", locked: false, ready: false };
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(unlockTs) - now;
  if (diff <= 0) return { status: "Unlocked & Ready", locked: false, ready: true };
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  return {
    status: `Locked ${days}d:${hours}h:${minutes}m`,
    locked: true,
    ready: false,
  };
}

export default function Stats() {
  const { address } = useAccount();
  const { refetchAll } = useController();
  
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [unstakeTx, setUnstakeTx] = useState<`0x${string}`>();
  
  const { writeContractAsync: unstakeSMOS, isPending: isUnstaking, error: writeError } = useWriteContract();
  const safeAddress = address ?? "0x0000000000000000000000000000000000000000";

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: CONTROLLER_ADDRESS, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "userPU", args: [safeAddress] },
      { address: CONTROLLER_ADDRESS, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "stakedSMOS", args: [safeAddress] },
      { address: CONTROLLER_ADDRESS, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "unlockTime", args: [safeAddress] },
      { address: CONTROLLER_ADDRESS, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "accRewardPerPU" },
      { address: CONTROLLER_ADDRESS, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "rewardDebt", args: [safeAddress] },
    ],
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const [uPU, uStaked, uUnlock, gAcc, uDebt] = useMemo(() => [
    data?.[0]?.result as bigint | undefined,
    data?.[1]?.result as bigint | undefined,
    data?.[2]?.result as bigint | undefined,
    data?.[3]?.result as bigint | undefined,
    data?.[4]?.result as bigint | undefined,
  ], [data]);

  const unstakeWait = useWaitForTransactionReceipt({ hash: unstakeTx });

  useEffect(() => {
    if (unstakeWait.isSuccess) {
      refetchAll();
      refetch();
      setUnstakeTx(undefined);
      setUnstakeAmount(""); 
    }
  }, [unstakeWait.isSuccess, refetchAll, refetch]);

  const lockInfo = useMemo(() => formatLockTime(uUnlock ?? 0n), [uUnlock]);
  const hasStake = uStaked !== undefined && uStaked > 0n;

  const handleMax = () => {
    if (uStaked) setUnstakeAmount(formatUnits(uStaked, 18));
  };

  /* ───────── Unstake with Auto-Correction Logic ───────── */
  const handleUnstake = async () => {
    if (!unstakeAmount || !uStaked) return;

    let finalAmountBigInt: bigint;
    const inputAmountBigInt = parseUnits(unstakeAmount, 18);

    // If input is greater than what is staked, automatically use MAX
    if (inputAmountBigInt > uStaked) {
      finalAmountBigInt = uStaked;
      setUnstakeAmount(formatUnits(uStaked, 18)); // Update UI to show correction
    } else {
      finalAmountBigInt = inputAmountBigInt;
    }

    try {
      const hash = await unstakeSMOS({
        address: CONTROLLER_ADDRESS,
        abi: SPHYGMOS_CONTROLLER_ABI,
        functionName: "unstakeSMOS",
        args: [finalAmountBigInt],
      });
      setUnstakeTx(hash);
    } catch (err: any) {
      console.error("Unstake Error:", err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <p className="panel-title">Your Power Units</p>
          <p className="panel-value text-white">{fmt(uPU)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="panel-title">Staked SMOS</p>
          <p className="panel-value text-neon">{fmt(uStaked)}</p>
        </div>
      </div>

      {/* Reward Card */}
      <div className="glass-card p-4 border-l-4 border-green-500 bg-green-500/5">
        <p className="panel-title text-green-400">Claimable Rewards</p>
        <div className="flex items-baseline gap-2">
          <p className="panel-value text-white">{fmt(((uPU ?? 0n) * (gAcc ?? 0n) / BigInt(1e18)) - (uDebt ?? 0n),18,8)}</p>
          <span className="text-[10px] text-green-500/60 font-mono">SMOS</span>
        </div>
      </div>

      {/* Unstake Control Section */}
      <div className="glass-card p-4 space-y-4 border-t-2 border-yellow-500/20">
        <div className="flex justify-between items-center mb-2">
          <div>
            <p className="panel-title">Staked Lock Status</p>
            <p className={`text-lg font-mono font-bold ${lockInfo.locked ? "text-yellow-400" : "text-green-400"}`}>
              {hasStake ? lockInfo.status : "No Stake found"}
            </p>
          </div>
          {lockInfo.locked && (
            <span className="text-[10px] bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 px-2 py-1 rounded">
              168H LOCK
            </span>
          )}
        </div>

        {hasStake && lockInfo.ready && (
          <div className="space-y-3 pt-2 border-t border-white/5">
            <div className="relative">
              <input
                type="number"
                className="input w-full pr-16 bg-black/40 border-white/10 focus:border-green-500/50"
                placeholder="Unstake amount"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
              />
              <button
                onClick={handleMax}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white rounded"
              >
                MAX
              </button>
            </div>
            <button 
              className="btn btn-sm w-full bg-green-500 hover:bg-green-600 text-black border-none font-bold"
              disabled={isUnstaking || !unstakeAmount || parseFloat(unstakeAmount) <= 0}
              onClick={handleUnstake}
            >
              {isUnstaking ? "Confirming..." : "Unstake Now"}
            </button>
          </div>
        )}

        {writeError && (
          <p className="text-red-500 text-[10px] font-mono mt-2 italic bg-red-500/10 p-2 rounded">
            Error: {(writeError as any).shortMessage || "Check contract conditions."}
          </p>
        )}

        <TxStatus hash={unstakeTx} />
      </div>
    </div>
  );
}
