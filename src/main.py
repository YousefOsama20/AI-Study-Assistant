import os
import sys
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from routes import base, data, nlp, project, document
from routes import system
from helpers.config import get_settings
from stores.llm.LLMProviderFactory import LLMProviderFactory
from stores.vectordb.VectorDBProviderFactory import VectorDBProviderFactory    
from stores.llm.templates.template_perser import TemplateParser
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

import logging

logger = logging.getLogger("uvicorn.error")

print("MAIN.PY LOADED")


def _env_flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def is_packaged_mode() -> bool:
    if getattr(sys, "frozen", False):
        return True
    return _env_flag("MINIRAG_PACKAGED", False)


def resolve_host(default_dev: str = "0.0.0.0") -> str:
    explicit = os.environ.get("HOST", "").strip()
    if explicit:
        return explicit
    return "127.0.0.1" if is_packaged_mode() else default_dev


def resolve_port(default_port: int = 5000) -> int:
    explicit = os.environ.get("PORT", "").strip()
    if explicit:
        try:
            return int(explicit)
        except ValueError:
            logger.warning(f"Invalid PORT value {explicit!r}, falling back to {default_port}")
    return default_port


def resolve_reload() -> bool:
    explicit = os.environ.get("RELOAD", "").strip()
    if explicit:
        return explicit.lower() in ("1", "true", "yes", "on")
    return not is_packaged_mode()


def should_auto_migrate() -> bool:
    explicit = os.environ.get("MINIRAG_AUTO_MIGRATE", "").strip()
    if explicit:
        return explicit.lower() in ("1", "true", "yes", "on")
    return is_packaged_mode()


@asynccontextmanager
async def lifespan(app: FastAPI):
    setting = get_settings()

    postgres_conn = f"postgresql+asyncpg://{setting.POSTGRES_USERNAME}:{setting.POSTGRES_PASSWORD}@{setting.POSTGRES_HOST}:{setting.POSTGRES_PORT}/{setting.POSTGRES_MAIN_DATABASE}"
    
    app.db_engine = create_async_engine(postgres_conn)
    
    app.db_client = sessionmaker(
        app.db_engine, class_=AsyncSession, expire_on_commit=False
    )

    # Optional auto-migration for packaged deployments (best effort)
    app.db_ready = False
    if should_auto_migrate():
        try:
            from helpers.migrations import run_migrations
            run_migrations()
            app.db_ready = True
        except Exception as e:
            logger.error(f"Auto-migration failed: {e}")
    else:
        try:
            from sqlalchemy import text
            async with app.db_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            app.db_ready = True
        except Exception as e:
            logger.error(f"Database connectivity check failed: {e}")

    llm_provider_factory = LLMProviderFactory(setting)
    vectordb_provider_factory = VectorDBProviderFactory(config=setting, db_client=app.db_client)

    #generation client
    app.generation_client = llm_provider_factory.create(provider = setting.GENERATION_BACKEND)
    app.generation_client.set_generation_model(model_id = setting.GENERATION_MODEL_ID)

    #embedding client
    app.embedding_client = llm_provider_factory.create(provider = setting.EMBEDDING_BACKEND)
    app.embedding_client.set_embedding_model(model_id = setting.EMBEDDING_MODEL_ID,
                                            embedding_size = setting.EMBEDDING_MODEL_SIZE)    

    # vector db client
    app.vectordb_client = vectordb_provider_factory.create(
        provider=setting.VECTOR_DB_BACKEND
    )
    try:
        await app.vectordb_client.connect()
        app.vectordb_ready = True
    except Exception as e:
        app.vectordb_ready = False
        logger.error(f"Vector DB connection failed: {e}")

    app.template_parser = TemplateParser(
        language =setting.PRIMARY_LANG,
        default_language = setting.DEFAULT_LANG
    )

    yield

    try:
        await app.db_engine.dispose()
    except Exception:
        pass
    try:
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
            allow_headers=["Content-Type"],
        )

app.include_router(base.base_router)
app.include_router(data.data_router)
app.include_router(nlp.nlp_router)
app.include_router(project.project_router)
app.include_router(document.document_router)
app.include_router(system.system_router)


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
