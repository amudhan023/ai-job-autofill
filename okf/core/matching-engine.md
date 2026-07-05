---
type: concept
title: Multi-Signal Matching Engine
description: How discovered fields are scored against FIELD_RULES across every signal, strongest match wins
tags: [engine, rules, matching, signals, core]
---

# Multi-Signal Matching Engine

Source: `extension/src/rules/engine.ts`.

## Design principle: score all signals, not first-match-wins

Every rule in [field-taxonomy](field-taxonomy.md) is scored against **every**
matchable signal on a field (label, aria-label, placeholder, normalized
name/id attributes, nearby text). The strongest score across all
rule×signal pairs wins; array order in `FIELD_RULES` only breaks exact ties.
This is a deliberate departure from naive "first regex that matches" logic —
`docs/OVERVIEW.md` §6.2 notes it's "O(rules × signals)," trivial at this
scale (~60 rules), and means a weak accidental match never beats a strong
one regardless of declaration order.

## Signal normalization

`normalizeAttr()` turns developer-facing attribute values into
pattern-matchable text: `first_name`, `firstName`, `candidate.first-name` →
`"first name"` (camelCase split, `_`/`-`/`.`/`[]`/`:` → spaces, lowercased).
This lets the same regex patterns used for human label text also match
machine-facing `name`/`id` tokens.

## `DiscoveredField` shape

The engine consumes a normalized field record (not raw DOM):

```ts
interface DiscoveredField {
  fieldId: string;
  label: string; placeholder: string; ariaLabel: string;
  type: FieldType;
  autocomplete?: string; nameAttr?: string; idAttr?: string;
  nearbyText?: string;
  atsKnownField?: boolean;   // adapter already identified this authoritatively
  adapterRuleId?: string;    // adapter-supplied rule id
}
```

`atsKnownField` lets a platform adapter short-circuit scoring for fields it
recognizes with certainty (see [platform-adapters](platform-adapters.md)) —
[confidence-scoring](confidence-scoring.md)'s `computeConfidence` floors such
fields at 0.97 regardless of label-match score.

## Autocomplete tokens

`autocompleteTokens()` extracts the field's `autocomplete` attribute value,
ignoring noise tokens (`on`/`off`/`section-*`). A matching autocomplete token
is the strongest possible signal (0.98) — it's spec-defined ground truth, not
a heuristic guess.

## Output: `FieldMatch`

`evaluateField(field, profile)` returns a `FieldMatch` (see
`shared/types.ts`) carrying the resolved rule id, profile path, computed
value, numeric confidence, tier, flags, and a human-readable `reason` string
shown on badge hover (see [badges](../ui/badges.md)). This is the object that
flows into [fill-executor](fill-executor.md)'s `shouldWrite()` decision.
