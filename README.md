# AI Job Autofill

A privacy-first Chrome extension (MV3) that autofills job applications across ATS
platforms. **Deterministic first** (zero hallucinations on structured fields),
**AI-assisted** for free-text answers, with **transparent confidence scoring**
that keeps the user in control.

> Full product & architecture spec: [`PLAN.md`](./PLAN.md).
> Implementation status & decisions: [`docs/IMPLEMENTATION.md`](./docs/IMPLEMENTATION.md).

## Monorepo layout

```
ai-job-autofill/
├── extension/     # Chrome MV3 extension (React + Vite + TypeScript)
│   └── src/
│       ├── shared/     # types shared across all contexts
│       ├── rules/      # deterministic field rule engine + confidence
│       ├── adapters/   # ATS detection + per-platform adapters
│       ├── content/    # content script (DOM detect + fill, never submit)
│       ├── background/ # MV3 service worker (orchestration, messaging)
│       ├── popup/      # popup UI (trigger fill, per-field status)
│       ├── options/    # options page (profile editor, settings)
│       └── storage/    # chrome.storage + IndexedDB helpers
└── backend/       # FastAPI services (profile, resume parse, AI orchestration)
    └── app/
```

## Quick start — extension

```bash
cd extension
npm install
npm run build      # outputs dist/ (load unpacked in chrome://extensions)
npm run typecheck  # tsc --noEmit
npm run dev        # watch build

# Tests
npm run test               # unit + component (Vitest + jsdom + Testing Library)
npx playwright install chromium   # once, for E2E
npm run test:e2e           # end-to-end against real built extension
npm run test:all           # typecheck → unit → build → e2e
```

Load `extension/dist/` as an unpacked extension at `chrome://extensions`
(Developer mode on). Full testing strategy: [`docs/TESTING.md`](./docs/TESTING.md).

## Quick start — backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # add ANTHROPIC_API_KEY etc.
uvicorn app.main:app --reload
```

## Status

This repo currently implements **Phase 1 (MVP foundation)**: extension scaffold,
deterministic rule engine, confidence scoring, ATS detection, and Greenhouse /
Lever / Ashby adapters, plus a FastAPI backend skeleton. See the roadmap in
[`PLAN.md`](./PLAN.md) §9 and progress in [`docs/IMPLEMENTATION.md`](./docs/IMPLEMENTATION.md).

## Principles

- **Zero-mutation guarantee:** the extension only *fills* fields; it never clicks
  submit. Forms are always reviewed by the user.
- **Local-first:** profile lives in `chrome.storage.local`; no server upload
  without explicit opt-in.
- **No LLM on structured fields:** names, emails, work-auth, etc. come only from
  the rule engine. AI is reserved for free-text.
