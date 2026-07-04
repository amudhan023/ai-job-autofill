# AI Job Autofill — agent guide

Privacy-first Chrome MV3 extension that autofills job applications, with a
FastAPI backend for AI features. All planned phases (1–5) and universality
milestones (M1–M6) are **complete and tested** — do not re-scan the repo to
rediscover this. Remaining work lives in `docs/BACKLOG.md`.

## Read before working (in this order, only as needed)

1. `docs/BACKLOG.md` — what to do next (task statuses, dependencies, blockers)
2. `docs/OVERVIEW.md` — architecture at a glance
3. `docs/IMPLEMENTATION.md` — what's built, where, and key decisions
4. `docs/ARCHITECTURE_REVIEW.md` / `PLAN.md` — deep design rationale (rarely needed)

For autonomous development, invoke the `/autodev` skill — it defines the full
branch → implement → test → PR → CI → merge loop.

## Layout

- `extension/` — MV3 extension (React + Vite + TS). `src/rules/` deterministic
  field engine; `src/adapters/` discovery + DOM writers + platform hints;
  `src/content/` fill executor, sessions, AI enrich; `src/background/`,
  `src/popup/`, `src/options/`, `src/storage/`, `src/shared/`.
- `backend/` — FastAPI. `app/services/` (LLM behind injectable providers with
  fakes), `app/api/`, `app/models/`.
- `integration/` — dockerized extension↔backend E2E.

## Commands (run from the component dir)

- Extension: `npm run typecheck` · `npm run test` · `npm run build` ·
  `npm run test:e2e` (needs `npx playwright install chromium`) · `npm run test:all`
- Backend: `venv/bin/python -m pytest -q` (deps: `venv/bin/pip install -r requirements-dev.txt`)
- CI mirrors these: `.github/workflows/ci.yml` (extension, backend, integration jobs)

## Inviolable principles

- **Zero-mutation guarantee**: the extension fills, never submits. No code
  path may click submit. Fills dispatch native `input`/`change` events only.
- **No LLM on structured fields**: names/emails/work-auth come only from the
  rule engine; AI is advisory (classification badges) or free-text drafts.
- **Never-clobber**: existing user-entered values are never overwritten.
- **Local-first**: profile in `chrome.storage.local`; no upload without opt-in.
- React-controlled inputs are written via per-realm native value setters
  (`adapters/domFill.ts`) — extend, never rewrite, that layer.

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`).
- Extend existing modules over adding parallel ones; adapters are data
  entries in `adapters/platforms.ts` (`PLATFORM_HINTS`), not new classes.
- Every behavior change updates tests and, when user-visible,
  `docs/IMPLEMENTATION.md`.
- Keep diffs focused on the task; no drive-by refactors or reformatting.
