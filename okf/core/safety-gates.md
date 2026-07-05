---
type: concept
title: Safety Gates
description: The ordered set of guarantees — blocklist, confirm-gate, never-clobber, zero-mutation — checked before any write
tags: [safety, blocklist, never-clobber, zero-mutation, core]
---

# Safety Gates

These are the inviolable principles from `CLAUDE.md`, realized in code across
[field-taxonomy](field-taxonomy.md) and [fill-executor](fill-executor.md).
Checked in order, per field, on every fill pass.

## 1. Blocklist — never filled, regardless of match

SSN/EIN/tax IDs, passport numbers, bank details, date of birth, driver's
license, criminal history, disability status, and veteran status have **no
entry** in `FIELD_RULES` at all (see [field-taxonomy](field-taxonomy.md)) and
are additionally checked against `BLOCKLIST_PATTERNS` in
`rules/fieldRules.ts`'s `isBlocked()` against every direct signal on the
field. This is defense-in-depth: absence from the rule table alone would
already prevent a fill, but the explicit blocklist also flags such fields
with the `✕` badge (see [badges](../ui/badges.md)) so the user sees *why*
nothing was attempted, rather than seeing an unexplained blank.

## 2. Confirm-gated — surfaced, never auto-written

Salary expectations, notice period, and voluntary EEO self-identification
(age range, race/ethnicity, gender, pronouns, LGBTQIA+ — stored in an
optional local `demographics` profile section) *do* have rules and *do* get
a resolved value and confidence score, but every such rule carries the
`confirm` `RuleFlag`. `fillExecutor.ts`'s `shouldWrite()` explicitly excludes
any match with this flag — the value is computed and shown (yellow `!`
badge) but the write never happens automatically. The user decides whether
to enter it.

## 3. Never-clobber — idempotent re-runs

`hasExistingValue(handle)` in `fillExecutor.ts` checks before every write:
radio/checkbox groups for an already-checked option, selects for
`selectedIndex > 0`, text/textarea for non-empty `.value`, contenteditable
for non-empty `.textContent`. Any positive check skips the write and marks
`alreadyHadValue: true`. This makes multiple fill passes over the same page
idempotent — re-running Autofill (or the settle window, or a later wizard
step re-fill) can never overwrite something the user already typed or a
previous pass already wrote.

## 4. Zero-mutation guarantee — never submits

No code path in [dom-writers](dom-writers.md) or
[fill-executor](fill-executor.md) clicks a submit button or calls
`form.submit()`. Every writer dispatches only `input`/`change` events (or, for
custom widgets, the pointer sequence needed to open/select — never a
navigation-causing action). This is enforced by an E2E test per
`docs/OVERVIEW.md` §3.4, so a regression that adds a submit path would be
caught by CI, not just by code review.

## Why order matters

Blocklist is checked structurally (rule absence + explicit pattern check)
before confidence is even computed, so a blocklisted field can never
accidentally clear the confidence floor. Confirm-gating and never-clobber
are both checked *after* a value is resolved but *before* the write call —
either one alone is sufficient to prevent a write, and both apply
independently (a confirm-gated field that also already has a value is
reported as "already has a value," not "needs confirmation," since
never-clobber is checked first in `writeMatch()`).
