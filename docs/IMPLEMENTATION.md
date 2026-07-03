# Implementation Status & Decisions

Tracks what is actually built vs. the roadmap in [`PLAN.md`](../PLAN.md).

## Phase 1 (MVP foundation) — ✅ complete

| Area | Status | Location |
|---|---|---|
| Monorepo scaffold | ✅ | repo root |
| Updated plan (model IDs, embeddings) | ✅ | `PLAN.md` |
| Extension build (MV3 + Vite + React + TS) | ✅ | `extension/` |
| Shared types / profile schema | ✅ | `extension/src/shared/` |
| Rule engine + confidence scoring | ✅ | `extension/src/rules/` |
| ATS detection + adapters (GH/Lever/Ashby) | ✅ | `extension/src/adapters/` |
| Content script (detect + fill, never submit) | ✅ | `extension/src/content/` |
| Background worker + messaging | ✅ | `extension/src/background/` |
| Popup UI | ✅ | `extension/src/popup/` |
| Options (profile editor) + storage | ✅ | `extension/src/options/`, `storage/` |
| Application history (IndexedDB) | ✅ | `extension/src/storage/history.ts` |
| Backend skeleton (FastAPI) | ✅ | `backend/` |

## Phase 2 (ATS coverage expansion) — ✅ complete

| Area | Status | Location |
|---|---|---|
| Workday adapter (multi-step, automation-id) | ✅ | `extension/src/adapters/workday.ts` |
| iCIMS adapter (iframe-aware) | ✅ | `extension/src/adapters/icims.ts` |
| SmartRecruiters adapter | ✅ | `extension/src/adapters/smartrecruiters.ts` |
| BambooHR adapter | ✅ | `extension/src/adapters/bamboohr.ts` |
| Remote adapter config (hot-update + fallback) | ✅ | `extension/src/adapters/remoteConfig.ts` |
| `all_frames` content script (iCIMS iframe) | ✅ | `extension/src/manifest.json` |

## Universality M1 (universal form engine core) — ✅ complete (2026-07-02)

Design & full milestone plan: [`ARCHITECTURE_REVIEW.md`](./ARCHITECTURE_REVIEW.md).

| Area | Status | Location |
|---|---|---|
| Generic adapter fallback (any site with a form) | ✅ | `extension/src/adapters/generic.ts`, `registry.ts` |
| Multi-signal best-match scoring (replaces first-match-wins) | ✅ | `extension/src/rules/engine.ts`, `confidence.ts` |
| Signal extraction: autocomplete / name / id / nearby text | ✅ | `extension/src/adapters/discover.ts` |
| Alias-rich taxonomy + autocomplete tokens + new rules | ✅ | `extension/src/rules/fieldRules.ts` |
| Hardened blocklist (DOB, criminal history, license; word-boundaries; all direct signals) | ✅ | `extension/src/rules/fieldRules.ts`, `engine.ts` |
| On-demand injection on any site (activeTab + scripting, no `<all_urls>`) | ✅ | `extension/src/popup/Popup.tsx` |
| iframe-safe label resolution (`ownerDocument`) | ✅ | `extension/src/adapters/domFill.ts`, `discover.ts` |

Milestones M2–M6 (shadow DOM/iframe scan, custom widgets, profile schema
expansion, multi-page session state, AI classify fallback + answer cache,
file uploads) are specified in `ARCHITECTURE_REVIEW.md` §4 and not yet built.

## Universality M2 (deep reach) — ✅ complete (2026-07-02)

| Area | Status | Location |
|---|---|---|
| Deep scan: open shadow roots + same-origin iframes | ✅ | `extension/src/adapters/discover.ts` |
| Realm-safe element handling (tagName checks, per-realm native setters) | ✅ | `discover.ts`, `domFill.ts`, `fillExecutor.ts`, `types.ts` |
| ARIA combobox writer (type value, click matching role=option) | ✅ | `extension/src/adapters/domFill.ts` |
| Contenteditable / role=textbox discovery + writer | ✅ | `discover.ts`, `types.ts`, `domFill.ts` |
| Shadow-root-scoped label resolution | ✅ | `extension/src/adapters/domFill.ts` |
| Post-fill MutationObserver settle window (conditional fields) | ✅ | `extension/src/content/fillExecutor.ts` |

`detectAndFill` is now async: after a successful pass it watches the DOM for
~1.2 s (debounced, incremental — only never-seen elements are evaluated) so
conditional fields revealed by our own writes get filled in the same run.
Cross-origin iframes are covered by their own content-script instance
(`all_frames` + popup injection with `allFrames: true`); closed shadow roots
are unreachable by design.

## Universality M3 (profile depth) — ✅ complete (2026-07-02)

| Area | Status | Location |
|---|---|---|
| Schema: middle/preferred name, street + line 2, clearance, willing-to-travel, references | ✅ | `extension/src/shared/profile.ts` |
| Migration: stored profiles deep-merged with new defaults on load | ✅ | `shared/profile.ts` (`migrateProfile`), `storage/profile.ts` |
| Rules: preferredName (falls back to full name), middleName, street/street2, clearance, travel, reference name/email/phone/relationship/company | ✅ | `extension/src/rules/fieldRules.ts`, `transforms.ts` |
| Options UI: address fields, visa-type + remote-preference selects, clearance, travel/relocate checkboxes, references editor | ✅ | `extension/src/options/Options.tsx`, `Field.tsx` |
| Backend Pydantic mirror | ✅ | `backend/app/models/profile.py` |

Reference contact rules intentionally never fall back to the candidate's own
email/phone — an empty references list means those fields stay blank.

## Universality M4 (multi-page applications) — ✅ complete (2026-07-02)

| Area | Status | Location |
|---|---|---|
| Fill-session state (storage.session; origin+path scope; 30-min/10-pass bounds) | ✅ | `extension/src/content/fillSession.ts` |
| Never-clobber guard: existing values untouched; fills idempotent | ✅ | `extension/src/content/fillExecutor.ts` |
| SPA navigation watcher + page-load session resume | ✅ | `extension/src/content/index.ts` |
| Session progress in popup; auto-continue settings toggle | ✅ | `popup/Popup.tsx`, `options/Options.tsx`, `storage/settings.ts` |
| storage.session access for content scripts | ✅ | `extension/src/background/index.ts` |

Auto-continue only ever operates inside a session the user started by
clicking Autofill, is bounded, and inherits the zero-mutation guarantee.

## Universality M5 (AI assist) — ✅ complete (2026-07-03)

| Area | Status | Location |
|---|---|---|
| Batched unmatched-field classification (1 request/page, ≤15 fields, 2.5s budget) | ✅ | `extension/src/content/aiEnrich.ts`, `backend/app/api/ai.py` (`/ai/classify-batch`) |
| Advisory-only AI: `aiCategory` annotates matches, never assigns values | ✅ | `shared/types.ts`, `aiEnrich.ts` |
| Local answer cache (30-day TTL, 100 entries, normalized question keys) | ✅ | `extension/src/storage/answerCache.ts`, `background/index.ts` |
| "AI draft" flow: popup button → JD scrape → cache-first answer → written for review | ✅ | `popup/Popup.tsx`, `content/index.ts`, `content/fillExecutor.ts` (`writeValueToField`) |

Filling never depends on AI: enrichment is best-effort with a hard timeout,
and a missing/unreachable backend degrades to the deterministic result.

## Universality M6 (files & platform hints) — ✅ complete (2026-07-03)

| Area | Status | Location |
|---|---|---|
| Adapter classes → data-driven PLATFORM_HINTS + one HintedAdapter | ✅ | `extension/src/adapters/platforms.ts`, `registry.ts` (7 class files deleted) |
| Remote config hot-extends detection fingerprints (additive only) | ✅ | `platforms.ts` (`applyRemoteHints`), wired in `content/index.ts` |
| Resume bytes stored locally (5MB cap, base64 in storage.local) | ✅ | `extension/src/storage/resumeFile.ts`, saved on upload in `options/Options.tsx` |
| Resume attached to Resume/CV file inputs (DataTransfer + input/change for dropzones) | ✅ | `adapters/domFill.ts` (`setFileValue`), `content/fillExecutor.ts` |
| File inputs discoverable (incl. visually hidden behind styled dropzones) | ✅ | `adapters/discover.ts`, `types.ts` (`file` FieldType) |
| Synthetic framework corpus (MUI/Angular/placeholder/autocomplete/shadow) | ✅ | `extension/src/content/corpus.test.ts` |

Adding a new ATS platform is now a `PLATFORM_HINTS` data entry (or a remote
config push for detection tweaks) — no new code. This completes M1–M6.

## Testing — ✅ established (carried into all future phases)

| Layer | Tool | Location | Count |
|---|---|---|---|
| Unit (rules, dom, adapters, storage) | Vitest + jsdom | `extension/src/**/*.test.ts` | 60+ |
| UI/UX component (Popup, Options, Badge) | Testing Library | `extension/src/**/*.test.tsx` | 14 |
| End-to-end (real built extension in Chromium) | Playwright | `extension/e2e/` | 3 |
| Backend API | pytest + TestClient | `backend/tests/` | 6 |
| CI (all of the above) | GitHub Actions | `.github/workflows/ci.yml` | — |

See [`TESTING.md`](./TESTING.md) for the full strategy and commands.

## Phase 3 (AI answers) — ✅ implemented (behind injectable LLM)

| Area | Status | Location |
|---|---|---|
| LLM + embeddings provider abstraction (+ fakes) | ✅ | `backend/app/services/llm.py`, `fakes.py` |
| Resume parse (text extract → Claude → profile) | ✅ | `backend/app/services/resume.py` |
| JD extraction + skill gap | ✅ | `backend/app/services/jd.py` |
| Question classifier (LLM + keyword fallback) | ✅ | `backend/app/services/classifier.py` |
| In-memory RAG (chunk + cosine) | ✅ | `backend/app/services/rag.py` |
| STAR answer generation | ✅ | `backend/app/services/answers.py` |
| Extension backend client + AI proxy + JD scraper | ✅ | `extension/src/api/`, `content/jdScraper.ts` |

## Phase 4 (cover letters & polish) — ✅ implemented

| Area | Status | Location |
|---|---|---|
| Cover letter generation (Opus) + styles | ✅ | `backend/app/services/cover_letter.py` |
| Analytics dashboard (fill rate, AI assist, by platform) | ✅ | `extension/src/options/Dashboard.tsx`, `storage/analytics.ts` |
| Onboarding flow (welcome → resume → review) | ✅ | `extension/src/options/Onboarding.tsx` |
| Settings (AI backend URL) | ✅ | `extension/src/options/Options.tsx`, `storage/settings.ts` |
| Keyboard shortcut (Alt+Shift+F) | ✅ | `manifest.json` + `background/index.ts` |
| CWS launch docs (privacy, store listing) | ✅ | `docs/PRIVACY.md`, `docs/STORE_LISTING.md` |

## Phase 5 (agentic workflows) — ✅ implemented (human-in-the-loop)

| Area | Status | Location |
|---|---|---|
| Job-search provider interface + match scoring | ✅ | `backend/app/services/job_search.py` |
| "Apply to N" orchestration state machine | ✅ | `backend/app/services/orchestration.py` |
| Job ranking endpoint | ✅ | `backend/app/api/jobs.py` |

**Zero-mutation upheld at the orchestration layer**: the planner halts every
application at `AWAIT_USER_REVIEW`; only explicit user approval reaches
`SUBMITTED_BY_USER`. There is no automated edge to submission.

## Key decisions

- **Zero-mutation guarantee** is enforced in the content script: it has no code path
  that clicks submit buttons. Fills dispatch native `input`/`change` events only.
- **React-safe value setting**: inputs are set via the native value setter
  (`Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set`)
  then a dispatched `InputEvent`, so React/controlled inputs register the change.
- **Confidence model** lives entirely client-side for Phase 1 (no AI). Structured
  fields are deterministic; free-text fields are detected and flagged `ai_generate`
  but left for the user (AI generation lands in Phase 3).
- **Embeddings = Voyage AI** (`voyage-3.5-lite`) to honor the "no OpenAI on primary
  path" principle. See `PLAN.md` changelog.
- **Model IDs**: cover-letter model corrected to `claude-opus-4-8`.

## Requires keys / infra to go live (logic is built + tested with fakes)
- **Live LLM/embeddings**: set `ANTHROPIC_API_KEY` (+ `VOYAGE_API_KEY`) to switch
  the injectable providers from stub → real. All service logic is unit-tested
  with `FakeLLM`/`FakeEmbeddings`; live calls are the only untested edge.
- **Persistence**: profile store and RAG are in-memory; swap for Postgres +
  pgvector (storage concern only — interfaces are stable).
- **Auth0, real job-board APIs (LinkedIn/Indeed)**: plug concrete `JobProvider`
  implementations behind the existing interface; needs partner credentials.
- **Real resume binary parsing**: `pdfminer.six` / `python-docx` are wired and
  imported lazily; exercised via text-level unit tests.

## How to verify
- Extension: `cd extension && npm install && npm run test:all`
  (typecheck → unit/component → build → e2e). Requires `npx playwright install chromium`.
- Backend: `cd backend && pip install -r requirements-dev.txt && python -m pytest -q`.
