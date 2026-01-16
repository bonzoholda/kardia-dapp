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

function WalletIcon() {
  return (
    <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12V7H5a2 2 0 010-4h14v4" /><path d="M3 5v14a2 2 0 002 2h16v-5" /><path d="M18 11h4v3h-4z" />
    </svg>
  );
}

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

  const ethersSigner = useMemo(() => {
    if (!connectorClient) return undefined;
    const provider = new BrowserProvider(connectorClient.transport, {
      chainId: connectorClient.chain.id,
      name: connectorClient.chain.name,
    });
    return provider.getSigner();
  }, [connectorClient]);

  const { data: usdtBalance, refetch: refetchUsdt } = useBalance({ address, token: USDT_ADDRESS });
  const { data: kdiaBalance, refetch: refetchKdia } = useBalance({ address, token: KDIA_ADDRESS });

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

  const handleAcquirePU = async () => {
    if (!ethersSigner || !puAmount) return;
    setIsBroadcasting(true);
    setStatusMsg("INITIALIZING...");
    
    try {
      const signer = await ethersSigner;
      const userAddress = await signer.getAddress();
      const amount = parseUnits(puAmount, 18);
      const usdt = new Contract(USDT_ADDRESS, ERC20_ABI, signer);
      const kardia = new Contract(controller, SPHYGMOS_CONTROLLER_ABI, signer);

      setStatusMsg("AUTHORIZING...");
      const currentAllowance = await usdt.allowance(userAddress, controller);
      if (BigInt(currentAllowance) < BigInt(amount)) {
        const txApprove = await usdt.approve(controller, amount);
        await txApprove.wait();
      }

      setStatusMsg("DEPOSITING...");
      const estimatedGas = await kardia.depositPush.estimateGas(amount);
      const txDeposit = await kardia.depositPush(amount, { gasLimit: (estimatedGas * 120n) / 100n });
      setPuTx(txDeposit.hash as `0x${string}`);
      setStatusMsg("PROCESSING...");
    } catch (e: any) {
      console.error(e);
      setIsBroadcasting(false);
      setStatusMsg(e.reason?.includes("rejected") ? "CANCELLED" : "FAILED");
      setTimeout(() => setStatusMsg(""), 3000);
    }
  };

  if (!address) return (
    <div className="glass-card p-10 text-center">
      <p className="text-xs font-bold tracking-[0.3em] text-red-500/40 uppercase font-['Orbitron']">
        Waiting for Authentication
      </p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. ACQUIRE POWER UNITS */}
      <div className="glass-card p-6 space-y-4 border-t border-red-500/20">
        <h4 className="panel-title font-['Orbitron'] text-red-500/80">Acquire Power Units</h4>
        <div className="relative group">
          <input 
            className="input h-14 pr-24 font-['Inter'] text-lg" 
            placeholder="0.00" 
            type="number"
            value={puAmount} 
            onChange={(e) => setPuAmount(e.target.value)} 
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-end pointer-events-none">
            <span className="text-[9px] font-bold text-red-500/40 uppercase tracking-widest">USDT Wallet</span>
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-white/70">
              <WalletIcon /> {usdtBalance ? Number(usdtBalance.formatted).toFixed(2) : "0.00"}
            </div>
          </div>
        </div>
        <button
          className="btn h-14"
          disabled={!puAmount || isBroadcasting}
          onClick={handleAcquirePU}
        >
          {statusMsg || "INITIATE DEPOSIT"}
        </button>
        <TxStatus hash={puTx} />
      </div>

      {/* 2. STAKE KDIA */}
      <div className="panel p-6 space-y-4 border-white/5">
        <h4 className="panel-title font-['Orbitron']">Protocol Staking</h4>
        <div className="relative group">
          <input 
            className="input h-14 pr-24 border-white/5 bg-black/20 focus:bg-black/40" 
            placeholder="0.00" 
            type="number"
            value={stakeAmount} 
            onChange={(e) => setStakeAmount(e.target.value)} 
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-end">
            <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">KDIA Avail.</span>
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-white/50">
               {kdiaBalance ? Number(kdiaBalance.formatted).toFixed(2) : "0.00"}
            </div>
          </div>
        </div>
        <button
          className="btn-outline h-14 w-full rounded-xl font-black uppercase text-xs tracking-[0.2em]"
          disabled={!stakeAmount || stakeSMOS.isPending}
          onClick={() => {
            stakeSMOS.writeContractAsync({
              address: controller, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "stake",
              args: [parseUnits(stakeAmount, 18)],
            }).then(hash => setStakeTx(hash)).catch(() => {});
          }}
        >
          {stakeSMOS.isPending ? "STAKING..." : "COMMIT $KDIA"}
        </button>
        <TxStatus hash={stakeTx} />
      </div>

      {/* 3. CLAIM REWARDS */}
      <button 
        className="w-full py-4 bg-transparent border border-dashed border-red-500/20 hover:border-red-500/50 hover:bg-red-500/5 text-red-500/60 rounded-xl font-bold text-[10px] uppercase tracking-[0.4em] transition-all"
        disabled={claimMiner.isPending} 
        onClick={() => {
            claimMiner.writeContractAsync({ 
                address: controller, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "claimMinerRewards" 
            }).then(hash => setClaimTx(hash)).catch(() => {});
        }}
      >
        {claimMiner.isPending ? "SYNCHRONIZING..." : "HARVEST MINING REWARDS"}
      </button>
      <TxStatus hash={claimTx} />
      
    </div>
  );
}
