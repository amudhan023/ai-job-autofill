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
