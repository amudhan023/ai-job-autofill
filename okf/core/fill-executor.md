---
type: concept
title: Fill Executor — Evaluate, Write, Settle
description: The detectAndFill orchestration loop that ties discovery, matching, and writing together, plus the late-field settle window
tags: [fill-executor, orchestration, settle-window, core]
---

# Fill Executor

Source: `extension/src/content/fillExecutor.ts`.

## `detectAndFill(profile, opts)` — the main pass

```
detectATS() → adapter.discoverFields() → for each handle:
    evaluateField(discovered, profile) → writeMatch(handle, match)
→ if anything was written: fillLateFields() settle window
→ return FillResult
```

Each handle is tracked in a `lastHandles: Map<fieldId, FieldHandle>`, cleared
at the start of every pass, so later actions (an AI-draft write triggered
from the popup) can target the exact element a given `fieldId` referred to
without re-running discovery.

## `shouldWrite()` — the write gate

```ts
function shouldWrite(match: FieldMatch): boolean {
  return match.value !== null
    && match.confidence >= AUTOFILL_FLOOR   // 0.7
    && !match.flags.includes("confirm");
}
```

This is the single choke point where [confidence-scoring](confidence-scoring.md)'s
floor and [field-taxonomy](field-taxonomy.md)'s `confirm` flag both apply
before any write is attempted. See [safety-gates](safety-gates.md) for the
full ordered gate list, of which this is one link.

## Resume attachment is a special case

`match.ruleId === "resumeUpload"` bypasses the normal value/confidence check
entirely — attachment is gated on whether a resume file is actually stored
locally (`storage/resumeFile.ts`), not on a profile field mirror, so "no
upload yet" still means "no fill" without contradicting the no-blank-fill
rule. A successful attach retroactively sets `confidence: 0.95`, `tier:
"high"`, `filled: true` on the match so the badge (see
[badges](../ui/badges.md)) reflects the true outcome.

## Never-clobber check

`hasExistingValue(handle)` — before any write, radios/checkboxes are checked
for an already-checked option, selects for `selectedIndex > 0`, text/textarea
for non-empty `.value`, and custom widgets for non-empty `.textContent`. A
positive match sets `match.alreadyHadValue = true` and skips the write
entirely — see [safety-gates](safety-gates.md).

## The settle window — filling conditional fields

After a pass writes at least one field, `fillLateFields()` opens a
`MutationObserver` on `document.body` for up to `settleMs` (default 1200ms),
debounced by `debounceMs` (default 150ms) per mutation burst. Each debounced
tick re-runs `adapter.discoverFields()` and fills only elements not already
in the `seen` set, folding new matches into the same `FillResult`. This is
what lets a "Do you require sponsorship? Yes/No" answer reveal and correctly
fill a follow-up "What visa type?" field revealed only after the first
write — without this window, one call to `detectAndFill` would only ever see
the DOM as it existed at click time.

## `writeField()` — routing to the right writer

A tag/type dispatch (never `instanceof`, per the realm-safety rule — see
[field-discovery](field-discovery.md)) routes each control to the correct
function in [dom-writers](dom-writers.md): file inputs are explicitly
refused here (they only accept `File` objects via the separate
`attachResume` path), then radio/checkbox groups, native selects, popup
listbox panels, ARIA comboboxes, plain text/textarea, and finally
contenteditable/role=textbox as the last fallback.

## `detectOnly()` — status without writing

A read-only variant used for `DETECT_ATS`/`GET_PAGE_STATUS` messages: runs
detection and counts fillable fields without evaluating or writing anything,
so the popup/side panel can show "12 fields detected" before the user
commits to a fill.
