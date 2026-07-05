---
type: concept
title: Storage Schema
description: The UserProfile shape and how chrome.storage.local/.session and IndexedDB are partitioned across concerns
tags: [storage, schema, profile, chrome-storage, core]
---

# Storage Schema

Sources: `extension/src/shared/profile.ts`, `extension/src/storage/*.ts`.

## `UserProfile` — the single source of truth for fills

Defined in `shared/profile.ts`, explicitly documented as mirroring the
backend's Pydantic schema (`backend/app/models/profile.py`) so the two stay
in lockstep. Top-level sections referenced throughout the rule engine:

```ts
interface UserProfile {
  personal: PersonalInfo;   // firstName/middleName/lastName/preferredName,
                            // email, phone, phoneCountry, location
  links: Links;             // linkedin, github, portfolio, website
  workAuth: WorkAuth;       // usAuthorized, sponsorshipNeeded, visaType, clearance
  references: Reference[];
  experience: Experience[];
  skills: { technical: string[]; ... };
  demographics?: {...};     // optional, voluntary EEO self-ID — confirm-gated only
  meta: { totalYearsExp: number; resumeFileName?: string; ... };
}
```

`FieldRule.profile` dot-paths (see [field-taxonomy](field-taxonomy.md))
address directly into this shape, including array indices (`experience[0].title`).

## chrome.storage partitioning

| Area | Contents | Lifetime | Accessed from |
|---|---|---|---|
| `storage.local` | `UserProfile` (`storage/profile.ts`), resume bytes (`storage/resumeFile.ts`), settings — backend URL, autofill-on-navigation toggle (`storage/settings.ts`), answer cache (`storage/answerCache.ts`) | persists until uninstall/clear | content script, service worker, UI |
| `storage.session` | Fill-session state (`content/fillSession.ts`), scoped per origin+tenant path | cleared on browser close | content script (granted `TRUSTED_AND_UNTRUSTED_CONTEXTS` by the service worker), falls back to `storage.local` pre-Chrome 114 |
| IndexedDB | Application history (`storage/history.ts`) — one `ApplicationRecord` per fill | persists until uninstall/clear | service worker only (`FILL_DONE` handler) |

## Why session state isn't in `storage.local`

Fill sessions are explicitly ephemeral (30-minute inactivity expiry, capped
auto-fill count — see [fill-sessions](fill-sessions.md)) — using
`storage.session` means an abandoned session doesn't linger past the browser
session, matching its actual semantics without needing manual cleanup code.

## Shared read/write surface: `storage/store.ts`

A `zustand` store (`useProfileStore`) wraps `loadProfile`/`saveProfile` for
the popup and options UIs, giving both a single reactive source of the
in-memory profile without each maintaining separate component state. The
content script does not use this store — it calls `loadProfile()` directly,
since it has no persistent React tree to react to changes in.

## Settings defaults favor zero-config local use

`loadBackendUrl()` defaults to `http://localhost:8000` (the local dev
`uvicorn` server) and `loadAutofillOnNavigation()` defaults to `true` — the
extension works immediately against a locally run backend without a manual
settings step, while still being fully overridable in Options.
