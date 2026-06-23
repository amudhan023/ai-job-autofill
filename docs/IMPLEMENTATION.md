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

## Not yet built (later phases)
- **Phase 3** — Resume parsing pipeline, JD extraction, RAG, AI answer generation.
  Backend services are scaffolded and stubbed (`backend/app/services/`).
- **Phase 4** — Cover letters (Opus), analytics dashboard, onboarding, CWS launch.
- **Phase 5** — Multi-tab agentic orchestration, job-search integration.
- Backend persistence (Postgres/pgvector), Auth0, real AI orchestration — currently
  stubbed with in-memory behavior so the service runs end-to-end.

## How to verify
- Extension: `cd extension && npm install && npm run test:all`
  (typecheck → unit/component → build → e2e). Requires `npx playwright install chromium`.
- Backend: `cd backend && pip install -r requirements-dev.txt && python -m pytest -q`.
