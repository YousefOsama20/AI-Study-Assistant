from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):

    APP_NAME: str  
    APP_VERSION: str
    OPENAI_API_KEY: str

    FILE_UPLOAD_TYPES: list
    FILE_MAX_SIZE: int
    FILE_DEFAULT_CHUNK_SIZE: int

    POSTGRES_USERNAME: str
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    POSTGRES_MAIN_DATABASE: str

    GENERATION_BACKEND: str
    EMBEDDING_BACKEND: str

    OPENAI_API_KEY: str = None
    OPENAI_API_URL: str = None
    COHERE_API_KEY: str = None
    GEMINI_API_KEY: str = None

    GENERATION_MODEL_ID_LITERAL: List = None
    GENERATION_MODEL_ID: str = None
    EMBEDDING_MODEL_ID: str = None
    EMBEDDING_MODEL_SIZE: int = None
    INPUT_DAFAULT_MAX_CHARACTERS: int = None
    GENERATION_DAFAULT_MAX_TOKENS: int = None
    GENERATION_DAFAULT_TEMPERATURE: float = None
    
    VECTOR_DB_BACKEND_LITERAL: List = None
    VECTOR_DB_BACKEND: str
    VECTOR_DB_PATH: str
    VECTOR_DB_DISTANCE_METHOD: str
    VECTOR_DB_PGVEC_INDEX_THRESHOLD: int

    # Preview settings
    PREVIEW_DPI: int = None
    PREVIEW_IMAGE_FORMAT: str = None
    MAX_PREVIEW_PAGES: int = None
    
    # Chunk defaults
    CHUNK_SIZE_DEFAULT: int = None
    CHUNK_OVERLAP_DEFAULT: int = None

    PRIMARY_LANG: str
    DEFAULT_LANG: str

    HOST: str
    PORT: int
    RELOAD: bool

    MINIRAG_PACKAGED: bool
    MINIRAG_AUTO_MIGRATE: bool

    MINIRAG_DATA_DIR: str = None

    CORS_ALLOW_ORIGINS: List = None
    
    model_config = SettingsConfigDict(env_file = ".env", extra="ignore")

def get_settings():
    return Settings()
