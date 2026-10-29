export interface Project {
  project_id: number
  project_uuid: string
  name: string
  description: string | null
  document_count: number
  created_at: string | null
  updated_at: string | null
}

export interface ProjectListResponse {
  projects: Project[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export type ProcessingStatus =
  | 'uploaded'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'indexing'
  | 'ready'
  | 'failed'

export const PROCESSING_STATUSES: ProcessingStatus[] = [
  'uploaded',
  'extracting',
  'chunking',
  'embedding',
  'indexing',
]

export function isActiveProcessingStatus(status: ProcessingStatus): boolean {
  return PROCESSING_STATUSES.includes(status)
}

export interface DocumentItem {
  document_id: number
  document_uuid: string
  original_filename: string
  stored_filename: string
  file_size: number
  page_count: number | null
  status: ProcessingStatus
  error_message: string | null
  preview_image_count: number
  created_at: string
  updated_at: string | null
}

export interface DocumentListResponse {
  documents: DocumentItem[]
  total: number
}

export interface UploadedFileResult {
  filename: string
  file_id: string
  document_id: number
  duplicate: boolean
  page_count?: number
}

export interface UploadResponse {
  signal: string
  files: UploadedFileResult[]
}

export interface ProcessResponse {
  signal: string
  inserted_chunks: number
  processed_files: number
  files: { file_id: string; asset_id: number; chunks: number }[]
  failed_files: { file_id: string; error: string }[]
}

export interface SearchResultItem {
  text: string
  score: number
  asset_id: number | null
  asset_uuid: string
  asset_name: string
  original_filename: string
  page_number: number | null
  chunk_index: number
  chunk_id: number | null
}

export interface SearchResponse {
  signal: string
  results: SearchResultItem[]
}

export interface SourceCitation {
  asset_id: number | null
  asset_uuid: string
  asset_name: string
  original_filename: string
  page_number: number | null
  chunk_text: string
  score: number
  chunk_index: number
  chunk_id: number | null
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AnswerResponse {
  signal: string
  answer: string
  sources: SourceCitation[]
  chat_history: ChatHistoryMessage[]
}

export interface SummaryDocument {
  document_id: number
  filename: string
  page_count: number | null
  chunk_count: number
  first_page: number | null
  last_page: number | null
}

export interface ProjectSummaryResponse {
  signal: string
  summary: string
  documents: SummaryDocument[]
  chunk_count: number
  cached: boolean
  truncated: boolean
  language: string
  generated_at: string
}

export interface IndexInfo {
  signal: string
  collection_info: {
    record_count?: number
    table_info?: Record<string, unknown>
  } | null
}

export interface IndexPushResponse {
  signal: string
  inserted_items_count: number
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  app: { name: string; version: string }
  database: {
    configured: boolean
    connected: boolean
    ready: boolean
    error: string | null
  }
  migration: {
    attempted: boolean
    succeeded: boolean
    error: string | null
  }
  vectordb: { backend: string; connected: boolean; error: string | null }
  generation: { backend: string; model: string | null; configured: boolean }
  embedding: { backend: string; model: string | null; configured: boolean }
}

export interface SystemInfoResponse {
  app_name: string
  version: string
  upload: { max_size_mb: number; allowed_types: string[] }
  providers: {
    generation_backend: string
    generation_model: string | null
    embedding_backend: string
    embedding_model: string | null
    embedding_size: number | null
  }
  vectordb: { backend: string; distance_method: string | null }
  preview: { max_pages: number; dpi: number; format: string }
  chunking: { default_size: number; default_overlap: number }
}

export interface SignalPayload {
  signal: string
  [key: string]: unknown
}
