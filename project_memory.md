# Project Memory: AI-Study-Assistant

## Overview

AI-Study-Assistant was extended from a minimal RAG API into a local-first Windows desktop
study assistant. Users create projects, upload PDFs, process them into
page-aware chunks and vectors, search semantically, and ask cited questions.

## Current Architecture

### Backend (FastAPI, `src/`)

- Routes under `/api/v1`:
  - `routes/project.py`: project CRUD, pagination, name search.
  - `routes/document.py`: list/get/delete/reprocess documents, page previews,
    original PDF download.
  - `routes/data.py`: PDF upload with content validation, size checks, SHA-256
    deduplication; synchronous processing with status tracking.
  - `routes/nlp.py`: vector index push/info, semantic search, RAG answers.
  - `routes/system.py`: `/health` and `/system/info`.
  - `routes/base.py`: root banner.
- Controllers: `DataController`, `ProcessController`, `NLPController`,
  `projectController`, `BassController`.
- Stores: OpenAI/Gemini/Cohere LLM providers; PGVector/Qdrant vector stores.
- Models: Project, Asset, DataChunk on SQLAlchemy async + Alembic.
- Processing: PyMuPDF extraction, LangChain text splitter, 1-based page
  metadata in chunks (to match preview URLs and citations), PNG previews.
- Runtime hardening:
  - Packaged mode binds `127.0.0.1`, disables reload, enables migrations.
  - `helpers/migrations.py` runs Alembic programmatically for frozen builds.
  - `AISTUDY_DATA_DIR` redirects uploads/previews for read-only install dirs.
  - CORS is disabled unless `CORS_ALLOW_ORIGINS` lists explicit origins.

### Frontend (`frontend/`)

- Electron 33 + React 18 + TypeScript + Vite + Tailwind.
- Pages: Dashboard, Projects, Workspace wrapper, Documents, Search, Chat,
  Settings, About.
- Zustand stores: backend status, projects, documents, search, chat, dashboard,
  settings, toasts.
- Renderer API client:
  - Browser development uses `fetch` to `/api/v1`.
  - Electron uses a preload bridge; the renderer never learns the backend port.
  - IPC allowlists methods/routes, validates upload names/sizes, applies
    per-route timeouts, supports request cancellation, streams upload progress
    events, and supports binary preview/PDF fetches.
- i18n: English and Arabic. Settings persist theme, language, density,
  reduced-motion, search defaults, project view, and recent projects.
- Security:
  - `contextIsolation`, sandbox, no Node integration, no webview.
  - Navigation locked to the dev URL or packaged file.
  - New windows denied; valid http(s) links open externally.
  - Permission requests denied.
  - Single-instance lock and `userData` set to
    `%APPDATA%\AI-Study-Assistant`.

### Electron process (`frontend/electron/`)

- `main.ts`: window creation, IPC handlers, security wiring, shutdown.
- `backend-manager.ts`: free-port allocation, config parsing from
  `userData/.env` plus allowlisted non-secret `userData/config.json` (`.env`
  wins), backend spawn, health polling (`/api/v1/health`), restart with a
  3-attempt cap, graceful stop, log file.
- `api-rules.ts`: route allowlist, timeouts, request/upload size limits.
- `security.ts`: web preferences, allowed navigation, external URL checks.
- `preload.ts`: typed `window.aiStudyAssistant` bridge.
- Paths: `FRONTEND_ROOT = path.join(__dirname, '..', '..')` resolves to
  `frontend/` in development and inside `app.asar` when packaged;
  `REPO_ROOT` is used only for development backend startup.

### Packaging

- `frontend/electron-builder.yml`: NSIS x64, one-click off, per-user install,
  icons from `assets/`, output `frontend/dist`, app files `electron/dist` +
  `electron/package.json` + `build/renderer` + `package.json`, extra resources
  `build/backend` -> `resources/backend`.
- `frontend/electron/package.json` declares `"type": "commonjs"` so the
  tsc-compiled main/preload files are not treated as ESM by the root
  `"type": "module"` package in development or inside `app.asar`.
- `frontend/scripts/backend.spec`: PyInstaller one-file backend, console off,
  collects app packages and Alembic files.
- `frontend/scripts/build-backend.ps1`: installs requirements +
  `pyinstaller==6.11.1`, outputs `build/backend/AIStudyAssistantBackend.exe`.
- `frontend/scripts/build-installer.ps1`: npm install if needed, typecheck,
  tests, backend build, renderer/electron builds, electron-builder NSIS.
- `frontend/scripts/backend-dev.ps1`: dev backend on `127.0.0.1:5000` with
  reload.
- `frontend/scripts/generate-icons.py`: generates PNG/ICO from the SVG mark.
- Icons: `frontend/assets/icon.svg`, `icon.png`, `icon.ico`.

## Data and Configuration

### Environment

Backend settings come from `src/.env` in development and from
`%APPDATA%\AI-Study-Assistant\.env` in the packaged app (parsed by
BackendManager and injected into the child process). The packaged app can also
read allowlisted non-secret values from
`%APPDATA%\AI-Study-Assistant\config.json`; `.env` takes precedence,
unknown keys and secrets are ignored. Neither file is bundled.

Required settings:

- PostgreSQL connection (`POSTGRES_USERNAME`, `POSTGRES_PASSWORD`,
  `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_MAIN_DATABASE`).
- Keys for the selected generation and embedding providers.
- `EMBEDDING_MODEL_SIZE` must match the embedding model.

Docker compose (`docker/docker-compose.yml`) starts only PostgreSQL + pgvector
on host port `5400` (and an unused MongoDB on `27007`). The backend runs on the
host in both development and packaged modes.

### Storage

- Default data root: `src/assets`; packaged override:
  `%APPDATA%\AI-Study-Assistant\data`.
- Files: `assets/files/{project_id}/`.
- Previews: `assets/files/{project_id}/previews/`.
- Packaged backend log: `%APPDATA%\AI-Study-Assistant\backend.log`.
- Vector tables: `collection_{embedding_size}_{project_id}`.

## Verification State

- Frontend: `npm run typecheck`, `npm test` (9 files / 70 tests), and
  `npm run build` pass.
- Electron: `npm run build:electron` passes; output is `electron/dist/*.js`.
- Covered by tests: workspace stats, exact dashboard pagination, `config.json`
  parsing, IPC cancellation/timeouts, upload progress, and project edit/delete.
- Backend: `python -m compileall -q src` passes. Full runtime tests are blocked
  locally by missing backend dependencies, PostgreSQL/pgvector, and provider
  keys.
- Not verified locally: PyInstaller `.exe`, NSIS installer, installed-app
  startup, full backend integration. These require Windows.
- Generated `src/**/__pycache__` was removed after compile checks and is now
  gitignored.

## Test Environment Notes

- Node v26.5.1 + jsdom: `window.localStorage` is undefined; polyfilled in
  `frontend/tests/setup.ts`.
- jsdom `File` lacks `arrayBuffer`; polyfilled on `Blob.prototype` with
  FileReader.
- Electron preload cannot be imported as a normal static test dependency;
  `tests/electron-security.test.ts` imports it via `pathToFileURL` with
  `/* @vite-ignore */` and captures the exposed bridge in `beforeAll`
  (`restoreMocks: true` clears mock history).
- Router tests use a `renderAt` helper that renders the route pattern (for
  `useParams`) while navigating to the concrete URL.
- Upload tests use `fireEvent.change` for non-PDF files because `user-event`
  filters by the file input's `accept` attribute.

## Known Limitations

1. No authentication; intended for local single-user use.
2. Chat history is session-only; not persisted.
3. Processing is synchronous and sequential per file.
4. Vector indexing happens during processing; manual re-index remains available.
5. Installer does not include PostgreSQL, pgvector, `.env`, `config.json`, or
   API keys.
6. Provider APIs are required at runtime; no offline model support.
7. Old projects indexed before page metadata was added may show `Page N/A`
   until reprocessed.
8. Only the first `MAX_PREVIEW_PAGES` pages have previews.
9. Windows packaging and installed-app behavior are not verified in this Linux
   environment.

## Useful Commands

```bash
# Frontend checks
cd frontend
npm run typecheck
npm test
npm run build
npm run build:electron

# Backend syntax check
cd src
python -m compileall -q .

# Backend dev
cd src && python main.py

# Windows packaging
powershell -ExecutionPolicy Bypass -File frontend/scripts/build-installer.ps1
```

## Key Files

```
frontend/
  package.json
  electron-builder.yml
  vitest.config.ts
  electron/{main,preload,backend-manager,api-rules,security}.ts
  scripts/{backend.spec,backend-dev.ps1,build-backend.ps1,build-installer.ps1,generate-icons.py}
  assets/{icon.svg,icon.png,icon.ico}
  src/lib/api/{client,transport,errors}.ts
  src/pages/{Dashboard,Projects,Workspace,Documents,Search,Chat,Settings,About}.tsx
  src/stores/*.ts
  src/lib/i18n/{en,ar}.ts
  tests/*.test.{ts,tsx}
src/
  main.py
  routes/{base,project,document,data,nlp,system}.py
  controllers/{DataController,ProcessController,NLPController,projectController}.py
  helpers/{config,migrations}.py
  models/db_schemes/ai_study_assistant/alembic/**
  models/enums/ProcessingStatus.py
docker/docker-compose.yml
README.md
WINDOWS_INSTALL.md
API_DOCS.md
TROUBLESHOOTING.md
plan.md
```

## Next Steps

1. Verify the packaging config and scripts on Windows.
2. Run a real end-to-end flow with PostgreSQL + pgvector and provider keys.
3. Consider first-run provisioning of `.env` and packaging a safe template.
4. Consider persisting chat history and adding WebSocket/polling-based status
   events instead of list polling.

---

*Last Updated: 2026-10-21*
*Version: 1.0.0*
