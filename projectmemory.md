# Project Memory: mini-rag

## Project Overview
Minimal RAG implementation for question answering with multi-provider LLM and vector DB support.

## Architecture
- **API Layer**: FastAPI routes (base, data, nlp) with prefix `/api/v1`
- **Controllers**: DataController, NLPController, ProcessController, ProjectController
- **Stores**: LLM providers (OpenAI, Gemini, Cohere), VectorDB providers (PGVector, Qdrant)
- **Models**: Project, Asset, Chunk with SQLAlchemy + Alembic
- **Templates**: Localized prompt templates (EN/AR)

## Key Configuration (.env)
- LLM: `GENERATION_BACKEND`, `EMBEDDING_BACKEND`, model IDs
- Vector DB: `VECTOR_DB_BACKEND` (pgvector/qdrant)
- Database: PostgreSQL connection settings
- Files: Upload types, chunk size, max size

## Development Commands
```bash
# Install deps
pip install -r requirements.txt

# Run server (dev)
cd src && python main.py

# Run with Docker
cd docker && docker compose up

# DB migrations
cd src/models/db_schemes/minirag && alembic upgrade head
```

## API Endpoints

### Base
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/` | GET | Health check - returns app name & version |

### Data Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/data/upload/{project_id}` | POST | Upload file to project (multipart/form-data) |
| `/api/v1/data/process/{project_id}` | POST | Process uploaded files into chunks |

### NLP - Vector Indexing
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/nlp/index/push/{project_id}` | POST | Push chunks to vector database |
| `/api/v1/nlp/index/info/{project_id}` | GET | Get vector collection info |
| `/api/v1/nlp/index/search/{project_id}` | POST | Semantic search in vector DB |
| `/api/v1/nlp/index/answer/{project_id}` | POST | RAG question answering |

## Request/Response Models

### Data Schemes
```python
# POST /api/v1/data/process/{project_id}
ProcessRequest:
  file_id: str = None          # Specific file to process (optional)
  chunk_size: int = 100        # Chunk size in characters
  overlap_size: int = 20       # Overlap between chunks
  do_reset: bool = False       # Reset vector collection before indexing
```

### NLP Schemes
```python
# POST /api/v1/nlp/index/push/{project_id}
PushRequest:
  do_reset: int = 0            # Reset collection before push (0/1)

# POST /api/v1/nlp/index/search/{project_id}
# POST /api/v1/nlp/index/answer/{project_id}
SearchRequest:
  text: str                    # Query text
  limit: int = 5               # Max results to return
```

## Design Decisions
1. **Factory pattern** for LLM/VectorDB providers - easy to extend
2. **Async throughout** - FastAPI + asyncpg + async clients
3. **Template parser** with locale support (EN/AR)
4. **In-memory fallback** (`MemoryProjectModel`) for testing
5. **Alembic** for schema migrations

## Known Limitations
- Single-threaded dev server (uvicorn reload)
- No authentication/authorization
- In-memory model not production-ready
- Limited error handling in some controllers
- No project CRUD endpoints (only in-memory model has them)