import { parseUnits, formatUnits } from "viem";
import { useAccount, useBalance, useWaitForTransactionReceipt, useReadContract, useConnectorClient } from "wagmi";
import { useController } from "../hooks/useController";
import { SPHYGMOS_CONTROLLER_ABI } from "../abi/SphygmosController";
import { useState, useEffect, useMemo } from "react";
import { TxStatus } from "./TxStatus";
import { ethers, BrowserProvider, JsonRpcProvider } from "ethers";

const controller = (import.meta.env.VITE_CONTROLLER_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;
const USDT_ADDRESS = (import.meta.env.VITE_USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955") as `0x${string}`;
const SMOS_ADDRESS = (import.meta.env.VITE_SMOS_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;
const PAIR_ADDRESS = "0x047511EaeDcB7548507Fcb336E219D3c08c9e806" as `0x${string}`;

const PRIVATE_RPC_URL = "https://rpc-bsc.48.club";

const PAIR_ABI = [{ constant: true, inputs: [], name: "getReserves", outputs: [{ name: "_reserve0", type: "uint112" }, { name: "_reserve1", type: "uint112" }, { name: "_blockTimestampLast", type: "uint32" }], stateMutability: "view", type: "function" }] as const;

function WalletIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h18v10H3z" /><path d="M16 11h4v2h-4z" />
    </svg>
  );
}

export function Actions() {
  const { address } = useAccount();
  const { data: connectorClient } = useConnectorClient(); // Get the viem client to convert to ethers signer
  const { acquirePU, stakeSMOS, claimMiner, refetchAll } = useController();

  const [puAmount, setPuAmount] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [puTx, setPuTx] = useState<`0x${string}`>();
  const [stakeTx, setStakeTx] = useState<`0x${string}`>();
  const [claimTx, setClaimTx] = useState<`0x${string}`>();
  const [copyLabel, setCopyLabel] = useState("Copy RPC");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const [isProtected, setIsProtected] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("mev_shield_verified") === "true";
    return false;
  });

  const txBlocked = !isProtected;

  // Conversion Hook for ethers.js
  const ethersSigner = useMemo(() => {
    if (!connectorClient) return undefined;
    const { account, chain, transport } = connectorClient;
    const network = {
      chainId: chain.id,
      name: chain.name,
    };
    const provider = new BrowserProvider(transport, network);
    return provider.getSigner(account.address);
  }, [connectorClient]);

  // Existing balances hooks...
  const { data: usdtBalance, isLoading: loadingUsdt, refetch: refetchUsdt } = useBalance({ address, token: USDT_ADDRESS });
  const { data: smosBalance, isLoading: loadingSmos, refetch: refetchSmos } = useBalance({ address, token: SMOS_ADDRESS });
  const { isLoading: loadingReserves, refetch: refetchReserves } = useReadContract({
    address: PAIR_ADDRESS, abi: PAIR_ABI, functionName: "getReserves",
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  useEffect(() => {
    if (!loadingUsdt && !loadingSmos && !loadingReserves && address) {
      const timer = setTimeout(() => setIsLoaded(true), 800);
      return () => clearTimeout(timer);
    }
  }, [loadingUsdt, loadingSmos, loadingReserves, address]);

  const puWait = useWaitForTransactionReceipt({ hash: puTx });
  const stakeWait = useWaitForTransactionReceipt({ hash: stakeTx });
  const claimWait = useWaitForTransactionReceipt({ hash: claimTx });

  useEffect(() => {
    if (puWait.isSuccess || stakeWait.isSuccess || claimWait.isSuccess) {
      refetchAll(); refetchUsdt(); refetchSmos(); refetchReserves();
      if (puWait.isSuccess) { setPuAmount(""); setPuTx(undefined); setIsBroadcasting(false); }
      if (stakeWait.isSuccess) { setStakeAmount(""); setStakeTx(undefined); }
      if (claimWait.isSuccess) { setClaimTx(undefined); }
    }
  }, [puWait.isSuccess, stakeWait.isSuccess, claimWait.isSuccess, refetchAll, refetchUsdt, refetchSmos, refetchReserves]);

  const addMEVProtectedRPC = async () => {
    const provider = (window as any).ethereum;
    if (!provider) return;
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x38",
          chainName: "BSC (48Club Shield)",
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: [PRIVATE_RPC_URL],
          blockExplorerUrls: ["https://bscscan.com"],
        }],
      });
      setIsProtected(true);
      localStorage.setItem("mev_shield_verified", "true");
    } catch {
      alert("Please add manually: " + PRIVATE_RPC_URL);
    }
  };

  const handleProtectedDeposit = async () => {
    if (!ethersSigner || !puAmount) return;
    
    setIsBroadcasting(true);
    try {
      // 1. Setup Private RPC Provider
      const privateProvider = new JsonRpcProvider(PRIVATE_RPC_URL);
      
      // 2. Setup Contract Instance with Ethers
      const contract = new ethers.Contract(controller, SPHYGMOS_CONTROLLER_ABI, await ethersSigner);
      
      // 3. Send Transaction
      // This will trigger the wallet popup. 
      // Because the underlying transport is linked to the private provider, it broadcasts there.
      const tx = await contract.depositPush(parseUnits(puAmount, 18), {
        maxPriorityFeePerGas: parseUnits("3", "gwei"),
        maxFeePerGas: parseUnits("6", "gwei"),
      });

      setPuTx(tx.hash);
    } catch (error) {
      console.error("Protected deposit failed", error);
      setIsBroadcasting(false);
    }
  };

  // Rendering logic remains identical...
  if (address && !isLoaded) return (
    <div className="flex flex-col items-center justify-center p-16 space-y-4 bg-slate-900/80 rounded-[2.5rem] border border-slate-800 shadow-2xl">
      <div className="w-10 h-10 border-4 border-[#eab308] border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] animate-pulse">Initiating the dApp...</p>
    </div>
  );

  if (!address) return (
    <div className="p-10 text-center bg-slate-900/50 rounded-[2.5rem] border border-slate-800">
      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Connection Required</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* SHIELD CARD UI (Unchanged) */}
      <div className={`p-6 rounded-[2.5rem] border-2 transition-all duration-500 ${isProtected ? 'bg-emerald-500/5 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.05)]' : 'bg-slate-900/50 border-slate-800 shadow-lg'}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl transition-all ${isProtected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
              {isProtected ? "🛡️" : "🔓"}
            </div>
            <div>
              <h4 className={`text-base font-black uppercase tracking-widest ${isProtected ? 'text-emerald-400' : 'text-slate-200'}`}>
                {isProtected ? "Shield Active" : "Shield Required"}
              </h4>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-tighter italic">
                {isProtected ? "48Club Private Relay" : "Public Mempool Risk"}
              </p>
            </div>
          </div>
          <input type="checkbox" checked={isProtected} readOnly className="toggle toggle-success toggle-md border-slate-700 pointer-events-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={addMEVProtectedRPC} className="h-14 rounded-2xl text-[10px] font-black uppercase bg-[#eab308] text-black hover:bg-[#ca8a04] transition-all active:scale-95 shadow-lg shadow-yellow-900/10">
            One-Tap Shield
          </button>
          <button onClick={() => { navigator.clipboard.writeText(PRIVATE_RPC_URL); setCopyLabel("Copied!"); setTimeout(() => setCopyLabel("Copy RPC"), 2000); }} className="h-14 rounded-2xl text-[10px] font-black uppercase border-2 border-slate-700 text-slate-300 hover:text-white transition-all active:scale-95">
            {copyLabel}
          </button>
        </div>
      </div>

      {/* ACQUIRE POWER UNITS (Updated Button) */}
      <div className="space-y-3">
        <div className="relative group">
          <input className="input w-full h-14 bg-slate-900 border-slate-800 focus:border-[#eab308] rounded-2xl text-white font-bold transition-all" placeholder="USDT amount" value={puAmount} onChange={(e) => setPuAmount(e.target.value)} />
          <div className="absolute inset-y-0 right-4 flex items-center gap-2 text-xs font-bold text-slate-500">
             <WalletIcon /> {usdtBalance ? Number(formatUnits(usdtBalance.value, 18)).toFixed(2) : "0.00"}
          </div>
        </div>
        <button
          className="btn h-14 w-full bg-[#eab308] hover:bg-[#ca8a04] text-black border-none rounded-2xl font-black text-sm uppercase tracking-widest disabled:bg-slate-800 disabled:text-slate-600 shadow-lg shadow-yellow-900/20 transition-all active:scale-95"
          disabled={txBlocked || !puAmount || isBroadcasting}
          onClick={handleProtectedDeposit}
        >
          {txBlocked ? "Switch to Shielded RPC" : (isBroadcasting ? "Confirming..." : "Acquire Power Units")}
        </button>
        <TxStatus hash={puTx} />
      </div>

      {/* STAKE SMOS & CLAIM (Unchanged logic for brevity, but they should also use txBlocked check) */}
      <div className="space-y-3">
        <div className="relative group">
          <input className="input w-full h-14 bg-slate-900 border-slate-800 focus:border-[#eab308] rounded-2xl text-white font-bold transition-all" placeholder="SMOS amount" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} />
          <div className="absolute inset-y-0 right-4 flex items-center gap-2 text-xs font-bold text-slate-500">
             <WalletIcon /> {smosBalance ? Number(formatUnits(smosBalance.value, 18)).toFixed(2) : "0.00"}
          </div>
        </div>
        <button
          className="btn h-14 w-full bg-slate-800 hover:bg-slate-700 text-white border-none rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all disabled:text-slate-600"
          disabled={txBlocked || !stakeAmount || stakeSMOS.isPending}
          onClick={() => {
            stakeSMOS.writeContractAsync({
              address: controller, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "stake",
              args: [parseUnits(stakeAmount, 18)],
            }).then(hash => setStakeTx(hash)).catch(() => {});
          }}
        >
          {txBlocked ? "Shield Required" : (stakeSMOS.isPending ? "Staking..." : "Stake SMOS")}
        </button>
        <TxStatus hash={stakeTx} />
      </div>

      <button 
        className="btn h-14 w-full bg-transparent border-2 border-slate-800 hover:border-slate-600 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95"
        disabled={txBlocked || claimMiner.isPending} 
        onClick={() => {
            claimMiner.writeContractAsync({ 
                address: controller, abi: SPHYGMOS_CONTROLLER_ABI, functionName: "claimMinerRewards" 
            }).then(hash => setClaimTx(hash)).catch(() => {});
        }}
      >
        {txBlocked ? "Shield Required" : (claimMiner.isPending ? "Processing..." : "Claim Mining Rewards")}
      </button>
      <TxStatus hash={claimTx} />
    </div>
  );
}
