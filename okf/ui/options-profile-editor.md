---
type: concept
title: Options Page — Profile Editor
description: The full-page profile editor, resume upload, and settings surface
tags: [ui, options, profile-editor, settings, core-ui]
---

# Options Page — Profile Editor

Source: `extension/src/options/Options.tsx` (~890 lines),
`extension/src/options/Onboarding.tsx`, `extension/src/options/Field.tsx`,
`extension/src/options/Dashboard.tsx`.

Declared as `options_page` in the manifest — a full extension page (not a
popup), reached via `chrome.runtime.openOptionsPage()` or the extension's own
options entry in `chrome://extensions`.

## Responsibilities

- **Profile editor** — structured form for every `UserProfile` section (see
  [storage-schema](../core/storage-schema.md)): personal info, links, work
  authorization, references, experience entries, skills, and the optional
  demographics section. Reads/writes through the shared `useProfileStore`
  (`storage/store.ts`) so edits are immediately reflected wherever the store
  is consulted.
- **Resume upload** — stores resume bytes locally via
  `storage/resumeFile.ts`; this is what
  [fill-executor](../core/fill-executor.md)'s `attachResume()` reads when a
  Resume/CV file input is discovered. Uploading does not itself write
  anything to any page — it only makes the bytes available for the next
  fill pass to attach.
- **Settings** — backend URL override (`storage/settings.ts`, default
  `http://localhost:8000`) and the `autofillOnNavigation` toggle that gates
  [fill-sessions](../core/fill-sessions.md)'s automatic multi-page
  continuation.
- **JSON import/export** (T11) — `exportProfileJson` downloads the whole
  `UserProfile` as pretty-printed JSON for backup or moving browsers;
  `importProfileJson` parses a previously exported file, validates it, and
  backfills fields missing from older exports (`storage/profile.ts`).
  Import **replaces** the entire saved profile, so it sits behind an
  explicit confirm dialog.
- **Onboarding** (`Onboarding.tsx`) — first-run flow guiding a new user
  through populating the profile before their first fill attempt.

## Field-level component (`Field.tsx`)

A shared input wrapper used across the profile editor's many sections,
keeping label/validation/change-handling consistent without each section
reimplementing its own input chrome.

## Relationship to the rule engine

Nothing in Options ever talks to the DOM of a job-application page — its
only job is producing a correct, complete `UserProfile` and resume file.
[field-taxonomy](../core/field-taxonomy.md)'s rules are what later turn that
data into actual page writes; a rule mapping to an empty profile path can
never fire (see [confidence-scoring](../core/confidence-scoring.md)'s
`profileValueExists` gate) — so an incomplete profile silently degrades to
fewer badges filled, never to a wrong or invented value.
