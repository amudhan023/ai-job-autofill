# AI Job Autofill Chrome Extension — Full Architecture & Product Plan

> **Target Team**: 3–5 engineers | **Horizon**: 12-month roadmap | **Authored for**: Staff-level CTO readiness

---

## Changes from the original plan (2026-06-22)

This document is the canonical, maintained version of the original product plan.
The following corrections were applied during implementation:

| # | Change | Reason |
|---|--------|--------|
| 1 | `claude-opus-4-6` → **`claude-opus-4-8`** (cover-letter model) | Opus 4.8 is the current latest Opus; 4.6 is superseded. |
| 2 | Embeddings `text-embedding-3-small` → **`voyage-3.5-lite`** (Voyage AI) | The plan mandates "no OpenAI on the primary path." OpenAI embeddings violated that. Anthropic has no first-party embeddings API and officially recommends **Voyage AI**. `voyage-3.5-lite` is cheap, 1024-dim, strong on retrieval. |
| 3 | Documented that `claude-sonnet-4-6` and `claude-haiku-4-5` are current and correct | No change needed; confirmed. |
| 4 | pgvector dimension note updated to **1024** (Voyage) from 1536 | Matches new embedding model. |

Everything else below preserves the original intent.

---

## 1. Product Requirements Document (PRD)

### Problem Statement
Job seekers spend 30–60 minutes per application manually re-entering the same data
across fragmented ATS platforms. 80% of application dropoff occurs at the form-fill
stage. Existing tools (Simplify Copilot, LazyApply, Jobright.ai) trade accuracy for
speed, producing hallucinated values, incorrect dropdowns, and no user oversight.
This erodes trust and creates silent errors that hurt candidates.

**This product solves it** by: deterministic autofill first (zero hallucinations for
structured fields), AI-powered tailoring for free-text answers, and transparent
confidence scoring that puts the user in control.

### User Personas

| Persona | Background | Pain | Goal |
|---|---|---|---|
| **Active Seeker** | Laid off, applying to 20+/week | Repetitive data entry, ATS format inconsistencies | Fill 90% of fields with one click |
| **Passive Seeker** | Employed, selective | Doesn't want to upload resume to each site | Quick, private autofill without SaaS signup friction |
| **Career Switcher** | Mid-career pivot | Can't just copy-paste; needs tailored framing | AI that maps transferable skills to new domain JDs |
| **International Candidate** | Visa/sponsorship concerns | Work auth questions vary wildly by company | Deterministic rules for legal status fields |

### Functional Requirements

#### Core (MVP)
- FR-01: Detect supported ATS platforms on page load
- FR-02: Extract and fill personal info, contact, work auth from local profile
- FR-03: Fill multi-step forms across page navigations
- FR-04: Confidence badge per field (green/yellow/red)
- FR-05: User can review/edit before submission
- FR-06: Persist application history locally (URL, company, date, fields filled)

#### AI (Phase 3+)
- FR-10: Parse uploaded resume PDF/DOCX into structured profile
- FR-11: Extract JD requirements from current tab
- FR-12: Generate tailored free-text answers using profile + JD context
- FR-13: Cover letter generation
- FR-14: Behavioral question detection and STAR-format generation

#### Advanced (Phase 4+)
- FR-20: Multi-tab parallel application orchestration
- FR-21: ATS-specific quirk handling (Workday multi-page state, iCIMS iframe)
- FR-22: Application analytics (field fill rate, AI assist rate, response quality)

### Non-Functional Requirements
- **Latency**: Form detection < 200ms; deterministic fill < 500ms; AI response < 5s
- **Privacy**: Resume/profile stored locally by default; no server upload without explicit consent
- **Reliability**: Extension must not break ATS form submissions (zero-mutation guarantee: only fills, never submits)
- **Compatibility**: MV3 compliant; tested on Chrome 120+, Edge 120+
- **Observability**: LangSmith tracing for all AI calls; OpenTelemetry for backend

### Success Metrics

| Metric | Target (6 months) |
|---|---|
| Field autofill accuracy (structured) | ≥ 97% |
| AI free-text answer acceptance rate | ≥ 70% |
| Time to fill per application | < 60 seconds |
| ATS platforms supported | ≥ 10 |
| MAU | 10,000 |
| Privacy: PII server leakage incidents | 0 |

### Competitive Analysis

| Product | Accuracy | AI Quality | Privacy | ATS Coverage | Price |
|---|---|---|---|---|---|
| Simplify Copilot | Medium | Low (template) | Cloud | ~8 ATS | Free/Pro |
| LazyApply | Low | None | Cloud | ~15 ATS | $49/mo |
| Jobright.ai | Medium | Medium | Cloud | ~12 ATS | $29/mo |
| **This Product** | **High** | **High (RAG+JD)** | **Local-first** | **Target: 15** | **Freemium** |

**Key differentiators**: Local-first privacy, confidence transparency, hybrid
deterministic+AI, JD-aware tailoring.

---

## 2. High-Level Architecture

```
Chrome Extension (MV3)
├── Content Script        — DOM interaction, form detection, field filling
├── Background Worker     — orchestration, API proxy, caching
├── Popup UI              — quick fill, status, override
├── Options Page          — profile editor, resume upload, settings
└── IndexedDB             — local profile, application history

Backend Services (AWS)
├── Profile API           — user profile CRUD
├── Resume Service        — parse + vectorize resumes
├── AI Orchestration      — LangGraph pipelines
├── Form Registry         — ATS adapter configs (versioned JSON)
└── Analytics             — anonymized fill telemetry

Storage
├── PostgreSQL            — user profiles, application records
├── Redis                 — session cache, rate limiting
├── S3                    — encrypted resume storage
└── pgvector              — resume embeddings for RAG (1024-dim, Voyage)
```

---

## 3. AI System Design

### Resume Understanding Pipeline
```
Input: PDF / DOCX
    ↓ [PDF: pdfminer.six | DOCX: python-docx]
Text extraction + section boundary detection (Regex + spaCy NER)
    ↓
Claude claude-sonnet-4-6 (structured extraction → JSON schema)
    ↓ Validation (Pydantic schema)
Embedding (voyage-3.5-lite, 1024-dim) → pgvector
    ↓
Normalized UserProfile JSON → LocalStorage + Backend
```

**Schema design** (abbreviated):
```json
{
  "personal": { "firstName": "", "lastName": "", "email": "", "phone": "", "location": {} },
  "workAuth": { "usAuthorized": true, "sponsorshipNeeded": false, "visaType": "USC" },
  "experience": [{ "company": "", "title": "", "startDate": "", "endDate": "", "bullets": [] }],
  "education": [{ "school": "", "degree": "", "major": "", "gpa": null, "year": "" }],
  "skills": { "technical": [], "languages": [], "certifications": [] }
}
```

### Job Description Understanding Pipeline
```
Content Script extracts visible JD text (DOM scraping)
    ↓ Background Worker → AI Orchestration
Claude extracts: { requiredSkills[], niceToHaveSkills[], yearsExp,
  domain, seniorityLevel, sponsorshipOffered, remotePolicy }
    ↓ Skill gap analysis: profile.skills vs JD.requiredSkills
Stored in session cache (Redis, TTL 1h)
```

### Question Answering Pipeline (RAG)
```
Form Question detected
    ↓ classifier: PERSONAL | EMPLOYMENT | BEHAVIORAL | VISA | SALARY | DIVERSITY
[IF BEHAVIORAL] RAG retrieval (embed question → cosine over resume chunks, top-3)
    → "Using these experiences {chunks}, write a STAR answer for {jd_summary}.
       Max 200 words, specific metrics." → Claude → confidence ~0.85
[IF VISA/SALARY/DIVERSITY] Deterministic rule engine, no AI call
    ↓
Response → UI with confidence badge → User Accept / Edit / Regenerate
```

### Model Recommendations

| Task | Recommended Model | Rationale |
|---|---|---|
| Resume parsing | `claude-sonnet-4-6` | Best structured extraction; reliable JSON |
| JD extraction | `claude-haiku-4-5` | Fast, cheap; extraction not generation |
| Free-text QA | `claude-sonnet-4-6` | Best reasoning + conciseness tradeoff |
| Cover letter | `claude-opus-4-8` | Tone + coherence matters most here |
| Embeddings | `voyage-3.5-lite` (Voyage AI) | Anthropic-recommended; cheap; 1024-dim sufficient |
| Classification | `claude-haiku-4-5` | Sub-100ms classification; cheap |

**Build vs Buy on models**: Use the Anthropic SDK directly for generation. Do NOT
use OpenAI on the primary path — Claude's instruction following on structured JSON
is more reliable. For embeddings, use **Voyage AI** (Anthropic's recommended
embeddings partner; Anthropic has no first-party embeddings API). Gemini Flash may
be kept as a cost fallback for classification only.

---

## 4. ATS Detection & Form Filling Engine

### Detection Strategy (scored pipeline)
Each candidate ATS gets a score 0–100; threshold 70+ triggers adapter load.
```
Score = URL_match(30) + DOM_fingerprint(40) + HTML_structure(20) + CSS_hints(10)
```

| Signal | Example |
|---|---|
| URL pattern | `greenhouse.io`, `lever.co`, `myworkdayjobs.com` |
| DOM fingerprint | `[data-qa="greenhouse-form"]`, `[aria-label="Workday"]` |
| HTML structure | Specific form field name patterns, hidden input names |
| CSS hints | Class prefixes `wdayApply-`, `LV-` |
| Script tags | `greenhouse.js`, `workday.com/wday/` |

### ATS Adapters (summary)

- **Greenhouse** — `boards.greenhouse.io/{slug}` + `[id^="field_order_"]`; file upload needs simulated drag-and-drop.
- **Lever** — `jobs.lever.co/{company}` + `.application-form`; submit button is outside the form (don't intercept).
- **Workday** — `*.myworkdayjobs.com` + `wdayApply`; multi-page wizard, React inputs need `nativeInputValueSetter` + dispatched `InputEvent`.
- **Ashby** — `jobs.ashbyhq.com` + `[data-form-id]`; JSON XHR payload, can augment before send.
- **iCIMS** — `careers.icims.com` + `icims_content`; iframe-embedded, session timeout ~15 min.

(Full per-adapter quirk notes retained from the original spec; implemented adapters
documented in `docs/IMPLEMENTATION.md`.)

---

## 5. Rule Engine Design
Deterministic `FIELD_RULES` map label/placeholder patterns → profile dot-paths with
a type and optional transform/flags. Confidence per rule:
- ATS adapter hard-coded field: **1.0**
- Exact label + type match: **0.97**
- Pattern match (label only): **0.85**
- Pattern match (placeholder only): **0.75**

SSN/EIN are blocklisted from all mappings. DIVERSITY answers are never AI-generated.
See `extension/src/rules/` for the implementation.

---

## 6. AI Fallback Strategy
Decision tree: rule-engine exact match (1.0, green) → pattern ≥0.90 (yellow) →
0.70–0.90 (confirm dialog) → <0.70 routes to AI (behavioral/motivation/cover) or a
user prompt (diversity/salary) or skip (red, "needs attention").

```python
def compute_confidence(label_match_score, ats_known_field, type_match, profile_value_exists):
    base = label_match_score
    if ats_known_field: base = max(base, 0.97)
    if not type_match: base *= 0.7
    if not profile_value_exists: base *= 0.0   # never fill with empty
    return min(base, 1.0)
```

---

## 7. Technical Stack

### Frontend (Extension)
- React 18 + TypeScript + Tailwind CSS
- Vite + `vite-plugin-web-extension` (MV3)
- State: Zustand
- Storage: `chrome.storage.local` (profile) + IndexedDB (history)
- IPC: `chrome.runtime.sendMessage`, `chrome.tabs.sendMessage`

### Backend Services
- Python 3.12+ + FastAPI
- LangGraph (stateful pipelines) + Anthropic SDK
- Voyage AI SDK for embeddings
- Observability: LangSmith + OpenTelemetry → Grafana/Tempo
- Resume parsing: pdfminer.six (PDF), python-docx (DOCX)
- Auth: Auth0 (OAuth2 PKCE)

### Databases

| Store | Tech | Why |
|---|---|---|
| User profiles | PostgreSQL (RDS) | Relational, reliable |
| Application history | PostgreSQL | ACID, queryable |
| Resume files | S3 + KMS | Encrypted at rest, presigned URLs |
| Resume embeddings | pgvector (1024-dim) | Collocated with profiles; avoid extra infra |
| Session cache | Redis (ElastiCache) | JD context, rate limits |

Avoid dedicated vector DB for MVP; pgvector at < 100k users is sufficient.

### Cloud (AWS)
```
Route53 → CloudFront → ALB
  ├── FastAPI (ECS Fargate, auto-scaled)
  └── Static assets (S3)
RDS PostgreSQL (Multi-AZ prod) · ElastiCache Redis · S3 (KMS) · Secrets Manager
CloudWatch + Grafana Cloud
```

---

## 8. Security & Privacy Design
- **Local-first default**: profile in `chrome.storage.local`, AES-256 via SubtleCrypto; AI proxied through BG worker → user's own API key; resume parsed client-side; zero PII leaves device.
- **Enhanced (cloud) mode**: explicit opt-in; KMS-encrypted resume upload; hashed analytics; GDPR delete/export; CCPA "Do Not Sell".
- **PII**: salary never logged server-side; SSN/EIN blocklisted; diversity fields deterministic-only and never logged; only resume chunk embeddings persisted server-side, never raw text.
- **Secrets**: extension keys in `chrome.storage.session`; backend via Secrets Manager (quarterly rotation); PKCE-only auth.

---

## 9. MVP Roadmap

| Phase | Weeks | Goal | Effort |
|---|---|---|---|
| **1 — Basic Autofill** | 1–8 | 80% of structured fields on Greenhouse + Lever + Ashby; rule engine; confidence badges; local history | 2 eng |
| **2 — ATS Coverage** | 9–16 | 10 ATS incl. Workday, iCIMS, LinkedIn Easy Apply; remote adapter config; profile sync | 3 eng |
| **3 — AI Answers** | 17–24 | Resume parse, JD extraction, RAG, classifier, behavioral/motivation gen; LangSmith | 3 eng |
| **4 — Cover Letters & Polish** | 25–32 | Cover letters (Opus), analytics dashboard, onboarding, CWS launch | 2–3 eng |
| **5 — Agentic Workflows** | 33–52 | Multi-tab orchestration, job-search integration, "apply to N" agent | Full team |

**This repo = Phase 1 foundation.**

---

## 10. Future Vision
- **12 mo — AI Job Search Copilot**: proactive matching, status tracking, interview prep gen.
- **18 mo — AI Career Coach**: skill-gap analysis, learning paths, salary benchmarking, resume scoring.
- **24 mo — Autonomous Application Agent**: LangGraph multi-agent (Researcher + Writer + Submitter), VLM self-healing nav, company research.
- **3 yr — Career Intelligence Platform**: longitudinal modeling, network graph, offer-negotiation assistant, enterprise API.

---

## Appendix A: Major Technical Risks & Mitigations

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| ATS DOM changes break adapters | High | High | Remote adapter config (JSON hotfix); adapter regression tests |
| MV3 BG worker memory limits | Med | Med | Offload AI to backend; keep BG worker thin |
| LLM hallucination on structured fields | Low | High | Never use LLM for structured fields; rule engine only |
| Banned from Chrome Web Store | Low | Fatal | Strict CWS policy compliance; user-initiated fills only; never auto-submit |
| GDPR/CCPA non-compliance | Med | High | Local-first default; legal review before EU launch |
| AI API rate limits | Med | Med | Exponential backoff + user-owned API key option |

## Appendix B: Cost Estimates

### AI Inference (per 1000 applications)

| Task | Model | Cost |
|---|---|---|
| Resume parse (1×/user) | `claude-sonnet-4-6` | $0.009 |
| JD extraction | `claude-haiku-4-5` | $0.0013 |
| Question classification (5/app) | `claude-haiku-4-5` | $0.0006 |
| Free-text answers (3/app) | `claude-sonnet-4-6` | $0.018 |
| Cover letter | `claude-opus-4-8` | $0.054 |
| **Total per application** | | **~$0.012–$0.075** |

### Infrastructure (MVP, 1000 MAU): ~$195/month. Scale to 10k MAU: ~$800/month.

## Appendix C: Build vs Buy

| Component | Decision | Reason |
|---|---|---|
| Auth | Buy (Auth0) | Complex; $0 at < 7000 MAU |
| LLM | Buy (Anthropic) | Infra cost > API cost at this scale |
| Vector DB | Build on pgvector | < 100k users |
| Resume parser | Build (pdfminer + Claude) | Off-shelf parsers $$$; Claude better |
| Analytics | Buy (PostHog) | Self-hosted, GDPR-compliant |
| Error tracking | Buy (Sentry) | Standard; $26/mo |
| Email | Buy (Resend) | Simple transactional; $20/mo |
