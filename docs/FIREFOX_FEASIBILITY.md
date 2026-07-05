# Firefox (MV3) Feasibility Spike (T12)

Timeboxed assessment of what it would take to ship this extension on Firefox
in addition to Chrome. This is a doc-only spike — no port was attempted; see
`docs/BACKLOG.md` T12 for scope.

## Summary

**Recommendation: port later, not now.** The extension is Chrome-only today
by manifest key choice and one Chrome-exclusive API (`chrome.sidePanel`),
not by pervasive `chrome.*` usage. Most of the code is already
promise-style and would carry over almost unchanged. The blocking item is a
real UX redesign (side panel → sidebar/popup), which is out of scope for a
"trivial tweak" and isn't worth doing speculatively before there's user
demand for Firefox. Estimated effort if undertaken: **2–4 days**, mostly the
side panel replacement and manual QA on Firefox; risk to existing Chrome
behavior is low if done as an additive `browser_specific_settings` + a
Firefox-specific manifest build, since none of the current source needs to
change to keep Chrome working.

## What was checked

- `extension/src/manifest.json` (MV3 fields, permissions, background,
  content scripts, action, side panel, commands).
- Every `chrome.*` call site under `extension/src/` (17 files matched;
  enumerated below by API surface).
- `extension/package.json` build tooling (Vite + `tsc`, single manifest,
  single `npm run package` zip — no per-browser build target today).

## Manifest gaps

| Field | Chrome | Firefox MV3 | Gap |
|---|---|---|---|
| `background.service_worker` + `type: module` | Supported (MV3 standard) | Firefox added MV3 support in 109, but background **service workers** (not event pages) only landed behind the scenes more recently and module-type service workers have historically been the roughest edge of Firefox's MV3 support; event pages (non-persistent background *scripts*, not a worker) are the well-trodden path. | **Needs verification on target Firefox version** before shipping — this is the single biggest manifest-level unknown, more likely to need a fallback (`background.scripts` + `persistent: false` under a Firefox-specific manifest) than a one-line fix. |
| `browser_specific_settings.gecko.id` | N/A | **Required** for anything but temporary `about:debugging` loads; AMO listing needs a stable extension ID. | Missing entirely — trivial to add, but only meaningful alongside an actual Firefox build/listing, so left out of this Chrome-only manifest. |
| `action` | Supported | Supported since Firefox 109 (no `browser_action` needed for MV3) | No gap. |
| `side_panel` / `permissions: ["sidePanel"]` | Supported (Chrome 114+) | **Not supported.** Firefox's equivalent is `sidebar_action`, a different manifest key with a different JS API (`browser.sidebarAction`, no `setOptions({tabId, enabled})` per-tab toggling, no `setPanelBehavior`) and different UX (persistent sidebar, not an on-demand docked panel). | **Real gap** — `updateSidePanelForTab` and the `chrome.sidePanel.setPanelBehavior` action-click wiring in `extension/src/background/index.ts` have no Firefox equivalent; this is a design change, not a shim. |
| `host_permissions` | Supported | Supported | No gap. |
| `commands` (keyboard shortcut) | Supported | Supported | No gap. |
| `options_page` | Supported | Supported | No gap. |
| `permissions: ["storage", "activeTab", "scripting"]` | Supported | Supported | No gap. |

## `chrome.*` API usage audit

All 17 files using `chrome.*` were reviewed. Firefox implements a `chrome.*`
namespace as a compatibility alias to its native promise-based `browser.*`
API, and this codebase already calls every callback-shaped API in
`await chrome.foo(...)` promise style (Chrome has supported promises on most
`chrome.*` methods since M99). That means the *style* of this code is
already Firefox-friendly; the gaps are specific APIs, not the calling
convention.

| API surface | Used in | Firefox status |
|---|---|---|
| `chrome.storage.local` | `storage/*.ts`, `adapters/remoteConfig.ts`, `shared/profile.ts` | Supported, no gap. |
| `chrome.storage.session` + `.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })` | `background/index.ts`, `content/fillSession.ts` | `storage.session` landed in Firefox 115. `setAccessLevel` support is inconsistent/newer — already defensively feature-detected (`chrome.storage.session?.setAccessLevel?.(...)` wrapped in try/catch with a documented `storage.local` fallback), so this degrades gracefully rather than breaking. |
| `chrome.storage.onChanged` | `storage/profile.ts` | Supported, no gap. |
| `chrome.runtime.onInstalled`, `onMessage`, `sendMessage`, `MessageSender`, `openOptionsPage` | `background/index.ts`, `content/index.ts`, `content/aiEnrich.ts`, `popup/Popup.tsx` | Supported, no gap. |
| `chrome.tabs.query`, `sendMessage`, `onActivated`, `onUpdated`, `TabChangeInfo` | `background/index.ts`, `popup/Popup.tsx` | Supported, no gap. |
| `chrome.scripting.executeScript` | `popup/Popup.tsx` | Supported in Firefox (landed alongside MV3 `scripting` permission support, Firefox 102+). No gap. |
| `chrome.commands.onCommand` | `background/index.ts` | Supported, no gap (already optional-chained: `chrome.commands?.onCommand`). |
| `chrome.sidePanel.setOptions` / `.setPanelBehavior` | `background/index.ts` | **No Firefox equivalent** (see manifest table above) — already defensively optional-chained/try-caught for older Chrome, which incidentally means it silently no-ops on Firefix today rather than throwing, but the actual UX (open a panel on toolbar click) simply wouldn't work. |

No usage of `chrome.declarativeNetRequest`, `chrome.webRequest`,
`chrome.identity`, or other high-friction MV3 APIs that commonly cause
cross-browser pain — the API surface here is narrow and mostly benign.

## Effort / risk rating

- **Manifest + build**: Low risk, low effort. Adding a second manifest
  (or a build-time flag producing a Firefox variant with
  `browser_specific_settings.gecko.id` and a `background.scripts` fallback)
  is additive and wouldn't touch the Chrome manifest or existing tests.
- **Side panel → sidebar UX**: Medium effort, medium risk. This is a real
  feature redesign (`sidebar_action` has a persistent-panel model, not
  Chrome's on-demand per-tab enable/disable), not a shim — it touches
  `background/index.ts`'s `updateSidePanelForTab` and the action-click
  wiring, and needs its own tests/manual QA. This is the task's main cost
  driver.
- **Service worker background reliability on Firefox**: Medium risk,
  unknown until tested on a real Firefox build/version — flagged rather
  than estimated, since getting this wrong risks a background script that
  silently fails to wake for messages (would violate the zero-mutation /
  reliability bar this extension holds itself to).
- **Everything else** (`chrome.storage`, `chrome.runtime`, `chrome.tabs`,
  `chrome.scripting`): No gap — already Firefox-compatible as written.

## Why no code changes landed with this spike

Per the task notes, only a genuinely trivial, zero-risk manifest tweak was
in scope, and none qualified: every manifest-level change worth making
(`browser_specific_settings`, a Firefox-specific background block) only
makes sense paired with an actual Firefox build target and the side panel
redesign, which is out of scope for a timeboxed feasibility spike. Making
those changes now, unpaired with a real Firefox build/test, would add
manifest complexity with no verification that it works — worse than doing
nothing.

## Recommendation

Don't port now. Revisit if/when there's concrete user demand for Firefox;
at that point, scope a dedicated task covering: a Firefox manifest variant
(with `browser_specific_settings.gecko.id`), the sidebar_action redesign
replacing the side panel flow, a second `npm run package` target, and
manual QA on a real Firefox build (not just `about:debugging` temporary
load) to settle the service-worker-reliability question above.
