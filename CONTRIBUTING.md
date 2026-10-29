# Contributing to AI-Study-Assistant

Thank you for your interest in contributing to **AI-Study-Assistant**! We welcome contributions from developers, technical writers, and students looking to improve local-first AI tooling.

This document provides guidelines and workflows for contributing to both the frontend (Electron + React) and backend (FastAPI + SQLAlchemy + pgvector).

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Database with Docker](#database-with-docker)
- [Development Workflow](#development-workflow)
- [Testing & Verification](#testing--verification)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues & Bugs](#reporting-issues--bugs)

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and considerate in all interactions within issues, pull requests, and discussions.

---

## How Can I Contribute?

- **Report Bugs**: Help us catch defects with reproducible bug reports.
- **Suggest Features**: Propose architectural enhancements or user experience improvements.
- **Documentation**: Improve guides, fix typos, add examples, or translate UI strings.
- **Code**: Implement features, improve test coverage, optimize vector indexing, or refine UI components.

---

## Development Setup

### Prerequisites

- **Python**: 3.11+ (3.12 recommended)
- **Node.js**: 18+ and `npm`
- **PostgreSQL**: 15+ with the `pgvector` extension (or Docker Desktop)
- **API Keys**: At least one LLM/Embedding provider key (Cohere, OpenAI, or Google Gemini)

### Backend Setup

1. Navigate to the `src/` directory and create a virtual environment:
   ```bash
   cd src
   python -m venv .venv
   source .venv/bin/activate       # On Windows: .venv\Scripts\activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `src/.env` with your PostgreSQL credentials and provider API keys.

3. Run database migrations:
   ```bash
   python -m helpers.migrations upgrade head
   ```

4. Start the backend server:
   ```bash
   python main.py
   ```
   The backend starts at `http://localhost:5000` with interactive API docs at `http://localhost:5000/docs`.

### Frontend Setup

1. In a separate terminal, navigate to the `frontend/` directory:
   ```bash
   cd frontend
   npm install
   ```

2. Run the desktop application in development mode:
   ```bash
   npm run electron:dev
   ```
   *Note: In development, Electron supervises its own backend process. If developing purely in the browser without Electron:*
   ```bash
   # Make sure CORS_ALLOW_ORIGINS="http://localhost:5173" is set in src/.env
   npm run dev
   ```

### Database with Docker

If you don't have a local PostgreSQL + pgvector instance installed:
```bash
cd docker
cp .env.example .env
# Set POSTGRES_PASSWORD in docker/.env
docker compose up -d
```
The compose stack creates the `ai_study_assistant` database, enables pgvector,
and health-checks itself. No manual `CREATE DATABASE` is required.

Default host port is `5400`. Override with `AISTUDY_DB_PORT` in `docker/.env`.

### Database Migrations

Alembic migrations live under `src/models/db_schemes/minirag/alembic/`. To run
migrations manually (from the repository root, with `src/.env` configured):

```bash
cd src
python -m helpers.migrations upgrade head
```

To check the current applied revision:

```bash
cd src
python -c "from helpers.migrations import current_revision; print(current_revision())"
```

New schema changes must include an Alembic migration script. The committed
`alembic.ini` contains no credentials — the database URL is resolved at runtime
from application settings.

---

## Development Workflow

1. **Fork the Repository**: Create your personal fork on GitHub.
2. **Clone Locally**:
   ```bash
   git clone https://github.com/<your-username>/AI-Study-Assistant.git
   cd AI-Study-Assistant
   ```
3. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/my-new-feature
   # or for bug fixes:
   git checkout -b fix/issue-description
   ```
4. **Make Your Changes**: Keep commits focused and atomic.

---

## Testing & Verification

Before submitting changes, ensure all automated tests and typechecks pass:

### Frontend
```bash
cd frontend
npm run typecheck    # TypeScript compiler check across renderer & electron
npm test             # Vitest test suite (unit and integration tests)
npm run build        # Production build verification
```

### Backend
```bash
cd src
python -m compileall -q .                             # Syntax validation
python -m unittest discover -s tests -p "test_*.py"   # Unit tests
```

### Windows Installer
```powershell
# Full build (backend + frontend + installer)
powershell -ExecutionPolicy Bypass -File frontend/scripts/build-installer.ps1

# Backend only
powershell -ExecutionPolicy Bypass -File frontend/scripts/build-backend.ps1

# Frontend only (renderer + electron main process)
cd frontend
npm run build && npm run build:electron
```

---

## Coding Standards

### Frontend (React & TypeScript)
- Use functional components with React hooks.
- Follow TypeScript best practices: avoid `any`; declare precise interfaces for state and API responses.
- Style UI using Tailwind CSS utility classes and design tokens consistent with `frontend/src/index.css`.
- Ensure new user-facing strings are added to both English (`src/lib/i18n/en.ts`) and Arabic (`src/lib/i18n/ar.ts`) translation dictionaries.
- Respect accessibility, keyboard navigation, and `contextIsolation` security constraints in Electron.

### Backend (FastAPI & Python)
- Follow PEP 8 style guidelines.
- Use explicit Pydantic schemas for request validation and response models in `src/routes/schemes/`.
- Keep asynchronous database operations inside async sessions (`sqlalchemy.ext.asyncio`).
- Ensure all database schema modifications include corresponding Alembic migrations.

---

## Pull Request Process

1. Rebase your branch onto the latest `main` branch:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
2. Double-check that no sensitive data (e.g., API keys, `.env` files, local database files) is committed.
3. Push your branch to your fork:
   ```bash
   git push origin feature/my-new-feature
   ```
4. Open a Pull Request against the `main` branch of `YousefOsama20/AI-Study-Assistant`.
5. Provide a clear description of:
   - What changed and why.
   - Any manual or automated testing performed.
   - Any relevant issue numbers (e.g., `Fixes #12`).

---

## Reporting Issues & Bugs

When submitting an issue, please include:
- A clear, descriptive title.
- Steps to reproduce the problem.
- Expected behavior vs. actual behavior.
- Operating system and version (Windows, Linux, macOS).
- Relevant log excerpts (omit any API keys or confidential credentials).
- Health check status from `GET /api/v1/health` if applicable.
