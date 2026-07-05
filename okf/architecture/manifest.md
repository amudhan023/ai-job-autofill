---
type: concept
title: MV3 Manifest Configuration
description: How manifest.json declares the extension's permissions, entry points, and reach
tags: [manifest, mv3, permissions, extension, architecture]
---

# MV3 Manifest Configuration

Source: `extension/src/manifest.json`.

## Permissions

```json
"permissions": ["storage", "activeTab", "scripting", "sidePanel"]
```

- `storage` — `chrome.storage.local`/`.session` for profile, settings, answer
  cache, and fill sessions (see [storage-schema](../core/storage-schema.md)).
- `activeTab` + `scripting` — the pair that lets the extension inject the fill
  engine into *any* page the user clicks the action on, without a
  `<all_urls>` install-time warning. See [reach-model](reach-model.md).
- `sidePanel` — the docked UI surface (Chrome 114+); see
  [sidepanel](../ui/sidepanel.md).

## host_permissions and declared content_scripts

Both lists name the same seven ATS hosts (Greenhouse, Lever, Ashby, Workday,
iCIMS, SmartRecruiters, BambooHR) plus `localhost`/`127.0.0.1` for local
integration testing:

```json
"host_permissions": [
  "https://boards.greenhouse.io/*", "https://job-boards.greenhouse.io/*",
  "https://jobs.lever.co/*", "https://jobs.ashbyhq.com/*",
  "https://*.myworkdayjobs.com/*", "https://careers.icims.com/*",
  "https://*.icims.com/*", "https://jobs.smartrecruiters.com/*",
  "https://careers.smartrecruiters.com/*", "https://*.bamboohr.com/*"
]
```

The `content_scripts` entry matches those same hosts and additionally sets:

- `"js": ["src/content/index.ts"]`
- `"all_frames": true` — the script runs in every same-origin iframe too, so
  iCIMS's iframe-embedded forms get their own instance rather than relying
  purely on cross-frame DOM access (see
  [field-discovery](../core/field-discovery.md)).
- `"run_at": "document_idle"` — waits for the DOM to be parsed before
  scanning.

Declaring these hosts gives instant status (badge, side-panel enablement) the
moment a known ATS page loads, without waiting for a user gesture. Every
*other* site is reached on-demand instead — see
[reach-model](reach-model.md).

## Entry points

| Manifest key | File | Role |
|---|---|---|
| `background.service_worker` | `src/background/index.ts` | routing hub — see [service-worker](service-worker.md) |
| `side_panel.default_path` | `src/sidepanel/index.html` | docked UI, opens on action click |
| `options_page` | `src/options/index.html` | profile editor + dashboard |
| `action` | (no `default_popup`) | toolbar icon click is routed entirely to the side panel via `chrome.sidePanel.setPanelBehavior` in the service worker, not a manifest-declared popup |
| `commands.autofill` | `Alt+Shift+F` | keyboard shortcut → `FILL_FORM` message to the active tab |

No `default_popup` is set deliberately: opening the side panel on action click
is configured imperatively in the service worker (see
[service-worker](service-worker.md)) so it can be gated per-tab.
