# Windows Installation Guide

AI-Study-Assistant is a local-first desktop study assistant. On Windows it runs
as an Electron app with a bundled FastAPI backend. The release installer is a
**limited beta**: Docker Desktop is a documented prerequisite for the bundled
database, and the installer is currently unsigned.

This guide covers two audiences:

- [Install the released app](#install-the-released-app)
- [Build from source](#build-from-source)
- [Configuration and data](#configuration-and-data)
- [Troubleshooting](#troubleshooting)
- [Backup and uninstall](#backup-and-uninstall)

---

## Install the released app

### What you need

| Requirement | Notes |
|---|---|
| Windows 10/11 x64 | Windows 10 21H2 or newer recommended. |
| Docker Desktop 4+ | Must be installed and running with the WSL 2 backend. Used for the local PostgreSQL + pgvector container. |
| One AI API key | OpenAI is the default for answers and embeddings. Cohere and Google Gemini are also supported. |
| ~1 GB free disk | The installer, application, and database image. Course PDFs and the database need additional space. |

You do **not** need Python, Node.js, PostgreSQL, or pgvector installed for the
installed app. Docker Desktop is the only runtime prerequisite.

### 1. Download the installer

Download these two files from the repository's **Releases** page:

- `AI-Study-Assistant Setup 1.0.0.exe`
- `SHA256SUMS.txt`

If no release asset is published yet, build the installer from source using the
[developer instructions](#build-from-source).

### 2. Verify the download (recommended)

```powershell
Get-FileHash ".\AI-Study-Assistant Setup 1.0.0.exe" -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

The two hashes must match.

### 3. Install

1. Run the installer.
2. Windows SmartScreen may show **Unknown publisher** because the beta installer
   is not code-signed. Choose **More info → Run anyway** only if you downloaded
   the file from the official Releases page and the hash matches.
3. Choose an install location (per-user install; administrator rights are not
   required).
4. Launch **AI-Study-Assistant** from the Start menu or desktop shortcut.

### 4. Start Docker Desktop

The bundled PostgreSQL + pgvector service runs in Docker. Start Docker Desktop
and wait until it reports that the engine is running.

The first database start pulls `pgvector/pgvector:0.8.6-pg18-trixie`. This can
take a few minutes on a slow connection. The container is named
`ai-study-assistant-pgvector-1` and keeps running after the app closes so your
data remains available.

### 5. Complete the setup wizard

The first launch opens a three-step wizard.

#### Step 1 — Database

**Docker Desktop (recommended)**

1. Select **Docker Desktop**.
2. Click **Check Docker**. The wizard reports the Docker and Compose versions.
3. Click **Start database**. The app generates a strong database password,
   stores it in your user profile, starts the container, and waits until it is
   healthy.
4. Click **Test connection**, then **Initialize database**. The app creates the
   database if needed, enables the `vector` extension, and applies schema
   migrations.

**Existing PostgreSQL**

1. Select **Existing PostgreSQL**.
2. Enter the host, port, database name, user name, and password.
3. The server must already have the [pgvector](https://github.com/pgvector/pgvector)
   extension available. The user must be able to create the database (if it
   does not exist) and run `CREATE EXTENSION vector`.
4. Click **Test connection**, then **Initialize database**.

#### Step 2 — AI providers

- **OpenAI** is selected by default for both generation and embeddings, so a
  single API key is enough to start.
- Keep **Use the same provider for embeddings** enabled for the simplest setup.
- To mix providers, disable that switch and choose a generation provider,
  embedding provider, models, and embedding dimensions independently.
- Cohere and Google Gemini keys are supported. Only the providers you select
  require a key.
- An optional OpenAI base URL can point at a compatible proxy.

#### Step 3 — Review and finish

Review the database and provider summary, then click **Save and finish**. The
app writes the configuration, restarts the backend, and opens the dashboard.

To change these settings later, open **Settings → Setup wizard**. Saved API
keys are never displayed again; leave a key field blank to keep the stored
value.

### Where secrets are stored

| File | Contents |
|---|---|
| `%APPDATA%\AI-Study-Assistant\config.json` | Non-secret settings: database host/port/name/user, providers, models. |
| `%APPDATA%\AI-Study-Assistant\.env` | Database password and provider API keys. |
| `%APPDATA%\AI-Study-Assistant\backend.log` | Redacted backend log (rotated at 5 MB). |
| `%APPDATA%\AI-Study-Assistant\data` | Uploaded PDFs, previews, and generated files. |

The Electron main process reads these files and passes values to the bundled
backend as environment variables. Secrets never enter the renderer, the
installer, or the repository. The backend also requires a random bearer token
generated fresh on every app launch, and binds only to `127.0.0.1` on a dynamic
port.

Do not copy `%APPDATA%` between users or attach it to bug reports.

---

## Build from source

### Prerequisites

- Windows 10/11 x64.
- Python **3.12** (the backend build enforces 3.12.x).
- Node.js **18+** (Node 22 recommended) and npm.
- Docker Desktop for running PostgreSQL + pgvector locally.
- Git for Windows.
- PowerShell 5.1 or PowerShell 7.
- Network access for `pip`, `npm`, PyInstaller, and electron-builder downloads.

### 1. Clone and install dependencies

```powershell
git clone https://github.com/YousefOsama20/AI-Study-Assistant.git
cd AI-Study-Assistant

cd frontend
npm ci
cd ..
```

### 2. Start PostgreSQL + pgvector (development)

```powershell
cd docker
Copy-Item .env.example .env
notepad .env   # set POSTGRES_PASSWORD
docker compose up -d pgvector
cd ..
```

The compose file maps PostgreSQL to host port `5400`. It does not run the
FastAPI backend; the backend always runs on the host.

### 3. Create the backend environment

```powershell
cd src
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
cd ..
```

Set at minimum:

```env
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5400
POSTGRES_MAIN_DATABASE=ai_study_assistant

GENERATION_BACKEND=OPENAI
EMBEDDING_BACKEND=OPENAI
OPENAI_API_KEY=sk-...
```

The database and `vector` extension can be created automatically by migration
helpers; `CREATE EXTENSION` requires a role with sufficient privileges.

### 4. Apply migrations

```powershell
cd src
python -m helpers.migrations upgrade head
cd ..
```

Back up existing study material before upgrading an existing database.

### 5. Run the desktop app in development

```powershell
cd frontend
npm run electron:dev
```

Electron compiles the main process, starts Vite, launches the backend from
`src\main.py`, allocates a free loopback port, and opens the window. Set
`AISTUDY_PYTHON` if the interpreter is not the default `python`.

For renderer-only browser development, run the backend and Vite separately:

```powershell
# Terminal 1
powershell -ExecutionPolicy Bypass -File frontend\scripts\backend-dev.ps1

# Terminal 2
cd frontend
npm run dev
```

Set `CORS_ALLOW_ORIGINS="http://localhost:5173"` in `src\.env` for browser mode.

### 6. Build the installer

```powershell
powershell -ExecutionPolicy Bypass -File frontend\scripts\build-installer.ps1
```

The script:

1. Installs npm dependencies with `npm ci` when `node_modules` is missing.
2. Runs TypeScript checks and the Vitest suite (skip tests with `-SkipTests`).
3. Creates an isolated Python 3.12 virtual environment at
   `frontend\build\venv`, installs `src\requirements.txt`, and builds the
   PyInstaller backend.
4. Smoke-tests the frozen backend: it must reject unauthenticated requests with
   `401` and return `503 degraded` for an unconfigured database.
5. Builds the renderer and Electron main process.
6. Packages the NSIS installer with electron-builder.
7. Validates the installer, `win-unpacked` resources, and writes
   `frontend\dist\SHA256SUMS.txt`.

Output:

```
frontend\dist\AI-Study-Assistant Setup 1.0.0.exe
frontend\dist\SHA256SUMS.txt
```

Useful switches:

| Switch | Effect |
|---|---|
| `-SkipTests` | Skip Vitest; type checking still runs. |
| `-SkipBackend` | Reuse an existing `frontend\build\backend\AIStudyAssistantBackend.exe`. |
| `-SkipInstall` | Require existing `node_modules` and backend virtual environment. |
| `-Python <path>` | Base Python 3.12 interpreter for the backend build environment. |

`npm run dist:win` runs the same installer script. `npm run backend:build`
builds and smoke-tests only the backend.

### What the installer bundles

- Electron main process, preload script, and renderer (`app.asar`).
- `AIStudyAssistantBackend.exe` under `resources\backend` (self-contained;
  users do not need Python).
- `resources\docker\docker-compose.yml` for the PostgreSQL + pgvector service.
- Application and installer icons from `frontend\assets`.

It does **not** bundle PostgreSQL, pgvector, Docker, provider keys, `.env` or
`config.json` files, or user data.

### Continuous integration

`.github/workflows/windows-build.yml` runs on pull requests, pushes to
`main`/`master`, version tags, and manual dispatch. It installs dependencies,
runs type checks and tests, builds the backend and installer, verifies packaged
resources, writes SHA-256 checksums, and uploads a `windows-installer` artifact.
It does not publish GitHub Releases automatically.

---

## Configuration and data

### Installed app

Configuration lives in `%APPDATA%\AI-Study-Assistant`:

```
config.json    non-secret settings written by the setup wizard
.env           database password and provider API keys
backend.log    redacted backend log
data\          uploaded PDFs, previews, generated files
```

Advanced users can add allowlisted non-secret settings to `config.json` or
`.env`. `.env` values override the structured configuration for the keys it
sets. Restart the app (or use **Settings → Restart backend**) after editing.

Commonly changed settings:

| Setting | Meaning |
|---|---|
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

Do not set `AISTUDY_API_TOKEN` yourself in the installed app; Electron generates
it per launch. The renderer never receives it.

### Data locations

- Uploaded PDFs: `%APPDATA%\AI-Study-Assistant\data\assets\files\{project_id}`
- Generated previews: `...\previews`
- Database: PostgreSQL database `ai_study_assistant` in the Docker volume
  `ai-study-assistant_pgvector_data`

---

## Troubleshooting

### The wizard says Docker is not installed

Install Docker Desktop from <https://www.docker.com/products/docker-desktop/>,
start it, wait for the engine to report running, then click **Check Docker**
again. On Windows, Docker Desktop requires the WSL 2 backend (or Hyper-V).

### The database container does not become healthy

```powershell
docker ps -a --filter "name=pgvector"
docker logs ai-study-assistant-pgvector-1 --tail 100
```

Common causes: port `5400` already in use, insufficient Docker memory, or a
stale volume with a different password. Choose another port in the wizard, or
remove the test container/volume after backing up any data you need.

### `password authentication failed`

The stored password no longer matches the container. If the database has no
important data, remove the Docker volume and run the wizard again:

```powershell
docker rm -f ai-study-assistant-pgvector-1
docker volume rm ai-study-assistant_pgvector_data
```

### Health endpoint returns 503

Open **Settings → Setup wizard** and re-run the database test and
**Initialize database**. Then open
`%APPDATA%\AI-Study-Assistant\backend.log` and read the last lines. The health
response never includes secrets; it reports booleans and error class names.

### Backend fails to start

```powershell
Get-Content "$env:APPDATA\AI-Study-Assistant\backend.log" -Tail 100
```

Check that `resources\backend\AIStudyAssistantBackend.exe` exists in the
installation directory. If it is missing, reinstall the app. In development,
run `npm run backend:build` and confirm `AISTUDY_PYTHON` points at the backend
virtual environment.

### Port 5000 is already in use

```powershell
netstat -ano | findstr :5000
```

Remove `PORT` from `%APPDATA%\AI-Study-Assistant\.env` or `config.json` so
Electron allocates a free loopback port, or choose another port.

### pgvector is missing on an existing PostgreSQL server

```sql
\c ai_study_assistant
CREATE EXTENSION IF NOT EXISTS vector;
```

On Windows, install a pgvector build that matches your PostgreSQL version, or
use the bundled Docker image.

### Installer build fails during PyInstaller

- Confirm Python 3.12 is the interpreter passed to the script.
- Delete `frontend\build\venv` and rebuild to get a clean environment.
- Build from a path without restrictive long-path or permission issues.
- Do not use `-SkipInstall` unless `frontend\build\venv` already contains the
  requirements and PyInstaller.

### Installer build fails during electron-builder

- Ensure `frontend\build\backend\AIStudyAssistantBackend.exe` exists.
- Ensure `frontend\build\renderer\index.html` exists.
- Delete `frontend\node_modules` and `frontend\dist`, then run `npm ci`.
- Verify `frontend\assets\icon.ico` is present (regenerate with `npm run icons`).

### Long path issues

```powershell
git config --system core.longpaths true
```

Or enable `LongPathsEnabled` under
`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`.

---

## Backup and uninstall

### Backup

```powershell
# Database (Docker)
docker exec ai-study-assistant-pgvector-1 pg_dump -U postgres ai_study_assistant > ai_study_assistant-backup.sql

# Uploaded documents and previews
Copy-Item "$env:APPDATA\AI-Study-Assistant\data" .\ai_study_assistant-data -Recurse

# Configuration and secrets (store securely; do not share)
Copy-Item "$env:APPDATA\AI-Study-Assistant\config.json" .\config.json
Copy-Item "$env:APPDATA\AI-Study-Assistant\.env" .\.env
```

Back up PostgreSQL and the data directory together so document records and
files stay consistent.

### Restore

```powershell
docker exec -i ai-study-assistant-pgvector-1 psql -U postgres ai_study_assistant < ai_study_assistant-backup.sql
Copy-Item .\ai_study_assistant-data "$env:APPDATA\AI-Study-Assistant\data" -Recurse
```

### Uninstall

1. Windows Settings → Apps → AI-Study-Assistant → Uninstall.
2. Optionally remove configuration and data:

```powershell
Remove-Item "$env:APPDATA\AI-Study-Assistant" -Recurse
```

3. Optionally remove the database container and volume:

```powershell
docker rm -f ai-study-assistant-pgvector-1
docker volume rm ai-study-assistant_pgvector_data
```

---

## Support

- API reference: [API_DOCS.md](API_DOCS.md)
- General troubleshooting: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Interactive API docs when the backend is running:
  `http://127.0.0.1:<port>/docs` (the port is chosen by Electron)
