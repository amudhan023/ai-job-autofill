---
type: concept
title: Platform Adapters — Data, Not Code
description: PLATFORM_HINTS + HintedAdapter + GenericAdapter, and the detection scoring that picks between them
tags: [adapters, ats, platforms, detection, core]
---

# Platform Adapters

Sources: `extension/src/adapters/platforms.ts`, `generic.ts`, `registry.ts`.

## Adapters as data entries

The seven ATS integrations (Greenhouse, Lever, Ashby, Workday, iCIMS,
SmartRecruiters, BambooHR) are **not** seven adapter classes. They are seven
entries in a `PLATFORM_HINTS: PlatformHint[]` table, each describing:

```ts
interface PlatformHint {
  platform: ATSPlatform;
  url: RegExp;              // matched against location.hostname
  fingerprints: string[];   // DOM selectors — strongest signal, 40 pts
  structure: string[];      // HTML structure selectors, 20 pts
  css: string[];            // CSS-class hints, 10 pts
  roots: string[];          // preferred discovery roots, most specific first
}
```

A single `HintedAdapter` class interprets whichever hint it's constructed
with. Adding an eighth ATS is adding a table row, not a class — this is
called out as design decision #3 in `docs/OVERVIEW.md`.

## Detection scoring

```
score = url(30) + DOM-fingerprint(40) + structure(20) + css(10)
threshold = 70   (registry.ts DETECTION_THRESHOLD)
```

`registry.ts`'s `detectATS()` runs every `HintedAdapter` and picks the
highest score at or above 70. Fingerprints (DOM presence) are weighted
highest because they're the most reliable signal that survives page
redesigns better than a CSS class name would.

## Remote-extendable fingerprints

`applyRemoteHints()` (`adapters/remoteConfig.ts`) can additively extend a
platform's fingerprint/structure/css arrays from a remotely fetched config,
so detection can be hardened against an ATS's markup changes without
shipping a new extension release. The content script calls this on load:
`loadAdapterConfig().then(applyRemoteHints)`.

## `GenericAdapter` — the universal fallback

When no hinted adapter clears 70, `GenericAdapter` runs instead of leaving
the page as `"unknown"`:

- `score()` returns a nominal 10 (never competes with a real ATS match) if
  `discoverWithin(document)` finds anything fillable at all.
- `discoverFields()` scopes discovery to the **densest `<form>`** on the page
  (at least 3 fillable controls) to cut noise from search bars/newsletter
  signups, falling back to the whole document for form-less React/Vue apps.

Safety is unchanged for generic pages — the same
[matching-engine](matching-engine.md) and
[confidence-scoring](confidence-scoring.md) floor apply, so unmatched noise
fields are badged, never written.

## Three-way detection outcome

`detectATS()` returns exactly one of: a hinted platform (score ≥ 70), the
generic fallback (any fillable field, score < 70 everywhere), or truly
`"unknown"` (nothing fillable on the page at all) — the last case now
strictly means "no forms here," not "we didn't recognize this ATS."
