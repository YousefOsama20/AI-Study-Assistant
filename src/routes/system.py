from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from helpers.config import get_settings

import logging

logger = logging.getLogger('uvicorn.error')

system_router = APIRouter(
    prefix="/api/v1",
    tags=["api_v1", "system"],
)


def _safe_name(exc: BaseException) -> str:
    return exc.__class__.__name__ or "Error"


def _database_configured(settings) -> bool:
    if not settings.database_configured:
        return False
    if (settings.POSTGRES_PASSWORD or "").strip():
        return True
    return not settings.packaged


@system_router.get("/health")
async def health_check(request: Request):
    """Health of the API, database, migrations, and provider configuration.

    Never returns secrets — only booleans and public configuration names.
    """
    settings = get_settings()

    db_status = {
        "configured": _database_configured(settings),
        "connected": False,
        "ready": bool(getattr(request.app, "db_ready", False)),
        "error": getattr(request.app, "db_error", None),
    }
    migration_status = dict(
        getattr(
            request.app,
            "db_migration",
            {"attempted": False, "succeeded": False, "error": None},
        )
    )

    engine = getattr(request.app, "db_engine", None)
    if engine is not None:
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            db_status["connected"] = True
            db_status["error"] = None
        except Exception as exc:
            db_status["connected"] = False
            db_status["error"] = _safe_name(exc)

    vector_status = {
        "backend": settings.VECTOR_DB_BACKEND,
        "connected": bool(getattr(request.app, "vectordb_ready", False)),
        "error": getattr(request.app, "vectordb_error", None),
    }

    generation_status = {
        "backend": settings.GENERATION_BACKEND,
        "model": settings.GENERATION_MODEL_ID,
        "configured": settings.generation_configured,
    }
    embedding_status = {
        "backend": settings.EMBEDDING_BACKEND,
        "model": settings.EMBEDDING_MODEL_ID,
        "configured": settings.embedding_configured,
    }

    healthy = (
        db_status["connected"]
        and db_status["ready"]
        and vector_status["connected"]
        and generation_status["configured"]
        and embedding_status["configured"]
    )

    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "ok" if healthy else "degraded",
            "app": {
                "name": settings.APP_NAME,
                "version": settings.APP_VERSION,
            },
            "database": db_status,
            "migration": migration_status,
            "vectordb": vector_status,
            "generation": generation_status,
            "embedding": embedding_status,
        },
    )


@system_router.get("/system/info")
async def system_info(request: Request):
    """Public application information used by the frontend settings/about pages."""
    settings = get_settings()

    return JSONResponse(
        content={
            "app_name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "upload": {
                "max_size_mb": settings.FILE_MAX_SIZE,
                "allowed_types": settings.FILE_UPLOAD_TYPES,
            },
            "providers": {
                "generation_backend": settings.GENERATION_BACKEND,
                "generation_model": settings.GENERATION_MODEL_ID,
                "embedding_backend": settings.EMBEDDING_BACKEND,
                "embedding_model": settings.EMBEDDING_MODEL_ID,
                "embedding_size": settings.EMBEDDING_MODEL_SIZE,
            },
            "vectordb": {
                "backend": settings.VECTOR_DB_BACKEND,
                "distance_method": settings.VECTOR_DB_DISTANCE_METHOD,
            },
            "preview": {
                "max_pages": settings.MAX_PREVIEW_PAGES,
                "dpi": settings.PREVIEW_DPI,
                "format": settings.PREVIEW_IMAGE_FORMAT,
            },
            "chunking": {
                "default_size": settings.CHUNK_SIZE_DEFAULT,
                "default_overlap": settings.CHUNK_OVERLAP_DEFAULT,
            },
        },
    )
