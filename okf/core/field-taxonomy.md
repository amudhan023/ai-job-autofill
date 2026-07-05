---
type: concept
title: Field Taxonomy (FIELD_RULES)
description: The canonical ~60-entry rule table mapping label patterns to UserProfile dot-paths
tags: [rules, taxonomy, fieldRules, core]
---

# Field Taxonomy — `FIELD_RULES`

Source: `extension/src/rules/fieldRules.ts`.

## Shape of a rule

```ts
interface FieldRule {
  id: string;
  patterns: RegExp[];        // matched against every signal in matching-engine.md
  profile: string | null;    // dot-path into UserProfile, or null for free text
  type: FieldType;
  flags?: RuleFlag[];        // "confirm" | "ai_generate" | "blocklist"
  transform?: (value: unknown) => string;
  autocomplete?: string[];   // spec-defined tokens, strongest signal
}
```

Example entries:

```ts
{ id: "firstName", patterns: [/first.?name/i, /given.?name/i, /\bforename\b/i],
  profile: "personal.firstName", type: "text", autocomplete: ["given-name"] }

{ id: "phoneCountry", patterns: [/country.?code/i, /phone.*country|country.*phone/i, ...],
  profile: "personal.phoneCountry", type: "select", transform: dialCodeToCountry,
  autocomplete: ["tel-country-code"] }
```

## Ordering matters only for ties

Because [matching-engine](matching-engine.md) scores every rule against every
signal, list order in `FIELD_RULES` only disambiguates equal-score ties.
Comments in the source call this out explicitly at several points — e.g.
`preferredName`/`fullName` are listed before `firstName`/`lastName` so "Full
Name" resolves to the composed-name rule rather than partially matching
`lastName`'s `/family.?name/i`; `cityState` precedes standalone `city`/`state`
rules; `phoneCountry` precedes both `phone` and generic country rules so a
dial-code dropdown next to a phone field doesn't get misclassified.

## Transforms

Rules can carry a `transform` that converts a raw profile value into the
string actually written: `boolToYesNo`, `toFullName`, `toPreferredName`,
`toCityState`, `dialCodeToCountry`, `joinList`, `visaToCitizenship` (see
`rules/transforms.ts`). This is where e.g. a boolean `usAuthorized` becomes
the literal string `"Yes"`/`"No"` a `<select>` option expects.

## Deliberate absences

SSN/EIN, DOB, driver's license, and criminal history have **no rule at all**
— they're not merely low-confidence, they don't exist in this table — and
are additionally hard-blocked by `BLOCKLIST_PATTERNS` (see
[safety-gates](safety-gates.md)) as defense in depth. Voluntary EEO self-ID
fields (age range, race/ethnicity, gender, pronouns, LGBTQIA+) *do* have
rules — they're matched and their values resolved — but every such rule
carries the `confirm` flag, so `fillExecutor.ts`'s `shouldWrite()` (see
[fill-executor](fill-executor.md)) surfaces them for review without ever
auto-writing.

## `profile: null` — free-text fields

A rule with `profile: null` marks a field as recognized but not
deterministically fillable — it's left for the user or for
[ai-pipeline](ai-pipeline.md)'s draft-on-request flow rather than
auto-populated from `UserProfile`.
