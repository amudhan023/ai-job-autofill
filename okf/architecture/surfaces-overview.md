---
type: concept
title: Extension Surfaces Overview
description: How the content script, service worker, and UI surfaces divide responsibility across the extension
tags: [architecture, overview, surfaces]
---

# Extension Surfaces Overview

Four distinct JS execution contexts make up the extension, each with a
narrow, non-overlapping job.

## Content script (`src/content/`, `src/adapters/`, `src/rules/`)

Runs inside the page (per frame, via `all_frames: true`). The only context
with real DOM access. Owns:

- ATS detection and field discovery ([field-discovery](../core/field-discovery.md), [platform-adapters](../core/platform-adapters.md))
- Rule evaluation and confidence scoring ([matching-engine](../core/matching-engine.md))
- The actual writes ([dom-writers](../core/dom-writers.md), [fill-executor](../core/fill-executor.md))
- SPA navigation watching and multi-page session continuation ([fill-sessions](../core/fill-sessions.md))
- Job-description scraping for AI drafts (`content/jdScraper.ts`)

It never persists anything durable itself beyond the scoped fill-session
entry; it reports outcomes upward via messages.

## Service worker (`src/background/`)

No DOM access. Owns cross-page state and network/storage side effects: side
panel gating, the AI proxy + answer cache, application history. See
[service-worker](service-worker.md).

## UI surfaces (`src/popup/`, `src/sidepanel/`, `src/options/`)

React trees that render state and send `ExtensionMessage`s to the content
script of the active tab. The side panel and popup share the *same* `Popup`
component (`sidepanel/main.tsx` renders `<Popup />` directly) — the side
panel is not a separate UI, just a different mount point that persists
across focus changes. See [ui/popup](../ui/popup.md), [ui/sidepanel](../ui/sidepanel.md), [ui/options-profile-editor](../ui/options-profile-editor.md).

## Shared layer (`src/shared/`, `src/storage/`)

`shared/types.ts` and `shared/profile.ts` define the vocabulary (message
contract, `UserProfile` schema) every other context imports — see
[message-passing](message-passing.md) and
[storage-schema](../core/storage-schema.md). `storage/` wraps
`chrome.storage`/IndexedDB behind typed load/save functions used by both the
content script and the UI (via a shared `zustand` store,
`storage/store.ts`).

## Data flow at a glance

```
UI surface  --ExtensionMessage-->  content script  --InternalMessage-->  service worker
    ^                                     |                                    |
    |                                     v                                    v
    +----------------ExtensionResponse----+                              chrome.storage /
                                                                          IndexedDB / backend
```
