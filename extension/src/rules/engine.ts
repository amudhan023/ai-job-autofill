import type { UserProfile } from "@/shared/profile";
import type { FieldMatch, FieldRule, FieldType, RuleFlag } from "@/shared/types";
import { FIELD_RULES, isBlocked } from "./fieldRules";
import { computeConfidence, labelMatchScore, toTier, type MatchSource } from "./confidence";
import { hasValue, resolveProfilePath } from "./profilePath";

/** A field discovered in the DOM, normalized for the rule engine. */
export interface DiscoveredField {
  fieldId: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  type: FieldType;
  /** HTML autocomplete attribute value (may hold multiple tokens). */
  autocomplete?: string;
  /** `name` attribute — developer-facing, often semantic (`first_name`). */
  nameAttr?: string;
  /** `id` attribute. */
  idAttr?: string;
  /** Surrounding text (preceding sibling / section heading) — weak context. */
  nearbyText?: string;
  /** True when an adapter has already authoritatively identified this field. */
  atsKnownField?: boolean;
  /** Adapter-supplied rule id, when the adapter knows the mapping. */
  adapterRuleId?: string;
}

/**
 * Turn developer attribute values into pattern-matchable text:
 * `first_name`, `firstName`, `candidate.first-name` → "first name".
 */
function normalizeAttr(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.[\]:]+/g, " ")
    .toLowerCase()
    .trim();
}

interface SignalText {
  text: string;
  on: MatchSource;
}

/** All matchable text signals for a field, strongest first. */
function signalsFor(field: DiscoveredField): SignalText[] {
  const attrText = normalizeAttr(`${field.nameAttr ?? ""} ${field.idAttr ?? ""}`);
  const all: SignalText[] = [
    { text: field.label, on: "label" },
    { text: field.ariaLabel, on: "aria" },
    { text: field.placeholder, on: "placeholder" },
    { text: attrText, on: "attr" },
    { text: field.nearbyText ?? "", on: "nearby" },
  ];
  return all.filter((s) => s.text.trim().length > 0);
}

/** Autocomplete tokens on the control, ignoring on/off/section-* noise. */
function autocompleteTokens(field: DiscoveredField): string[] {
  return (field.autocomplete ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t && t !== "on" && t !== "off" && !t.startsWith("section-"));
}

/**
 * Score every rule against every signal and return the strongest match.
 * Rule-array order only breaks ties (more specific rules are listed first);
 * it no longer decides matches outright — a strong label hit on a later rule
 * beats a weak placeholder hit on an earlier one.
 */
function findRule(field: DiscoveredField): {
  rule: FieldRule;
  matchedOn: MatchSource;
  exact: boolean;
} | null {
  // Adapter override takes precedence.
  if (field.adapterRuleId) {
    const r = FIELD_RULES.find((x) => x.id === field.adapterRuleId);
    if (r) return { rule: r, matchedOn: "label", exact: true };
  }

  const signals = signalsFor(field);
  const acTokens = autocompleteTokens(field);

  let best: { rule: FieldRule; matchedOn: MatchSource; exact: boolean; score: number } | null =
    null;

  for (const rule of FIELD_RULES) {
    // Strongest signal: spec-defined autocomplete tokens.
    if (rule.autocomplete && acTokens.some((t) => rule.autocomplete!.includes(t))) {
      const score = labelMatchScore("autocomplete", false);
      if (!best || score > best.score) {
        best = { rule, matchedOn: "autocomplete", exact: false, score };
      }
      continue; // no text signal can beat autocomplete for this rule
    }

    for (const { text, on } of signals) {
      for (const pattern of rule.patterns) {
        if (!pattern.test(text)) continue;
        const exact = on === "label" && isExactKeyword(text, pattern);
        const score = labelMatchScore(on, exact);
        if (!best || score > best.score) {
          best = { rule, matchedOn: on, exact, score };
        }
      }
    }
  }

  return best ? { rule: best.rule, matchedOn: best.matchedOn, exact: best.exact } : null;
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
export function evaluateField(field: DiscoveredField, profile: UserProfile): FieldMatch {
  // Hard safety gate first — checked on every direct signal (not nearby text,
  // which can legitimately mention e.g. an EEO notice near unrelated fields).
  if (
    isBlocked(field.label) ||
    isBlocked(field.ariaLabel) ||
    isBlocked(field.placeholder) ||
    isBlocked(normalizeAttr(`${field.nameAttr ?? ""} ${field.idAttr ?? ""}`))
  ) {
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

function formatValue(raw: unknown, rule: FieldRule): string | null {
  const result = rule.transform
    ? rule.transform(raw)
    : raw === null || raw === undefined
      ? ""
      : String(raw);
  return result.length > 0 ? result : null;
}

/** Some control types are interchangeable enough not to penalize confidence. */
function isCompatibleType(actual: FieldType, expected: FieldType): boolean {
  const textish: FieldType[] = ["text", "email", "tel", "url", "number"];
  if (textish.includes(actual) && textish.includes(expected)) return true;
  if (expected === "radio" && (actual === "select" || actual === "radio")) return true;
  // A select-like control (incl. ARIA comboboxes) can take any short value by
  // picking the matching option — don't penalize text-expecting rules on it.
  if (actual === "select" && textish.includes(expected)) return true;
  return false;
}

function buildReason(
  matchedOn: MatchSource,
  exact: boolean,
  valueExists: boolean,
  atsKnown?: boolean,
): string {
  if (!valueExists) return "Matched a field but your profile has no value for it.";
  if (atsKnown) return "ATS adapter field — exact mapping.";
  if (matchedOn === "autocomplete") return "Autocomplete attribute — authoritative.";
  if (exact) return "Exact label match.";
  if (matchedOn === "attr") return "Matched on name/id attribute.";
  if (matchedOn === "nearby") return "Matched on nearby text — review before use.";
  return `Pattern match on ${matchedOn}.`;
}

/** Evaluate all discovered fields. */
export function evaluateFields(fields: DiscoveredField[], profile: UserProfile): FieldMatch[] {
  return fields.map((f) => evaluateField(f, profile));
}
