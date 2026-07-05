---
type: concept
title: Popup UI
description: The Popup component — fill trigger, per-field badges, session progress — shared by both the toolbar popup and the side panel
tags: [ui, popup, react, core-ui]
---

# Popup UI

Source: `extension/src/popup/Popup.tsx`.

## Shared component, two mount points

`Popup` is not exclusive to a transient toolbar popup — `sidepanel/main.tsx`
renders the exact same component (see [sidepanel](sidepanel.md)). There is no
separate "side panel UI"; the docked panel is just a different host page for
this component, chosen because a manifest `default_popup` was intentionally
left unset (see [manifest](../architecture/manifest.md)).

## Responsibilities

- Sends `{ type: "GET_PAGE_STATUS" }` on mount to show current platform
  detection and any resumable session, and `{ type: "FILL_FORM" }` on the
  Autofill button click.
- Renders one [ConfidenceBadge](badges.md) per field in the last
  `FillResult.matches`, each with a hover tooltip built from `match.reason`.
- Shows session progress (`SessionSummary`: pages filled, cumulative fields
  filled) when a multi-page [fill-sessions](../core/fill-sessions.md) is
  active.
- Surfaces an "AI draft" action per unmatched free-text field, sending
  `{ type: "AI_DRAFT_FIELD", fieldId }` (see [ai-pipeline](../core/ai-pipeline.md)).

## Truthful "Filled X of Y" summary

The header count is derived from `matches.filter(m => m.filled).length`, the
same field the badges themselves render from — see
[badges](badges.md) for why this can't silently disagree with what the
badges show.
