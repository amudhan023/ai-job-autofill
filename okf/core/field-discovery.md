---
type: concept
title: Field Discovery (Deep Scan)
description: How discoverWithin() walks shadow DOM and same-origin iframes to find every fillable control
tags: [discovery, dom, shadow-dom, iframe, core]
---

# Field Discovery (Deep Scan)

Source: `extension/src/adapters/discover.ts`.

## What counts as a control

```
CONTROL_SELECTOR = input, textarea, select,
  [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"],
  [role="textbox"]:not(input):not(textarea),
  button[aria-controls],
  [role="combobox"]:not(input):not(select)
```

This covers native controls, rich-text contenteditable editors, ARIA
textboxes, ARIA comboboxes built on plain `<input>` (react-select and
similar libraries — typed as `select`), and popup-listbox composites: a
button/div whose `aria-controls` panel holds `role="option"` items, the
pattern intl-tel-input uses for its phone-country picker.

## Deep traversal: `collectRoots()`

Discovery isn't just `document.querySelectorAll` — it recursively collects
every **query root** reachable from the starting node:

1. The root itself.
2. Every element's **open** shadow root (`el.shadowRoot`), queued for further
   traversal (shadow roots can nest).
3. Every same-origin `<iframe>`/`<frame>`'s `contentDocument`. Cross-origin
   frames throw on access and are caught silently — those are instead
   covered by the content script's own separate instance running inside that
   frame, since the manifest sets `all_frames: true` (see
   [manifest](../architecture/manifest.md)).

Closed shadow roots are unreachable by design (there is no API to reach into
one) — a page author who wants to opt out of DOM scanning can use closed
shadow roots.

## Why tagName checks, not `instanceof`

Elements owned by an iframe belong to that frame's own `window` — its
`HTMLInputElement` constructor is a *different object* than the top frame's.
`el instanceof HTMLInputElement` fails silently across that realm boundary,
so every check in this module (and in
[dom-writers](dom-writers.md)) uses `el.tagName` / per-document
`getComputedStyle` / root-node-scoped label lookups instead. This realm-safety
requirement is called out repeatedly in the OVERVIEW and is a known landmine
for anyone extending discovery — a new instanceof check here re-introduces a
cross-frame bug.

## Radio/checkbox grouping

Radio and checkbox inputs are grouped by their `name` attribute **per root**
(not globally), so identical `name="answer"` groups in different iframes or
shadow roots don't collide. The group's question text is resolved via
`fieldset > legend`, `aria-labelledby`, or preceding text.

## Consumers

Adapters (see [platform-adapters](platform-adapters.md)) call
`discoverWithin(root)` with their preferred scope — a specific form root for
known ATSes, the densest `<form>` or the whole document for
`GenericAdapter`. The result feeds directly into
[matching-engine](matching-engine.md) as `DiscoveredField` objects.
