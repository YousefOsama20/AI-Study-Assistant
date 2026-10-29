import os
import sys
from pathlib import Path
from typing import List, Optional

from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_UPLOAD_TYPES = ["application/pdf", "text/plain"]
DEFAULT_GENERATION_MODEL = "gpt-4o-mini"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_EMBEDDING_SIZE = 1536


class Settings(BaseSettings):
    """Application settings.

    Every non-secret setting has a safe default so the backend can start in a
    degraded state and expose setup/health information on a fresh install.
    Database credentials and provider keys are supplied by the desktop app's
    user configuration or by the developer's ``src/.env``.
    """

    APP_NAME: str = "AI-Study-Assistant"
    APP_VERSION: str = "1.0.0"

    FILE_UPLOAD_TYPES: List[str] = DEFAULT_UPLOAD_TYPES
    FILE_MAX_SIZE: int = 10
    FILE_DEFAULT_CHUNK_SIZE: int = 512000

    POSTGRES_USERNAME: str = "postgres"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_HOST: str = "127.0.0.1"
    POSTGRES_PORT: int = 5432
    POSTGRES_MAIN_DATABASE: str = "ai_study_assistant"

    GENERATION_BACKEND: str = "OPENAI"
    EMBEDDING_BACKEND: str = "OPENAI"

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_API_URL: Optional[str] = None
    COHERE_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None

    GENERATION_MODEL_ID_LITERAL: List[str] = [
        "gpt-4o-mini",
        "command-a-03-2025",
        "gemini-2.0-flash",
    ]
    GENERATION_MODEL_ID: str = DEFAULT_GENERATION_MODEL
    EMBEDDING_MODEL_ID: str = DEFAULT_EMBEDDING_MODEL
    EMBEDDING_MODEL_SIZE: int = DEFAULT_EMBEDDING_SIZE
    INPUT_DAFAULT_MAX_CHARACTERS: int = 1024
    GENERATION_DAFAULT_MAX_TOKENS: int = 1500
    GENERATION_DAFAULT_TEMPERATURE: float = 0.1

    VECTOR_DB_BACKEND_LITERAL: List[str] = ["QDRANT", "PGVECTOR"]
    VECTOR_DB_BACKEND: str = "PGVECTOR"
    VECTOR_DB_PATH: str = "qdrant_db"
    VECTOR_DB_DISTANCE_METHOD: str = "cosine"
    VECTOR_DB_PGVEC_INDEX_THRESHOLD: int = 100

    # Preview settings
    PREVIEW_DPI: int = 150
    PREVIEW_IMAGE_FORMAT: str = "PNG"
    MAX_PREVIEW_PAGES: int = 10

    # Chunk defaults
    CHUNK_SIZE_DEFAULT: int = 1000
    CHUNK_OVERLAP_DEFAULT: int = 200

    # RAG answer detail controls
    RAG_ANSWER_LIMIT: int = 8
    RAG_CONTEXT_MAX_CHARS: int = 20000
    RAG_CHUNK_MAX_CHARS: int = 2000
    RAG_MAX_OUTPUT_TOKENS: int = 1500
    RAG_HISTORY_MESSAGES: int = 8
    RAG_HISTORY_MESSAGE_MAX_CHARS: int = 2000

    # Project summary controls
    SUMMARY_SINGLE_PASS_MAX_CHARS: int = 80000
    SUMMARY_BATCH_MAX_CHARS: int = 40000
    SUMMARY_REDUCE_MAX_CHARS: int = 60000
    SUMMARY_MAX_CHUNKS: int = 1200
    SUMMARY_MAX_OUTPUT_TOKENS: int = 2000
    SUMMARY_MAP_MAX_OUTPUT_TOKENS: int = 700
    SUMMARY_CACHE_TTL_SECONDS: int = 0

    PRIMARY_LANG: str = "en"
    DEFAULT_LANG: str = "en"

    HOST: Optional[str] = None
    PORT: Optional[int] = None
    RELOAD: Optional[bool] = None

    # Current desktop-app names.
    AISTUDY_PACKAGED: Optional[bool] = None
    AISTUDY_AUTO_MIGRATE: Optional[bool] = None
    AISTUDY_DATA_DIR: Optional[str] = None
    AISTUDY_API_TOKEN: Optional[str] = None

    # Legacy names retained for existing developer environments.
    MINIRAG_PACKAGED: Optional[bool] = None
    MINIRAG_AUTO_MIGRATE: Optional[bool] = None
    MINIRAG_DATA_DIR: Optional[str] = None

    CORS_ALLOW_ORIGINS: Optional[str] = None

    @field_validator("POSTGRES_USERNAME", mode="before")
    @classmethod
    def default_postgres_username(cls, value):
        return value.strip() if isinstance(value, str) and value.strip() else "postgres"

    @field_validator("POSTGRES_HOST", mode="before")
    @classmethod
    def default_postgres_host(cls, value):
        return value.strip() if isinstance(value, str) and value.strip() else "127.0.0.1"

    @field_validator("POSTGRES_MAIN_DATABASE", mode="before")
    @classmethod
    def default_postgres_database(cls, value):
        return (
            value.strip()
            if isinstance(value, str) and value.strip()
            else "ai_study_assistant"
        )

    @field_validator("POSTGRES_PORT", mode="before")
    @classmethod
    def default_postgres_port(cls, value):
        if value is None or (isinstance(value, str) and not value.strip()):
            return 5432
        return value

    @field_validator("GENERATION_BACKEND", "EMBEDDING_BACKEND", mode="before")
    @classmethod
    def normalize_provider_backend(cls, value):
        if isinstance(value, str) and value.strip():
            return value.strip().upper()
        return "OPENAI"

    @field_validator("VECTOR_DB_BACKEND", mode="before")
    @classmethod
    def normalize_vector_backend(cls, value):
        if isinstance(value, str) and value.strip():
            return value.strip().upper()
        return "PGVECTOR"

    @field_validator("FILE_UPLOAD_TYPES", mode="before")
    @classmethod
    def parse_upload_types(cls, value):
        if value is None:
            return DEFAULT_UPLOAD_TYPES
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return DEFAULT_UPLOAD_TYPES
            if not raw.startswith("["):
                return [part.strip() for part in raw.split(",") if part.strip()]
        return value

    @field_validator(
        "GENERATION_MODEL_ID",
        mode="before",
    )
    @classmethod
    def default_generation_model(cls, value):
        return value.strip() if isinstance(value, str) and value.strip() else DEFAULT_GENERATION_MODEL

    @field_validator(
        "EMBEDDING_MODEL_ID",
        mode="before",
    )
    @classmethod
    def default_embedding_model(cls, value):
        return value.strip() if isinstance(value, str) and value.strip() else DEFAULT_EMBEDDING_MODEL

    @field_validator(
        "EMBEDDING_MODEL_SIZE",
        "FILE_MAX_SIZE",
        "FILE_DEFAULT_CHUNK_SIZE",
        "PREVIEW_DPI",
        "MAX_PREVIEW_PAGES",
        "CHUNK_SIZE_DEFAULT",
        "CHUNK_OVERLAP_DEFAULT",
        "RAG_ANSWER_LIMIT",
        "RAG_CONTEXT_MAX_CHARS",
        "RAG_CHUNK_MAX_CHARS",
        "RAG_MAX_OUTPUT_TOKENS",
        "RAG_HISTORY_MESSAGES",
        "RAG_HISTORY_MESSAGE_MAX_CHARS",
        "SUMMARY_SINGLE_PASS_MAX_CHARS",
        "SUMMARY_BATCH_MAX_CHARS",
        "SUMMARY_REDUCE_MAX_CHARS",
        "SUMMARY_MAX_CHUNKS",
        "SUMMARY_MAX_OUTPUT_TOKENS",
        "SUMMARY_MAP_MAX_OUTPUT_TOKENS",
        "SUMMARY_CACHE_TTL_SECONDS",
        "INPUT_DAFAULT_MAX_CHARACTERS",
        "GENERATION_DAFAULT_MAX_TOKENS",
        "GENERATION_DAFAULT_TEMPERATURE",
        "VECTOR_DB_PGVEC_INDEX_THRESHOLD",
        mode="before",
    )
    @classmethod
    def empty_number_to_default(cls, value, info: ValidationInfo):
        if isinstance(value, str) and not value.strip():
            return cls.model_fields[info.field_name].default
        return value

    @field_validator(
        "HOST",
        "PORT",
        "RELOAD",
        "AISTUDY_PACKAGED",
        "AISTUDY_AUTO_MIGRATE",
        "AISTUDY_DATA_DIR",
        "AISTUDY_API_TOKEN",
        "MINIRAG_PACKAGED",
        "MINIRAG_AUTO_MIGRATE",
        "MINIRAG_DATA_DIR",
        "CORS_ALLOW_ORIGINS",
        "OPENAI_API_KEY",
        "OPENAI_API_URL",
        "COHERE_API_KEY",
        "GEMINI_API_KEY",
        mode="before",
    )
    @classmethod
    def empty_str_to_none(cls, value):
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @property
    def data_dir(self) -> str:
        """Directory for uploads and generated previews.

        Electron supplies ``AISTUDY_DATA_DIR``. When the backend is frozen but
        the variable is missing, fall back to a per-user application data
        directory so uploads never land in PyInstaller's temporary extraction
        directory.
        """
        explicit = (self.AISTUDY_DATA_DIR or self.MINIRAG_DATA_DIR or "").strip()
        if explicit:
            return str(Path(explicit).expanduser())

        if getattr(sys, "frozen", False):
            appdata = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA")
            if appdata:
                return str(Path(appdata) / "AI-Study-Assistant" / "data")
            return str(Path.home() / ".ai-study-assistant" / "data")

        return str(Path(__file__).resolve().parent.parent)

    @property
    def packaged(self) -> bool:
        value = self.AISTUDY_PACKAGED
        if value is None:
            value = self.MINIRAG_PACKAGED
        return bool(value) or bool(getattr(sys, "frozen", False))

    @property
    def auto_migrate(self) -> Optional[bool]:
        value = self.AISTUDY_AUTO_MIGRATE
        if value is None:
            value = self.MINIRAG_AUTO_MIGRATE
        return value

    @property
    def database_configured(self) -> bool:
        return bool(
            self.POSTGRES_HOST
            and self.POSTGRES_USERNAME
            and self.POSTGRES_MAIN_DATABASE
            and self.POSTGRES_PORT
        )

    def provider_key(self, backend: str) -> Optional[str]:
        provider = (backend or "").strip().upper()
        if provider == "OPENAI":
            return self.OPENAI_API_KEY
        if provider == "COHERE":
            return self.COHERE_API_KEY
        if provider == "GEMINI":
            return self.GEMINI_API_KEY
        return None

    @staticmethod
    def _is_real_key(value: Optional[str]) -> bool:
        if not value:
            return False
        return value.strip().lower() not in ("", "dummy_key", "none", "null", "changeme")

    @property
    def generation_configured(self) -> bool:
        return self._is_real_key(self.provider_key(self.GENERATION_BACKEND))

    @property
    def embedding_configured(self) -> bool:
        return self._is_real_key(self.provider_key(self.EMBEDDING_BACKEND))

    model_config = SettingsConfigDict(
        env_file=(".env", "src/.env"),
        extra="ignore",
        case_sensitive=True,
    )


def get_settings():
    return Settings()
