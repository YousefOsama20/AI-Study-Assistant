"""First-run setup endpoints.

These routes are called by Electron's main process (never directly by the
renderer). They return no secrets and translate failures into actionable
messages.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from helpers.config import get_settings
from helpers.database_setup import (
    DatabaseConfig,
    DatabaseSetupError,
    initialize_database,
    test_connection,
)

logger = logging.getLogger("uvicorn.error")

setup_router = APIRouter(prefix="/api/v1/setup", tags=["api_v1", "setup"])


class DatabasePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str = Field(default="127.0.0.1", max_length=255)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(default="ai_study_assistant", max_length=63)
    username: str = Field(default="postgres", max_length=63)
    password: str = Field(default="", max_length=1024)


class InitializePayload(DatabasePayload):
    create_database: bool = True
    run_migrations: bool = True


def _config(payload: DatabasePayload) -> DatabaseConfig:
    return DatabaseConfig(
        host=payload.host,
        port=payload.port,
        database=payload.database,
        username=payload.username,
        password=payload.password,
    )


def _error_response(exc: DatabaseSetupError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"ok": False, "code": exc.code, "message": exc.message},
    )


@setup_router.get("/status")
async def setup_status():
    """Report which parts of the setup are complete. Never returns secrets."""
    settings = get_settings()
    database_configured = bool(
        settings.database_configured and (settings.POSTGRES_PASSWORD or "").strip()
    )
    return JSONResponse(
        content={
            "configured": bool(
                database_configured
                and settings.generation_configured
                and settings.embedding_configured
            ),
            "database": {
                "configured": database_configured,
                "host": settings.POSTGRES_HOST,
                "port": settings.POSTGRES_PORT,
                "database": settings.POSTGRES_MAIN_DATABASE,
                "username": settings.POSTGRES_USERNAME,
                "password_set": bool((settings.POSTGRES_PASSWORD or "").strip()),
            },
            "generation": {
                "backend": settings.GENERATION_BACKEND,
                "model": settings.GENERATION_MODEL_ID,
                "configured": settings.generation_configured,
            },
            "embedding": {
                "backend": settings.EMBEDDING_BACKEND,
                "model": settings.EMBEDDING_MODEL_ID,
                "configured": settings.embedding_configured,
            },
            "packaged": settings.packaged,
        }
    )


@setup_router.post("/test-db")
async def test_db(payload: DatabasePayload):
    try:
        result = await asyncio.to_thread(test_connection, _config(payload))
    except DatabaseSetupError as exc:
        return _error_response(exc)
    except Exception as exc:  # defensive: never leak a stack trace or password
        logger.error("Database connection test failed: %s", exc.__class__.__name__)
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "code": "database_error",
                "message": "The database connection test failed unexpectedly.",
            },
        )
    return JSONResponse(content=result)


@setup_router.post("/init-db")
async def init_db(payload: InitializePayload):
    try:
        result = await asyncio.to_thread(
            initialize_database,
            _config(payload),
            create_database=payload.create_database,
            run_migrations=payload.run_migrations,
        )
    except DatabaseSetupError as exc:
        return _error_response(exc)
    except Exception as exc:  # defensive: never leak a stack trace or password
        logger.error("Database initialization failed: %s", exc.__class__.__name__)
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "code": "database_error",
                "message": "Database initialization failed unexpectedly.",
            },
        )
    return JSONResponse(content=result)
