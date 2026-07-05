---
name: autodev
description: Autonomous development loop for ai-job-autofill. Reads docs/BACKLOG.md, picks the highest-priority ready task, implements it on a feature branch, tests it, opens a PR, self-reviews it, waits for CI, fixes failures, and auto-merges once green — then repeats with the next ready task until the backlog is empty or blocked. Use when asked to "run autodev", "work through the backlog", "continue autonomous development", or "/autodev".
---

# Autodev

Continuous branch → implement → test → PR → review → CI → merge loop for this
repo. One invocation processes the *entire* backlog, one task at a time, until
no `ready` task remains or the loop hits a stop condition. This skill has full
authority to push branches, open PRs, and **squash-merge to `main` without
waiting for human approval**, as long as every gate below stays green — that
authority was explicitly granted by the user; do not ask for per-PR
confirmation.

Read `CLAUDE.md` first if it isn't already in context — the inviolable
principles there (zero-mutation, no-LLM-on-structured-fields, never-clobber)
are hard constraints on every task, not suggestions.

## Outer loop

The outer loop stays thin on purpose: it never runs the per-task workflow
itself. Each task's full implement → test → PR → review → CI → merge cycle
runs inside a **fresh subagent** (Agent tool, default/general-purpose type —
never `subagent_type: "fork"`, since a fork inherits this session's
accumulated context, which is exactly what this is meant to avoid). That
keeps this orchestrating session's context flat across the whole backlog
instead of accumulating every prior task's diffs, tool output, and CI logs.

Per iteration:

1. Sync `main` and parse `docs/BACKLOG.md` fresh (see Task selection) — don't
   trust a stale in-memory copy, status may have changed from a prior
   iteration's merge.
2. Pick the next eligible task.
3. Spawn one fresh Agent whose prompt is self-contained: the task id and
   one-line summary from the backlog row, an instruction to read `CLAUDE.md`
   and this file's **Per-task workflow** section, and to execute steps 1–12
   there verbatim for that task. Ask it to report back only the outcome
   (merged PR number, or `blocked(<reason>)`) — not a blow-by-blow of what it
   did.
4. Record that outcome in this session's running summary. Do not read the
   subagent's transcript or tool output back into this session beyond its
   final report.
5. Check the stop conditions below; if none are hit, go back to step 1.

Stop conditions — report a summary and end the skill when:

- `docs/BACKLOG.md` has no row with Status `ready` whose every `Depends on`
  task is `done`.
- The task just attempted had to be marked `blocked(<reason>)` and no other
  ready task remains.
- The same task fails CI (or review) after 3 fix-and-repush rounds — the
  subagent should mark it `blocked(ci-unresolved: <short reason>)`, leave its
  branch/PR open for a human, and report that back rather than retrying
  further; continue to the next ready task.
- A task turns out to require something the guardrails forbid (large
  refactor, touching a Blocked-table item's credentials, ambiguity that risks
  zero-mutation/never-clobber) — the subagent should mark `blocked(<reason>)`
  rather than guess, and report that back.

## Task selection

1. Sync `main`: `git checkout main && git pull origin main`.
2. Parse `docs/BACKLOG.md`. Eligible = Status `ready` AND every ID in
   `Depends on` has Status `done`.
3. Among eligible rows, pick lowest P-number table first (P0 > P1 > P2), and
   within a table, the topmost row.
4. Never pick a row from the "Blocked — needs credentials / human decisions"
   table.
5. If the note on a task says "Verify current behavior first — parts may
   already exist" or similar, spend the first step of implementation
   actually checking that before writing new code — do not duplicate
   existing functionality (guardrail).

## Per-task workflow

Runs inside the spawned subagent (see Outer loop) — the subagent starts with
no memory of prior tasks, so it must read `CLAUDE.md` and the specific task's
backlog row itself before starting.

### 1. Mark in-progress
Edit the task's Status cell in `docs/BACKLOG.md` to `in-progress` as the
first commit on the new branch (not a direct push to `main`).

### 2. Branch
`git checkout -b autodev/<task-id>-<short-slug>` off up-to-date `main`, e.g.
`autodev/t2-release-packaging`.

### 3. Implement
- Extend existing modules per `CLAUDE.md` conventions (e.g. new adapters go
  into `PLATFORM_HINTS` in `extension/src/adapters/platforms.ts`, not new
  classes).
- Keep the diff scoped to exactly this task. No drive-by refactors,
  reformatting, or touching unrelated files.
- Respect the inviolable principles verbatim — if a task's obvious
  implementation would require clicking submit, bypassing the rule engine
  for structured fields, or overwriting user-entered values, stop and mark
  `blocked(guardrail-conflict)` instead of proceeding.

### 4. Tests
Add or update tests for every behavior change (per `CLAUDE.md`). Match the
existing test style in the touched area (Vitest for extension unit/component,
Playwright for e2e, pytest for backend).

### 5. Local gates (must be clean before opening a PR)
Run whichever apply to the touched component(s):

```bash
# extension/ changes
cd extension && npm run typecheck && npm run test && npm run build
# if the task touches user-facing flows or adapters, also:
npx playwright install chromium   # first run only
npm run test:e2e

# backend/ changes
cd backend && venv/bin/python -m pytest -q

# changes touching both extension and backend contracts
docker compose -f integration/docker-compose.yml up --build \
  --abort-on-container-exit --exit-code-from e2e
```

Fix any failure locally before proceeding — never open a PR on red local
gates, and never delete/skip/weaken a test or check to force green.

### 6. Docs
If the change is user-visible, update `docs/IMPLEMENTATION.md` in the same
branch (per `CLAUDE.md`). Set this task's `docs/BACKLOG.md` row to
`done (PR #<n>, <YYYY-MM-DD>)` — the PR number isn't known until step 8, so
this edit lands as a follow-up commit on the same branch right after the PR
is opened.

### 7. Commit
Conventional commit style (`feat:`, `fix:`, `docs:`, `test:`), matching
`git log` phrasing in this repo. Small, focused commits are fine; squash
happens at merge time anyway.

### 8. Open PR
```bash
git push -u origin autodev/<task-id>-<short-slug>
gh pr create --title "<type>: <task summary>" --body "$(cat <<'EOF'
## Summary
- <what changed and why, tying back to the backlog task ID>

## Test plan
- [ ] <gates run in step 5, checked off>
EOF
)"
```
Then push the `docs/BACKLOG.md` `done (PR #<n>, ...)` update from step 6 as
an additional commit to the same branch/PR.

### 9. Self-review
Invoke the `code-review` skill (equivalent to `/code-review high`) against
the PR diff. Treat CONFIRMED findings as blocking: fix them, push a new
commit, and re-run the step-5 gates for anything touched by the fix. Use
judgment on PLAUSIBLE findings — fix if cheap and clearly in-scope, otherwise
leave a one-line rationale in the PR description for why it's out of scope.

### 10. Wait for CI
```bash
gh pr checks <PR-number> --watch --interval 30
```
Run this via Bash with `run_in_background: true` if it risks exceeding a
single tool timeout (the integration Docker job is the slow one), and use
Monitor to await completion rather than polling manually.

### 11. Fix CI failures
If a check fails: `gh run view <run-id> --log-failed` to find the root
cause, fix it locally (never `--no-verify`, never disable/skip the failing
check, never weaken a threshold to pass), push, and return to step 10. Count
attempts — after 3 rounds on the same task, stop and mark it blocked (see
Outer loop stop conditions).

### 12. Merge
Once every required check is green:
```bash
gh pr merge <PR-number> --squash --delete-branch
```
Then `git checkout main && git pull origin main` to leave the working tree
clean on `main` for whatever runs next.

### 13. Report back
This is the subagent's last step — it ends here. Return a short report to the
orchestrator: the outcome (merged PR number, or `blocked(<reason>)`) and
anything the next iteration needs to know (e.g. a follow-on task it noticed).
Do not continue to another task inside this same subagent — the orchestrator
spawns a new one for that (see Outer loop).

## Guardrails (hard constraints, not suggestions)

- Zero-mutation guarantee: no code path may click submit; fills stay
  `input`/`change` events only.
- No LLM on structured fields (name/email/work-auth stay rule-engine-only).
- Never-clobber: existing user-entered values are never overwritten.
- Never skip, delete, or weaken a test/lint/type/coverage gate to reach
  green — fix the underlying issue.
- Never force-push, never rewrite `main` history, never merge on red CI.
- No large-scale refactors or reformatting unless the task itself is
  explicitly that (e.g. T9's formatting-policy task).
- Keep every diff scoped to its one backlog task — no unrelated file
  touches.
- Don't create duplicate implementations of something that already exists;
  verification-flagged tasks (T6, T7) require checking current behavior
  before writing new code.
- If a task is ambiguous or unsafe, `blocked(<reason>)` beats a guess.

## Token efficiency

- Run each task in its own fresh subagent (see Outer loop) so the
  orchestrating session's context doesn't accumulate diffs, tool output, and
  CI logs across the whole backlog — that's the main lever here, bigger than
  any of the points below.
- Don't re-scan the whole repo each iteration — `docs/BACKLOG.md` +
  `docs/IMPLEMENTATION.md` + the files the current task touches is enough
  context.
- Reuse the `code-review` and `verify` skills rather than reinventing review
  or manual-QA steps.
- Don't regenerate `docs/OVERVIEW.md` or `docs/ARCHITECTURE_REVIEW.md`
  content that hasn't changed.

## End-of-run report

When the loop stops, summarize: tasks merged (with PR links), tasks blocked
(with reasons), and what's next-ready in the backlog for a human or the next
`/autodev` invocation.
