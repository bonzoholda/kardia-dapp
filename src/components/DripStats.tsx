import { useReadContract } from "wagmi";
import { SPHYGMOS_CONTROLLER_ABI } from "../abi/SphygmosController";
import { fmt } from "../utils/format";

const CONTROLLER_ADDRESS = import.meta.env.VITE_CONTROLLER_ADDRESS as `0x${string}` | undefined;

export default function DripStats() {
  /* ───── Read Drip Rate ───── */
  const { data: dripRatePerSecond } = useReadContract({
    address: CONTROLLER_ADDRESS,
    abi: SPHYGMOS_CONTROLLER_ABI,
    functionName: "dripRatePerSecond",
    query: {
      enabled: !!CONTROLLER_ADDRESS,
      refetchInterval: 10000, // Refresh every 10s for drip accuracy
    },
  });

  if (!CONTROLLER_ADDRESS) return null;

  /* ───── Derived Values ───── */
  const dripPerDay =
    dripRatePerSecond && dripRatePerSecond > 0n
      ? dripRatePerSecond * 86400n
      : 0n;

  return (
    <div className="glass-card p-6 space-y-4 relative overflow-hidden">
      {/* Background Accent for Drip feel */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-[50px] rounded-full -mr-16 -mt-16 pointer-events-none" />

      <div className="flex items-center gap-2 mb-2">
        <div className="live-indicator"></div>
        <h3 className="text-sm font-bold tracking-[0.2em] text-white font-['Orbitron'] uppercase">
          Emission Protocol
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="panel bg-gradient-to-br from-red-500/5 to-transparent border-red-500/20">
          <p className="panel-title text-red-500/60">KDIA Drip / 24H</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-3xl font-bold text-white font-['Inter']">
              {dripPerDay > 0n ? fmt(dripPerDay, 18, 4) : "SYNCING..."}
            </p>
            <span className="text-xs font-black text-red-500/40 font-['Orbitron']">KDIA</span>
          </div>
        </div>
      </div>

      {/* ───── Explanation Panel ───── */}
      <div className="p-4 rounded-xl bg-black/40 border border-white/5">
        <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
          The <span className="text-red-500/80">Reward Pool</span> releases KDIA linearly into the Miners Pool. 
          Rewards are claimable via the <span className="text-white">Mining System</span> and allocated 
          proportionally based on your current <span className="text-white">Power Unit (PU)</span> share.
        </p>
      </div>

      {/* Mini Secondary Stat for Real-time feel */}
      <div className="flex justify-between items-center px-1">
        <span className="text-[9px] uppercase tracking-widest text-gray-600 font-bold">Network Velocity</span>
        <span className="text-[10px] font-mono text-red-500/60 italic">
          {dripRatePerSecond ? fmt(dripRatePerSecond, 18, 8) : "0.00"} /sec
        </span>
      </div>
    </div>
  );
}
