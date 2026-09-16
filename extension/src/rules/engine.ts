import type { CustomAnswer, UserProfile } from "@/shared/profile";
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

/** One rule's claim on a field, ranked by `beats()`. */
interface RuleCandidate {
  rule: FieldRule;
  matchedOn: MatchSource;
  exact: boolean;
  /** Signal strength, 0-1 (see confidence.ts SOURCE_SCORES). */
  score: number;
  /** True when the rule's declared type can drive this control. */
  typeMatch: boolean;
}

/**
 * The stronger of two candidate rules for the same field (`best` is absent on
 * the first match).
 *
 * Exact ties are common, not rare: two rules often match the same label on the
 * same signal and so carry an identical score. The live ClickUp/Ashby question
 * "...sponsor you for a work visa ... in the country where you will be
 * working?" matches both /country/i and /sponsor/i on its label. Without a
 * tie-break, declaration order in FIELD_RULES silently decides, and `country`
 * (a text rule) wins a radio group it cannot fill.
 */
function stronger(best: RuleCandidate | null, candidate: RuleCandidate): RuleCandidate {
  if (!best) return candidate;
  // Signal strength stays the primary key: a type-compatible rule must never
  // promote itself over a genuinely stronger match.
  if (candidate.score !== best.score) return candidate.score > best.score ? candidate : best;
  // Equal score: the rule whose declared type can actually drive the control
  // wins. Still equal, the incumbent keeps it — preserving FIELD_RULES order.
  return candidate.typeMatch && !best.typeMatch ? candidate : best;
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

  const candidateFor = (
    rule: FieldRule,
    matchedOn: MatchSource,
    exact: boolean,
  ): RuleCandidate => ({
    rule,
    matchedOn,
    exact,
    score: labelMatchScore(matchedOn, exact),
    typeMatch: field.type === rule.type || isCompatibleType(field.type, rule.type),
  });

  let best: RuleCandidate | null = null;

  for (const rule of FIELD_RULES) {
    // Strongest signal: spec-defined autocomplete tokens.
    if (rule.autocomplete && acTokens.some((t) => rule.autocomplete!.includes(t))) {
      best = stronger(best, candidateFor(rule, "autocomplete", false));
      continue; // no text signal can beat autocomplete for this rule
    }

    for (const { text, on } of signals) {
      for (const pattern of rule.patterns) {
        if (!pattern.test(text)) continue;
        const exact = on === "label" && isExactKeyword(text, pattern);
        best = stronger(best, candidateFor(rule, on, exact));
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

/** Everything a human would read as "the question" for this control. */
function questionText(field: DiscoveredField): string {
  return [field.label, field.ariaLabel, field.placeholder, field.nearbyText ?? ""]
    .filter((t) => t.trim().length > 0)
    .join(" ");
}

/**
 * The first custom answer whose `match` text applies to this field, or null.
 * First-match-wins, so the user's own list order is their priority order.
 */
function findCustomAnswer(field: DiscoveredField, answers: CustomAnswer[]): CustomAnswer | null {
  const question = questionText(field);
  if (!question.trim()) return null;
  for (const a of answers) {
    if (!a.match.trim() || !a.answer.trim()) continue;
    if (matchesQuestion(a.match, question)) return a;
  }
  return null;
}

/**
 * Does the user's `match` text identify this `question`?
 *
 * Case-insensitive substring on whitespace-normalized text. The user pastes a
 * fragment of the real question, so the two sides differ in wrapping, NBSPs
 * and the trailing " *" required-marker — collapsing runs of whitespace makes
 * those irrelevant. Deliberately NOT a regex: match text routinely contains
 * `8+`, `(e.g., OpenAI)` and `?`, which would either throw or silently mean
 * something else. Substring over word-boundary matching because the user
 * controls both sides and a too-short fragment is fixed by typing a longer
 * one — whereas escaping-plus-boundaries is code that can only reject matches
 * the user meant.
 */
function matchesQuestion(match: string, question: string): boolean {
  return normalizeText(question).includes(normalizeText(match));
}

/** Lowercase, collapse all whitespace (incl. NBSP) to single spaces, trim. */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Evaluate a single discovered field against the rules + profile.
 * Returns a FieldMatch describing what (if anything) we'd fill and how sure.
 */
export function evaluateField(field: DiscoveredField, profile: UserProfile): FieldMatch {
  // A custom answer the user wrote themselves outranks everything below,
  // including the blocklist: the blocklist exists to stop *inferred* fills of
  // sensitive fields, and this value was typed by the user for this question.
  const custom = findCustomAnswer(field, profile.customAnswers ?? []);
  if (custom) {
    return {
      fieldId: field.fieldId,
      label: field.label,
      type: field.type,
      ruleId: "customAnswer",
      profilePath: null,
      value: custom.answer,
      confidence: 0.95,
      tier: "high",
      flags: [],
      reason: `Your custom answer for "${custom.match}".`,
    };
  }

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
    // Free-text with no rule match is still AI-eligible — reuses the same
    // ai_generate flag/AI-draft path as the predefined free-text rules below.
    const isFreeText = field.type === "textarea";
    return {
      fieldId: field.fieldId,
      label: field.label,
      type: field.type,
      ruleId: null,
      profilePath: null,
      value: null,
      confidence: 0,
      tier: "low",
      flags: isFreeText ? ["ai_generate"] : [],
      reason: isFreeText
        ? "Free-text — no rule matched; AI generation available."
        : "No matching rule — needs attention.",
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

  const value = valueExists ? formatValue(raw, rule, field.label) : null;

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

function formatValue(raw: unknown, rule: FieldRule, label: string): string | null {
  const result = rule.transform
    ? rule.transform(raw, label)
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
