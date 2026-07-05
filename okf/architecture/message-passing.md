---
type: concept
title: Message-Passing Contract
description: The typed ExtensionMessage/ExtensionResponse contract connecting content script, service worker, and UI surfaces
tags: [messaging, chrome-runtime, types, architecture]
---

# Message-Passing Contract

Source: `extension/src/shared/types.ts` (public contract) and
`extension/src/background/index.ts` (internal message union).

## Two message vocabularies

There are deliberately two separate typed unions:

1. **`ExtensionMessage` / `ExtensionResponse`** — the public contract between
   UI surfaces (popup/side panel/options) and the **content script**, sent
   via `chrome.tabs.sendMessage`.
2. **`InternalMessage`** (defined inline in `background/index.ts`) — messages
   the content script or UI sends to the **service worker** via
   `chrome.runtime.sendMessage`.

## ExtensionMessage → content script

```ts
type ExtensionMessage =
  | { type: "DETECT_ATS" }
  | { type: "FILL_FORM" }
  | { type: "GET_PAGE_STATUS" }
  | { type: "PROFILE_UPDATED"; profile: UserProfile }
  | { type: "AI_DRAFT_FIELD"; fieldId: string };
```

Handled by the switch in `content/index.ts`'s `handle()`. Every response is
one of:

```ts
type ExtensionResponse =
  | { ok: true; platform: ATSPlatform; session?: SessionSummary }
  | { ok: true; result: FillResult; session?: SessionSummary }
  | { ok: true; value: string; cached?: boolean }
  | { ok: false; error: string };
```

The listener always returns `true` from `chrome.runtime.onMessage` to signal
an async response, and errors are caught and normalized to `{ ok: false,
error }` rather than throwing across the message boundary.

## InternalMessage → service worker

```
FILL_DONE            content script reporting a completed fill (→ history)
CONTENT_READY        content script announcing it loaded on a URL
REPORT_PAGE_STATUS   content script telling the worker whether this tab
                      has a fillable form (→ per-tab side panel enablement)
REQUEST_AI_ANSWER     free-text draft request (→ cache check → backend)
REQUEST_COVER_LETTER  cover letter generation (→ backend)
REQUEST_CLASSIFY_BATCH batched unmatched-field classification (→ backend)
OPEN_DASHBOARD        UI navigation request
```

## End-to-end flow example: clicking "Autofill"

1. Side panel sends `{ type: "FILL_FORM" }` to the active tab.
2. `content/index.ts` runs `detectAndFill` (see
   [fill-executor](../core/fill-executor.md)), then sends
   `{ type: "FILL_DONE", result }` to the service worker for history
   persistence, and separately returns `{ ok: true, result, session }` as the
   direct response to the side panel.
3. If a field needs an AI draft, the side panel sends
   `{ type: "AI_DRAFT_FIELD", fieldId }` to the content script, which in turn
   sends `{ type: "REQUEST_AI_ANSWER", question, jdSummary }` to the service
   worker, which checks the answer cache before calling the backend client.

This two-hop shape (UI → content script → service worker) keeps DOM access
confined to the content script (the only context with page access) while
centralizing storage/network side effects in the service worker.
