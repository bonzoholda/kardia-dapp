import { formatUnits } from "viem";

/**
 * Safe bigint formatter for UI (no Number(), no crashes)
 */
export function fmt(
  value?: bigint,
  decimals = 18,
  maxDecimals = 4
): string {
  if (value === undefined) return "—";

  try {
    const formatted = formatUnits(value, decimals); // string

    const [whole, fraction = ""] = formatted.split(".");

    const trimmedFraction = fraction.slice(0, maxDecimals);

    return trimmedFraction.length > 0
      ? `${whole}.${trimmedFraction}`
      : whole;
  } catch {
    return "—";
  }
}
