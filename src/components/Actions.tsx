import { parseUnits } from "viem";
import { useAccount, useBalance, useWaitForTransactionReceipt, useConnectorClient } from "wagmi";
import { useController } from "../hooks/useController";
import { SPHYGMOS_CONTROLLER_ABI } from "../abi/SphygmosController";
import { useState, useEffect, useMemo } from "react";
import { TxStatus } from "./TxStatus";
import { BrowserProvider, Contract } from "ethers";

const controller = (import.meta.env.VITE_CONTROLLER_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;
const USDT_ADDRESS = (import.meta.env.VITE_USDT_ADDRESS || "0x...") as `0x${string}`;
const KDIA_ADDRESS = (import.meta.env.VITE_KDIA_ADDRESS || "0x...") as `0x${string}`;

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)"
];

export function Actions() {
  const { address } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const { stakeSMOS, claimMiner, refetchAll } = useController();

  const [puAmount, setPuAmount] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [puTx, setPuTx] = useState<`0x${string}`>();
  const [stakeTx, setStakeTx] = useState<`0x${string}`>();
  const [claimTx, setClaimTx] = useState<`0x${string}`>();
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const { data: usdtBalance, refetch: refetchUsdt } = useBalance({ address, token: USDT_ADDRESS });
  const { data: kdiaBalance, refetch: refetchKdia } = useBalance({ address, token: KDIA_ADDRESS });

  const ethersSigner = useMemo(() => {
    if (!connectorClient) return undefined;
    return new BrowserProvider(connectorClient.transport).getSigner();
  }, [connectorClient]);

  const puWait = useWaitForTransactionReceipt({ hash: puTx });
  const stakeWait = useWaitForTransactionReceipt({ hash: stakeTx });
  const claimWait = useWaitForTransactionReceipt({ hash: claimTx });

  useEffect(() => {
    if (puWait.isSuccess || stakeWait.isSuccess || claimWait.isSuccess) {
      refetchAll(); refetchUsdt(); refetchKdia();
      if (puWait.isSuccess) { setPuAmount(""); setPuTx(undefined); setStatusMsg(""); setIsBroadcasting(false); }
      if (stakeWait.isSuccess) { setStakeAmount(""); setStakeTx(undefined); }
      if (claimWait.isSuccess) { setClaimTx(undefined); }
    }
  }, [puWait.isSuccess, stakeWait.isSuccess, claimWait.isSuccess, refetchAll, refetchUsdt, refetchKdia]);

  const handleAcquirePU = async () => {
    if (!ethersSigner || !puAmount) return;
    setIsBroadcasting(true);
    setStatusMsg("AUTHORIZING...");
    try {
      const signer = await ethersSigner;
      const userAddress = await signer.getAddress();
      const amount = parseUnits(puAmount, 18);
      const usdt = new Contract(USDT_ADDRESS, ERC20_ABI, signer);
      const kardia = new Contract(controller, SPHYGMOS_CONTROLLER_ABI, signer);

      const currentAllowance = await usdt.allowance(userAddress, controller);
      if (BigInt(currentAllowance) < BigInt(amount)) {
        const txApprove = await usdt.approve(controller, amount);
        await txApprove.wait();
      }

      setStatusMsg("DEPOSITING...");
      const txDeposit = await kardia.depositPush(amount);
      setPuTx(txDeposit.hash as `0x${string}`);
      setStatusMsg("PROCESSING...");
    } catch (e) {
      setIsBroadcasting(false);
      setStatusMsg("");
    }
  };

  const handleStake = async () => {
    if (!stakeAmount) return;
    try {
      const hash = await stakeSMOS.writeContractAsync({
        address: controller, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "stake",
        args: [parseUnits(stakeAmount, 18)],
      });
      setStakeTx(hash);
    } catch (e) { console.error(e); }
  };

  const handleClaim = async () => {
    try {
      const hash = await claimMiner.writeContractAsync({ 
        address: controller, 
        abi: SPHYGMOS_CONTROLLER_ABI, 
        functionName: "claimMinerRewards" 
      });
      if (hash) setClaimTx(hash);
    } catch (err) {
      console.error("Claim failed:", err);
    }
  };

  if (!address) return (
    <div className="glass-card p-10 text-center font-bold text-red-500/40 uppercase text-[10px] tracking-widest font-['Orbitron']">
      Connect Wallet
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. ACQUIRE POWER */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="panel-title font-['Orbitron']">Acquire Power</h4>
          <div className="text-right">
            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest block">USDT Balance</span>
            <span className="text-xs font-mono text-red-500/80 font-bold">
              {usdtBalance ? Number(usdtBalance.formatted).toLocaleString('en-US', { minimumFractionDigits: 2 }) : "0.00"}
            </span>
          </div>
        </div>
        <input className="input h-14" type="number" placeholder="USDT Amount" value={puAmount} onChange={(e) => setPuAmount(e.target.value)} />
        <button className="btn h-14" disabled={!puAmount || isBroadcasting} onClick={handleAcquirePU}>
          {statusMsg || "Acquire Power Units"}
        </button>
        <TxStatus hash={puTx} />
      </div>

      {/* 2. STAKE KDIA */}
      <div className="panel p-6 space-y-4 border-white/5">
        <div className="flex justify-between items-center">
          <h4 className="panel-title font-['Orbitron']">Stake $KDIA</h4>
          <div className="text-right">
            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest block">Available KDIA</span>
            <span className="text-xs font-mono text-white/60 font-bold">
              {kdiaBalance ? Number(kdiaBalance.formatted).toLocaleString('en-US', { minimumFractionDigits: 2 }) : "0.00"}
            </span>
          </div>
        </div>
        <input className="input h-14 bg-black/20" type="number" placeholder="KDIA Amount" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} />
        <button className="btn h-14 w-full" disabled={!stakeAmount || stakeSMOS.isPending} onClick={handleStake}>
          {stakeSMOS.isPending ? "STAKING..." : "Stake KDIA"}
        </button>
        <TxStatus hash={stakeTx} />
      </div>

      {/* 3. HARVEST REWARDS */}
      <div className="space-y-2">
        <button 
          className="btn h-14 w-full"
          disabled={claimMiner.isPending} 
          onClick={handleClaim}
        >
          {claimMiner.isPending ? "SYNCHRONIZING..." : "HARVEST MINING REWARDS"}
        </button>
        <TxStatus hash={claimTx} />
        <p className="text-[8px] text-center text-gray-600 font-bold uppercase tracking-[0.2em] mt-1">
          * Harvesting does not affect your 7-day stake lock duration.
        </p>
      </div>
      
    </div>
  );
}
