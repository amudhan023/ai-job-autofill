import type { FieldMatch } from "@/shared/types";

interface BadgeStatus {
  label: string;
  cls: string;
}

/**
 * Badge = what actually HAPPENED to the field this pass, not the match
 * confidence: a high-confidence match that was confirm-gated, skipped for an
 * existing value, or rejected by the widget must not show as "filled".
 */
function badgeStatus(m: FieldMatch): BadgeStatus {
  if (m.filled) return { label: "✓", cls: "bg-green-100 text-green-800" };
  if (m.alreadyHadValue) return { label: "✓", cls: "bg-gray-100 text-gray-500" };
  if (m.flags.includes("blocklist")) return { label: "✕", cls: "bg-red-100 text-red-800" };
  // A value is ready but wasn't written: confirm-gated or the write failed.
  if (m.value !== null) return { label: "!", cls: "bg-yellow-100 text-yellow-800" };
  return { label: "?", cls: "bg-red-100 text-red-800" };
}

/** Per-field status badge, with the reason on hover. */
export function ConfidenceBadge({ match }: { match: FieldMatch }) {
  const { label, cls } = badgeStatus(match);
  return (
    <span
      title={`${match.reason} (confidence ${(match.confidence * 100).toFixed(0)}%)`}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-bold ${cls}`}
    >
      {label}
    </span>
  );
}
