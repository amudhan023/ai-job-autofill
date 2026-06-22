# Implementation Status & Decisions

Tracks what is actually built vs. the roadmap in [`PLAN.md`](../PLAN.md).

## Phase 1 (MVP foundation) — in progress

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
- Resume parsing pipeline, JD extraction, RAG, AI answer generation (Phase 3).
- Workday / iCIMS / additional adapters (Phase 2).
- Backend persistence (Postgres/pgvector), Auth0, real AI orchestration — currently
  stubbed with in-memory/echo behavior so the service runs end-to-end.

## How to verify
- Extension: `cd extension && npm install && npm run typecheck && npm run build`.
- Backend: `cd backend && pip install -r requirements.txt && python -c "import app.main"`.
