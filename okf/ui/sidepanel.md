---
type: concept
title: Side Panel
description: The docked panel that replaced default_popup, gated per-tab by the service worker
tags: [ui, sidepanel, mv3, core-ui]
---

# Side Panel

Source: `extension/src/sidepanel/main.tsx`, `extension/src/manifest.json`
(`side_panel.default_path`), `extension/src/background/index.ts`.

## Why a side panel instead of a popup

A toolbar popup closes the instant focus leaves it, which discards any
in-progress state. The side panel is docked next to the job application and
persists across focus changes, so the last fill result and current session
progress survive as the user actually works the page — the code comment in
`sidepanel/main.tsx` states this directly.

## It renders the same UI as the popup

```tsx
// sidepanel/main.tsx
createRoot(container).render(<Popup />);
```

No separate component tree — see [popup](popup.md). The "side panel" is
purely a different HTML host page (`src/sidepanel/index.html`, declared as
`side_panel.default_path` in the manifest) mounting the identical React
component.

## Per-tab enablement

There is no `default_popup` in the manifest; instead the service worker
calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
so a toolbar-icon click opens the panel. `updateSidePanelForTab()` in
`background/index.ts` then enables or disables the panel **per tab id**
based on whether that tab's content script reported a fillable form via
`REPORT_PAGE_STATUS` — see [service-worker](../architecture/service-worker.md).
Tabs the worker has never heard from keep the manifest default (enabled), so
on-demand scanning via [reach-model](../architecture/reach-model.md) still
works on undeclared hosts.

## Graceful degradation pre-Chrome 114

Every `chrome.sidePanel` call is wrapped in `try/catch` — on browsers without
the Side Panel API, the action-click behavior configuration silently no-ops
and the icon click has no visible effect, rather than throwing at service
worker startup.
