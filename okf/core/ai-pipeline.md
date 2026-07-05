---
type: concept
title: AI Pipeline — Advisory Classification and Cached Drafting
description: Batched field classification and free-text drafting, both advisory-only and never load-bearing for structured fills
tags: [ai, classification, drafting, cache, core]
---

# AI Pipeline

Sources: `extension/src/content/aiEnrich.ts`,
`extension/src/background/index.ts`, `extension/src/storage/answerCache.ts`.

AI is never on the critical path for structured fields — per `CLAUDE.md`'s
inviolable principle, names/emails/work-auth come only from the rule engine.
AI has exactly two jobs, both advisory: classify what a leftover unmatched
field *might* mean, and draft free text on explicit user request.

## Batched classification (`aiEnrich.ts`)

After a fill pass, `enrichWithAI(matches)`:

1. `selectUnmatched()` filters to fields with `ruleId === null`, not
   blocklisted, with a label of at least 5 characters — trivial/blocked
   fields aren't worth a round trip.
2. Caps the batch at `MAX_QUESTIONS = 15` and the whole enrichment at
   `ENRICH_TIMEOUT_MS = 2500` via `Promise.race` against a timeout that
   resolves `null` — a slow or unreachable backend degrades to "no
   classification," never to a stalled fill.
3. Sends one `REQUEST_CLASSIFY_BATCH` message; on success,
   `applyCategories()` writes an advisory `aiCategory` onto each match
   index-aligned with the request, and rewrites `match.reason` to
   `"Unmatched — AI suggests: <category>. Review manually."`

Critically: **the classifier assigns no value at all** — it can only label a
badge, never trigger `shouldWrite()` in
[fill-executor](fill-executor.md), because it never touches
`match.value` or `match.confidence`. This is the mechanism behind
`docs/OVERVIEW.md`'s claim that AI classification is "capped below the write
floor by construction."

## Free-text drafting (`draftField` in `content/index.ts`)

Triggered by the popup's per-field "AI draft" button (`AI_DRAFT_FIELD`
message):

1. Looks up the field's `FieldHandle` from `fillExecutor.ts`'s `lastHandles`
   map (requires a fill pass to have run first).
2. Uses the field's own label/nearby text as the question.
3. Scrapes the visible job description (`content/jdScraper.ts`).
4. Sends `REQUEST_AI_ANSWER` to the service worker, which checks the answer
   cache before calling the backend (RAG over experience chunks, STAR format
   for behavioral questions, ≤200 words, "use ONLY the provided
   experiences").
5. Writes the returned text into the field via the same
   [dom-writers](dom-writers.md) path fills use — for the user to review and
   edit, never auto-submitted.

## Answer cache (`storage/answerCache.ts`)

Local-only, 30-day TTL, 100-entry cap, keyed on
`normalizeQuestion(question)` (lowercase, punctuation stripped, whitespace
collapsed, truncated to 300 chars). Repeat questions across different
applications ("Why do you want to work here?" modulo the company name) are
free and work offline once cached. Empty/stub answers are never cached
(`putCachedAnswer` early-returns on blank `answer`), so a temporarily
misconfigured backend can't poison the cache with placeholder text.

## Provider chain (backend side)

Behind an `LLM` protocol: Anthropic (primary) → Gemini (fallback) →
deterministic fakes (used in tests / when no API keys are configured), so
the extension's UI code never needs to know which provider actually served a
given request.
