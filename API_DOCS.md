# API Documentation - Mini-RAG Study Assistant

## Base URL

- **Development**: `http://localhost:5000/api/v1`
- **Packaged desktop app**: a free `127.0.0.1` port chosen at startup; the
  renderer accesses it through Electron IPC and never needs the port.

Interactive OpenAPI docs are available at `/docs` while the backend runs.

## Authentication

None. This is a single-user, local-first application. Do not expose the port to
untrusted networks.

## Conventions

Most JSON endpoints return a `signal` string plus endpoint-specific fields.
Project and document list endpoints return Pydantic response models directly
(no `signal` wrapper). File endpoints return binary data.

Common signals:

| Signal | Meaning |
|--------|---------|
| `project_created` | Project created |
| `project_updated` | Project updated |
| `project_deleted` | Project deleted |
| `project_list_retrieved` | Single project retrieved |
| `project_not_found` | Project does not exist |
| `document_list_retrieved` | Documents listed (or one document retrieved) |
| `document_deleted` | Document deleted |
| `file_upload_success` | Upload completed |
| `file_upload_failed` | Upload could not be written |
| `file_type_not_supported` | Upload is not a valid PDF |
| `file_size_exceeded` | Upload exceeds `FILE_MAX_SIZE` |
| `duplicate_file` | Duplicate name/PDF detected |
| `processing_success` | Processing finished (possibly with failed files) |
| `processing_failed` | Processing failed |
| `not_found_files` | No documents to process |
| `no_file_found_with_this_id` | Document/file ID not found |
| `insert_into_vectordb_success` | Vector indexing completed |
| `insert_into_vectordb_error` | Vector indexing failed |
| `vectordb_collection_retrieved` | Collection info retrieved |
| `vectordb_search_success` | Search completed |
| `vectordb_search_error` | Search failed |
| `rag_answer_success` | Answer generated |
| `rag_answer_error` | Answer could not be generated |

## Health and System

### Health

```http
GET /api/v1/health
```

Returns `200` when the database and vector store are connected, otherwise
`503` with `"status": "degraded"`. The bundled backend treats any HTTP response
as "server is up", even when degraded.

```json
{
  "status": "ok",
  "app": { "name": "mini-RAG", "version": "0.1" },
  "database": { "configured": true, "connected": true, "error": null },
  "vectordb": { "backend": "PGVECTOR", "connected": true, "error": null },
  "generation": {
    "backend": "OPENAI",
    "model": "gpt-3.5-turbo-0125",
    "configured": true
  },
  "embedding": {
    "backend": "COHERE",
    "model": "embed-multilingual-light-v3.0",
    "configured": true
  }
}
```

### System Info

```http
GET /api/v1/system/info
```

Returns non-secret runtime settings used by Settings/About pages, including
upload limits, provider/model names, vector backend, preview settings, and
chunking defaults.

## Projects

### List Projects

```http
GET /api/v1/projects?page=1&page_size=10&search=transformer
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number, minimum 1 |
| `page_size` | integer | 10 | 1-100 items |
| `search` | string | — | Case-insensitive name filter |

```json
{
  "projects": [
    {
      "project_id": 1,
      "project_uuid": "uuid-string",
      "name": "Transformers",
      "description": "Electrical transformers",
      "document_count": 5,
      "created_at": "2026-10-20T10:00:00Z",
      "updated_at": "2026-10-20T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10,
  "total_pages": 1
}
```

### Create Project

```http
POST /api/v1/projects
Content-Type: application/json

{
  "name": "Transformers",
  "description": "Electrical transformers"
}
```

`name` is required, 1-255 characters. Names must be unique; a duplicate returns
`400` with `{"signal": "duplicate_file"}`. Success returns `201`:

```json
{
  "signal": "project_created",
  "project": {
    "project_id": 1,
    "project_uuid": "uuid-string",
    "name": "Transformers",
    "description": "Electrical transformers",
    "document_count": 0,
    "created_at": "2026-10-20T10:00:00",
    "updated_at": null
  }
}
```

### Get Project

```http
GET /api/v1/projects/{project_id}
```

Returns `{"signal": "project_list_retrieved", "project": {...}}` or `404` with
`{"signal": "project_not_found"}`.

### Update Project

```http
PATCH /api/v1/projects/{project_id}
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description"
}
```

Both fields are optional. Returns `{"signal": "project_updated", "project": {...}}`.
Duplicate names return `400` with `duplicate_file`.

### Delete Project

```http
DELETE /api/v1/projects/{project_id}
```

Deletes the project's vector collection, chunks, assets, PDFs, previews, and
project row. Returns `{"signal": "project_deleted"}`.

## Documents

### List Documents

```http
GET /api/v1/projects/{project_id}/documents
```

```json
{
  "documents": [
    {
      "document_id": 1,
      "document_uuid": "uuid-string",
      "original_filename": "transformer_theory.pdf",
      "stored_filename": "abc123_transformer_theory.pdf",
      "file_size": 2048576,
      "page_count": 15,
      "status": "ready",
      "error_message": null,
      "preview_image_count": 10,
      "created_at": "2026-10-20T10:00:00Z",
      "updated_at": "2026-10-20T10:05:00Z"
    }
  ],
  "total": 1
}
```

`status` is one of `uploaded`, `extracting`, `chunking`, `embedding`,
`indexing`, `ready`, or `failed`.

### Get Document

```http
GET /api/v1/projects/{project_id}/documents/{document_id}
```

Returns `{"signal": "document_list_retrieved", "document": {...}}` or `404`
with `no_file_found_with_this_id`.

### Upload Documents

```http
POST /api/v1/data/upload/{project_id}
Content-Type: multipart/form-data

files: file1.pdf
files: file2.pdf
```

- Only PDF content is accepted. The configured content type allowlist also
  contains `text/plain`, but a PDF content check rejects other formats.
- Maximum size is `FILE_MAX_SIZE` MB (default 10 MB per file).
- Duplicate detection uses SHA-256 within the project. Duplicates are not
  stored again; the existing document is returned with `"duplicate": true`.
- The Electron upload bridge accepts at most 20 files per request.

```json
{
  "signal": "file_upload_success",
  "files": [
    {
      "filename": "transformer_theory.pdf",
      "file_id": "abc123_transformer_theory.pdf",
      "document_id": 1,
      "duplicate": false,
      "page_count": 15
    }
  ]
}
```

Errors include the offending `filename`:

```json
{
  "signal": "file_size_exceeded",
  "filename": "large.pdf"
}
```

### Process Documents

```http
POST /api/v1/data/process/{project_id}
Content-Type: application/json

{
  "file_id": null,
  "chunk_size": 1000,
  "overlap_size": 200,
  "do_reset": false
}
```

- Omit `file_id` (or send `null`) to process every uploaded document.
- `file_id` is the stored `file_id`, not the numeric document ID.
- Server defaults are `chunk_size=100`, `overlap_size=20`, `do_reset=false`.
  The desktop client sends `1000`/`200`.
- `do_reset=true` deletes the project's vector collection and all chunks before
  processing.
- Existing chunks and vectors for each file are cleared before re-insertion, so
  reprocessing is idempotent.

Status flow: `uploaded` -> `extracting` -> `chunking` -> `embedding` ->
`indexing` -> `ready`; failures set `failed` and populate `error_message`.

```json
{
  "signal": "processing_success",
  "inserted_chunks": 150,
  "processed_files": 3,
  "files": [
    { "file_id": "abc123_transformer_theory.pdf", "asset_id": 1, "chunks": 50 }
  ],
  "failed_files": []
}
```

### Reprocess Document

```http
POST /api/v1/projects/{project_id}/documents/{document_id}/reprocess
```

Deletes that document's old vectors and chunks, resets its status to
`uploaded`, and processes it again. Returns the same shape as Process
Documents.

### Delete Document

```http
DELETE /api/v1/projects/{project_id}/documents/{document_id}
```

Deletes the document's vectors, chunks, preview images, original PDF, and asset
row. Returns `{"signal": "document_deleted"}`.

### Preview Page Image

```http
GET /api/v1/projects/{project_id}/documents/{document_id}/preview/{page_number}
```

Returns a PNG for an available preview page. Only the first
`MAX_PREVIEW_PAGES` pages (default 10) are rendered at `PREVIEW_DPI`.
Returns `404` when the page or document does not exist.

### Download Original PDF

```http
GET /api/v1/projects/{project_id}/documents/{document_id}/file
```

Returns the original PDF. The backend validates that the file resolves inside
the configured storage root and rejects anything outside it.

## Vector Indexing

### Push Chunks to the Vector Database

```http
POST /api/v1/nlp/index/push/{project_id}
Content-Type: application/json

{
  "do_reset": 0
}
```

- `do_reset` is an integer flag (`1` resets the collection, `0` appends).
- Reads stored chunks in pages and embeds them through the configured embedding
  provider.

```json
{
  "signal": "insert_into_vectordb_success",
  "inserted_items_count": 150
}
```

### Collection Info

```http
GET /api/v1/nlp/index/info/{project_id}
```

```json
{
  "signal": "vectordb_collection_retrieved",
  "collection_info": {
    "record_count": 150,
    "table_info": {}
  }
}
```

`collection_info` can be `null` when the collection does not exist yet.

## Search

```http
POST /api/v1/nlp/index/search/{project_id}
Content-Type: application/json

{
  "text": "Explain the transformer equivalent circuit",
  "limit": 5,
  "similarity_threshold": 0.2
}
```

`similarity_threshold` is optional. `limit` defaults to 5.

```json
{
  "signal": "vectordb_search_success",
  "results": [
    {
      "text": "The equivalent circuit of a transformer consists of...",
      "score": 0.92,
      "asset_id": 1,
      "asset_name": "abc123_transformer_theory.pdf",
      "asset_uuid": "uuid-string",
      "original_filename": "transformer_theory.pdf",
      "page_number": 3,
      "chunk_index": 0,
      "chunk_id": 5
    }
  ]
}
```

Metadata values can be null for old entries indexed before page metadata was
added.

## RAG Question Answering

```http
POST /api/v1/nlp/index/answer/{project_id}
Content-Type: application/json

{
  "text": "Why is secondary current inversely proportional to secondary voltage?",
  "limit": 5,
  "chat_history": [
    { "role": "user", "content": "What is a transformer?" },
    { "role": "assistant", "content": "A transformer is a static device..." }
  ]
}
```

- Answers are generated only from retrieved document chunks.
- The prompt includes document name and page number for citations.
- At most the last 5 history messages are sent to the provider.
- The returned `chat_history` includes the new user question and assistant
  answer.
- If retrieval returns nothing, the endpoint returns `400` with
  `{"signal": "rag_answer_error"}`.

```json
{
  "signal": "rag_answer_success",
  "answer": "Based on your documents... [transformer_theory.pdf, Page 3]",
  "sources": [
    {
      "asset_id": 1,
      "asset_name": "abc123_transformer_theory.pdf",
      "asset_uuid": "uuid-string",
      "original_filename": "transformer_theory.pdf",
      "page_number": 3,
      "chunk_text": "The equivalent circuit shows...",
      "score": 0.92,
      "chunk_index": 0,
      "chunk_id": 5
    }
  ],
  "chat_history": [
    { "role": "user", "content": "What is a transformer?" },
    { "role": "assistant", "content": "A transformer is a static device..." },
    {
      "role": "user",
      "content": "Why is secondary current inversely proportional to secondary voltage?"
    },
    { "role": "assistant", "content": "Based on your documents..." }
  ]
}
```

## Error Handling

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Project created |
| 400 | Validation, duplicate, processing, upload, search, or RAG error |
| 404 | Project/document/page not found |
| 500 | Unhandled server error |
| 503 | Health check degraded (database or vector store unavailable) |

Typical error body:

```json
{
  "signal": "project_not_found"
}
```

Upload errors may also include `filename`. Non-API filesystem errors are
logged server-side and surfaced as general failure signals.

## Client Examples

### Python

```python
import httpx

client = httpx.Client(base_url="http://localhost:5000/api/v1", timeout=300)

project = client.post("/projects", json={"name": "My Subject"}).json()["project"]
project_id = project["project_id"]

with open("document.pdf", "rb") as f:
    upload = client.post(
        f"/data/upload/{project_id}",
        files={"files": ("document.pdf", f, "application/pdf")},
    ).json()

process = client.post(
    f"/data/process/{project_id}",
    json={"file_id": None, "chunk_size": 1000, "overlap_size": 200},
).json()

search = client.post(
    f"/nlp/index/search/{project_id}",
    json={"text": "equivalent circuit", "limit": 5},
).json()

answer = client.post(
    f"/nlp/index/answer/{project_id}",
    json={"text": "Explain the equivalent circuit", "limit": 5},
).json()
```

### TypeScript

```typescript
const API_BASE = 'http://localhost:5000/api/v1'

async function askQuestion(projectId: number, question: string) {
  const response = await fetch(`${API_BASE}/nlp/index/answer/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: question, limit: 5, chat_history: [] }),
  })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json()
}
```

## Changelog

### v1.0.0 (2026-10-20)

- Project CRUD, pagination, and name search.
- PDF upload with content validation, size limits, and hash deduplication.
- Processing status tracking, idempotent reprocessing, page previews, and
  original PDF download.
- Semantic search with page-level metadata.
- RAG answers with source citations and session chat history.
- Health and system-info endpoints.
- Packaging/runtime hardening: loopback-only packaged backend, IPC route
  allowlist, and migration-aware startup.
