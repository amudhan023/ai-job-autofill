# Ubuntu deployment (Postgres+pgvector + backend)

Runs the FastAPI backend with a real Postgres+pgvector database, so the
extension's persisted knowledge-base corpus gets real SQL cosine-similarity
search instead of the SQLite/dev fallback (linear-scan Python cosine).

## Setup

```bash
cd deploy
cp .env.example .env   # fill in GEMINI_API_KEY at minimum
docker compose up -d --build
curl http://localhost:8000/health   # {"status":"ok","ai_enabled":true}
```

Then, in the extension's Settings, set Backend URL to
`http://<ubuntu-host>:8000` and click "Test connection".

If port 8000 is already taken on the host, set `BACKEND_PORT` in `.env` to an
open port (e.g. `8001`) before `docker compose up` — the container still
listens on 8000 internally, only the published host port changes. Update the
extension's Backend URL to match.

## Optional: ANN index

At small corpus sizes (a personal knowledge base — dozens to low hundreds of
chunks) the exact-search query pgvector runs by default is fast enough with
no index. If the corpus grows much larger, add an approximate index manually:

```sql
CREATE INDEX ON rag_chunks USING hnsw (vector vector_cosine_ops);
```

## Data persistence

Postgres data lives in the named volume `deploy_db-data`. `docker compose down`
keeps it; `docker compose down -v` deletes it.
