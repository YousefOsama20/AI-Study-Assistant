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


def _has_value(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != "" and value.strip().lower() not in ("dummy_key", "none", "null")
    return True


@system_router.get("/health")
async def health_check(request: Request):
    """Health of the API, database, and provider configuration.

    Never returns secrets — only booleans and public configuration names.
    """
    settings = get_settings()

    db_status = {"configured": True, "connected": False, "error": None}
    try:
        async with request.app.db_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_status["connected"] = True
        db_status["error"] = None
    except Exception as e:
        db_status["connected"] = False
        db_status["error"] = str(e.__class__.__name__)

    vector_status = {
        "backend": settings.VECTOR_DB_BACKEND,
        "connected": bool(getattr(request.app, "vectordb_ready", False)),
        "error": None,
    }

    generation_status = {
        "backend": settings.GENERATION_BACKEND,
        "model": settings.GENERATION_MODEL_ID,
        "configured": _has_value(settings.OPENAI_API_KEY)
        or _has_value(settings.COHERE_API_KEY)
        or _has_value(settings.GEMINI_API_KEY),
    }
    embedding_status = {
        "backend": settings.EMBEDDING_BACKEND,
        "model": settings.EMBEDDING_MODEL_ID,
        "configured": _has_value(settings.OPENAI_API_KEY)
        or _has_value(settings.COHERE_API_KEY)
        or _has_value(settings.GEMINI_API_KEY),
    }

    healthy = db_status["connected"] and vector_status["connected"]

    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "ok" if healthy else "degraded",
            "app": {
                "name": settings.APP_NAME,
                "version": settings.APP_VERSION,
            },
            "database": db_status,
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
