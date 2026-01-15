import { useReadContract } from "wagmi";
import { SPHYGMOS_CONTROLLER_ABI } from "../abi/SphygmosController";
import { fmt } from "../utils/format";

const CONTROLLER_ADDRESS = import.meta.env
  .VITE_CONTROLLER_ADDRESS as `0x${string}` | undefined;

export default function DripStats() {
  /* ───── Read Drip Rate ───── */
  const { data: dripRatePerSecond } = useReadContract({
    address: CONTROLLER_ADDRESS,
    abi: SPHYGMOS_CONTROLLER_ABI,
    functionName: "dripRatePerSecond",
    query: {
      enabled: !!CONTROLLER_ADDRESS,
    },
  });

  if (!CONTROLLER_ADDRESS) return null;

  /* ───── Derived Values ───── */
  const dripPerDay =
    dripRatePerSecond && dripRatePerSecond > 0n
      ? dripRatePerSecond * 86400n
      : 0n;

  return (
    <div className="grid p-4 space-y-3">
      <h3 className="panel-title">💧 KDIA Drip Emission</h3>

      <div className="grid grid-cols-1 gap-4">
        <StatCard
          label="Drip / Day (KDIA)"
          value={
            dripPerDay > 0n
              ? fmt(dripPerDay, 18, 4)
              : "Waiting emission sync…"
          }
        />
      </div>

      {/* ───── Explanation ───── */}
      <p className="text-sm text-muted leading-relaxed">
        The Reward Pool is released gradually at this rate into the Miners Pool.
        Distributed rewards are claimable through the Mining Rewards system and
        allocated proportionally based on PU share.
      </p>
    </div>
  );
}

/* ───────────────────────── */

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="panel">
      <p className="panel-title">{label}</p>
      <p className="panel-value">{value}</p>
    </div>
  );
}
