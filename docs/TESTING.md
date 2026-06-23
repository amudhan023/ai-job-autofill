# Testing Strategy

Testing is a first-class concern across every phase. The pyramid:

```
        ┌─────────────────────────┐
        │  E2E (Playwright)       │  real extension in Chromium, fixture ATS pages
        ├─────────────────────────┤
        │  Component / UI-UX      │  Testing Library + jsdom (Popup, Options, Badge)
        ├─────────────────────────┤
        │  Unit                   │  rules, confidence, dom fill, adapters, storage
        └─────────────────────────┘
   + Backend API tests (pytest) + CI running all of it
```

## Layers

### 1. Unit (Vitest + jsdom)
Pure logic and DOM helpers, fast and deterministic.
- `src/rules/` — rule matching, confidence math, profile-path resolution, blocklist.
- `src/adapters/` — detection scoring, field discovery, native-setter DOM fill,
  remote-config fallback/refresh.
- `src/storage/` — URL→company parsing.

### 2. Component / UI-UX (Testing Library)
Renders real React components against a mocked `chrome.*` API
(`src/test/chromeMock.ts`).
- **Popup** — ATS detection display, enabled/disabled fill button, fill summary,
  "needs attention" count, the never-submit assurance, opening options.
- **Options** — hydration, accessible labels (`getByLabelText`), local-only
  privacy copy, editing + persisting to storage, array-field creation.
- **ConfidenceBadge** — tier → marker/colour mapping, reason+percentage tooltip,
  blocklist coercion to the low marker.

UX assertions deliberately include accessibility (labelled inputs) and the
trust-building copy ("we only fill — never submit"), since those are core to the
product's differentiation.

### 3. End-to-end (Playwright)
Loads the **actual built extension** (`dist/`) into a persistent Chromium
context and exercises the real production path:
`manifest match → content script → detection → rule engine → DOM fill`.
- Fixtures in `e2e/fixtures/` are served on `localhost` (matched by the manifest).
- A profile is seeded via the service worker; fill is triggered through it.
- Asserts: structured fields filled correctly, work-auth radio selected,
  sensitive (SSN) / confirm-gated (salary) / AI free-text (cover letter) skipped,
  and the form is **never submitted**.

### 4. Backend (pytest + FastAPI TestClient)
Health/model-id contract, profile CRUD round-trip, 404s, stubbed AI/resume
endpoints, plus regression tests for issues found in integration (CORS origin
regex, resume 422, fake-AI mode).

### 5. Docker integration E2E (the cross-process layer)
A live backend **container** + the real built extension driven by Playwright —
the only layer that exercises the extension↔backend contract over real HTTP,
including the `chrome-extension://` CORS preflight. Runs in `USE_FAKE_AI` mode for
deterministic AI. See [`integration/README.md`](../integration/README.md).

```bash
docker compose -f integration/docker-compose.yml up --build \
  --abort-on-container-exit --exit-code-from e2e
```

## Commands

```bash
# Extension
cd extension
npm run typecheck          # tsc --noEmit
npm run test               # unit + component (Vitest)
npm run test:coverage      # + coverage report
npm run build              # production bundle → dist/
npx playwright install chromium   # once
npm run test:e2e           # Playwright E2E
npm run test:all           # typecheck → unit → build → e2e

# Backend
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
```

## CI
`.github/workflows/ci.yml` runs two jobs on every push/PR to `main`:
- **extension** — typecheck, unit/component, build, install Chromium, E2E
  (uploads the Playwright report on failure).
- **backend** — pytest.

## Conventions
- Co-locate unit/component tests next to source (`*.test.ts(x)`); E2E lives in `e2e/`.
- Detection tests use DOM fixtures that clear the 70 threshold **without** relying
  on jsdom's fixed `location`, so they're stable and hostname-independent.
- Every new adapter ships with a detection test; every new rule with an engine test.
