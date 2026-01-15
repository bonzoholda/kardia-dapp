import React, { useEffect } from 'react';
import { 
  useAccount, 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt 
} from 'wagmi';
// 1. Import maxUint256 from viem
import { parseUnits, maxUint256 } from 'viem';

const MOCK_USDT_ABI = [
  {"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}
] as const;

interface Props {
  children: React.ReactNode;
  tokenAddress: `0x${string}`;
  spenderAddress: `0x${string}`;
  amountRequired: string; // The minimum amount needed to "trigger" the UI
}

export const TokenApprovalGuard: React.FC<Props> = ({ children, tokenAddress, spenderAddress, amountRequired }) => {
  const { address } = useAccount();
  const requiredWei = parseUnits(amountRequired, 18);

  const { data: allowance, refetch } = useReadContract({
    address: tokenAddress,
    abi: MOCK_USDT_ABI,
    functionName: 'allowance',
    args: address ? [address, spenderAddress] : undefined,
    query: { enabled: !!address }
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) refetch();
  }, [isSuccess, refetch]);

  /**
   * MODIFIED: handleApprove now sends maxUint256
   */
  const handleApprove = () => {
    writeContract({
      address: tokenAddress,
      abi: MOCK_USDT_ABI,
      functionName: 'approve',
      // We pass maxUint256 here for "Unlimited"
      args: [spenderAddress, maxUint256], 
      gas: 70000n, // Still keeping manual gas for TokenPocket
    });
  };

  const handleReset = () => {
    writeContract({
      address: tokenAddress,
      abi: MOCK_USDT_ABI,
      functionName: 'approve',
      args: [spenderAddress, 0n],
      gas: 50000n,
    });
  };

  if (!address) return <>{children}</>;

  // Check if current allowance is less than what the app needs right now
  if (allowance !== undefined && allowance < requiredWei) {
    return (
      <div className="rounded-xl bg-black/50 border border-yellow-400/30 p-6 text-center space-y-4">
        <h3 className="text-yellow-400 font-bold uppercase tracking-wider">Security Permission</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Sphygmos requires permission to move tokens from your wallet. 
          <br />
          <span className="text-yellow-400/50">Setting "Unlimited" prevents future popups.</span>
        </p>
        
        <div className="flex flex-col gap-3">
           {/* If there's a stuck allowance > 0 but < required, show Reset */}
           {allowance > 0n && (
             <button 
               onClick={handleReset}
               disabled={isPending || isConfirming}
               className="w-full py-3 px-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-all"
             >
               {isPending ? "Processing..." : "Reset Approval (Safety First)"}
             </button>
           )}
           
           <button 
             onClick={handleApprove}
             disabled={isPending || isConfirming}
             className="w-full py-3 px-4 bg-yellow-400 text-black font-black rounded-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(243,186,47,0.3)]"
           >
             {isPending || isConfirming ? "Waiting for Wallet..." : "Enable Unlimited Spending"}
           </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
