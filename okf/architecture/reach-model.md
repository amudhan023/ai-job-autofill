---
type: concept
title: Reach Model — Declared vs On-Demand Injection
description: Why the extension combines declared content scripts with activeTab + chrome.scripting injection to reach any site
tags: [manifest, activeTab, scripting, permissions, architecture]
---

# Reach Model

The extension needs to work on "virtually any" career site, but Chrome Web
Store review and user trust both penalize the `<all_urls>` host permission
("read and change all your data on all websites"). The design instead layers
two reach mechanisms.

## 1. Declared content scripts (seven known ATS hosts)

Listed in `manifest.json` under `content_scripts` and mirrored in
`host_permissions` (see [manifest](manifest.md)). On these hosts the content
script is present from `document_idle` with no user action required, so the
popup/side panel can show live status immediately.

## 2. On-demand injection (everywhere else)

For any other site, the extension relies on:

- `activeTab` — grants temporary host access to *only* the tab the user is
  currently interacting with, and *only* after a user gesture (clicking the
  toolbar icon or the in-panel "Autofill" button).
- `chrome.scripting` — the API used to inject the content script bundle into
  that tab at the moment of the click.

The click **is** the consent: there is no way for the extension to scan or
write to an arbitrary page without the user first acting on that specific
tab. This is called out explicitly in `docs/OVERVIEW.md` §6 as a deliberate
trade-off: "the popup can't show status on unknown sites until the first
click."

## Why this over `<all_urls>`

| | `<all_urls>` | activeTab + scripting |
|---|---|---|
| Install warning | "Read and change all your data on all websites" | none |
| Status before first click | Yes, everywhere | Only on the 7 declared hosts |
| User consent model | Implicit (grant once, forever) | Explicit (per click) |

Universal reach is preserved — the fill engine is identical either way, see
[platform-adapters](../core/platform-adapters.md)'s `GenericAdapter` for how
an unrecognized page is still handled — but the *installation* footprint
stays minimal.
