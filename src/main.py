import asyncio
import os
import secrets
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routes import base, data, nlp, project, document
from routes import system, setup
from helpers.config import get_settings
from stores.llm.LLMProviderFactory import LLMProviderFactory
from stores.vectordb.VectorDBProviderFactory import VectorDBProviderFactory
from stores.llm.templates.template_perser import TemplateParser
from sqlalchemy import text
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

import logging

logger = logging.getLogger("uvicorn.error")


def _env_value(name: str, legacy_name: Optional[str] = None) -> Optional[str]:
    value = os.environ.get(name)
    if value is not None and value.strip() != "":
        return value.strip()
    if legacy_name:
        legacy = os.environ.get(legacy_name)
        if legacy is not None and legacy.strip() != "":
            return legacy.strip()
    return None


def _env_flag(name: str, default: bool, legacy_name: Optional[str] = None) -> bool:
    raw = _env_value(name, legacy_name)
    if raw is None:
        return default
    return raw.lower() in ("1", "true", "yes", "on")


def is_packaged_mode() -> bool:
    if getattr(sys, "frozen", False):
        return True
    return _env_flag("AISTUDY_PACKAGED", False, "MINIRAG_PACKAGED")


def resolve_host(default_dev: str = "0.0.0.0") -> str:
    explicit = _env_value("HOST")
    if explicit:
        return explicit
    return "127.0.0.1" if is_packaged_mode() else default_dev


def resolve_port(default_port: int = 5000) -> int:
    explicit = _env_value("PORT")
    if explicit:
        try:
            return int(explicit)
        except ValueError:
            logger.warning("Invalid PORT value, falling back to %s", default_port)
    return default_port


def resolve_reload() -> bool:
    explicit = _env_value("RELOAD")
    if explicit:
        return explicit.lower() in ("1", "true", "yes", "on")
    return not is_packaged_mode()


def should_auto_migrate() -> bool:
    explicit = _env_value("AISTUDY_AUTO_MIGRATE", "MINIRAG_AUTO_MIGRATE")
    if explicit:
        return explicit.lower() in ("1", "true", "yes", "on")
    return is_packaged_mode()


def build_database_url(settings, driver: str = "postgresql+asyncpg") -> str:
    return URL.create(
        driver,
        username=settings.POSTGRES_USERNAME,
        password=settings.POSTGRES_PASSWORD,
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        database=settings.POSTGRES_MAIN_DATABASE,
    ).render_as_string(hide_password=False)


def database_looks_configured(settings) -> bool:
    """Whether the database settings look intentionally configured.

    A fresh packaged install has no password. Developers and setup-wizard
    users always have one. Passwordless local trust authentication remains
    possible by setting ``AISTUDY_DATABASE_TRUST=1``.
    """
    if not settings.database_configured:
        return False
    if (settings.POSTGRES_PASSWORD or "").strip():
        return True
    trust = _env_flag("AISTUDY_DATABASE_TRUST", False)
    return trust or not settings.packaged


def safe_error_name(exc: BaseException) -> str:
    """Return a credential-free error label for API responses and logs."""
    name = exc.__class__.__name__
    return name if name else "Error"


@asynccontextmanager
async def lifespan(app: FastAPI):
    setting = get_settings()

    # In-memory caches for generated project summaries. Cache entries are
    # keyed by (project_id, language) and invalidated by a chunk signature.
    app.summary_cache = {}
    app.summary_locks = {}

    app.db_engine = None
    app.db_client = None
    app.db_ready = False
    app.db_error = None
    app.db_migration = {
        "attempted": False,
        "succeeded": False,
        "error": None,
    }
    app.vectordb_ready = False
    app.vectordb_error = None
    app.generation_client = None
    app.embedding_client = None

    try:
        data_root = Path(setting.data_dir)
        (data_root / "assets" / "files").mkdir(parents=True, exist_ok=True)
        (data_root / "assets" / "database").mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        logger.error("Could not prepare data directory: %s", safe_error_name(exc))

    if database_looks_configured(setting):
        try:
            app.db_engine = create_async_engine(
                build_database_url(setting),
                pool_pre_ping=True,
            )
            app.db_client = sessionmaker(
                app.db_engine, class_=AsyncSession, expire_on_commit=False
            )
        except Exception as exc:
            app.db_error = safe_error_name(exc)
            logger.error("Could not create database engine: %s", app.db_error)

    if app.db_engine is not None:
        if should_auto_migrate():
            app.db_migration["attempted"] = True
            try:
                from helpers.migrations import run_migrations

                await asyncio.to_thread(run_migrations, "head")
                app.db_migration["succeeded"] = True
                app.db_ready = True
            except Exception as exc:
                app.db_migration["error"] = safe_error_name(exc)
                app.db_error = app.db_migration["error"]
                logger.error("Auto-migration failed: %s", app.db_error)
        else:
            try:
                async with app.db_engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
                app.db_ready = True
            except Exception as exc:
                app.db_error = safe_error_name(exc)
                logger.error("Database connectivity check failed: %s", app.db_error)

    llm_provider_factory = LLMProviderFactory(setting)

    if setting.generation_configured:
        try:
            app.generation_client = llm_provider_factory.create(
                provider=setting.GENERATION_BACKEND
            )
            if app.generation_client is not None:
                app.generation_client.set_generation_model(
                    model_id=setting.GENERATION_MODEL_ID
                )
        except Exception as exc:
            logger.warning(
                "Generation provider could not be initialized: %s", safe_error_name(exc)
            )

    if setting.embedding_configured:
        try:
            app.embedding_client = llm_provider_factory.create(
                provider=setting.EMBEDDING_BACKEND
            )
            if app.embedding_client is not None:
                app.embedding_client.set_embedding_model(
                    model_id=setting.EMBEDDING_MODEL_ID,
                    embedding_size=setting.EMBEDDING_MODEL_SIZE,
                )
        except Exception as exc:
            logger.warning(
                "Embedding provider could not be initialized: %s", safe_error_name(exc)
            )

    # vector db client
    app.vectordb_client = None
    if app.db_client is not None:
        try:
            vectordb_provider_factory = VectorDBProviderFactory(
                config=setting, db_client=app.db_client
            )
            app.vectordb_client = vectordb_provider_factory.create(
                provider=setting.VECTOR_DB_BACKEND
            )
            if app.vectordb_client is not None:
                await app.vectordb_client.connect()
                app.vectordb_ready = True
        except Exception as exc:
            app.vectordb_error = safe_error_name(exc)
            logger.error("Vector DB connection failed: %s", app.vectordb_error)

    app.template_parser = TemplateParser(
        language=setting.PRIMARY_LANG,
        default_language=setting.DEFAULT_LANG,
    )

    yield

    try:
        if app.db_engine is not None:
            await app.db_engine.dispose()
    except Exception:
        pass
    try:
        if app.vectordb_client is not None:
            await app.vectordb_client.disconnect()
    except Exception:
        pass


app = FastAPI(lifespan=lifespan)

# Narrow CORS allowlist for local browser development only.
# Production Electron uses IPC, so no permissive CORS is needed.
_cors_origins = os.environ.get("CORS_ALLOW_ORIGINS", "").strip()
if _cors_origins:
    _origins = [o.strip() for o in _cors_origins.split(",") if o.strip()]
    if _origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "Authorization"],
        )


@app.middleware("http")
async def require_local_token(request: Request, call_next):
    """Require a per-launch bearer token when the desktop app provides one.

    The token never reaches the renderer: Electron's main process adds it to
    health polls and IPC-forwarded requests. Development runs without a token
    retain the previous behavior.
    """
    token = _env_value("AISTUDY_API_TOKEN")
    if not token:
        return await call_next(request)
    if request.method == "OPTIONS":
        return await call_next(request)

    provided = request.headers.get("authorization", "")
    if not secrets.compare_digest(provided, f"Bearer {token}"):
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await call_next(request)


app.include_router(base.base_router)
app.include_router(data.data_router)
app.include_router(nlp.nlp_router)
app.include_router(project.project_router)
app.include_router(document.document_router)
app.include_router(system.system_router)
app.include_router(setup.setup_router)


if __name__ == "__main__":
    import uvicorn

    reload_enabled = resolve_reload() and not getattr(sys, "frozen", False)
    # Uvicorn requires an import string only when reload is enabled. Passing the
    # app object directly keeps the frozen entry point working under PyInstaller.
    target = "main:app" if reload_enabled else app
    uvicorn.run(
        target,
        host=resolve_host(),
        port=resolve_port(),
        reload=reload_enabled,
    )
