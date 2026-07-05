---
type: concept
title: UI Truthfulness — Badge Contract
description: Why badge color reflects actual write outcome, not match confidence, and how FieldMatch.filled enforces that
tags: [ui, badges, truthfulness, confidence, core-ui]
---

# UI Truthfulness — Badge Contract

Source: `extension/src/popup/ConfidenceBadge.tsx`, `shared/types.ts`
(`FieldMatch`).

## The core rule

Badges encode **what actually happened to a field this pass**, not how
confident the match was. A high-confidence match can still end up unfilled
(confirm-gated, or the widget rejected the write) — so badge color is driven
by outcome fields, never by `tier` alone.

## `badgeStatus()` decision order

```ts
function badgeStatus(m: FieldMatch): BadgeStatus {
  if (m.filled) return green "✓";              // written THIS pass
  if (m.alreadyHadValue) return gray "✓";       // skipped — never-clobber guard
  if (m.flags.includes("blocklist")) return red "✕"; // never-fillable
  if (m.value !== null) return yellow "!";      // ready but not written
  return red "?";                               // no match / no value
}
```

| Badge | Color | Meaning |
|---|---|---|
| ✓ | green | written this pass (`filled: true`) |
| ✓ | gray | skipped — already had a value ([never-clobber](../core/safety-gates.md)) |
| ! | yellow | value ready but not written — confirm-gated or widget rejected the write; hover shows why |
| ✕ | red | never-fillable — blocklisted field |
| ? | red | no match found, or matched but no profile value exists |

Hover text is built from `match.reason` (a human-readable string set at the
point of decision throughout [fill-executor](../core/fill-executor.md) and
[matching-engine](../core/matching-engine.md)) plus the numeric confidence
percentage.

## Why `FieldMatch.filled` exists as a separate field from `confidence`/`tier`

`filled` is set **only** from the writer's real return value in
`writeMatch()`/`writeField()` (see [fill-executor](../core/fill-executor.md))
— never inferred from confidence. This is what lets the popup's "Filled X of
Y" header and the individual badges agree by construction: both are derived
from the same `filled` boolean, so a summary count of "3 filled" can never
coexist with only 2 green badges. Confidence/tier still exist on the object
(and could theoretically diverge from outcome), but no UI surface renders
them as if they were the outcome.
