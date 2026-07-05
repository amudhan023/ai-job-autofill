---
type: concept
title: Fill Sessions — Multi-Page Continuation
description: How a fill session tracks and auto-continues a multi-step application across SPA navigations and page loads
tags: [sessions, multi-page, spa, storage, core]
---

# Fill Sessions

Source: `extension/src/content/fillSession.ts`, orchestrated from
`extension/src/content/index.ts`.

## What a session tracks

```ts
interface FillSessionState {
  scope: string;         // origin + first path segment
  startedAt: number; updatedAt: number;
  pages: string[];       // distinct pathname+search keys filled so far
  fieldsFilled: number;  // cumulative across the session
  autoFills: number;     // automatic (navigation-triggered) passes only
}
```

## Scope: origin + first path segment, not just origin

`currentScope()` computes `${origin}/${firstPathSegment}`. This matters
because multi-tenant ATS hosts like `boards.greenhouse.io/{company}` would
otherwise let a session started on one company's application leak into a
different company's application under the same host — scoping by the first
path segment (the tenant slug) keeps sessions isolated per employer.

## Storage: session-first, local-fallback

Sessions live in `chrome.storage.session` (evicted on browser close) when
available — the service worker grants content scripts access to it via
`setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })` (see
[service-worker](../architecture/service-worker.md)) — falling back to
`storage.local` on older Chrome without the session storage API.

## Bounds — deliberately capped automation

- **30-minute inactivity expiry** (`MAX_AGE_MS`) — `isFresh()` checks
  `now - updatedAt < MAX_AGE_MS`.
- **10 automatic passes max** (`MAX_AUTO_FILLS`) — only counts
  navigation-triggered auto-fills, not the user's own manual "Autofill"
  clicks, so automation stays scoped to the single application the user
  actually started rather than running indefinitely.

## How continuation is triggered

`content/index.ts` installs two watchers:

1. **SPA navigation watcher** (`installNavigationWatcher`) — content scripts
   run in an isolated world, so they can't hook a page script's own
   `history.pushState` calls directly. Instead it polls `location.href`
   every 800ms (`NAV_POLL_MS`) plus listens for `popstate`/`hashchange`, and
   debounces 700ms (`NAV_DEBOUNCE_MS`) after a detected change before
   re-scanning, to let the SPA finish rendering the new wizard step.
2. **Full-page-load resume** (`resumeSessionOnLoad`) — since a full page load
   re-executes the content script from scratch, this checks for a fresh
   session on script startup and retries once after 2.5s if the first scan
   finds zero fields (slow-rendering step).

Both paths funnel into the same `maybeAutoFill()`, which checks the user's
`autofillOnNavigation` setting (default on, `storage/settings.ts`) and
`canAutoFill(session)` (fresh + under the auto-fill cap) before calling
`runFill({ auto: true })` — the identical `detectAndFill` path a manual click
uses, just tagged `auto` for the session's `autoFills` counter.

## Off-switch

`autofillOnNavigation` in Settings disables the navigation-triggered
continuation entirely; manual "Autofill" clicks and the keyboard shortcut are
unaffected by this setting.
