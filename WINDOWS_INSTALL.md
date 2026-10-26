# Windows Installation Guide

This guide covers running AI-Study-Assistant on Windows in development,
building the installer, and configuring the installed app.

## Prerequisites

### All setups

- **PostgreSQL 15+ with pgvector**
  - PostgreSQL: https://www.postgresql.org/download/windows/
  - pgvector Windows builds: https://github.com/pgvector/pgvector
  - Enable the extension in the `ai_study_assistant` database:
    ```sql
    CREATE EXTENSION IF NOT EXISTS vector;
    ```
- **A provider API key**
  - Cohere: `COHERE_API_KEY`
  - OpenAI: `OPENAI_API_KEY` (optional `OPENAI_API_URL`)
  - Google Gemini: `GEMINI_API_KEY`

### Docker setup

- Docker Desktop 4+ with the WSL 2 backend and at least 4 GB RAM.
- Git for Windows (optional, for cloning).

### Native development setup

- Python 3.11+ (3.12 recommended), with "Add Python to PATH" enabled.
- Node.js 18+ and npm.
- Visual C++ Build Tools for native Python packages:
  https://visualstudio.microsoft.com/visual-cpp-build-tools/

### Installer build setup

- Everything from native development, plus PowerShell 5.1 or PowerShell 7.
- Network access for `pip install`, `npm install`, and NuGet/electron-builder
  downloads.
- PyInstaller is installed by the build script (`pyinstaller==6.11.1`).

## Option 1: PostgreSQL in Docker

The compose file in `docker/` starts PostgreSQL + pgvector; it does not run the
FastAPI backend. The backend runs on the host in both development and the
installed desktop app.

1. Create the Docker environment file:

```powershell
cd docker
copy .env.example .env
notepad .env
```

2. Set the database password:

```env
POSTGRES_PASSWORD=your_secure_password
```

3. Start PostgreSQL:

```powershell
docker compose -f docker-compose.yml up -d pgvector
```

4. Create the application database and enable pgvector:

```powershell
docker exec -it pgvector psql -U postgres -c "CREATE DATABASE ai_study_assistant;"
docker exec -it pgvector psql -U postgres -d ai_study_assistant -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

5. Configure `src\.env` with port `5400`:

```env
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5400
POSTGRES_MAIN_DATABASE=ai_study_assistant

GENERATION_BACKEND=OPENAI
EMBEDDING_BACKEND=COHERE
OPENAI_API_KEY=
COHERE_API_KEY=
```

Then follow the native backend steps below. `/api/v1/health` returns `200` when
the database and vector store are ready and `503` with a `degraded` status
otherwise.

## Option 2: Native backend

### 1. Create the database

Create a `ai_study_assistant` database and enable pgvector:

```sql
CREATE DATABASE ai_study_assistant;
\c ai_study_assistant
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Install Python dependencies

From the repository root:

```powershell
cd src
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configure the environment

```powershell
copy .env.example .env
notepad .env
```

Set database and provider values:

```env
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_MAIN_DATABASE=ai_study_assistant

GENERATION_BACKEND=OPENAI
EMBEDDING_BACKEND=COHERE
OPENAI_API_KEY=
COHERE_API_KEY=
GEMINI_API_KEY=
```

Keep `EMBEDDING_MODEL_SIZE` aligned with `EMBEDDING_MODEL_ID`.

### 4. Apply migrations

Back up the database first if it already contains data, then run:

```powershell
# Recommended (programmatic runner with auto-stamping):
cd src
python -m helpers.migrations upgrade head

# Or directly with Alembic:
cd src\models\db_schemes\minirag
alembic upgrade head
```

The packaged backend runs this automatically on startup and can stamp schemas
that predate Alembic. Back up existing study material before the first launch
of a new version.

### 5. Start the backend

```powershell
cd src
python main.py
```

Or use the helper script from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File frontend\scripts\backend-dev.ps1
```

The helper binds to `127.0.0.1:5000` and enables reload. Pass `-NoReload` to
disable it, or `-Python "C:\path\python.exe"` to select an interpreter.

## Run the desktop app in development

```powershell
cd frontend
npm install
npm run electron:dev
```

`npm run electron:dev` builds the Electron main/preload code, starts Vite, and
opens Electron. Electron starts and supervises the backend itself; do not run a
second backend on the same port. Set `AISTUDY_PYTHON` if Python is not on
`PATH` under the expected name.

To develop only the renderer in a browser, start the backend in one terminal and
`npm run dev` in another.

## Build the installer

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File frontend\scripts\build-installer.ps1
```

The script performs:

1. `npm install` when `frontend\node_modules` is missing.
2. `npm run typecheck`.
3. `npm run test` (skip with `-SkipTests`).
4. PyInstaller one-file backend build (skip with `-SkipBackend`).
5. Renderer and Electron builds.
6. `electron-builder --win --publish never`.

Output:

```
frontend\dist\AI-Study-Assistant Setup 1.0.0.exe
```

Manual equivalent:

```powershell
cd frontend
npm install
npm run backend:build
npm run dist:win
```

`npm run dist:win` builds the renderer and Electron code but does **not** build
the backend executable. Run `backend:build` first, or run
`build-installer.ps1`, which performs both.

### What is bundled

- Electron main process, preload script, and renderer (`app.asar`).
- `AIStudyAssistantBackend.exe` under `resources\backend`.
- Application and installer icons from `frontend\assets`.

### What is not bundled

- PostgreSQL or pgvector.
- Provider API keys.
- A `.env` or `config.json` file.
- Existing projects, documents, or vector data.

## First launch of the installed app

The installed app reads configuration from:

```
%APPDATA%\AI-Study-Assistant\.env
%APPDATA%\AI-Study-Assistant\config.json
```

Create `.env` using `src\.env.example` as the template for provider keys and
other secrets. Non-secret settings such as database host/port, models, and
`FILE_MAX_SIZE` may go in `config.json`; `.env` takes precedence when both
files set the same key. Unknown keys and secrets in `config.json` are ignored.
The app starts its bundled backend on a free loopback port (or `PORT` if set in
either file) and points it at local PostgreSQL.

Runtime files:

| Item | Location |
|------|----------|
| Configuration | `%APPDATA%\AI-Study-Assistant\.env` and `config.json` |
| Backend log | `%APPDATA%\AI-Study-Assistant\backend.log` |
| Uploaded files, previews, local data | `%APPDATA%\AI-Study-Assistant\data` |

Override the data location with `AISTUDY_DATA_DIR` in the same `.env` file.
`config.json` accepts only allowlisted non-secret scalar settings such as
`PORT`, database connection values, model names, and `FILE_MAX_SIZE`; provider
keys and unknown keys are ignored there. Packaged mode binds to `127.0.0.1`,
disables reload, and runs migrations automatically unless
`AISTUDY_AUTO_MIGRATE=0`.

## Configuration reference

### Required

- PostgreSQL connection settings.
- A key for each provider selected by `GENERATION_BACKEND` and
  `EMBEDDING_BACKEND`.

### Commonly changed

| Setting | Meaning |
|---------|---------|
| `GENERATION_BACKEND` | `OPENAI`, `GEMINI`, or `COHERE` |
| `EMBEDDING_BACKEND` | `OPENAI`, `GEMINI`, or `COHERE` |
| `GENERATION_MODEL_ID` | Generation model name |
| `EMBEDDING_MODEL_ID` | Embedding model name |
| `EMBEDDING_MODEL_SIZE` | Vector dimensions; must match the model |
| `FILE_MAX_SIZE` | Max upload size in MB (default 10) |
| `VECTOR_DB_BACKEND` | `PGVECTOR` (default) or `QDRANT` |
| `PRIMARY_LANG` / `DEFAULT_LANG` | Prompt language / fallback |
| `AISTUDY_DATA_DIR` | Data directory override |
| `PORT` | Fixed backend port; omit to let Electron choose one |

Data locations:

- Uploaded PDFs: `AISTUDY_DATA_DIR\assets\files\{project_id}`
- Generated previews: `...\previews`
- Database: PostgreSQL `ai_study_assistant`

## Troubleshooting

### Port 5000 already in use

```powershell
netstat -ano | findstr :5000
```

Stop the conflicting process, choose another port in `src\.env` (`PORT=5001`),
or remove `PORT` so the Electron backend manager allocates a free port.

### Backend logs

Installed app:

```powershell
Get-Content "$env:APPDATA\AI-Study-Assistant\backend.log" -Tail 100
```

Development: use the terminal running `python main.py`.

### Database connection failures

```powershell
# Is PostgreSQL listening?
Test-NetConnection localhost -Port 5432

# Inspect the database objects
psql -U postgres -h localhost -d ai_study_assistant -c "\dt"
```

### pgvector missing

```sql
\c ai_study_assistant
CREATE EXTENSION IF NOT EXISTS vector;
```

### Installer build fails during PyInstaller

- Confirm Python 3.11/3.12 is the interpreter passed to the script.
- Run `pip install -r src\requirements.txt` first and fix any native build
  errors.
- Build from a path without restrictive long-path or permission issues.
- Re-run with `-SkipInstall` only after dependencies and PyInstaller are
  already installed.

### Installer build fails during electron-builder

- Ensure `frontend\build\backend\AIStudyAssistantBackend.exe` exists.
- Ensure `frontend\build\renderer\index.html` exists.
- Delete `frontend\node_modules` and `frontend\dist`, then run `npm install`.
- Verify `frontend\assets\icon.ico` is present (regenerate with
  `npm run icons`).

### Long path issues

```powershell
git config --system core.longpaths true
```

Or enable `LongPathsEnabled` under
`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`.

## Backup and restore

```powershell
# Backup
pg_dump -U postgres -h localhost ai_study_assistant > ai_study_assistant-backup.sql

# Restore
psql -U postgres -h localhost ai_study_assistant < ai_study_assistant-backup.sql

# Backup uploaded documents and previews
Copy-Item "$env:APPDATA\AI-Study-Assistant\data" .\ai_study_assistant-data -Recurse
```

Back up PostgreSQL and the data directory together so document records and
files stay consistent.

## Uninstall

1. Windows Settings -> Apps -> AI-Study-Assistant -> Uninstall.
2. Optionally remove configuration and data:

```powershell
Remove-Item "$env:APPDATA\AI-Study-Assistant" -Recurse
```

3. Optionally drop the database:

```sql
DROP DATABASE ai_study_assistant;
```

## Support

- API reference: [API_DOCS.md](API_DOCS.md)
- General troubleshooting: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Interactive API docs when the backend is running:
  http://localhost:5000/docs
