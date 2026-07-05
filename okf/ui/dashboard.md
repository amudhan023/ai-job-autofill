---
type: concept
title: Dashboard — Application History & Analytics
description: The history and analytics view surfaced inside the Options page
tags: [ui, dashboard, history, analytics, core-ui]
---

# Dashboard

Source: `extension/src/options/Dashboard.tsx`, backed by
`extension/src/storage/history.ts` and `extension/src/storage/analytics.ts`.

## Data source

Reads `ApplicationRecord` entries from IndexedDB (see
[storage-schema](../core/storage-schema.md)), each written by the service
worker's `FILL_DONE` handler (`recordApplication()`,
[service-worker](../architecture/service-worker.md)) immediately after a
content-script fill pass completes:

```ts
interface ApplicationRecord {
  id: string; url: string; company: string; platform: ATSPlatform;
  date: number; fieldsFilled: number; fieldsTotal: number;
  aiAssisted: number;   // count of fields flagged for AI free-text assistance
}
```

## What it shows

A per-application history list (site, platform, date, fields filled out of
total) plus aggregate analytics (`storage/analytics.ts`) — e.g. counts by
platform, fill-rate trends over time. This is purely observational: the
Dashboard never triggers a fill or writes to any page; it only reads what
already happened.

## Why history lives in IndexedDB, not `storage.local`

Application history is expected to grow unbounded over a job search (dozens
to hundreds of records) and benefits from IndexedDB's querying/indexing over
`chrome.storage.local`'s flat key-value model — see
[storage-schema](../core/storage-schema.md) for the full storage
partitioning rationale.
