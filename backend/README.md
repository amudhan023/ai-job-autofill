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

## Endpoints (skeleton)

| Method | Path | Status |
|---|---|---|
| GET | `/health` | ✅ live |
| GET/PUT | `/profile/{user_id}` | ✅ in-memory |
| POST | `/resume/parse` | 🚧 stub (Phase 3) |
| POST | `/ai/jd` | 🚧 stub (Phase 3) |
| POST | `/ai/answer` | 🚧 stub (Phase 3) |

## Models
See `app/core/config.py`. Defaults follow `PLAN.md` §3 (cover letter =
`claude-opus-4-8`; embeddings = `voyage-3.5-lite` via Voyage AI).
