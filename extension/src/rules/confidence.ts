import type { ConfidenceTier } from "@/shared/types";

export interface ConfidenceInput {
  /** Fuzzy label-match score in [0,1]. */
  labelMatchScore: number;
  /** True if an ATS adapter hard-codes this exact field. */
  atsKnownField: boolean;
  /** Input control type matches the rule's expected type. */
  typeMatch: boolean;
  /** Profile has a non-null, non-empty value for this field. */
  profileValueExists: boolean;
}

/**
 * Mirror of the spec's compute_confidence. Key invariant: a field with no
 * profile value gets confidence 0 — we never fill blanks.
 */
export function computeConfidence(input: ConfidenceInput): number {
  let base = input.labelMatchScore;
  if (input.atsKnownField) base = Math.max(base, 0.97);
  if (!input.typeMatch) base *= 0.7;
  if (!input.profileValueExists) base *= 0.0;
  return Math.min(base, 1.0);
}

/** Map a numeric confidence to a badge tier. */
export function toTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

/**
 * Label-match scoring:
 *  - exact label text equals a rule keyword:    0.97
 *  - regex pattern matches the label:           0.85
 *  - regex matches placeholder/aria only:       0.75
 */
export function labelMatchScore(
  matchedOn: "label" | "placeholder" | "aria",
  exact: boolean,
): number {
  if (exact) return 0.97;
  if (matchedOn === "label") return 0.85;
  return 0.75;
}
