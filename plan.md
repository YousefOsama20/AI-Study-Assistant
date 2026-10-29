# Windows Installation Completion Plan

## Status

- **Decision:** Docker Desktop + first-run setup wizard.
- **Backend packaging:** PyInstaller-bundled FastAPI backend (no user-installed Python).
- **Database:** PostgreSQL + pgvector through Docker Desktop, with existing PostgreSQL as an alternative.
- **Release positioning:** Limited beta. Docker remains a documented prerequisite; the app will not be described as fully standalone.
- **Plan mode:** Completed. Implementation may begin.

## Goal

Make the public repository installable by a new Windows user:

1. Download the Windows installer from GitHub Releases.
2. Install it.
3. Complete a first-run setup wizard.
4. Start the Dockerized database and configure an AI provider.
5. Create a project, upload a PDF, process it, and use search/chat.
6. Restart the app and retain projects, documents, and configuration.
7. Upgrade without data loss.
8. Uninstall without unexpectedly deleting study data.

Developers must also have a documented, reproducible build path.

## Constraints

- Preserve the existing Electron + React + FastAPI + SQLAlchemy + pgvector architecture.
- Do not require regular users to install Python, Node.js, or Git.
- Docker Desktop is an accepted external prerequisite, but it must be detected, explained, and checked.
- Never commit populated `.env` files, real API keys, passwords, or user data.
- Do not expose secrets in the renderer, installer, logs, or repository.
- Do not commit, push, publish a release, or change repository permissions without explicit authorization.
- Preserve unrelated user changes.

## Audit Summary

### Verified

- Repository is clean on branch `AI-Study-Assistant-part-2-(impove)`.
- No populated `.env` file is tracked; only `.env.example` files are tracked.
- `frontend/assets/icon.ico` is a valid ICO file.
- The public repository has no GitHub Actions workflows.
- Existing GitHub releases have zero assets; no Windows installer is currently published.
- Windows toolchain is available: Python 3.12.10, Node 24.18.1, npm 11.16.0, Git 2.55.0, Docker 29.6.2.
- Electron security baseline is implemented: context isolation, sandbox, no Node integration, preload IPC allowlist, route allowlist, navigation hardening, permission denial.
- Backend supervisor implements free-port selection, health polling, restart policy, logging, and graceful shutdown.
- NSIS configuration preserves application data on uninstall.

### P0 blockers

1. **Environment variable mismatch**
   - Electron injects `AISTUDY_DATA_DIR`, `AISTUDY_PACKAGED`, `AISTUDY_AUTO_MIGRATE`.
   - Backend reads `MINIRAG_*`.
   - Uploads/previews are written under PyInstaller's temporary extraction directory and are lost on exit.

2. **No first-run configuration**
   - `src/helpers/config.py` requires many settings with no defaults.
   - A new installation has no user `.env`.
   - Backend startup fails validation before it can report useful setup information.
   - No setup UI or IPC exists to create configuration.

3. **Broken Alembic and PyInstaller paths**
   - `src/models/db_schemes/minirag/alembic.ini` is ignored and absent.
   - `src/helpers/migrations.py` requires that file.
   - `frontend/scripts/backend.spec` references the nonexistent `models/db_schemes/ai_study_assistant/alembic` directory and missing `alembic.ini`.
   - Developer migrations and packaged auto-migration fail; PyInstaller build is likely to fail.

4. **Database provisioning is manual and inconsistent**
   - Docker compose does not set `POSTGRES_DB`, so the default database is `postgres`.
   - The app expects `ai_study_assistant`.
   - No healthcheck, database creation, extension initialization, or Docker availability check.
   - Compose also starts an unused MongoDB service.

5. **Installer build is not reproducible**
   - Backend build installs into the global Python environment.
   - No isolated virtual environment.
   - No backend smoke test.
   - `npm run dist:win` does not build the backend and can package a stale or missing backend.
   - Current `frontend/node_modules` is Linux-built; Windows-native dependencies are required.

### Secondary issues

- `.env.example` has blank required values, a duplicate `OPENAI_API_KEY`, and inconsistent provider/model defaults.
- Health check marks both generation and embedding as configured if any provider key exists.
- Packaged backend has no local API authentication.
- Logs have no rotation or redaction.
- Documentation describes a developer flow but not a working regular-user installer flow.
- No backend tests.
- No CI/CD or release asset validation.
- Version and application metadata are not checked automatically.
- `file://` navigation is allowed too broadly in production.

## Target Architecture

### Installation layout

- Installer: `AI-Study-Assistant Setup <version>.exe` (NSIS, x64, per-user).
- Application files: Electron/React in `app.asar`.
- Backend executable: `resources/backend/AIStudyAssistantBackend.exe` (or one-dir equivalent).
- Docker compose file: `resources/docker/docker-compose.yml`.
- User configuration: `%APPDATA%\AI-Study-Assistant\config.json`.
- User secrets: `%APPDATA%\AI-Study-Assistant\.env`.
- User files: `%APPDATA%\AI-Study-Assistant\data`.
- Logs: `%APPDATA%\AI-Study-Assistant\backend.log`.
- Database data: Docker named volume managed by the compose project.

### First-run flow

1. App launches; backend starts in degraded mode using safe defaults.
2. Renderer detects missing/incomplete configuration and opens the Setup page.
3. User chooses Docker database or existing PostgreSQL.
4. Docker path:
   - Check Docker CLI and daemon.
   - Start bundled compose project on a configurable port (default 5400).
   - Generate a strong database password.
   - Wait for PostgreSQL readiness.
   - Create `ai_study_assistant` if missing.
   - Enable the `vector` extension.
   - Run Alembic migrations.
5. Existing PostgreSQL path:
   - Validate host, port, database name, user, and password.
   - Test connectivity and pgvector availability.
   - Attempt database/extension/migration initialization when permissions allow.
   - Otherwise show exact SQL and permission guidance.
6. Configure generation and embedding providers, API keys, models, and embedding size.
7. Save configuration atomically, restart the backend, and verify `/api/v1/health`.
8. User creates a project and uploads a PDF.

## Implementation Phases

### Phase 1 — Backend correctness and configuration

Files:

- `src/helpers/config.py`
- `src/main.py`
- `src/controllers/BassController.py`
- `src/helpers/migrations.py`
- `src/routes/system.py`
- New setup/auth helpers and routes under `src/helpers/` and `src/routes/`
- `src/models/db_schemes/minirag/alembic.ini`
- `src/models/db_schemes/minirag/.gitignore`
- `src/.env.example`
- `frontend/scripts/backend.spec`

Tasks:

- Add defaults for application, upload, preview, chunk, vector, and RAG settings.
- Keep database settings configurable, with safe non-secret defaults.
- Support `AISTUDY_*` variables first and retain `MINIRAG_*` fallbacks.
- Resolve data storage as `AISTUDY_DATA_DIR` → `MINIRAG_DATA_DIR` → safe packaged fallback.
- Make backend startup resilient: a missing database or key produces a degraded health state, not a process crash.
- Run migrations without blocking the async event loop.
- Record migration success/failure for health reporting.
- Commit a real `alembic.ini` with no secrets; `migrations.py` supplies the database URL at runtime.
- Add an optional URL parameter to migration helpers for setup-time validation.
- Fix PyInstaller data paths and include Alembic files, locale templates, and required hidden imports.
- Add provider-specific configuration checks:
  - OpenAI → `OPENAI_API_KEY`
  - Cohere → `COHERE_API_KEY`
  - Gemini → `GEMINI_API_KEY`
- Report `database.configured`, `database.connected`, `database.ready`, and sanitized migration error state.
- Add a per-launch local API token middleware. Require it when `AISTUDY_API_TOKEN` is set.
- Add setup endpoints:
  - `GET /api/v1/setup/status`
  - `POST /api/v1/setup/test-db`
  - `POST /api/v1/setup/init-db`
- Validate database identifiers and never log credentials.
- Rewrite `.env.example` with working defaults and consistent provider/model examples.

Acceptance criteria:

- Backend imports and starts with no user configuration.
- `/api/v1/health` returns a structured degraded response instead of a startup crash.
- `python -m helpers.migrations upgrade head` works with a valid database.
- Packaged backend contains Alembic files and can run migrations.
- Uploads resolve under the configured user data directory.

### Phase 2 — First-run setup wizard

Files:

- New `frontend/electron/setup-config.ts`
- `frontend/electron/main.ts`
- `frontend/electron/preload.ts`
- `frontend/electron/backend-manager.ts`
- New `frontend/src/pages/Setup.tsx`
- `frontend/src/App.tsx`
- `frontend/src/pages/Settings.tsx`
- i18n files and API types
- `docker/docker-compose.yml`
- `frontend/electron-builder.yml`

Tasks:

- Add IPC methods:
  - Get configuration status (no secrets returned).
  - Save configuration.
  - Test database connection.
  - Initialize database, extension, and migrations.
  - Start/check Docker database.
  - Restart backend.
  - Open logs folder.
- Store non-secret settings in `config.json` and secrets in `.env`.
- Use atomic writes and `0600` file mode where supported.
- Restrict read/write keys to an explicit allowlist.
- Never log secret values.
- Add a Setup page with:
  - Database mode selection.
  - Docker detection and startup.
  - Existing PostgreSQL fields.
  - Connection test and initialization.
  - Generation provider/key/model.
  - Embedding provider/key/model/embedding size.
  - Optional “use same provider for embeddings” behavior.
  - Clear stage-by-stage progress and actionable errors.
- Default to OpenAI for both generation and embeddings so a new user can start with one key.
- Preserve Cohere and Gemini support.
- Add a first-run gate and a Settings link to reopen Setup.
- Update Docker compose:
  - Set `POSTGRES_DB=ai_study_assistant`.
  - Set `POSTGRES_USER`.
  - Add a healthcheck.
  - Pin a verified pgvector image tag.
  - Remove the unused MongoDB service from the default stack.
  - Use a named volume that survives upgrades.
- Bundle the compose file in the installer resources.
- Restart the backend after saving and surface health results.

Acceptance criteria:

- A fresh install can reach the Setup page.
- Docker database can be started from the app and becomes healthy.
- Database, extension, and schema initialization are idempotent.
- Existing PostgreSQL can be tested and used.
- Configuration survives restart.
- Invalid credentials produce understandable errors, not silent failure.

### Phase 3 — Packaging and installer

Files:

- `frontend/scripts/build-backend.ps1`
- `frontend/scripts/build-installer.ps1`
- `frontend/scripts/backend.spec`
- `frontend/package.json`
- `frontend/electron-builder.yml`
- `frontend/electron/backend-manager.ts`

Tasks:

- Build the backend in an isolated `.venv-build`.
- Install pinned Python dependencies and PyInstaller.
- Verify the executable exists.
- Smoke-test the executable:
  - Start it with a temporary data directory and unreachable database.
  - Confirm `/api/v1/health` responds (HTTP 503 is acceptable).
  - Stop the process and check the log.
- Run `npm ci` on Windows.
- Run typecheck, frontend tests, and production build.
- Build the Electron main process and renderer.
- Build the NSIS installer.
- Validate `win-unpacked/resources/backend` contains the executable and runtime files.
- Validate the installer exists and has a plausible size.
- Print the installer path and SHA-256 hash.
- Decide and document one-file vs one-dir PyInstaller layout; prefer one-dir if it improves reliability.
- Make the full Windows build command explicit so `dist:win` cannot silently omit the backend.
- Add/verify application metadata and version consistency.
- Keep per-user NSIS installation, shortcuts, and data preservation on uninstall.

Acceptance criteria:

- A clean Windows checkout can produce the backend and installer with documented commands.
- The installer contains the backend, renderer, Electron main process, icon, compose file, and metadata.
- No developer-specific absolute paths are required.
- Build failure stops before producing a misleading artifact.

### Phase 4 — CI and GitHub Releases

New files:

- `.github/workflows/windows-build.yml`
- `.github/dependabot.yml`

Workflow steps:

1. Checkout.
2. Set up Node 20/22 and Python 3.12.
3. `npm ci`.
4. Frontend typecheck, tests, and production build.
5. Backend dependency installation and tests.
6. PyInstaller build and health smoke test.
7. Electron/NSIS installer build.
8. Validate unpacked backend contents and installer artifact.
9. Upload installer and SHA-256 artifact.
10. On `v*` tags only, publish the installer to a GitHub Release.

Requirements:

- Do not publish on pull requests.
- Do not publish when tests or packaging checks fail.
- Use `permissions: contents: write` only for the release job.
- Use lockfiles and pinned action versions.
- Keep code signing optional until a certificate is available.
- Document SmartScreen warnings for unsigned builds.
- Do not claim a release exists until the workflow actually succeeds.

### Phase 5 — Security and reliability

Tasks:

- Require the per-launch bearer token for packaged backend routes.
- Attach the token in Electron IPC, health polling, and binary downloads without exposing it to the renderer.
- Restrict production navigation to the app's own renderer path.
- Add a production CSP header; keep dev allowances only in development.
- Add log rotation and redaction for API keys, passwords, tokens, and connection strings.
- Use unique temporary files for “open original PDF”.
- Allowlist `.env` keys read from user configuration.
- Verify config/data directory permissions and document Windows ACL behavior.
- Run `npm audit` and a Python dependency audit; report findings.
- Review IPC handlers for unsafe file paths and shell execution.
- Verify no secrets appear in logs, the renderer bundle, or the installer.

### Phase 6 — Documentation

Update:

- `README.md`
  - Regular Windows user path.
  - Link to the latest release.
  - Honest note when no installer asset is published.
  - Separate developer setup.
  - Supported Windows versions and x64 requirement.
- `WINDOWS_INSTALL.md`
  - User installation.
  - Docker Desktop requirement.
  - Existing PostgreSQL alternative.
  - First-run wizard.
  - AI provider configuration.
  - Data, configuration, and log locations.
  - Backup and restore.
  - Upgrade and uninstall behavior.
- `TROUBLESHOOTING.md`
  - Docker not installed/running.
  - PostgreSQL unreachable.
  - pgvector missing.
  - Migration failure.
  - Invalid provider key.
  - Backend executable failure.
  - Missing runtime file.
  - Port conflict.
  - Frontend cannot reach backend.
  - Upload/processing failure.
  - Where to find logs.
- `API_DOCS.md`
  - Packaged token authentication.
  - Setup endpoints.
  - Health response fields.
- `CONTRIBUTING.md`
  - Updated setup, test, migration, and build commands.
- `project_memory.md`
  - Correct stale status and test counts.
- Optional `SECURITY.md`.

Documentation must not claim:

- Fully standalone operation while Docker is required.
- Offline AI functionality.
- A published installer or verified Windows installation before those are true.

### Phase 7 — Verification

Static validation:

- Inspect packaging configs and resource paths.
- Search for developer absolute paths and development-only URLs.
- Verify `.gitignore` excludes secrets, environments, builds, and user data.
- Verify required runtime files are tracked or generated by the build.
- Validate PowerShell syntax.
- Check version consistency.

Automated validation:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Backend unit tests
- `python -m compileall src`
- Alembic migration check against Docker PostgreSQL
- PyInstaller backend build
- Backend health smoke test
- Electron/NSIS installer build
- Unpacked app resource validation
- Installer artifact and SHA-256 validation
- Optional dependency audit

End-to-end Windows validation:

1. Start from a clean test directory or VM.
2. Install using only documented prerequisites.
3. Launch from Start Menu/desktop shortcut.
4. Verify backend startup.
5. Run Setup and connect to Docker PostgreSQL.
6. Verify database, extension, and schema initialization.
7. Configure a provider using a local mock OpenAI-compatible server if no real key is available.
8. Create a project.
9. Upload a sample PDF.
10. Process and index it.
11. Search and ask a question.
12. Verify results and citations.
13. Restart the app and verify persistence.
14. Restart after a temporary database/backend failure.
15. Upgrade without data loss.
16. Uninstall and verify documented data retention.

Explicitly disclose untested items:

- Real third-party provider calls if no credentials are available.
- Clean Windows VM if only the development host is available.
- Code-signed installer if no certificate is available.
- Machines without Docker.

## Acceptance Criteria

- Public repository contains all required source, scripts, migrations, and build configuration.
- A documented developer build produces the backend and installer.
- The installer includes the Electron app, backend executable, runtime assets, icon, and compose file.
- A new user can install, complete Setup, and reach a healthy backend/database.
- AI provider configuration is possible without editing source code.
- Projects, documents, and configuration survive restart and upgrade.
- Uninstall preserves user study data and does not silently remove the database volume.
- Error messages are actionable and do not expose secrets.
- CI builds and validates the installer on a Windows runner.
- Release publication occurs only after successful checks and only on tags.
- Documentation matches the implementation.
- Release readiness is reported honestly.

## Expected Release Status

After implementation and successful verification, the expected status is:

**Ready for a limited beta**

Reasons:

- Docker Desktop remains a prerequisite.
- The installer will likely be unsigned unless a certificate is provided.
- Real-provider E2E testing may be limited by available credentials.
- Clean-VM testing may be limited by the environment.

It will not be labeled “Ready for public Windows release” unless the installer is verified end-to-end on a clean Windows environment and the Docker/signing limitations are resolved or explicitly accepted.

## Authorization

No commit, push, release publication, or repository permission change will be performed without explicit authorization.
