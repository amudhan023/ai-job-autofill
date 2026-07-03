# AI Job Autofill

A privacy-first Chrome extension (MV3) that autofills job applications across ATS
platforms. **Deterministic first** (zero hallucinations on structured fields),
**AI-assisted** for free-text answers, with **transparent confidence scoring**
that keeps the user in control.

> **New here? Read the [Complete Guide](./docs/GUIDE.md)** — how it works,
> install, load into Chrome for testing, and use the autofill feature.
>
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

Phases 1–5 (rule engine, ATS adapters, AI answers, cover letters, analytics,
orchestration) and the **universality initiative M1–M6** are implemented. The
extension now works on *any* site with a form:

- **M1 — universal core:** multi-signal semantic matching (autocomplete /
  label / aria / placeholder / name / id / nearby text), generic fallback
  when no ATS is recognized, on-demand injection via `activeTab` (no
  `<all_urls>` permission).
- **M2 — deep reach:** open shadow roots, same-origin iframes, ARIA
  comboboxes, contenteditable editors, post-fill watch for conditional
  fields.
- **M3 — profile depth:** address, middle/preferred name, clearance,
  references; stored profiles migrate automatically.
- **M4 — multi-page:** bounded fill sessions continue across wizard steps
  and SPA navigations; existing values are never overwritten.
- **M5 — AI assist:** batched classification of unknown fields (advisory
  only), local answer cache, one-click AI drafts for free-text questions.
- **M6 — files & data-driven platforms:** resume auto-attach to upload
  fields; ATS adapters are data entries (`PLATFORM_HINTS`), extendable via
  remote config without a release.

Architecture review, gap analysis, and design decisions:
[`docs/ARCHITECTURE_REVIEW.md`](./docs/ARCHITECTURE_REVIEW.md). Progress log:
[`docs/IMPLEMENTATION.md`](./docs/IMPLEMENTATION.md).

## Principles

- **Zero-mutation guarantee:** the extension only *fills* fields; it never clicks
  submit. Forms are always reviewed by the user.
- **Local-first:** profile lives in `chrome.storage.local`; no server upload
  without explicit opt-in.
- **No LLM on structured fields:** names, emails, work-auth, etc. come only from
  the rule engine. AI is reserved for free-text.
