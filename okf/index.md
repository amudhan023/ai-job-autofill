---
type: index
title: AI Job Autofill — OKF Knowledge Map
description: Master entry point into the Open Knowledge Format bundle for the AI Job Autofill Chrome extension
tags: [okf, index, extension, autofill]
---

# AI Job Autofill — Knowledge Map

This bundle documents a privacy-first Chrome MV3 extension that autofills job
applications deterministically (with AI advisory-only for free text). It fills
forms; it never submits them. See `CLAUDE.md` and `docs/OVERVIEW.md` in the
repository root for the full narrative — these concept files break that
architecture into addressable, linkable units.

## architecture/ — manifest, reach model, message passing

- [manifest](architecture/manifest.md) — MV3 manifest.json: permissions, host_permissions, entry points
- [reach-model](architecture/reach-model.md) — declared content scripts vs on-demand activeTab injection
- [message-passing](architecture/message-passing.md) — the typed ExtensionMessage/ExtensionResponse contract
- [service-worker](architecture/service-worker.md) — background/index.ts: routing, side-panel gating, AI proxy
- [surfaces-overview](architecture/surfaces-overview.md) — how content script, service worker, and UI divide responsibility

## core/ — discovery, matching, writing, safety, AI

- [field-discovery](core/field-discovery.md) — deep-scan traversal of shadow DOM and same-origin iframes
- [matching-engine](core/matching-engine.md) — multi-signal scoring against the field taxonomy
- [field-taxonomy](core/field-taxonomy.md) — FIELD_RULES: patterns, profile dot-paths, transforms, flags
- [confidence-scoring](core/confidence-scoring.md) — how a signal match becomes a confidence tier
- [dom-writers](core/dom-writers.md) — typed, realm-safe writers for every control kind
- [platform-adapters](core/platform-adapters.md) — PLATFORM_HINTS + HintedAdapter + GenericAdapter
- [fill-executor](core/fill-executor.md) — evaluate → write → settle-window orchestration
- [fill-sessions](core/fill-sessions.md) — multi-page / SPA continuation, scope, expiry, caps
- [safety-gates](core/safety-gates.md) — blocklist, confirm-gate, never-clobber, zero-mutation
- [ai-pipeline](core/ai-pipeline.md) — batched classification and cached free-text drafting
- [storage-schema](core/storage-schema.md) — UserProfile shape and the chrome.storage layout

## ui/ — popup, side panel, options, dashboard

- [popup](ui/popup.md) — fill trigger, per-field badges, session progress
- [sidepanel](ui/sidepanel.md) — docked panel replacing default_popup, per-tab enablement
- [options-profile-editor](ui/options-profile-editor.md) — profile editor, resume upload, settings
- [dashboard](ui/dashboard.md) — application history and analytics
- [badges](ui/badges.md) — the UI-truthfulness contract (badge reflects outcome, not confidence)

## Reading order for a new agent

1. `architecture/manifest.md` → `architecture/reach-model.md` (what the extension is allowed to do, and where)
2. `architecture/surfaces-overview.md` → `architecture/message-passing.md` (how the pieces talk)
3. `core/field-discovery.md` → `core/matching-engine.md` → `core/dom-writers.md` → `core/fill-executor.md` (the fill pipeline, in execution order)
4. `core/safety-gates.md` (the guarantees that make the above trustworthy)
5. `ui/*` (what the user actually sees)
