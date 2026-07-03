# Architecture Review & Universal-Compatibility Redesign

> Deliverables 1–5 of the universality initiative: current-state review, gap
> analysis, refactoring plan, target architecture, and incremental milestones.
> Written 2026-07-02. Implementation status is tracked at the bottom.

---

## 1. Current Architecture Review

### 1.1 Structure

```
extension/src/
├── shared/     UserProfile schema + cross-context types (messaging contract)
├── rules/      deterministic engine: FIELD_RULES (regex → profile path),
│               confidence scoring, profile-path resolver, value transforms
├── adapters/   7 ATS adapters (score() + discoverFields()), shared generic
│               discovery (discoverWithin), low-level DOM writers (domFill),
│               remote-config stub
├── content/    message handler + fillExecutor (detect → evaluate → write)
├── background/ thin MV3 worker: history persistence, AI request proxy
├── popup/      fill trigger + per-field confidence badges
├── options/    profile editor, onboarding, dashboard
└── storage/    chrome.storage.local (profile/settings) + IndexedDB (history)

backend/app/
├── api/        /ai (classify, jd, answer, cover-letter), /profile, /resume, /jobs
└── services/   llm (Anthropic/Gemini behind a Protocol), classifier
                (keyword-first, LLM refinement), answers (RAG+STAR),
                cover_letter, rag (in-memory vector store), resume parser,
                orchestration (state machine that halts at AWAIT_USER_REVIEW)
```

### 1.2 What is genuinely good (keep, don't rewrite)

- **Deterministic-first split.** Structured fields come only from
  `FIELD_RULES` → profile paths; AI is classification + free-text generation
  only. This is exactly the right safety posture and survives the redesign.
- **Zero-mutation guarantee** is enforced at every layer (fillExecutor has no
  submit path; backend orchestration has no automated edge out of
  `AWAIT_USER_REVIEW`).
- **`domFill` native-setter writes** (React/Vue-safe `value` set + `input`/
  `change` dispatch) are correct and framework-agnostic.
- **`discoverWithin`** already does decent label resolution (label[for],
  wrapping label, aria-label/labelledby, fieldset>legend, radiogroup
  heuristics) and radio/checkbox grouping.
- **Confidence model** (multi-factor score → tier → autofill floor at 0.7,
  `confirm` flags, hard blocklist for SSN/EEO) is the right control surface.
- **Backend LLM Protocol** isolation and keyword-first classifier keep AI
  optional and testable.

### 1.3 Weaknesses found

| # | Weakness | Where |
|---|----------|-------|
| W1 | **Adapters gate everything.** `detectATS()` returns `adapter: null` below threshold 70, and `fillExecutor` then discovers **zero** fields. On any unrecognized site the extension does nothing — even though `discoverWithin` is fully generic and would work. | `adapters/registry.ts`, `content/fillExecutor.ts` |
| W2 | **Manifest whitelist.** Content scripts are declared only on 10 host patterns. The extension is architecturally incapable of running on company career portals, home-grown systems, LinkedIn, Indeed, Taleo, SuccessFactors, … regardless of engine quality. | `manifest.json` |
| W3 | **Single-signal, first-match-wins matching.** `findRule` checks label → aria → placeholder against ordered regexes and stops at the first hit. It ignores `autocomplete`, `name`, `id`, `title`, section headings, and nearby text. Rule-array order is load-bearing (fragile), and a weak placeholder hit on an early rule beats a strong label hit on a later one. | `rules/engine.ts` |
| W4 | **Thin alias coverage.** ~30 rules, few aliases each. No middle name, suffix, address lines, work/home phone, citizenship, clearance, references, travel, remote preference, expected graduation, minor, employer/position phrasing, etc. |`rules/fieldRules.ts` |
| W5 | **Adapters are near-identical boilerplate.** All 7 are "score by URL/selector, pick a form root, call `discoverWithin`". None supply `adapterRuleId`/`atsKnownField` (the engine supports it; nothing uses it). ~200 lines of copies of the same shape. | `adapters/*.ts` |
| W6 | **No dynamic-DOM handling.** Discovery is a one-shot snapshot at fill time. Fields rendered after async fetches, conditional fields appearing on input, lazy steps — invisible. No MutationObserver, no retry. | `content/` |
| W7 | **No multi-page/SPA state.** Nothing persists which fields were filled; SPA route changes (Workday wizard, React Router) get no re-scan; `WorkdayAdapter.currentStep()` exists but is dead code. | everywhere |
| W8 | **No Shadow DOM / limited iframe reach.** `querySelectorAll` never pierces open shadow roots (SuccessFactors, Phenom, many design systems). Same-origin iframe handling exists only as an iCIMS special case rather than a general capability (`all_frames: true` helps, but top-frame discovery doesn't enumerate frames). | `adapters/discover.ts` |
| W9 | **No custom-widget support.** Only native `input/textarea/select`. React-select comboboxes, MUI/Chakra dropdowns, `[role=combobox]`/`[contenteditable]`, date pickers, file-upload dropzones are undiscoverable. | `discover.ts`, `domFill.ts` |
| W10 | **File upload explicitly excluded** (`isFillable` filters `type=file`; resume upload exists only in the options page → backend parse path, not into forms). | `discover.ts` |
| W11 | **AI is not wired into field understanding.** Backend `/ai/classify` exists, but the extension never calls it for unmatched fields; `ai_generate` fields return "left for you for now". No caching of answers → repeat questions would re-bill. | `fillExecutor.ts`, `background/` |
| W12 | **`labelForControl` does global lookups** (`document.querySelector`) even when discovery is scoped to a root — wrong inside detached roots/iframes, and repeated per control with no caching. | `domFill.ts` |
| W13 | **Profile schema gaps.** No street address, middle name, suffix, secondary phone/email, citizenship, clearance, references, languages-per-proficiency, work-history location. Rules can't map what the profile can't hold. | `shared/profile.ts` |
| W14 | **`FieldMatch.fieldId` is a session counter**, not a stable selector — useless for cross-page state or popup→page highlighting after re-render. | `discover.ts` |

### 1.4 Answer: what prevents this from working on arbitrary job forms?

Three hard gates, in order of severity:

1. **Reach (W2):** the content script never loads outside 10 hostname
   patterns.
2. **The adapter bottleneck (W1):** even where the script loads, no
   recognized ATS ⇒ zero discovery, although the discovery code itself is
   generic.
3. **Recognition breadth (W3/W4/W8/W9):** where discovery runs, the matcher
   uses a fraction of the available DOM signals against a thin alias set, and
   can't see shadow DOM, custom widgets, or late-rendered fields at all.

Everything else (multi-page state, uploads, AI fallback, caching) is quality
of coverage on top of those three.

---

## 2. Target Architecture

### 2.1 Principle inversion: generic engine first, adapters as hints

Today: `adapter (required) → discoverWithin → rules`.
Target: **`universal engine (always) ← adapter hints (optional)`**.

```
┌─────────────────────────── content script ───────────────────────────┐
│  Discovery            Signals              Matching        Filling   │
│  ─────────            ───────              ────────        ───────   │
│  walk DOM +      →    per-control      →   score every  →  typed     │
│  open shadow          FieldSignals         rule × every    writers   │
│  roots + same-        (autocomplete,       signal with     (native   │
│  origin frames        label, aria,         layered         setters,  │
│  + MutationOb-        placeholder,         weights;        combobox, │
│  server rescan        name/id, title,      best match      upload)   │
│                       section heading,     wins; conf.               │
│                       nearby text,         from signal               │
│                       control type)        strength                  │
│                            ▲                                         │
│                 platform hints (optional):                           │
│                 URL/DOM detection → root selector, extra             │
│                 fingerprints, field overrides (data-driven,          │
│                 remote-updatable JSON — not code)                    │
└──────────────────────────────────────────────────────────────────────┘
```

**Adding a new ATS becomes a JSON hint entry (or nothing at all)** — the
generic path must already produce a usable result on an unknown site; hints
only raise confidence and fix quirks.

### 2.2 Layered signal priority (Phase 7 of the brief)

Matching scores each candidate rule against **all** signals and takes the
best-weighted hit, replacing first-match-wins:

| Signal | Weight (label-match score) | Rationale |
|---|---|---|
| `autocomplete` attribute token | 0.98 | Spec-defined semantics; effectively ground truth |
| exact label text | 0.97 | Human-facing, unambiguous |
| adapter/platform override | 0.97 | Curated |
| label pattern | 0.85 | Human-facing, fuzzy |
| aria-label / labelledby | 0.80 | Accessibility text, occasionally stale |
| placeholder | 0.75 | Often an example, not a name |
| `name`/`id` attribute tokens | 0.70 | Developer-facing, often meaningful (`first_name`) |
| section heading / nearby text | 0.60 | Context only — badge, never auto-fill (floor is 0.7) |
| AI classification fallback | capped ≤ 0.65 | Suggest, never auto-fill |

Existing invariants preserved: no profile value ⇒ confidence 0; type
mismatch ×0.7; blocklist beats everything; auto-write floor stays 0.7.

### 2.3 Canonical field taxonomy (Phase 3)

`FIELD_RULES` grows into a taxonomy where each canonical field carries:
`aliases` (many), `autocomplete` tokens, expected control types, profile
path + transform, and flags. Aliases are data, not logic — contributors add
strings, not regexes-in-code, and the remote-config channel
(`remoteConfig.ts`) can ship new aliases without an extension release.

The profile schema grows to hold what forms actually ask (street address,
middle name, suffix, additional phones/emails, citizenship, clearance,
references…) — schema first, then rules, then options-UI editors.

### 2.4 Reach: how the script gets onto arbitrary pages

Keep the declared content scripts for the top ATS hosts (instant status in
the popup). For **everything else**: `activeTab` + `chrome.scripting`
injection when the user clicks Autofill. This is the privacy-first answer to
`<all_urls>`: no code runs anywhere until an explicit user gesture, no new
install-time permission warnings, works on every site.

### 2.5 Dynamic DOM & multi-page (Phases 4–5)

- Discovery returns handles from a **scan pass** that (a) walks open shadow
  roots, (b) enumerates same-origin iframes, (c) can be re-run cheaply.
- After a fill, a short-lived debounced `MutationObserver` window (~3 s)
  catches conditional fields that appear in reaction to filled values and
  re-evaluates only added subtrees (incremental, not whole-DOM rescans).
- Per-tab session state (`chrome.storage.session`): URL + canonical fields
  already filled, so SPA step changes and reloads don't double-fill and the
  popup can show wizard progress. No cross-page identity is needed beyond
  canonical field ids.

### 2.6 AI boundaries (Phase 6, unchanged in spirit)

AI classifies (`what is this field?`) and drafts free text; it never invents
profile values. New: unmatched-field classification batches all unknown
fields of a page into **one** `/ai/classify` call; answers are cached
locally keyed on normalized question text so repeat questions across
applications are free.

### 2.7 What stays exactly as is

Zero-mutation guarantee, local-first storage, deterministic-vs-AI split,
confidence tiers/floor, blocklist semantics, backend service seams,
orchestration human-gate. The redesign widens *recognition and reach*; it
does not touch *trust*.

---

## 3. Refactoring Plan (prioritized)

| P | Change | Fixes | Risk |
|---|--------|-------|------|
| P0 | Generic fallback engine: registry returns a `GenericAdapter` when no ATS matches; fill works on any page with a form | W1 | Low — additive |
| P0 | Multi-signal scoring matcher + expanded signal extraction (`autocomplete`, `name`, `id`, section/nearby text) | W3, W12 | Medium — core engine; existing tests guard behavior |
| P0 | Alias-rich taxonomy + `autocomplete` tokens on rules | W4 | Low — data change |
| P0 | On-demand injection via `activeTab`+`scripting` from the popup | W2 | Low — additive |
| P1 | Shadow-DOM-piercing + frame-enumerating scan pass | W8 | Medium |
| P1 | Custom widget handlers (combobox/listbox roles, contenteditable) behind a `WidgetWriter` strategy interface in `domFill` | W9 | Medium |
| P1 | Profile schema expansion + options UI + migrations | W13 | Medium — touches storage |
| P1 | Post-fill MutationObserver window + incremental re-evaluation | W6 | Medium |
| P2 | Per-tab fill-session state (multi-page/SPA) | W7, W14 | Medium |
| P2 | AI classify fallback for unmatched fields (batched) + answer cache | W11 | Low — additive |
| P2 | File-upload writer (native input + DataTransfer; dropzone simulation) | W10 | High — per-widget quirks |
| P2 | Collapse 7 adapter classes into data-driven platform hints consumed from `remoteConfig` | W5 | Low once P0 lands |

**Non-goals of the refactor:** rewriting `domFill` native setters, the
confidence model, storage layer, popup/options UI structure, or any backend
service. They work; they get extended, not replaced.

---

## 4. Milestones

- **M1 — Universal core (this change):** generic adapter fallback +
  multi-signal matcher + expanded signals + alias-rich taxonomy + on-demand
  injection. After M1 the extension produces useful fills on arbitrary
  career portals. Fully backward compatible: on recognized ATSs behavior is
  the same or strictly better.
- **M2 — Deep reach:** shadow-DOM/iframe scan pass; custom widget writers
  (combobox, listbox, contenteditable); post-fill observer window.
- **M3 — Profile depth:** schema expansion (address, extra names/contacts,
  citizenship/clearance, references), options UI, migration, new rules.
- **M4 — Multi-page:** per-tab session state, SPA navigation hooks
  (history API + observer), wizard progress in popup.
- **M5 — AI assist:** batched unknown-field classification, local answer
  cache, JD-aware free-text insertion UX.
- **M6 — Files & platform hints:** file-upload writers; fold adapter classes
  into remote-config platform hints; synthetic-form test corpus (React/
  Vue/Angular/shadow fixtures) + perf benchmarks.

## 5. Key decisions & trade-offs

1. **`activeTab` injection over `<all_urls>` content scripts.** Universality
   without the "read all sites" install warning or persistent per-page cost.
   Trade-off: on non-whitelisted sites the popup can't show status before
   the first click — acceptable; the click *is* the consent gesture.
2. **Score-all-rules over ordered-first-match.** Removes order fragility and
   lets strong signals beat weak ones. Trade-off: O(rules × signals) per
   field — trivial at this scale (dozens × ~8), and cheaper than a wrong
   fill.
3. **Adapters demoted to hints, not deleted.** Detection strings and root
   selectors stay valuable (confidence boost, scoping); the class boilerplate
   is what goes. Trade-off: keeping a compatibility shim during M1–M6.
4. **AI classification capped below the auto-fill floor.** An AI guess can
   badge and suggest but never write. Preserves the zero-hallucination
   contract at the cost of one extra user click on exotic fields.
5. **Aliases as data (and remote-updatable), regexes generated.** Turns the
   long tail of field phrasing into a corpus problem rather than a code
   problem. Trade-off: generated patterns are slightly less precise than
   hand-tuned regexes; the multi-signal scorer compensates.

---

## 6. Implementation status

- [x] **M1** — landed: `adapters/generic.ts`, multi-signal
  matcher in `rules/engine.ts` + `rules/confidence.ts`, expanded signals in
  `adapters/discover.ts`, alias/autocomplete-enriched `rules/fieldRules.ts`,
  popup on-demand injection.
- [x] **M2** — landed: deep scan pass in `adapters/discover.ts` (open shadow
  roots + same-origin iframe documents, realm-safe element checks); widget
  writers in `adapters/domFill.ts` (ARIA combobox type-and-pick,
  contenteditable/role=textbox, per-realm native setters, root-node-scoped
  label lookup); async `detectAndFill` with a post-fill MutationObserver
  settle window in `content/fillExecutor.ts` that fills late-rendered
  conditional fields incrementally. Cross-origin iframes remain covered by
  the frame's own content-script instance (`all_frames`); closed shadow
  roots are unreachable by design.
- [x] **M3** — landed: profile schema expansion in `shared/profile.ts`
  (middle/preferred name, street address lines, security clearance,
  willing-to-travel, references) with `migrateProfile` deep-merge migration
  on load (`storage/profile.ts`); matching rules incl. reference contact
  fields that beat the generic email/phone rules; options-UI editors
  (address, visa/clearance selects, references list); backend Pydantic
  mirror updated.
- [ ] M4 – M6 — not started.
