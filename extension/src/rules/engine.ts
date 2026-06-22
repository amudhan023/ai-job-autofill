import type { UserProfile } from "@/shared/profile";
import type { FieldMatch, FieldRule, FieldType, RuleFlag } from "@/shared/types";
import { FIELD_RULES, isBlocked } from "./fieldRules";
import { computeConfidence, labelMatchScore, toTier } from "./confidence";
import { hasValue, resolveProfilePath } from "./profilePath";

/** A field discovered in the DOM, normalized for the rule engine. */
export interface DiscoveredField {
  fieldId: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  type: FieldType;
  /** True when an adapter has already authoritatively identified this field. */
  atsKnownField?: boolean;
  /** Adapter-supplied rule id, when the adapter knows the mapping. */
  adapterRuleId?: string;
}

function findRule(field: DiscoveredField): {
  rule: FieldRule;
  matchedOn: "label" | "placeholder" | "aria";
  exact: boolean;
} | null {
  // Adapter override takes precedence.
  if (field.adapterRuleId) {
    const r = FIELD_RULES.find((x) => x.id === field.adapterRuleId);
    if (r) return { rule: r, matchedOn: "label", exact: true };
  }

  const haystacks: Array<{ text: string; on: "label" | "placeholder" | "aria" }> = [
    { text: field.label, on: "label" },
    { text: field.ariaLabel, on: "aria" },
    { text: field.placeholder, on: "placeholder" },
  ];

  for (const rule of FIELD_RULES) {
    for (const { text, on } of haystacks) {
      if (!text) continue;
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          const exact = on === "label" && isExactKeyword(text, pattern);
          return { rule, matchedOn: on, exact };
        }
      }
    }
  }
  return null;
}

/** Heuristic: a short label that the pattern matches wholesale counts as exact. */
function isExactKeyword(text: string, pattern: RegExp): boolean {
  const trimmed = text.trim().replace(/[*:]\s*$/, "");
  const m = trimmed.match(pattern);
  return !!m && m[0].length >= trimmed.length - 2;
}

/**
 * Evaluate a single discovered field against the rules + profile.
 * Returns a FieldMatch describing what (if anything) we'd fill and how sure.
 */
export function evaluateField(
  field: DiscoveredField,
  profile: UserProfile,
): FieldMatch {
  // Hard safety gate first.
  if (isBlocked(field.label) || isBlocked(field.ariaLabel)) {
    return {
      fieldId: field.fieldId,
      label: field.label,
      type: field.type,
      ruleId: null,
      profilePath: null,
      value: null,
      confidence: 0,
      tier: "low",
      flags: ["blocklist"],
      reason: "Sensitive field — never auto-filled.",
    };
  }

  const found = findRule(field);
  if (!found) {
    return {
      fieldId: field.fieldId,
      label: field.label,
      type: field.type,
      ruleId: null,
      profilePath: null,
      value: null,
      confidence: 0,
      tier: "low",
      flags: [],
      reason: "No matching rule — needs attention.",
    };
  }

  const { rule, matchedOn, exact } = found;
  const flags: RuleFlag[] = rule.flags ?? [];

  // Free-text (AI) fields: detected, flagged, but not deterministically filled.
  if (rule.profile === null) {
    return {
      fieldId: field.fieldId,
      label: field.label,
      type: field.type,
      ruleId: rule.id,
      profilePath: null,
      value: null,
      confidence: 0,
      tier: "low",
      flags,
      reason: flags.includes("ai_generate")
        ? "Free-text — AI generation (Phase 3); left for you for now."
        : "Free-text field.",
    };
  }

  const raw = resolveProfilePath(profile, rule.profile);
  const valueExists = hasValue(raw);
  const typeMatch = field.type === rule.type || isCompatibleType(field.type, rule.type);

  const confidence = computeConfidence({
    labelMatchScore: labelMatchScore(matchedOn, exact),
    atsKnownField: !!field.atsKnownField,
    typeMatch,
    profileValueExists: valueExists,
  });

  const value = valueExists ? formatValue(raw, rule) : null;

  return {
    fieldId: field.fieldId,
    label: field.label,
    type: field.type,
    ruleId: rule.id,
    profilePath: rule.profile,
    value,
    confidence,
    tier: toTier(confidence),
    flags,
    reason: buildReason(matchedOn, exact, valueExists, field.atsKnownField),
  };
}

function formatValue(raw: unknown, rule: FieldRule): string {
  if (rule.transform) return rule.transform(raw);
  if (raw === null || raw === undefined) return "";
  return String(raw);
}

/** Some control types are interchangeable enough not to penalize confidence. */
function isCompatibleType(actual: FieldType, expected: FieldType): boolean {
  const textish: FieldType[] = ["text", "email", "tel", "url", "number"];
  if (textish.includes(actual) && textish.includes(expected)) return true;
  if (expected === "radio" && (actual === "select" || actual === "radio")) return true;
  return false;
}

function buildReason(
  matchedOn: string,
  exact: boolean,
  valueExists: boolean,
  atsKnown?: boolean,
): string {
  if (!valueExists) return "Matched a field but your profile has no value for it.";
  if (atsKnown) return "ATS adapter field — exact mapping.";
  if (exact) return "Exact label match.";
  return `Pattern match on ${matchedOn}.`;
}

/** Evaluate all discovered fields. */
export function evaluateFields(
  fields: DiscoveredField[],
  profile: UserProfile,
): FieldMatch[] {
  return fields.map((f) => evaluateField(f, profile));
}
