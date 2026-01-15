import { parseUnits, formatUnits } from "viem";
import { useAccount, useBalance, useWaitForTransactionReceipt, useReadContract, useConnectorClient } from "wagmi";
import { useController } from "../hooks/useController";
import { SPHYGMOS_CONTROLLER_ABI } from "../abi/SphygmosController";
import { useState, useEffect, useMemo } from "react";
import { TxStatus } from "./TxStatus";
import { ethers, BrowserProvider, Contract } from "ethers";

// Configuration from Environment
const controller = (import.meta.env.VITE_CONTROLLER_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;
const USDT_ADDRESS = (import.meta.env.VITE_USDT_ADDRESS || "0xd5210074786CfBE75b66FEC5D72Ae79020514afD") as `0x${string}`;
const KDIA_ADDRESS = (import.meta.env.VITE_KDIA_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;

// Minimum ABIs
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)"
];

function WalletIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h18v10H3z" /><path d="M16 11h4v2h-4z" />
    </svg>
  );
}

export function Actions() {
  const { address } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const { stakeSMOS, claimMiner, refetchAll } = useController();

  // Component States
  const [puAmount, setPuAmount] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [puTx, setPuTx] = useState<`0x${string}`>();
  const [stakeTx, setStakeTx] = useState<`0x${string}`>();
  const [claimTx, setClaimTx] = useState<`0x${string}`>();
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Ethers Signer Bridge
  const ethersSigner = useMemo(() => {
    if (!connectorClient) return undefined;
    const provider = new BrowserProvider(connectorClient.transport, {
      chainId: connectorClient.chain.id,
      name: connectorClient.chain.name,
    });
    return provider.getSigner();
  }, [connectorClient]);

  // Balance Hooks
  const { data: usdtBalance, refetch: refetchUsdt } = useBalance({ address, token: USDT_ADDRESS });
  const { data: kdiaBalance, refetch: refetchKdia } = useBalance({ address, token: KDIA_ADDRESS });

  // Listen for Transaction Success to refresh UI
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

  // Logic: Smart Approve + Acquire Power Units with Gas Buffer
  const handleAcquirePU = async () => {
    if (!ethersSigner || !puAmount) return;
    setIsBroadcasting(true);
    setStatusMsg("Initializing...");
    
    try {
      const signer = await ethersSigner;
      const userAddress = await signer.getAddress();
      const amount = parseUnits(puAmount, 18);
      
      const usdt = new Contract(USDT_ADDRESS, ERC20_ABI, signer);
      const kardia = new Contract(controller, SPHYGMOS_CONTROLLER_ABI, signer);

      // 1. SMART ALLOWANCE CHECK
      setStatusMsg("Checking Permissions...");
      const currentAllowance = await usdt.allowance(userAddress, controller);
      
      if (BigInt(currentAllowance) < BigInt(amount)) {
        setStatusMsg("Step 1/2: Approving...");
        const txApprove = await usdt.approve(controller, amount);
        await txApprove.wait();
      }

      // 2. DEPOSIT WITH GAS BUFFER
      setStatusMsg("Step 2/2: Depositing...");
      
      // Estimate gas and add a 20% buffer to prevent reverts during swaps
      const estimatedGas = await kardia.depositPush.estimateGas(amount);
      const gasLimit = (estimatedGas * 120n) / 100n;

      const txDeposit = await kardia.depositPush(amount, {
        gasLimit: gasLimit
      });

      setPuTx(txDeposit.hash as `0x${string}`);
      setStatusMsg("Processing...");
    } catch (e: any) {
      console.error(e);
      setIsBroadcasting(false);
      
      // User-friendly error message
      const msg = e.reason || e.message || "";
      if (msg.includes("user rejected")) {
        setStatusMsg("Cancelled");
      } else {
        setStatusMsg("Failed");
      }
      
      // Reset button after error
      setTimeout(() => setStatusMsg(""), 3000);
    }
  };

  if (!address) return <div className="p-10 text-center text-slate-500 uppercase text-xs font-bold">Connect Wallet</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. ACQUIRE POWER UNITS (WITH SMART LOGIC) */}
      <div className="space-y-3 p-6 bg-slate-900/50 rounded-[2.5rem] border border-slate-800">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Acquire Power</h4>
        <div className="relative">
          <input 
            className="input w-full h-14 bg-black border-slate-700 rounded-2xl text-white font-bold" 
            placeholder="USDT Amount" 
            type="number"
            value={puAmount} 
            onChange={(e) => setPuAmount(e.target.value)} 
          />
          <div className="absolute right-4 top-4 flex items-center gap-2 text-xs font-bold text-slate-500">
             <WalletIcon /> {usdtBalance ? Number(usdtBalance.formatted).toFixed(2) : "0.00"}
          </div>
        </div>
        <button
          className="btn h-14 w-full bg-[#eab308] hover:bg-[#ca8a04] text-black border-none rounded-2xl font-black text-sm uppercase transition-all disabled:opacity-50"
          disabled={!puAmount || isBroadcasting}
          onClick={handleAcquirePU}
        >
          {statusMsg || "Acquire Power Units"}
        </button>
        <TxStatus hash={puTx} />
      </div>

      {/* 2. STAKE KDIA */}
      <div className="space-y-3 p-6 bg-slate-900/50 rounded-[2.5rem] border border-slate-800">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Stake $KDIA</h4>
        <div className="relative">
          <input 
            className="input w-full h-14 bg-black border-slate-700 rounded-2xl text-white font-bold" 
            placeholder="KDIA Amount" 
            type="number"
            value={stakeAmount} 
            onChange={(e) => setStakeAmount(e.target.value)} 
          />
          <div className="absolute right-4 top-4 flex items-center gap-2 text-xs font-bold text-slate-500">
             <WalletIcon /> {kdiaBalance ? Number(kdiaBalance.formatted).toFixed(2) : "0.00"}
          </div>
        </div>
        <button
          className="btn h-14 w-full bg-slate-800 hover:bg-slate-700 text-white border-none rounded-2xl font-black text-sm uppercase transition-all"
          disabled={!stakeAmount || stakeSMOS.isPending}
          onClick={() => {
            stakeSMOS.writeContractAsync({
              address: controller, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "stake",
              args: [parseUnits(stakeAmount, 18)],
            }).then(hash => setStakeTx(hash)).catch(() => {});
          }}
        >
          {stakeSMOS.isPending ? "Staking..." : "Stake KDIA"}
        </button>
        <TxStatus hash={stakeTx} />
      </div>

      {/* 3. CLAIM REWARDS */}
      <button 
        className="btn h-14 w-full bg-transparent border-2 border-slate-800 hover:border-slate-600 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all"
        disabled={claimMiner.isPending} 
        onClick={() => {
            claimMiner.writeContractAsync({ 
                address: controller, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "claimMinerRewards" 
            }).then(hash => setClaimTx(hash)).catch(() => {});
        }}
      >
        {claimMiner.isPending ? "Claiming..." : "Claim Mining Rewards"}
      </button>
      <TxStatus hash={claimTx} />
      
    </div>
  );
}
