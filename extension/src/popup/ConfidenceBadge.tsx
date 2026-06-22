import type { FieldMatch } from "@/shared/types";

const TIER_STYLES: Record<string, string> = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-red-100 text-red-800",
};

const TIER_LABEL: Record<string, string> = {
  high: "✓",
  medium: "!",
  low: "?",
};

/** Per-field confidence badge (green / yellow / red), with reason on hover. */
export function ConfidenceBadge({ match }: { match: FieldMatch }) {
  const tier = match.flags.includes("blocklist") ? "low" : match.tier;
  return (
    <span
      title={`${match.reason} (confidence ${(match.confidence * 100).toFixed(0)}%)`}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-bold ${TIER_STYLES[tier]}`}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
