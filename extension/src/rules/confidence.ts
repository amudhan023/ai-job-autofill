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
 * Where a rule matched a field. Layered by trustworthiness (see
 * docs/ARCHITECTURE_REVIEW.md §2.2):
 *  - autocomplete: spec-defined semantics — effectively ground truth
 *  - label:        human-facing text (exact match scores highest)
 *  - aria:         accessibility text, occasionally stale
 *  - placeholder:  often an example rather than a name
 *  - attr:         developer-facing name/id tokens (e.g. `first_name`)
 *  - nearby:       surrounding text/heading — context only, below the
 *                  auto-fill floor (0.7) so it badges but never writes
 */
export type MatchSource =
  | "autocomplete"
  | "label"
  | "aria"
  | "placeholder"
  | "attr"
  | "nearby";

const SOURCE_SCORES: Record<MatchSource, number> = {
  autocomplete: 0.98,
  label: 0.85,
  aria: 0.8,
  placeholder: 0.75,
  attr: 0.7,
  nearby: 0.6,
};

/**
 * Signal-match scoring. `exact` only applies to label matches: a short label
 * the pattern matches wholesale (e.g. label text "First Name") scores 0.97.
 */
export function labelMatchScore(matchedOn: MatchSource, exact: boolean): number {
  if (exact && matchedOn === "label") return 0.97;
  return SOURCE_SCORES[matchedOn];
}
