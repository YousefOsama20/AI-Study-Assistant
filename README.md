# Mini-RAG Study Assistant

A local-first desktop study assistant that turns your PDFs into a searchable,
citable knowledge base. Upload course material, process it, search it
semantically, and ask questions answered only from your documents.

The app is a React + TypeScript renderer inside Electron, backed by a FastAPI
service, PostgreSQL + pgvector, and your choice of OpenAI, Gemini, or Cohere.

## Features

- Project-based study material management (create, rename, delete).
- Multi-PDF upload with validation, upload progress, and SHA-256 duplicate
  detection.
- Background-friendly processing with visible status: uploaded, extracting,
  chunking, embedding, indexing, ready, failed.
- Page-level PDF previews and original-PDF download.
- Semantic search with page references and similarity scores.
- RAG question answering with source citations and in-session chat history.
- English and Arabic UI, light/dark/system themes, search defaults, density,
  and reduced-motion preferences.
- Windows NSIS installer with a bundled PyInstaller backend executable.

## Architecture

```
frontend/  Electron main + preload, React renderer, Vitest tests
src/       FastAPI app, controllers, models, LLM/vector stores, migrations
docker/    PostgreSQL + pgvector and backend containers
```

The renderer never talks to the backend port directly. In Electron it uses IPC;
in a browser it can use HTTP with a narrow CORS allowlist. The Electron main
process starts and supervises the backend, allocates a loopback port, and
exposes only an allowlisted set of API routes to the renderer.

## Requirements

- Python 3.11+ (3.12 recommended)
- Node.js 18+ and npm
- PostgreSQL 15+ with the pgvector extension, or Docker Desktop
- Keys for the selected generation and embedding providers (OpenAI, Gemini,
  or Cohere; they may be different providers)

Windows installer builds additionally require PowerShell, PyInstaller, and the
Visual C++ build tools needed by the Python dependencies. See
[WINDOWS_INSTALL.md](WINDOWS_INSTALL.md).

## Configuration

Create the backend environment file:

```bash
cp src/.env.example src/.env
```

Then edit `src/.env`. The important settings are:

```env
POSTGRES_USERNAME="postgres"
POSTGRES_PASSWORD="your-password"
POSTGRES_HOST="localhost"
POSTGRES_PORT=5432
POSTGRES_MAIN_DATABASE="minirag"

GENERATION_BACKEND="OPENAI"
EMBEDDING_BACKEND="COHERE"
OPENAI_API_KEY=""
COHERE_API_KEY=""
GEMINI_API_KEY=""

GENERATION_MODEL_ID="gpt-3.5-turbo-0125"
EMBEDDING_MODEL_ID="embed-multilingual-light-v3.0"
EMBEDDING_MODEL_SIZE=384
```

Notes:

- `GENERATION_BACKEND` and `EMBEDDING_BACKEND` are independent. You can use
  Gemini for both, OpenAI for both, or mix providers.
- `EMBEDDING_MODEL_SIZE` must match the embedding model. Changing it requires
  re-indexing all projects.
- `FILE_MAX_SIZE` is in MB (default `10`).
- `PRIMARY_LANG` controls the prompt language (`en` or `ar`).
- For local browser development set a narrow CORS allowlist, for example
  `CORS_ALLOW_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"`.

## Start PostgreSQL with Docker

The compose file in `docker/` provides PostgreSQL + pgvector (and a legacy
MongoDB service that the application does not use). It does not run the
FastAPI backend.

```bash
cd docker
cp .env.example .env
# Set POSTGRES_PASSWORD in docker/.env
docker compose up -d pgvector
```

The database is exposed on host port `5400`. Create the application database
and enable pgvector:

```bash
docker exec -it pgvector psql -U postgres -c "CREATE DATABASE minirag;"
docker exec -it pgvector psql -U postgres -d minirag -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Point `src/.env` at it:

```env
POSTGRES_USERNAME="postgres"
POSTGRES_PASSWORD="the password from docker/.env"
POSTGRES_HOST="127.0.0.1"
POSTGRES_PORT=5400
POSTGRES_MAIN_DATABASE="minirag"
```

Then follow the backend steps below and run the API on the host.

## Install and run the backend

1. Install dependencies:

```bash
cd src
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

2. Back up the database, then apply migrations from the repository root:

```bash
cd src/models/db_schemes/minirag
alembic upgrade head
```

`helpers/migrations.py` handles fresh databases and stamps pre-existing schemas
that were created before Alembic. Back up any database that already contains
study material before upgrading.

3. Start the backend:

```bash
cd src
python main.py
```

Development defaults are `http://0.0.0.0:5000` with reload enabled. Set
`HOST`, `PORT`, or `RELOAD` in the environment to override them. The API is then
available at `http://localhost:5000`, interactive docs at
`http://localhost:5000/docs`, and health at
`http://localhost:5000/api/v1/health`.

## Run the desktop app in development

```bash
cd frontend
npm install
npm run electron:dev
```

`npm run electron:dev` builds the Electron main/preload code, starts the Vite
dev server, and opens Electron. Electron starts and supervises its own backend
process using `python` (Windows) or `python3` (Linux/macOS); set
`MINIRAG_PYTHON` to use a specific interpreter. Do not start a second backend
on the same port.

To develop only the renderer in a browser, start the backend separately:

```bash
# Terminal 1
cd src && python main.py

# Terminal 2
cd frontend && npm run dev
```

## Tests and checks

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

Backend static syntax check:

```bash
cd src
python -m compileall -q .
```

The repository does not include a backend test suite. Full API/database
integration checks require a running PostgreSQL/pgvector instance, provider
keys, and a backend process; those were not run in this Linux environment.

## Build the Windows installer

Run PowerShell from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File frontend\scripts\build-installer.ps1
```

The script installs npm dependencies if needed, runs typecheck and tests,
builds the PyInstaller backend, builds the renderer and Electron processes, and
runs electron-builder. The installer is written to:

```
frontend\dist\Mini-RAG Study Assistant Setup 1.0.0.exe
```

To run the stages separately:

```powershell
cd frontend
npm install
npm run backend:build     # build\backend\MiniRAGBackend.exe
npm run dist:win          # frontend\dist\*.exe
```

The icon assets are committed. To regenerate them, install Pillow
(`pip install pillow`) and run `npm run icons`.

The bundled backend is a one-file executable. The installer does **not** bundle
PostgreSQL, pgvector, provider keys, or a `.env` file. Before first launch,
install PostgreSQL + pgvector and create:

```
%APPDATA%\Mini-RAG Study Assistant\.env
```

Use `src/.env.example` as the template. Non-secret settings may also be placed
in `%APPDATA%\Mini-RAG Study Assistant\config.json`; values in `.env` take
precedence. Unknown keys, provider keys, and other secrets in `config.json` are
ignored, so keep secrets in `.env`. Packaged data defaults to
`%APPDATA%\Mini-RAG Study Assistant\data`, and backend logs are written to
`%APPDATA%\Mini-RAG Study Assistant\backend.log`.

The build scripts target Windows. Cross-building the NSIS installer and
PyInstaller executable from Linux is not supported by this repository.

## API

See [API_DOCS.md](API_DOCS.md) for endpoints, payloads, and examples. Start at
`GET /api/v1/health` for a readiness check and `GET /api/v1/system/info` for
non-secret runtime configuration.

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Common issues include PostgreSQL
not running, the pgvector extension missing, provider keys not configured, and
choosing an embedding size that does not match the model.

## License

Apache-2.0.
