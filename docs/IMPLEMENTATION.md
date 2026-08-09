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

### Perf regression guard (T8, 2026-07-05)

`extension/src/content/corpus.perf.test.ts` runs the full detect → evaluate
→ write pipeline (`detectAndFill`) 25x over the six synthetic corpus fixtures
(150 passes) and asserts total wall time stays under a generous 100ms/pass
budget (~75x local headroom — observed runs land under 5ms/pass). Purely a
regression guard for an accidental algorithmic blowup (e.g. O(n²) DOM walk),
not a tight perf target; runs in CI as part of the normal `npm run test`
suite, no separate bench command needed.

### Formatting policy (T9, 2026-07-05)

Prettier (`extension/`, `npm run format` / `format:check`) and `ruff format`
(`backend/`, `ruff format` / `ruff format --check`) are the enforced
formatters, both gated in CI (`--check` steps). The one-time repo-wide
reformat landed as dedicated commits; those SHAs are listed in
`.git-blame-ignore-revs` at the repo root — run
`git config blame.ignoreRevsFile .git-blame-ignore-revs` once per clone to
have `git blame` skip them.

### i18n field taxonomy (T10, 2026-07-05)

`extension/src/rules/fieldRules.ts` gained Spanish/German/French label alias
patterns for most rules (name/contact/location/experience/skills/preferences/
work-auth/education/resume/cover-letter) — additive regex entries on the
existing `patterns` arrays, no new rule ids or matching logic. Still fully
rule-engine-only (no LLM on structured fields). US-specific concepts
(`usAuthorized`, `clearance`) are left English-only since they don't
localize. Covered by `extension/src/rules/i18n.test.ts` (rule-matching per
language) and `extension/src/content/corpus.i18n.test.ts` (full
detect-and-fill corpus fixtures per language, mirroring `corpus.test.ts`).

### Profile import/export (T11, 2026-07-05)

`extension/src/storage/profile.ts` gained `exportProfileJson` (pretty-printed
JSON of the current `UserProfile`) and `importProfileJson` (parses + runs the
result through the existing `migrateProfile` schema-migration path, so an
older export still backfills newly-added fields the same way a stored profile
does). Wired into the Options "Settings" tab as a "Profile data" section:
an "Export profile (JSON)" button downloads the file client-side (Blob +
`URL.createObjectURL`, no server involved), and "Import profile…" reads a
chosen file, asks for confirmation since it replaces the whole profile, then
persists it via the existing `useProfileStore`. Covered by
`extension/src/storage/profile.test.ts` (round-trip, migration backfill,
invalid-input errors) and new cases in `extension/src/options/Options.test.tsx`
(export triggers a download, import persists/rejects/cancels).

### RAG-backed answers for unmatched free-text questions (T13, 2026-07-25)

Free-text `textarea` fields that don't match any of the 5 predefined
AI-eligible rules (`coverLetter`, `whyCompany`, `aboutYou`, `behavioral`,
`describeExperience`) previously dead-ended with "no matching rule — needs
attention" and got no AI treatment at all. `extension/src/rules/engine.ts`'s
unmatched branch now flags any unmatched `textarea` as `ai_generate` too, so
the existing "AI Draft" button path (`AI_DRAFT_FIELD` → `REQUEST_AI_ANSWER` →
`/ai/answer`) becomes available — no new UI, no auto-submit.

Separately, the RAG retrieval corpus is no longer only the ephemeral,
per-request resume chunks: a user-curated knowledge base can now be pasted
into a new "Knowledge base" textarea on the Options page
(`extension/src/options/KnowledgeBase.tsx`), backed by a persisted corpus on
the backend:

- `backend/app/services/db.py`: `RagChunkRecord.vector` now uses a
  `PortableVector(TypeDecorator)` — a real `pgvector.sqlalchemy.Vector` column
  on Postgres (lazy-imported), the same `struct.pack`/`unpack` blob encoding
  as before on SQLite (no behavior change for the SQLite dev default).
  `RagChunkStore` gained `replace()` (atomic whole-corpus overwrite) and
  `search()` (real SQL `cosine_distance` ORDER BY/LIMIT on Postgres; falls
  back to the existing Python `cosine()` loop on SQLite).
- `backend/app/services/rag.py`: `search_persisted()`/`replace_documents()`
  wrap the above for a fixed `DEFAULT_USER_ID = "local"` (single fixed
  identity — no multi-user auth, matching this being a personal, local-first
  tool).
- `backend/app/api/ai.py`: `GET`/`PUT /ai/documents` read/replace the
  persisted corpus; `/ai/answer` merges persisted-corpus chunks with the
  ephemeral resume chunks before generation (`answers.generate()`'s new
  `doc_chunks` param).
- `extension/src/api/client.ts`: `BackendClient.getDocuments()`/
  `saveDocuments()`.
- Ubuntu deployment: `deploy/docker-compose.yml` (`pgvector/pgvector:pg16` +
  the existing `backend/Dockerfile`) + `deploy/README.md` — the Mac-side
  extension points its existing Settings → Backend URL at that host.

The real Postgres SQL search path (`cosine_distance`) isn't exercised in CI
(no Postgres service there) — same lazy, untested-until-configured posture
the live AI provider code already has (B1).

`deploy/docker-compose.yml` publishes the backend on host port `${BACKEND_PORT:-8000}`
(container port stays 8000) — set `BACKEND_PORT` in `deploy/.env` if 8000 is
already taken on the deployment host.

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
| RAG (ephemeral resume chunks + persisted knowledge-base corpus; real pgvector SQL search when `DATABASE_URL` is Postgres, T13) | ✅ | `backend/app/services/rag.py`, `db.py` |
| STAR answer generation | ✅ | `backend/app/services/answers.py` |
| Extension backend client + AI proxy + JD scraper | ✅ | `extension/src/api/`, `content/jdScraper.ts` |

## Phase 4 (cover letters & polish) — ✅ implemented

| Area | Status | Location |
|---|---|---|
| Cover letter generation (Opus) + styles, end-to-end from the popup (T7) | ✅ | `backend/app/services/cover_letter.py`, `extension/src/popup/Popup.tsx` (`CoverLetterButton`), `content/index.ts` (`draftCoverLetter`), `background/index.ts` (`REQUEST_COVER_LETTER`) |
| Analytics dashboard (fill rate, AI assist, by platform) | ✅ | `extension/src/options/Dashboard.tsx`, `storage/analytics.ts` |
| Onboarding flow (welcome → resume → review) | ✅ | `extension/src/options/Onboarding.tsx` |
| Settings (AI backend URL, connection test) | ✅ | `extension/src/options/Options.tsx`, `storage/settings.ts` |
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
- **Backend-unreachable UX**: `BackendClient` (`extension/src/api/client.ts`) retries
  once, with a short backoff, on a raw network error or a 5xx — never on a timeout
  (retrying a slow backend would just double the wait) or a 4xx (retrying a client
  error can't help). `getBackendClient()` now shares `loadBackendUrl()`'s zero-config
  `localhost:8000` default, so AI features and resume-parse behave consistently when
  nothing's been configured. Settings has a "Test connection" button
  (`checkBackendHealth`, hits `/health`). AI failures are always inline/non-blocking
  (`AiDraftButton`'s error state, resume-upload's connection-error copy) and never
  degrade or delay deterministic fill beyond `aiEnrich`'s fixed 2.5s budget.

## Live AI provider (B1, 2026-07-06) — ✅ active

`backend/.env` (local, gitignored) is configured with `GEMINI_API_KEY`,
`LLM_PROVIDER=gemini`, `EMBEDDINGS_PROVIDER=gemini`. On startup `get_llm()`
returns `GeminiLLM` (model: `gemini-2.0-flash`, via `GEMINI_MODEL`) and
`get_embeddings()` returns `GeminiEmbeddings` (model:
`models/gemini-embedding-001`, via `GEMINI_EMBEDDING_MODEL`, 3072-dim — must
match `EMBEDDING_DIM`). All AI endpoints
(`/ai/classify-batch`, `/resume/parse`, `/qa/answer`, `/cover-letter/generate`,
etc.) now call real Gemini instead of the deterministic fake.

To switch providers: update `LLM_PROVIDER` / `EMBEDDINGS_PROVIDER` in `.env`
and restart the server. See `backend/.env.example` for all options.

## Ashby button-driven Yes/No toggles (2026-08-09) — ✅ fixed

Live-site debugging on `jobs.ashbyhq.com` (Headway application form) found
work-authorization/visa-sponsorship questions silently unfilled. Root cause:
Ashby renders these as two plain `<button>` elements ("Yes"/"No") next to a
`display:none` checkbox that only mirrors state — clicking a button is what
actually drives React state; setting `.checked` + dispatching `input`/`change`
on the hidden input does nothing (verified live: button never gets the
`_active_` class).

Two-part fix, both root-caused to the shared layer so every caller benefits:
- `adapters/discover.ts` `isFillable()`: a hidden radio/checkbox is still
  discoverable when it has sibling `<button>` elements (the toggle relay
  pattern), not just when it's a file input.
- `adapters/domFill.ts` `setRadioOrCheckbox()`: tries clicking a sibling
  `<button>` whose text matches the desired value before falling back to the
  native `.checked` path.
- `rules/engine.ts` `isCompatibleType()`: a single-checkbox "group" (how this
  pattern gets discovered) no longer loses confidence against `radio`-typed
  rules — it was scoring 0.6 (below the 0.7 auto-fill floor) even after
  discovery/write were fixed.

Regression coverage: `adapters/domFill.test.ts`, `adapters/discover.test.ts`,
`rules/engine.test.ts`.

## Requires keys / infra to go live (remaining)
- **Auth0, real job-board APIs (LinkedIn/Indeed)**: plug concrete `JobProvider`
- **Persistence**: profile store (`backend/app/services/db.py`) is SQLite by
  default (zero-infra — `DATABASE_URL=sqlite:///./data/app.db`). RAG's
  `VectorStore` gains the same SQLAlchemy backing as an opt-in (construct with
  `user_id=...` to persist across requests; every existing call site omits it
  and stays purely in-memory/ephemeral, unchanged). Postgres/pgvector is
  opt-in via `DATABASE_URL` — same interfaces, install a Postgres driver.
- **Auth0, real job-board APIs (LinkedIn/Indeed)**: plug concrete `JobProvider`
  implementations behind the existing interface; needs partner credentials.
- **Real resume binary parsing**: `pdfminer.six` / `python-docx` are wired and
  imported lazily; exercised via text-level unit tests.

## How to verify
- Extension: `cd extension && npm install && npm run test:all`
  (typecheck → unit/component → build → e2e). Requires `npx playwright install chromium`.
- Backend: `cd backend && pip install -r requirements-dev.txt && python -m pytest -q`.
