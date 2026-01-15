import { useWaitForTransactionReceipt } from "wagmi";

type Props = {
  hash?: `0x${string}`;
};

export function TxStatus({ hash }: Props) {
  const { isLoading, isSuccess, isError } =
    useWaitForTransactionReceipt({
      hash,
    });

  if (!hash) return null;

  return (
    <div className="text-sm mt-2">
      {isLoading && (
        <p className="text-yellow-500">⏳ Transaction pending…</p>
      )}

      {isSuccess && (
        <p className="text-green-600">✅ Transaction confirmed</p>
      )}

      {isError && (
        <p className="text-red-600">❌ Transaction failed</p>
      )}
    </div>
  );
}
