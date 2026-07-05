---
type: concept
title: Confidence Scoring
description: How a signal match becomes a numeric confidence and a badge tier, with the no-blank-fill invariant
tags: [confidence, scoring, tiers, core]
---

# Confidence Scoring

Source: `extension/src/rules/confidence.ts`.

## The formula

```ts
function computeConfidence(input: ConfidenceInput): number {
  let base = input.labelMatchScore;
  if (input.atsKnownField) base = Math.max(base, 0.97);
  if (!input.typeMatch) base *= 0.7;
  if (!input.profileValueExists) base *= 0.0;
  return Math.min(base, 1.0);
}
```

**Key invariant**: `profileValueExists` gates the *entire* score to zero when
false. There is no path to a nonzero confidence — and therefore no path to an
auto-write (see [fill-executor](fill-executor.md)'s `AUTOFILL_FLOOR`) — for a
field whose corresponding profile value is empty. The engine never fills a
blank with a guess; it can only be silent.

## Signal source weights

| `MatchSource` | Score | Note |
|---|---|---|
| `autocomplete` | 0.98 | spec-defined semantics — ground truth |
| `label` (exact) | 0.97 | short label the pattern matches wholesale |
| `label` (fuzzy) | 0.85 | pattern match, not exact string |
| `aria` | 0.80 | accessibility text, occasionally stale |
| `placeholder` | 0.75 | often an example value rather than a real name |
| `attr` (name/id) | 0.70 | developer-facing tokens, e.g. `first_name` |
| `nearby` | 0.60 | surrounding text/heading — context only |

## Tiers and the auto-write floor

```ts
function toTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}
```

Tiers drive badge color in the UI, but the **auto-write floor is 0.7**
(`AUTOFILL_FLOOR` in `fillExecutor.ts`) — everything at or above `medium`
tier is eligible to be written; `low` tier is badge-only. Note `nearby` text
alone caps at 0.6, strictly below the floor by construction — surrounding
page text can inform a badge but can never justify a write on its own.

## Type mismatch penalty

If the discovered control's type doesn't match what the rule expects (e.g. a
`select` where the rule wants `text`), the score is multiplied by 0.7 rather
than zeroed — a near-miss can still clear the 0.7 floor if the underlying
label match was strong (autocomplete or exact label), but a merely
placeholder-level match would drop below it.
