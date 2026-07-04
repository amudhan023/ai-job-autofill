# Development Backlog

Source of truth for the autonomous development loop (`/autodev`). One task per
row; the loop picks the highest-priority `ready` task whose dependencies are
all `done`, implements it on a feature branch, and merges via PR once CI is
green. Update the Status column in the same PR that completes the task.

**Statuses:** `ready` · `in-progress` · `done` · `blocked(<reason>)`

Completed history lives in [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) — do not
re-add finished phase/milestone work here.

## P0 — quality gates & release infrastructure

| ID | Task | Depends on | Status | Notes |
|----|------|-----------|--------|-------|
| T1 | **Lint gates**: ESLint (flat config, typescript-eslint) for `extension/` with `npm run lint`; ruff (`ruff check`) for `backend/`; both added as CI steps. Fix (or narrowly suppress with justification) existing violations. No repo-wide reformat — formatting policy is T9. | — | done (PR #2, 2026-07-04) | Foundation for all later autonomous merges. |
| T2 | **Release packaging**: `npm run package` script that builds and zips `extension/dist` with a version stamp for Chrome Web Store upload; CI uploads the zip as an artifact on main. | T1 | ready | Keep manifest/package versions in sync (single source). |
| T3 | **Coverage reporting in CI**: run `vitest --coverage` and `pytest --cov` in CI, publish summaries; add a modest fail-under floor (e.g. 70%) to prevent regression, not to chase 100%. | T1 | ready | Thresholds must pass on current code as-is. |

## P1 — product hardening

| ID | Task | Depends on | Status | Notes |
|----|------|-----------|--------|-------|
| T4 | **Backend persistence**: swap in-memory profile store + RAG index for SQLite via SQLAlchemy behind the existing interfaces (default, zero-infra); Postgres/pgvector as opt-in via `DATABASE_URL`. No interface changes. | T1 | ready | IMPLEMENTATION.md lists this as the known storage gap. |
| T5 | **E2E coverage expansion**: Playwright specs for (a) multi-page fill session auto-continue, (b) resume auto-attach to a file input, (c) AI-draft flow against a stubbed backend. | T1 | ready | Only 3 E2E specs exist today; these are the highest-risk untested flows. |
| T6 | **Backend-unreachable UX**: audit popup/options flows for a down or misconfigured backend; ensure clear non-blocking messaging and that deterministic fill is never degraded. Add retry/backoff to `extension/src/api/` client if missing. | — | ready | Verify current behavior first — parts may already exist. |
| T7 | **Cover-letter UX audit**: backend `cover_letter.py` service exists — verify the extension exposes generation end-to-end (options or popup), complete the UI if missing, with tests. | — | ready | Verification-first task: may be partially done. |
| T8 | **Perf benchmarks**: scan/fill timing over the synthetic corpus (`content/corpus.test.ts` fixtures); assert a generous budget in a vitest bench/test so regressions surface in CI. | T1 | ready | Planned in M6 (ARCHITECTURE_REVIEW §4); corpus landed, benchmarks did not. |

## P2 — enhancements

| ID | Task | Depends on | Status | Notes |
|----|------|-----------|--------|-------|
| T9 | **Formatting policy**: adopt Prettier (extension) + ruff-format (backend) in a single dedicated reformat PR with `.git-blame-ignore-revs`; add `--check` to CI. | T1 | ready | Deliberately separate from T1 to keep that diff reviewable. |
| T10 | **i18n field taxonomy**: add non-English label aliases (start: Spanish, German, French) to `rules/fieldRules.ts` with corpus fixtures per language. | — | ready | Aliases are data — low-risk, high-reach. |
| T11 | **Options profile import/export**: JSON export/import of the local profile (privacy story: user owns their data; also enables backup/migration). | — | ready | Local-only; no server involvement. |
| T12 | **Firefox (MV3) feasibility spike**: assess manifest + `chrome.*`→`browser.*` gaps; document findings in docs/, no port unless trivial. | — | ready | Timebox; outcome is a doc, not necessarily code. |

## Blocked — needs credentials / human decisions (do not attempt)

| ID | Task | Blocker |
|----|------|---------|
| B1 | Live LLM/embeddings (swap fakes → real providers) | `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` from user |
| B2 | Auth0 integration | Auth0 tenant + credentials |
| B3 | Real job-board providers (LinkedIn/Indeed) behind `JobProvider` | Partner API credentials |
| B4 | Chrome Web Store publication | Developer account, listing assets sign-off |
| B5 | Postgres/pgvector managed infra | Hosting decision + credentials (T4's SQLite default is not blocked) |

## Prioritization rules

1. Lower P number first; within a band, top row first.
2. A task is *ready* only if every dependency is `done`.
3. If a task turns out to be unsafe or under-specified mid-flight, set
   `blocked(<reason>)`, leave the branch unmerged, and move to the next ready
   task — never guess through ambiguity that risks the zero-mutation
   guarantee or existing behavior.
