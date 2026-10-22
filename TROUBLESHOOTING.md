# Troubleshooting Guide - AI-Study-Assistant

## Quick Diagnostics

```bash
# API and dependencies
curl http://localhost:5000/api/v1/health
curl http://localhost:5000/api/v1/system/info

# PostgreSQL (Docker compose service uses host port 5400)
docker ps
docker logs pgvector --tail 100

# Packaged app logs (Windows)
Get-Content "$env:APPDATA\AI-Study-Assistant\backend.log" -Tail 100
```

| Check | Expected |
|-------|----------|
| `GET /api/v1/health` | `200` and `"status": "ok"` |
| `/api/v1/health` degraded | `503` with `database.connected` or `vectordb.connected` false |
| `GET /api/v1/` | `{"message":"AI-Study-Assistant","version":"0.1"}` |
| `GET /docs` | Swagger UI loads |

## Backend Startup

### `ModuleNotFoundError`

```bash
cd src
pip install -r requirements.txt --force-reinstall
```

Confirm you activated the same virtual environment used to run `python main.py`.

### Database connection failed

Symptoms include `asyncpg` connection errors or SQLAlchemy `OperationalError`.

```bash
# Inspect effective settings (do not paste secrets into issues)
cd src
python -c "from helpers.config import get_settings; s=get_settings(); print(s.POSTGRES_HOST, s.POSTGRES_PORT, s.POSTGRES_MAIN_DATABASE)"

# Docker PostgreSQL is exposed on port 5400 by docker/docker-compose.yml
docker ps | grep pgvector
docker exec -it pgvector pg_isready -U postgres

# If using the compose service, src/.env should contain:
# POSTGRES_HOST=127.0.0.1
# POSTGRES_PORT=5400
```

Create the database if it does not exist:

```bash
docker exec -it pgvector psql -U postgres -c "CREATE DATABASE ai_study_assistant;"
```

### pgvector extension missing

Error: `type "vector" does not exist`

```sql
\c ai_study_assistant
CREATE EXTENSION IF NOT EXISTS vector;
```

### Migrations not applied

```bash
cd src/models/db_schemes/ai_study_assistant
alembic upgrade head
```

The packaged backend runs migrations automatically on startup. Look for
`Auto-migration failed` in `backend.log` if startup is degraded.

### Provider key missing or rejected

```bash
# Check which providers are selected (not the secret values)
cd src
python -c "from helpers.config import get_settings; s=get_settings(); print(s.GENERATION_BACKEND, s.EMBEDDING_BACKEND)"
```

- Set the key for each selected backend. Combining OpenAI generation with
  Cohere embeddings requires both `OPENAI_API_KEY` and `COHERE_API_KEY`.
- `401`/`403` means the key is invalid or lacks access to the model.
- `429` means quota or rate limiting; wait and retry or switch providers.
- Keep `EMBEDDING_MODEL_SIZE` consistent with the embedding model.

### Port already in use

```bash
# Linux/macOS
lsof -i :5000

# Windows
netstat -ano | findstr :5000
```

Set `PORT` in `src/.env` (development), or remove `PORT` so Electron allocates
a free loopback port. The packaged backend ignores external interfaces and
binds to `127.0.0.1`.

## Upload and Processing

### Upload rejected

| Signal | Cause |
|--------|-------|
| `file_type_not_supported` | Content is not a readable PDF (despite the MIME type) |
| `file_size_exceeded` | File exceeds `FILE_MAX_SIZE` MB (default 10) |
| `file_upload_failed` | File could not be written to the data directory |
| `project_not_found` | Invalid project ID |

The renderer also rejects non-PDF files and files over 10 MB before upload.

### Upload succeeds but processing fails

Check the document's `status` and `error_message`:

```bash
curl http://localhost:5000/api/v1/projects/1/documents
```

Common causes:

- Corrupted or encrypted PDF.
- Empty/scanned PDF with no extractable text.
- Provider outage or invalid embedding key during the embedding stage.
- Insufficient memory for very large PDFs.

Use **Reprocess** after fixing the cause, or call:

```bash
curl -X POST http://localhost:5000/api/v1/projects/1/documents/1/reprocess
```

### Status appears stuck

Processing is synchronous and the UI polls the document list. If the backend
was restarted mid-run, the status may remain at an intermediate value. Reprocess
the document; old chunks and vectors are removed first, so it is safe to retry.

### Duplicate upload is skipped

This is expected. Deduplication uses the SHA-256 content hash within a project.
The existing document is returned with `"duplicate": true`.

### PDF preview is blank or unavailable

- Only the first `MAX_PREVIEW_PAGES` pages (default 10) get previews.
- Previews are generated at `PREVIEW_DPI` (default 150).
- Open the original PDF from the document menu if a preview is missing.
- A failed preview generation does not fail processing; the document still
  becomes `ready`.

## Search and RAG

### Search returns no results

- Process documents first; indexing happens during processing.
- Verify the project contains `ready` documents.
- Lower `similarity_threshold` or clear it.
- If embeddings changed, reset and re-index:

```bash
curl -X POST http://localhost:5000/api/v1/nlp/index/push/1 \
  -H "Content-Type: application/json" \
  -d '{"do_reset": 1}'
```

### RAG returns `rag_answer_error`

This means retrieval returned no usable chunks. Check the same causes as search.
An answer containing "insufficient information" is a normal model response when
the retrieved context does not contain the answer.

### Chat history is lost

Chat history is kept in renderer session state and is not persisted to the
database. Refreshing or starting a new chat clears it.

## Electron and the Installed App

### Backend fails to start in Electron

1. Confirm Python is available:

```bash
python --version
```

2. Set `AISTUDY_PYTHON` to the full interpreter path if needed.
3. For the installed app, check:

```powershell
Get-Content "$env:APPDATA\AI-Study-Assistant\backend.log" -Tail 100
```

4. Confirm `%APPDATA%\AI-Study-Assistant\.env` exists with valid provider
   keys, and that `.env` or `config.json` has the correct PostgreSQL settings.
5. Confirm PostgreSQL is running and migrations have been applied.

### Installed app shows a degraded backend

The backend process is healthy but a dependency is not:

- `database.connected: false` -> PostgreSQL settings, database missing, or
  pgvector unavailable.
- `vectordb.connected: false` -> pgvector/Qdrant connection failed.
- `generation.configured`/`embedding.configured: false` -> missing API keys.

The API remains reachable while degraded so the UI can display the status.

### `Backend executable not found`

The installer was built without the backend:

```powershell
cd frontend
npm run backend:build
npm run dist:win
```

Confirm `frontend\build\backend\AIStudyAssistantBackend.exe` exists before
electron-builder runs.

### Blank window or renderer load failure

Rebuild:

```powershell
cd frontend
rmdir /s /q node_modules, dist, build
npm install
npm run build
npm run build:electron
```

For development, use `npm run electron:dev` (Vite + Electron). `npm run dev`
opens only the browser renderer.

### API calls fail with CORS in a browser

Browsers need an explicit allowlist:

```env
CORS_ALLOW_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
```

Electron does not use CORS; it sends requests through the main process IPC
bridge. A permissive CORS policy is neither needed nor recommended.

## Docker PostgreSQL

### Port conflict

The compose file maps PostgreSQL to host port `5400` and MongoDB to `27007`.
Change the host side of the mapping if needed, then update `src/.env`.

### Data persistence

```bash
# Backup
docker exec pgvector pg_dump -U postgres ai_study_assistant > backup.sql

# Restore
docker exec -i pgvector psql -U postgres ai_study_assistant < backup.sql

# Volumes persist across restarts
docker compose down     # keeps data
docker compose down -v  # WARNING: deletes database volumes
```

### Out of memory

Increase Docker Desktop memory, or add limits to the `pgvector` service under
`deploy.resources.limits`.

## Performance

- Reduce `limit` (default 5) for search and answers.
- Lower `MAX_PREVIEW_PAGES` or `PREVIEW_DPI` to speed up processing.
- Indexing is done in pages of chunks; large projects take longer.
- HNSW indexes are created by the PGVector provider after the configured
  `VECTOR_DB_PGVEC_INDEX_THRESHOLD` (default 100 records).
- Provider latency dominates embedding and answer generation time.

## Collecting Debug Information

```bash
python --version
node --version
npm --version
docker version

# Sanitized settings
cd src
python - <<'PY'
from helpers.config import get_settings
s = get_settings()
for key in ("POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_MAIN_DATABASE",
            "GENERATION_BACKEND", "EMBEDDING_BACKEND",
            "EMBEDDING_MODEL_ID", "EMBEDDING_MODEL_SIZE"):
    print(f"{key}={getattr(s, key)}")
PY
```

Do not include API keys or database passwords in issues.

## FAQ

**Can I run without Docker?**
Yes. Install PostgreSQL 15+ and pgvector natively, then follow
[WINDOWS_INSTALL.md](WINDOWS_INSTALL.md) or [README.md](README.md).

**Can I use local LLMs?**
Not out of the box. Add a provider in `stores/llm/Provider/` and register it in
`LLMProviderFactory`.

**How do I change the embedding model?**
Update `EMBEDDING_MODEL_ID` and `EMBEDDING_MODEL_SIZE`, then re-index every
project with `do_reset: 1`.

**Can I use Qdrant instead of PGVector?**
Set `VECTOR_DB_BACKEND=QDRANT` and configure a reachable Qdrant instance. The
default and tested path is PGVector.

**How do I back up study materials?**
Back up the PostgreSQL `ai_study_assistant` database and the data directory
(`%APPDATA%\AI-Study-Assistant\data` for the installed app) together.

**Why do citations show "Page N/A"?**
The chunk has no page metadata. Reprocess the document with the current version
to regenerate page-aware chunks.

**Why are citations off by one page?**
Older builds stored PyMuPDF's 0-based page index. Current processing stores
1-based page numbers. Reprocess the affected documents to refresh their chunks.

---

*Last updated: 2026-10-21*
*Version: 1.0.0*
