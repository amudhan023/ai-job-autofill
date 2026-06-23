# AI Job Autofill — Complete Guide

How the project works, how to install it, how to load it into Google Chrome for
testing, and how to use the autofill feature day to day.

- New here? Read **[How it works](#1-how-it-works)** then **[Quick start](#3-quick-start-tldr)**.
- Just want it running in Chrome? Jump to **[Load into Chrome](#5-load-the-extension-into-google-chrome)**.
- Want to actually fill an application? See **[Using autofill](#7-using-the-autofill-feature)**.

---

## 1. How it works

AI Job Autofill is a Chrome extension (Manifest V3) with an optional backend.
The guiding idea: **be deterministic and private first, use AI only where it
genuinely helps, and never act without your review.**

### The core principles
- **Deterministic first.** Structured fields (name, email, phone, work
  authorization, education, links) are filled from a rule engine — there is no
  AI in that path, so there is nothing to hallucinate.
- **AI only for free-text.** Behavioral / motivation / cover-letter answers are
  *optional* and only run if you enable an AI backend. Off by default.
- **Confidence you can see.** Every field gets a green / yellow / red badge so
  you know what was filled and how sure the extension is.
- **Local-first privacy.** Your profile and history live in your browser. Nothing
  is uploaded unless you explicitly turn on a backend.
- **Zero-mutation guarantee.** The extension only *fills* fields. It never clicks
  Submit. You review and submit every application yourself.

### The pieces

```
Chrome Extension (MV3)                         Optional Backend (FastAPI)
┌────────────────────────────────┐            ┌──────────────────────────┐
│ Popup        – trigger fill,    │            │ /ai/classify  /ai/answer │
│                show status      │  fetch     │ /ai/jd       /ai/cover…  │
│ Options      – profile editor,  │ ─────────▶ │ /resume/parse /jobs/rank │
│                dashboard,       │  (only if  │                          │
│                settings         │   enabled) │ Claude (Anthropic) +     │
│ Content      – detect ATS,      │            │ Voyage embeddings        │
│   script       fill the form    │            └──────────────────────────┘
│ Background   – history, AI proxy│
│ Storage      – chrome.storage + │
│                IndexedDB        │
└────────────────────────────────┘
```

### What happens when you click "Autofill"
1. The **content script** already running on the page detects which ATS it is
   (Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters, BambooHR) using a
   scored fingerprint of the URL + DOM.
2. It discovers the form's fields and matches each one against the **rule
   engine** (label/placeholder patterns → your profile values).
3. Each field gets a **confidence score**. Fields at/above the threshold with a
   real profile value are filled; sensitive ones (SSN, EIN, diversity) are
   always skipped; free-text ones are flagged for optional AI.
4. Values are written using a React-safe setter so controlled inputs (Workday,
   Ashby) register the change.
5. The popup shows a per-field summary; the result is saved to your local
   history (used by the dashboard).

For the full architecture, see [`PLAN.md`](../PLAN.md) and
[`IMPLEMENTATION.md`](./IMPLEMENTATION.md).

---

## 2. Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | 20+ (22 recommended) | build the extension |
| **npm** | 10+ | install dependencies |
| **Google Chrome** | 120+ (or Edge 120+) | run the extension |
| Python 3.12+ | optional | only if you run the AI backend |

Check what you have:
```bash
node -v && npm -v
```

---

## 3. Quick start (TL;DR)

```bash
git clone git@github.com:amudhan023/ai-job-autofill.git
cd ai-job-autofill/extension
npm install
npm run build          # produces extension/dist/
```
Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select `ai-job-autofill/extension/dist`. Open the extension's
**Options**, fill in your profile, save. Visit a supported job posting and click
the toolbar icon → **Autofill this application**.

The rest of this guide explains each step in detail.

---

## 4. Build the extension

From the repo root:

```bash
cd extension
npm install            # one time
npm run build          # outputs the loadable extension into extension/dist/
```

You should see a `dist/` folder containing `manifest.json`, `src/…`, `icons/`,
and `styles.css`. That `dist/` folder **is** the extension you load into Chrome.

Useful scripts:
```bash
npm run dev            # rebuild on change (watch mode) during development
npm run typecheck      # TypeScript only
npm run test           # unit + UI component tests
npm run test:e2e       # end-to-end tests (needs: npx playwright install chromium)
npm run test:all       # typecheck → unit → build → e2e
```

> Note: `npm run dev` writes to `dist/` continuously. After it rebuilds, click
> the **reload** icon on the extension card in `chrome://extensions` to pick up
> changes.

---

## 5. Load the extension into Google Chrome

1. Open Chrome and go to **`chrome://extensions`**.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select the **`extension/dist`** folder (the build output, *not* the repo root
   and *not* `extension/src`).
5. The **AI Job Autofill** card appears. Pin it: click the puzzle-piece
   (Extensions) icon in the toolbar, then the pin next to AI Job Autofill so its
   icon is always visible.

**To update after a rebuild:** run `npm run build` again, then click the circular
**reload** icon on the extension's card.

**Edge / Brave / other Chromium browsers:** the same steps work — use
`edge://extensions` / `brave://extensions`.

### Troubleshooting loading
- *"Manifest file is missing or unreadable"* → you selected the wrong folder.
  Pick `extension/dist`, which must contain `manifest.json`.
- *Icon doesn't appear* → pin it via the Extensions puzzle-piece menu.
- *Nothing happens on a job page* → confirm the site is one of the supported ATS
  platforms (below). On other sites the extension stays dormant by design.

---

## 6. Set up your profile (required)

The extension fills forms from a profile you enter once.

1. Right-click the extension icon → **Options** (or click the icon, then **Edit
   profile** in the popup).
2. On the **Profile** tab, fill in:
   - **Personal** — first/last name, email, phone, location.
   - **Links** — LinkedIn, GitHub, portfolio.
   - **Work Authorization** — authorized to work / needs sponsorship.
   - **Current Experience** — company, title, total years of experience.
   - **Education** — school, degree, major, graduation year.
   - **Preferences** — expected salary, notice period.
3. Click **Save profile**. You'll see **Saved ✓**.

Everything is stored locally in `chrome.storage.local`. Nothing leaves your
device.

> Tip: there's also an **Applications** tab (analytics dashboard) and a
> **Settings** tab (optional AI backend URL) on the Options page.

---

## 7. Using the autofill feature

### Supported job platforms
Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters, BambooHR. On any other
site the extension does nothing.

### Fill an application
1. Open a job posting's **application form** on a supported platform.
2. Click the **AI Job Autofill** toolbar icon to open the popup.
   - The popup shows the detected platform, e.g. *"Detected: greenhouse"*. If it
     says *"No supported ATS detected"*, you're not on a supported application
     form.
3. Click **Autofill this application**.
4. Fields fill in, and the popup shows a summary: *"Filled X of Y fields"* with a
   badge per field.

**Or use the keyboard shortcut:** press **Alt + Shift + F** on the application
page to autofill without opening the popup. (Configurable at
`chrome://extensions/shortcuts`.)

### Reading the confidence badges
| Badge | Meaning |
|---|---|
| 🟢 **✓** (green) | High confidence — exact match, filled. |
| 🟡 **!** (yellow) | Medium confidence — filled, worth a quick check. |
| 🔴 **?** (red) | Low confidence / needs attention — not auto-filled, or a sensitive/free-text field left for you. |

Hover any badge to see *why* (the reason and the confidence percentage).

### What it deliberately will **not** fill
- **Sensitive fields** — Social Security Number, EIN/tax ID, passport, bank
  details. Always left blank.
- **Diversity / EEO questions** — never auto-filled or AI-generated; you answer
  these yourself.
- **Salary / notice period** — matched but left for you to confirm (they're
  flagged, not auto-written), since these are situational.
- **Cover letters and free-text** — detected and flagged; filled only if you've
  enabled the optional AI backend (see below).

### Review and submit
1. **Always review the filled form** before submitting. The extension never
   clicks Submit — that's your decision.
2. Fix any field with a yellow/red badge.
3. Submit the application yourself in the page as normal.

### After filling
The **Applications** tab on the Options page shows your history and analytics:
total applications, overall fill rate, AI-assist rate, breakdown by platform, and
recent applications.

---

## 8. (Optional) Enable AI free-text answers

By default the extension is fully deterministic and offline. To draft behavioral
answers, motivation responses, and cover letters, run the backend and point the
extension at it.

### Run the backend
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=...  (and optionally VOYAGE_API_KEY for RAG)
uvicorn app.main:app --reload
```
- Health check: <http://localhost:8000/health> (shows `ai_enabled: true` once a
  key is set).
- API docs: <http://localhost:8000/docs>.

Without `ANTHROPIC_API_KEY`, the AI endpoints return safe empty stubs — the
extension still works for all deterministic autofill.

### Connect the extension
1. Options page → **Settings** tab.
2. Enter the **Backend URL** (e.g. `http://localhost:8000`).
3. **Save settings.**

Now free-text fields can be drafted with AI. Generated answers are **suggestions
you review and edit** — they're built only from your real profile experience and
never fabricate facts.

> Privacy: with a backend enabled, only the data needed for a request is sent
> (e.g. a question + relevant experience). See [`PRIVACY.md`](./PRIVACY.md).

---

## 9. Testing it end to end

The repo ships an automated E2E test that loads the *built* extension into a real
headless Chromium and fills a fixture ATS page — a good way to confirm a working
setup:

```bash
cd extension
npm run build
npx playwright install chromium     # one time
npm run test:e2e
```

You can also test manually against the bundled fixture without a real job site:
```bash
cd extension
node e2e/server.mjs                  # serves fixtures at http://localhost:5566
```
Then open <http://localhost:5566/greenhouse.html> in the Chrome where you loaded
the extension, set a profile, and click Autofill. (The manifest includes
`localhost` so the content script runs there for testing.)

---

## 10. Uninstall / reset

- **Reset profile:** Options → edit fields or clear them → Save.
- **Remove everything:** `chrome://extensions` → AI Job Autofill → **Remove**.
  This deletes all locally stored profile and history data.

---

## 11. FAQ

**Does it submit applications for me?**
No. It only fills fields. You always review and submit. This is a hard guarantee,
enforced in code and in the "apply to many" orchestration.

**Is my data uploaded anywhere?**
Not by default. Profile and history stay in your browser. Data is only sent if
you explicitly configure an AI backend URL.

**Why didn't it fill a field?**
Either your profile has no value for it, the label didn't match a rule, or it's
intentionally protected (sensitive/diversity) or confirm-gated (salary). Hover
the red/yellow badge for the exact reason.

**It says "No supported ATS detected."**
You're not on a supported application form, or you're on the job *description*
page rather than the *apply* form. Open the application form and reopen the popup.

**How do I change the keyboard shortcut?**
Go to `chrome://extensions/shortcuts`.

**Which platforms are supported?**
Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters, BambooHR.
