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
  if (!unlockTs || unlockTs === 0n) return { status: "NO ACTIVE STAKE", locked: false, ready: false };
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(unlockTs) - now;
  if (diff <= 0) return { status: "UNLOCKED & READY", locked: false, ready: true };
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  return {
    status: `LOCKED ${days}D:${hours}H:${minutes}M`,
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
      { address: CONTROLLER_ADDRESS, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "stakedKDIA", args: [safeAddress] },
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
      refetchAll(); refetch();
      setUnstakeTx(undefined); setUnstakeAmount(""); 
    }
  }, [unstakeWait.isSuccess, refetchAll, refetch]);

  const lockInfo = useMemo(() => formatLockTime(uUnlock ?? 0n), [uUnlock]);
  const hasStake = uStaked !== undefined && uStaked > 0n;

  const handleMax = () => {
    if (uStaked) setUnstakeAmount(formatUnits(uStaked, 18));
  };

  const handleUnstake = async () => {
    if (!unstakeAmount || !uStaked) return;
    let finalAmountBigInt = parseUnits(unstakeAmount, 18);
    if (finalAmountBigInt > uStaked) {
      finalAmountBigInt = uStaked;
      setUnstakeAmount(formatUnits(uStaked, 18));
    }

    try {
      const hash = await unstakeSMOS({
        address: CONTROLLER_ADDRESS,
        abi: SPHYGMOS_CONTROLLER_ABI,
        functionName: "unstakeSMOS",
        args: [finalAmountBigInt],
      });
      setUnstakeTx(hash);
    } catch (err: any) { console.error(err); }
  };

  return (
    <div className="space-y-4">
      {/* Power & Staked Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <p className="panel-title">Active Power Units</p>
          <p className="text-2xl font-bold text-white mt-1 font-['Inter']">{fmt(uPU)}</p>
        </div>
        <div className="glass-card p-5">
          <p className="panel-title">Staked Balance</p>
          <p className="text-2xl font-bold text-neon mt-1 font-['Inter']">{fmt(uStaked)}</p>
        </div>
      </div>

      {/* Reward Pool Card */}
      <div className="glass-card p-5 border-l-2 border-red-500/40">
        <div className="flex justify-between items-start">
          <div>
            <p className="panel-title text-red-500/80">Accumulated Rewards</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-3xl font-bold text-white font-['Inter']">
                {fmt(((uPU ?? 0n) * (gAcc ?? 0n) / BigInt(1e18)) - (uDebt ?? 0n), 18, 8)}
              </p>
              <span className="text-[10px] text-red-500/60 font-bold tracking-widest uppercase">KDIA</span>
            </div>
          </div>
          <div className="live-indicator"></div>
        </div>
      </div>

      {/* Unstake Vault Logic */}
      <div className="glass-card p-5 space-y-5">
        <div className="flex justify-between items-center pb-4 border-b border-white/5">
          <div>
            <p className="panel-title">Vault Security Status</p>
            <p className={`text-sm font-bold mt-1 font-['Orbitron'] tracking-wider ${lockInfo.locked ? "text-red-500" : "text-white"}`}>
              {hasStake ? lockInfo.status : "READY FOR STAKING"}
            </p>
          </div>
          {lockInfo.locked && (
            <span className="text-[9px] bg-red-500/10 border border-red-500/30 text-red-500 px-3 py-1 rounded-full font-black tracking-widest uppercase">
              7D COOLDOWN
            </span>
          )}
        </div>

        {hasStake && lockInfo.ready && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="panel relative group">
              <p className="panel-title">Amount to Withdraw</p>
              <div className="flex items-center mt-2">
                <input
                  type="number"
                  className="w-full bg-transparent text-2xl font-bold outline-none text-white placeholder:text-white/5"
                  placeholder="0.00"
                  value={unstakeAmount}
                  onChange={(e) => setUnstakeAmount(e.target.value)}
                />
                <button
                  onClick={handleMax}
                  className="ml-2 px-3 py-1 text-[10px] font-black bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-md transition-all"
                >
                  MAX
                </button>
              </div>
            </div>
            
            <button 
              className="btn"
              disabled={isUnstaking || !unstakeAmount || parseFloat(unstakeAmount) <= 0}
              onClick={handleUnstake}
            >
              {isUnstaking ? "INITIATING..." : "CONFIRM UNSTAKE"}
            </button>
          </div>
        )}

        {writeError && (
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
            <p className="text-red-500 text-[10px] font-bold uppercase tracking-tighter">
              ERR: {(writeError as any).shortMessage || "Action Restricted"}
            </p>
          </div>
        )}

        <TxStatus hash={unstakeTx} />
      </div>
    </div>
  );
}
