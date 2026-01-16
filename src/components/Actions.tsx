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
  }, [puWait.isSuccess, stakeWait.isSuccess, claimWait.isSuccess]);

  // --- Handlers ---
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

  const handleClaimRewards = async () => {
    try {
      const hash = await claimMiner.writeContractAsync({ 
        address: controller, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "claimMinerRewards" 
      });
      setClaimTx(hash);
    } catch (e) { console.error(e); }
  };

  if (!address) return <div className="glass-card p-10 text-center font-bold text-red-500/40 uppercase text-[10px] tracking-widest">Connect Wallet</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. ACQUIRE POWER */}
      <div className="glass-card p-6 space-y-4">
        <h4 className="panel-title font-['Orbitron']">Acquire Power</h4>
        <input className="input h-14" type="number" placeholder="USDT Amount" value={puAmount} onChange={(e) => setPuAmount(e.target.value)} />
        <button className="btn h-14" disabled={!puAmount || isBroadcasting} onClick={handleAcquirePU}>
          {statusMsg || "Acquire Power Units"}
        </button>
        <TxStatus hash={puTx} />
      </div>

      {/* 2. STAKE KDIA */}
      <div className="panel p-6 space-y-4">
        <h4 className="panel-title font-['Orbitron']">Stake $KDIA</h4>
        <input className="input h-14 bg-black/20" type="number" placeholder="KDIA Amount" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} />
        <button className="btn-outline h-14 w-full" disabled={!stakeAmount || stakeSMOS.isPending} onClick={handleStake}>
          {stakeSMOS.isPending ? "STAKING..." : "Stake KDIA"}
        </button>
        <TxStatus hash={stakeTx} />
      </div>

      {/* 3. HARVEST REWARDS */}
      <div className="space-y-2">
        <button 
          className="w-full py-4 bg-transparent border border-dashed border-red-500/20 hover:border-red-500/50 hover:bg-red-500/5 text-red-500/60 rounded-xl font-bold text-[10px] uppercase tracking-[0.4em] transition-all"
          disabled={claimMiner.isPending} 
          onClick={handleClaimRewards}
        >
          {claimMiner.isPending ? "SYNCHRONIZING..." : "HARVEST MINING REWARDS"}
        </button>
        <TxStatus hash={claimTx} />
      </div>
      
    </div>
  );
}
