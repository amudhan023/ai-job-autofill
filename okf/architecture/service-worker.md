---
type: concept
title: Background Service Worker
description: What background/index.ts owns — routing, per-tab side panel gating, AI proxy, history persistence
tags: [service-worker, background, mv3, architecture]
---

# Background Service Worker

Source: `extension/src/background/index.ts`.

Kept intentionally thin: "orchestration + history persistence + AI proxy.
Heavy work stays on the backend; this only routes" (file header comment).

## Responsibilities

1. **Per-tab side panel gating.** `updateSidePanelForTab(tabId, hasForm)`
   calls `chrome.sidePanel.setOptions({ tabId, enabled })` so the panel is
   only offered on tabs that reported a fillable form via
   `REPORT_PAGE_STATUS` — it stays out of the way on Gmail, search results,
   etc. Tabs the worker has never heard from are left at the manifest
   default (enabled), so the on-demand "scan this page" flow still works on
   sites without a declared content script.
2. **Action-click behavior.** `chrome.sidePanel.setPanelBehavior({
   openPanelOnActionClick: true })` is set imperatively here (not via
   manifest `default_popup`) — this is the *only* place the icon click is
   handled. Both this and the `storage.session` access-level call below are
   wrapped in `try/catch` because they're unavailable on Chrome < 114 and the
   extension should degrade gracefully rather than throw at startup.
3. **Session storage access grant.** `chrome.storage.session.setAccessLevel({
   accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })` — session storage is
   trusted-contexts-only by default; this line is what lets the content
   script (an untrusted context) read/write fill-session state directly. See
   [fill-sessions](../core/fill-sessions.md).
4. **Keyboard command routing.** `chrome.commands.onCommand` for `autofill`
   (`Alt+Shift+F`) looks up the active tab and sends it `{ type: "FILL_FORM"
   }` — same message the side panel button sends.
5. **AI proxy with cache-first answers.** `REQUEST_AI_ANSWER` checks the
   local answer cache before calling the backend client; only non-stubbed,
   non-empty responses are cached. `REQUEST_CLASSIFY_BATCH` and
   `REQUEST_COVER_LETTER` call straight through to the backend client with no
   caching.
6. **History persistence.** `FILL_DONE` calls `recordApplication(result)`
   against IndexedDB (`storage/history.ts`).

## Why routing lives here and not in the content script

The content script runs once per page/frame and is torn down on navigation;
the service worker is the durable place to hold cross-page concerns (which
tab has a form, the answer cache, application history) without re-deriving
them on every page load.
