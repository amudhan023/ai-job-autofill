# Backend — AI Job Autofill

FastAPI service for profile sync, resume parsing, and AI orchestration.

> Phase 1 skeleton: profile CRUD is in-memory; resume + AI endpoints are stubbed
> and return safe defaults until keys/pipelines land in Phase 3. The app boots
> with no API keys.

## Run

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # optional; AI stays stubbed without ANTHROPIC_API_KEY
uvicorn app.main:app --reload
```

- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | live; reports model IDs + `ai_enabled` |
| GET/PUT | `/profile/{user_id}` | in-memory (swap for Postgres) |
| POST | `/resume/parse` | PDF/DOCX → Claude → profile (stub without key) |
| POST | `/ai/classify` | question category (keyword + LLM) |
| POST | `/ai/jd` | JD structured extraction |
| POST | `/ai/answer` | RAG + STAR free-text answer |
| POST | `/ai/cover-letter` | cover letter (Opus), styles |
| POST | `/jobs/rank` | deterministic job–candidate match ranking |

AI endpoints run real logic when `ANTHROPIC_API_KEY` is set; otherwise they
return safe stubs. All logic is unit-tested with fakes (`app/services/fakes.py`).

## Models
See `app/core/config.py`. Defaults follow `PLAN.md` §3 (cover letter =
`claude-opus-4-8`; embeddings = `voyage-3.5-lite` via Voyage AI).
