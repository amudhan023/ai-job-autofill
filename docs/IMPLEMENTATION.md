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
| Cover letter bytes stored locally + attached to "Cover Letter" file inputs | ✅ | `storage/resumeFile.ts` (`saveCoverLetterFile`), `options/Options.tsx` (`CoverLetterUploadSection`), `content/fillExecutor.ts` (`attachDocument`) |
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

### Custom answers for unmatched screening questions (2026-09-12)

Job-specific screening dropdowns ("Do you have 8+ years of professional
software engineering experience?", "Have you implemented LLM-based workflows
beyond simple prompt calls?") match no built-in rule, so nothing was written
even though the combobox writer handles the widget fine. A rule per question
doesn't scale — the questions change with every posting.

`UserProfile.customAnswers` is a user-edited list of `{ match, answer }` pairs
(Options → "Custom answers"). `evaluateField` consults it **before** the
blocklist and returns `ruleId: "customAnswer"` at 0.95 confidence with no
flags. Matching is case-insensitive substring on whitespace-normalized text
(`matchesQuestion` in `rules/engine.ts`) — not regex, because match text
routinely contains `8+`, `(e.g., OpenAI)` and `?`. First entry that matches
wins, so list order is priority order.

Ordering above the blocklist is deliberate: the blocklist stops the engine
from *inferring* values for sensitive fields (veteran status, disability), not
from using an answer the user typed for that exact question. EEO dropdowns
stay untouched unless the user opts in by writing one.

No write-path change was needed — `setComboboxValue`'s exact → startsWith →
includes option matching already turns "Yes" into "Yes, I am a veteran".

Second defect fixed in the same pass: `discover.isFillable()` now skips
`aria-hidden="true"` controls. react-select renders a hidden `requiredInput`
proxy (`tabindex=-1`, `opacity:0`) beside every combobox; `opacity` isn't
`display:none`, so it slipped through and surfaced as "(unlabeled)" rows in
the popup, one per dropdown, each a stray-write risk.

Tests: `rules/customAnswers.test.ts` (9), plus an `aria-hidden` case in
`adapters/discover.test.ts`.

### Claude fills the leftover unmatched fields (2026-09-12)

Custom answers (above) cover questions the user has seen before. Everything
else on a new posting — "What interests you about this team?", "How many years
with Kubernetes?", "When could you start?" — still ended a fill pass unwritten,
badged with an advisory AI category and nothing more.

`POST /ai/fill` closes that gap. The extension sends the fields the rule engine
left unanswered (id, label, control type, the page's own option list, maxlength)
plus a profile summary and the scraped JD; Claude answers through a **forced
tool call** (`fill_fields`, `strict: true`, `tool_choice` pinned to that tool),
so the reply is a schema-validated object, never prose to be parsed.
`services/llm.py::call_tool` gives the same shape to providers without native
tool use (Gemini, the test fakes) by asking for the schema as JSON text.

Three gates, all server-side except the last:

1. **Category denylist** (`classifier.is_llm_fillable`) drops `PERSONAL`,
   `VISA_WORK_AUTH`, `DIVERSITY` and `SALARY` *before the prompt is built* —
   those questions never reach the model at all. This is the server-side
   enforcement of "no LLM on structured fields": identity and work-authorization
   answers come from the deterministic engine or not at all, and a compensation
   number is the user's negotiating position, not a model's guess.
2. **Echo check** — a `field_id` the extension did not send is discarded.
3. **Closed set** — for a select or radio group the value must equal one of the
   options actually on the page (case-insensitive, snapped back to the page's
   exact text); over-length answers are dropped.

In the extension, `aiFillUnmatched` (`content/aiEnrich.ts`) writes only
suggestions at ≥ 0.7 confidence — the same `AUTOFILL_FLOOR` the rule engine
uses — and passes `skipIfFilled: true` to `writeValueToField`, so the automatic
pass keeps the never-clobber guarantee that the popup's explicit "AI draft"
button deliberately bypasses. A missing key, a timeout, or an unparseable reply
leaves the deterministic result exactly as it was.

Anthropic is now the documented default provider (`LLM_PROVIDER=anthropic` in
`.env.example`) and the stale date-suffixed model IDs were refreshed to the
current aliases (`claude-sonnet-5`, `claude-haiku-4-5`, `claude-opus-5`).
`FILL_MODEL` defaults to `claude-sonnet-5`.

Tests: `backend/tests/test_field_fill.py` (7), plus three `aiFillUnmatched`
cases in `extension/src/content/aiEnrich.test.ts`.

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

## Greenhouse screening-question rules (2026-09-11) — ✅ added

Taken from a live Greenhouse posting (Omada Health, job `8055515`). Six of its
questions matched no rule. They are a shape the taxonomy didn't cover: the
question states its own bar in the label, so the answer lives half in the
profile and half in the question text.

- `FieldRule.transform` now receives the discovered label as a second argument
  (`(value, label) => string`). Backward-compatible — the eight existing
  transforms ignore it.
- New rules in `rules/fieldRules.ts`:
  - `residesInUS` — "Do you currently live in the United States?" from
    `personal.location.country` (`countryToUsResidency`). Auto-fills.
  - `yearsExpThreshold` — "Do you have 5+ years of ... experience?" reads the
    threshold out of the label and compares it to `meta.totalYearsExp`
    (`yearsMeetsThreshold`). Auto-fills. Listed **before** `yearsExp`: both
    match "at least 3 years of experience", and `yearsExp` would write the raw
    number into a Yes/No dropdown.
  - `skillGate` — "Do you have hands-on experience with Terraform, Pulumi, or
    CDK?" answers from `skills.technical` vs. the technologies named in the
    question (`skillsMatchLabel`). Word-boundary matching with regex escaping,
    so `Go` doesn't hit "good" and `C++`/`.NET` still match. One overlap ⇒
    "Yes". **`confirm`-flagged** — a heuristic about the user's own
    qualifications, so the popup surfaces it and the executor never writes it.
    Listed **last** so it loses every same-signal tie to a specific rule.
  - `transgender` — new `demographics.transgender` field + Options select,
    `confirm`-flagged like the other EEO rules.
- Every new transform returns `""` (⇒ `null` ⇒ no fill) when the profile side
  is missing, rather than guessing. This matters most for `yearsExpThreshold`:
  `totalYearsExp` defaults to `0` and `hasValue(0)` is `true`, so without the
  guard an unset profile would answer "No" to every gate. Likewise `skillGate`
  never volunteers a "No" — zero overlap means *unknown*, since the question
  may name a technology the user simply never listed.
- Veteran status and disability on the same page stay hard-blocked by
  `BLOCKLIST_PATTERNS` — unchanged, and pinned by a test.

Coverage: `rules/engine.omada.test.ts` (the real question set),
`rules/transforms.test.ts`.

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
