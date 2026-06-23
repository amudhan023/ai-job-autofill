# Docker-based Integration E2E

Validates the **extension ↔ backend** contract that the isolated unit/E2E suites
can't: a real FastAPI service (containerized) and the real built extension talking
to it over HTTP, including the CORS preflight from the `chrome-extension://`
origin.

## What it covers
- **`contract.spec.ts`** — every backend endpoint over real HTTP against the live
  container (`/health`, `/profile`, `/ai/classify|answer|jd|cover-letter`,
  `/jobs/rank`, `/resume/parse` incl. the 422 path). Runs in `USE_FAKE_AI` mode so
  AI responses are deterministic without API keys.
- **`extension-backend.spec.ts`** — the real built extension loaded in Chromium;
  its **service worker fetches the backend cross-origin**, exercising the CORS
  preflight + request path that a misconfigured backend would break.

## Run it

```bash
# From the repo root — builds both images, runs the suite, exits with its code.
docker compose -f integration/docker-compose.yml up --build \
  --abort-on-container-exit --exit-code-from e2e
```

Services:
- **backend** — built from `backend/Dockerfile`, `USE_FAKE_AI=1`, healthchecked.
- **e2e** — Playwright image; builds the extension and runs the integration specs
  against `http://backend:8000` on the compose network.

## Run against a local backend instead (faster dev loop)

```bash
# Terminal 1 — start the backend in fake-AI mode on a free port
cd backend && source venv/bin/activate
USE_FAKE_AI=1 uvicorn app.main:app --port 8090

# Terminal 2 — run the integration specs on the host
cd extension && npm run build
BACKEND_URL=http://127.0.0.1:8090 npm run test:integration
```

> Note: the default backend port 8000 may be taken by another local service —
> pick a free port and set `BACKEND_URL` accordingly. The Docker stack avoids this
> by running on an isolated network.

## Version pinning
`Dockerfile.e2e` pins the Playwright image (`v1.47.2-jammy`) to match
`@playwright/test` in `extension/package.json`. Bump both together.
