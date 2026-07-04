# AI Job Autofill — Architecture & Design Overview

A privacy-first Chrome extension (Manifest V3) that autofills job applications on
virtually any career site. **Deterministic-first** (zero hallucinations on
structured fields), **AI-assisted** for free-text answers, with **transparent
per-field status** that keeps the user in control. It fills forms; it **never
submits** them.

---

## 1. The problem it solves

- Job seekers spend 30–60 minutes per application re-entering the same data
  across fragmented ATS platforms (Greenhouse, Workday, Lever, iCIMS, …).
  Most application drop-off happens at the form-fill stage.
- Existing tools (LazyApply, Simplify, Jobright) trade accuracy for speed:
  hallucinated values, wrong dropdown picks, cloud-stored resumes, and no
  per-field visibility into what was written.
- This product's answer:
  1. **Deterministic engine first** — names, contacts, work authorization come
     only from the user's locally stored profile via an explainable rule
     engine. No LLM ever invents a structured value.
  2. **AI only where AI belongs** — classifying unknown fields ("what does
     this field represent?") and drafting free-text answers (cover letters,
     "why us?") on explicit user request, cached locally.
  3. **Trust guarantees** — never submits, never overwrites existing values,
     never fills sensitive fields (SSN, DOB, disability/veteran status),
     confirm-gates situational ones (salary, notice period, EEO self-ID).
  4. **Local-first privacy** — profile, resume bytes, history, and AI answer
     cache all live in the browser. The backend is optional.

---

## 2. High-level architecture

```
┌─────────────────────────── Chrome Extension (MV3) ───────────────────────────┐
│                                                                              │
│  Content Script (per page)          Background Service Worker                │
│  ┌─────────────────────────┐        ┌───────────────────────────┐            │
│  │ 1. Detect platform      │        │ • Application history      │            │
│  │    (ATS hints → generic)│ msgs   │   persistence (IndexedDB)  │            │
│  │ 2. Deep-scan discovery  │◄──────►│ • AI request proxy +       │            │
│  │    (shadow DOM, iframes,│        │   30-day answer cache      │            │
│  │    custom widgets)      │        │ • Side-panel behavior,     │            │
│  │ 3. Multi-signal rule    │        │   keyboard command         │            │
│  │    engine + confidence  │        └───────────────────────────┘            │
│  │ 4. Typed writers        │                                                 │
│  │ 5. Settle window +      │        UI Surfaces                              │
│  │    multi-page session   │        ┌───────────────────────────┐            │
│  └─────────────────────────┘        │ Side panel / popup:        │            │
│                                     │  fill trigger, per-field   │            │
│  Storage (all local)                │  write-status badges,      │            │
│  ┌─────────────────────────┐        │  AI-draft buttons, session │            │
│  │ storage.local: profile, │        │  progress                  │            │
│  │  resume bytes, settings,│        │ Options: profile editor,   │            │
│  │  answer cache           │        │  resume upload, settings   │            │
│  │ storage.session: fill   │        │ Dashboard: history +       │            │
│  │  sessions (multi-page)  │        │  analytics                 │            │
│  │ IndexedDB: history      │        └───────────────────────────┘            │
└──────────────────────────────────────────┬───────────────────────────────────┘
                                           │ HTTPS (optional, user-configured)
                              ┌────────────▼────────────┐
                              │   FastAPI Backend       │
                              │ /ai: classify, batch-   │
                              │  classify, jd-extract,  │
                              │  answer (RAG + STAR),   │
                              │  cover-letter           │
                              │ /resume/parse (PDF/DOCX)│
                              │ LLM: Anthropic primary, │
                              │  Gemini fallback, fakes │
                              │ Voyage embeddings + RAG │
                              └─────────────────────────┘
```

### Reach model (how it runs on "any" site)

- **Declared content scripts** on known ATS hosts (Greenhouse, Lever, Ashby,
  Workday, iCIMS, SmartRecruiters, BambooHR) for instant status.
- **On-demand injection everywhere else**: clicking Autofill is a user
  gesture, so `activeTab` + `chrome.scripting` injects the engine into any
  page for that click only — universal reach without the `<all_urls>`
  install-time warning.

### Platform adapters are data, not code

The seven ATS integrations are entries in a `PLATFORM_HINTS` table (URL
regex, DOM fingerprints, preferred form roots) interpreted by a single
`HintedAdapter`. Detection scores URL 30 / DOM 40 / structure 20 / CSS 10
against a 70 threshold. Below threshold, a `GenericAdapter` runs the same
engine on the densest form on the page. Remote config can hot-extend
detection fingerprints without shipping a release. Adding an ATS ≈ adding a
data entry.

---

## 3. Low-level design

### 3.1 Field discovery (deep scan)

`discoverWithin()` walks the document **plus every open shadow root and
same-origin iframe** (cross-origin frames are covered by the content script's
own instance there via `all_frames`). It collects native controls and custom
widgets:

- `input / textarea / select`
- `contenteditable` and `role=textbox` editors
- ARIA combobox inputs (react-select & co) — typed as **select**
- popup-listbox composites (a button/div whose `aria-controls` panel holds
  `role=option` items — e.g. intl-tel-input's phone-country picker)
- `input[type=file]` — including visually hidden ones behind styled
  "Attach" buttons

Radio/checkbox inputs are grouped by name per root; the group's question text
is resolved via `fieldset>legend`, `aria-labelledby`, or preceding text.
All element checks are realm-safe (tagName, per-document `getComputedStyle`,
root-node-scoped label lookup) because `instanceof` fails across iframe realms.

### 3.2 Multi-signal matching engine

Every rule is scored against **all** signals of a field; the strongest match
wins (array order only breaks ties). Signal weights:

| Signal                          | Score | Note                                   |
|---------------------------------|-------|----------------------------------------|
| `autocomplete` attribute token  | 0.98  | spec-defined — ground truth            |
| exact label text                | 0.97  |                                        |
| label pattern                   | 0.85  |                                        |
| `aria-label` / `labelledby`     | 0.80  |                                        |
| placeholder                     | 0.75  |                                        |
| `name`/`id` tokens (normalized) | 0.70  | `first_name`, `candidateLastName`      |
| nearby text / section heading   | 0.60  | **below the write floor** — badge only |

Confidence = signal score × type-compatibility (×0.7 penalty on mismatch)
× profile-value-exists (×0 — *no profile value ⇒ never fill*). Auto-write
floor: **0.7**. The rule taxonomy (~60 canonical fields) maps to dot-paths in
the profile with optional transforms (bool→Yes/No, dial-code→country name,
full-name compose, list join).

### 3.3 Typed writers (all verified against live widgets)

- **Text/textarea**: native value setter *from the element's own realm* +
  `input`/`change` events (required by React/Vue controlled inputs).
- **Native select**: exact value → exact text → substring option match.
- **React-select combobox**: type (filters) → open via mouse events bubbling
  to the control (typing alone never opens it) → read `aria-controls` *after*
  opening (it only exists while the menu is open) → match option
  exact→prefix→substring **scoped to that listbox only** (a document-wide
  fallback once matched "No" to "Norway" in the phone-country list) → click;
  Escape-closes if nothing matches, reports failure honestly.
- **Popup listbox** (intl-tel-input): click trigger → panel opens → click the
  matching `role=option`.
- **Contenteditable**: `textContent` + `input` event.
- **File**: resume bytes from local storage attached via `DataTransfer` +
  events for dropzone wrappers.

### 3.4 Safety gates (checked in order, per field)

1. **Blocklist** (never filled, all direct signals checked): SSN/EIN/tax IDs,
   passport, bank, DOB, driver's license, criminal history, disability,
   veteran status.
2. **Confirm-gated** (value surfaced for review, never auto-written): salary,
   notice period, and voluntary EEO self-ID (age, race/ethnicity, gender,
   pronouns, LGBTQIA+ — stored in an optional local `demographics` section).
3. **Never-clobber**: any control that already holds a value (user-typed or
   filled on an earlier pass/page) is left untouched → re-runs are idempotent.
4. **Zero-mutation**: no code path clicks submit — enforced by an E2E test.

### 3.5 Dynamic forms & multi-page applications

- **Settle window**: after a fill pass writes anything, a debounced
  `MutationObserver` watches ~1.2 s for conditional fields revealed by the
  writes and fills only never-seen elements, folded into the same result.
- **Fill sessions** (`chrome.storage.session`): scoped to origin + first path
  segment (so multi-tenant hosts like `boards.greenhouse.io/{company}` don't
  leak sessions), expire after 30 min, cap at 10 automatic passes. SPA route
  changes (URL polling + popstate) and full page loads auto-continue the
  same application; off-switch in Settings.

### 3.6 AI pipeline (optional, never load-bearing)

- **Field classification**: unmatched fields batched into ONE
  `/ai/classify-batch` request (≤15 fields, 2.5 s budget). Result is an
  advisory `aiCategory` badge — AI assigns no values, so it cannot write.
- **Free-text drafts**: per-field "AI draft" button → scrape the visible job
  description → `/ai/answer` (keyword classifier routes; RAG over the user's
  experience chunks; STAR format for behavioral; ≤200 words; "use ONLY the
  provided experiences"). Draft is written into the form for review.
- **Answer cache**: 30-day, 100-entry local cache keyed on normalized
  question text — repeat questions across applications are free and offline.
- **Cover letters**: profile summary + JD summary + style (formal/startup/
  creative).
- Provider chain behind an `LLM` Protocol: Anthropic (primary) → Gemini
  (fallback) → deterministic fakes (tests/no keys). Embeddings: Voyage.

### 3.7 UI truthfulness

Badges encode **what actually happened**, not match confidence:
green ✓ written this pass · gray ✓ skipped (already had a value) ·
yellow ! value ready but not written (confirm-gated / widget rejected — hover
shows why) · ✕ never-filled (blocklist) · ? no match/value.
`FieldMatch.filled` is set from the writer's real return value, so
"Filled X of Y" and badges can't disagree.

---

## 4. Tech stack

| Layer            | Tech                                                          |
|------------------|---------------------------------------------------------------|
| Extension        | Chrome MV3, TypeScript 5, React 18, Vite 5 + vite-plugin-web-extension, Tailwind CSS 3, zustand |
| Extension APIs   | content scripts (`all_frames`), `chrome.scripting` + `activeTab`, storage.local/session, IndexedDB, sidePanel, commands |
| Backend (opt-in) | Python 3.12+, FastAPI, Pydantic v2, uvicorn                   |
| AI               | Anthropic API (primary), Google Gemini (fallback), Voyage embeddings, in-memory vector store (pgvector-ready interface) |
| Resume parsing   | pdfminer.six / python-docx + regex fallback (works keyless), LLM extraction when configured |
| Testing          | Vitest + jsdom + Testing Library (237 unit/component), Playwright (E2E on the real built extension), pytest (46 backend), dockerized integration suite |
| CI               | GitHub Actions (typecheck → unit → build → E2E → backend)     |

## 5. Repository layout

```
extension/src/
├── shared/      UserProfile schema (+ deep-merge migration), typed messaging contract
├── rules/       field taxonomy (FIELD_RULES), multi-signal engine, confidence, transforms
├── adapters/    PLATFORM_HINTS + HintedAdapter, GenericAdapter, deep-scan discovery,
│                typed DOM writers (domFill), remote config
├── content/     fill executor (evaluate→write→settle), fill sessions, AI enrichment,
│                JD scraper, message handler + navigation watcher
├── background/  history persistence, AI proxy + answer cache, side-panel/commands
├── popup/ sidepanel/ options/   React UIs (status, badges, profile editor, dashboard)
└── storage/     profile, resume bytes, settings, answer cache, history helpers

backend/app/
├── api/         /ai, /resume, /profile, /jobs routers
└── services/    llm providers, classifier, answers (RAG+STAR), cover_letter,
                 rag, resume parser, orchestration (human-gated state machine)

docs/            ARCHITECTURE_REVIEW.md (design + gap analysis + milestones),
                 IMPLEMENTATION.md (per-milestone status), GUIDE.md (user guide),
                 TESTING.md, PRIVACY.md
```

## 6. Key design decisions & trade-offs

1. **`activeTab` injection over `<all_urls>`** — universal reach with no
   "read all sites" permission; the popup can't show status on unknown sites
   until the first click (the click *is* the consent).
2. **Score-all-signals over first-match-wins** — strong signals beat weak
   ones regardless of rule order; O(rules × signals) is trivial at this scale.
3. **Adapters as data** — new ATS platforms are hint entries (or nothing:
   the generic engine must already produce a usable result).
4. **AI advisory-only for structured fields** — classification is capped
   below the write floor by construction (it assigns no value at all).
5. **Regression tests modeled on live DOM** — the Greenhouse/Affirm fixtures
   replicate real widget quirks discovered in production (mousedown-only
   menus, transient aria-controls, portaled listboxes, "Attach"-labeled file
   inputs), so fixes can't silently regress.
