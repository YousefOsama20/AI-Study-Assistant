import type {
  AnswerResponse,
  DocumentListResponse,
  HealthResponse,
  IndexInfo,
  IndexPushResponse,
  ProcessResponse,
  Project,
  ProjectListResponse,
  ProjectSummaryResponse,
  SearchResponse,
  SignalPayload,
  SystemInfoResponse,
  UploadResponse,
  ChatHistoryMessage,
  DocumentItem,
} from '../../types/api'
import { apiErrorFromResponse, ApiError } from './errors'
import {
  detectTransport,
  transportBinary,
  transportRequest,
  transportUpload,
  type TransportKind,
  type UploadFilePayload,
  type UploadProgress,
} from './transport'

const API_BASE = '/api/v1'

export interface RequestOptions {
  timeoutMs?: number
  signal?: AbortSignal
  onProgress?: (progress: UploadProgress) => void
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions & { body?: unknown } = {},
): Promise<T> {
  const response = await transportRequest({
    method,
    path: `${API_BASE}${path}`,
    body: options.body,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })
  if (!response.ok) {
    throw apiErrorFromResponse(response.status, response.data)
  }
  return response.data as T
}

export const api = {
  get transport(): TransportKind {
    return detectTransport()
  },

  // ---- System ----
  getSystemInfo(options: RequestOptions = {}): Promise<SystemInfoResponse> {
    return request('GET', '/system/info', options)
  },

  getHealth(options: RequestOptions = {}): Promise<HealthResponse> {
    return request('GET', '/health', { ...options, timeoutMs: options.timeoutMs ?? 8_000 })
  },

  // ---- Projects ----
  listProjects(
    params: { page?: number; pageSize?: number; search?: string },
    options: RequestOptions = {},
  ): Promise<ProjectListResponse> {
    const query = new URLSearchParams()
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('page_size', String(params.pageSize))
    if (params.search) query.set('search', params.search)
    const qs = query.toString()
    return request('GET', `/projects${qs ? `?${qs}` : ''}`, options)
  },

  createProject(
    body: { name: string; description?: string },
    options: RequestOptions = {},
  ): Promise<{ signal: string; project: Project }> {
    return request('POST', '/projects', { ...options, body })
  },

  getProject(projectId: number, options: RequestOptions = {}): Promise<SignalPayload> {
    return request('GET', `/projects/${projectId}`, options)
  },

  updateProject(
    projectId: number,
    body: { name?: string; description?: string },
    options: RequestOptions = {},
  ): Promise<{ signal: string; project: Project }> {
    return request('PATCH', `/projects/${projectId}`, { ...options, body })
  },

  deleteProject(projectId: number, options: RequestOptions = {}): Promise<SignalPayload> {
    return request('DELETE', `/projects/${projectId}`, {
      ...options,
      timeoutMs: options.timeoutMs ?? 60_000,
    })
  },

  // ---- Documents ----
  listDocuments(
    projectId: number,
    options: RequestOptions = {},
  ): Promise<DocumentListResponse> {
    return request('GET', `/projects/${projectId}/documents`, options)
  },

  getDocument(
    projectId: number,
    documentId: number,
    options: RequestOptions = {},
  ): Promise<SignalPayload & { document: DocumentItem }> {
    return request('GET', `/projects/${projectId}/documents/${documentId}`, options)
  },

  deleteDocument(
    projectId: number,
    documentId: number,
    options: RequestOptions = {},
  ): Promise<SignalPayload> {
    return request('DELETE', `/projects/${projectId}/documents/${documentId}`, {
      ...options,
      timeoutMs: options.timeoutMs ?? 60_000,
    })
  },

  reprocessDocument(
    projectId: number,
    documentId: number,
    options: RequestOptions = {},
  ): Promise<ProcessResponse> {
    return request(
      'POST',
      `/projects/${projectId}/documents/${documentId}/reprocess`,
      { ...options, timeoutMs: options.timeoutMs ?? 120_000 },
    )
  },

  // ---- Data processing ----
  processProject(
    projectId: number,
    body: {
      fileId?: string
      chunkSize?: number
      overlapSize?: number
      doReset?: boolean
    } = {},
    options: RequestOptions = {},
  ): Promise<ProcessResponse> {
    return request('POST', `/data/process/${projectId}`, {
      ...options,
      timeoutMs: options.timeoutMs ?? 600_000,
      body: {
        file_id: body.fileId ?? null,
        chunk_size: body.chunkSize ?? 1000,
        overlap_size: body.overlapSize ?? 200,
        do_reset: body.doReset ?? false,
      },
    })
  },

  // ---- NLP / index ----
  pushIndex(
    projectId: number,
    body: { doReset?: boolean } = {},
    options: RequestOptions = {},
  ): Promise<IndexPushResponse> {
    return request('POST', `/nlp/index/push/${projectId}`, {
      ...options,
      timeoutMs: options.timeoutMs ?? 600_000,
      body: { do_reset: body.doReset ? 1 : 0 },
    })
  },

  getIndexInfo(projectId: number, options: RequestOptions = {}): Promise<IndexInfo> {
    return request('GET', `/nlp/index/info/${projectId}`, options)
  },

  search(
    projectId: number,
    body: { text: string; limit?: number; similarityThreshold?: number | null },
    options: RequestOptions = {},
  ): Promise<SearchResponse> {
    return request('POST', `/nlp/index/search/${projectId}`, {
      ...options,
      timeoutMs: options.timeoutMs ?? 60_000,
      body: {
        text: body.text,
        limit: body.limit ?? 5,
        similarity_threshold: body.similarityThreshold ?? null,
      },
    })
  },

  answer(
    projectId: number,
    body: {
      text: string
      limit?: number
      chatHistory?: ChatHistoryMessage[]
      language?: string
    },
    options: RequestOptions = {},
  ): Promise<AnswerResponse> {
    return request('POST', `/nlp/index/answer/${projectId}`, {
      ...options,
      timeoutMs: options.timeoutMs ?? 120_000,
      body: {
        text: body.text,
        limit: body.limit ?? null,
        chat_history: body.chatHistory ?? [],
        language: body.language ?? null,
      },
    })
  },

  summarize(
    projectId: number,
    body: { language?: string; forceRefresh?: boolean } = {},
    options: RequestOptions = {},
  ): Promise<ProjectSummaryResponse> {
    return request('POST', `/nlp/summary/${projectId}`, {
      ...options,
      timeoutMs: options.timeoutMs ?? 600_000,
      body: {
        language: body.language ?? null,
        force_refresh: body.forceRefresh ?? false,
      },
    })
  },

  previewPath(projectId: number, documentId: number, page: number): string {
    return `${API_BASE}/projects/${projectId}/documents/${documentId}/preview/${page}`
  },

  filePath(projectId: number, documentId: number): string {
    return `${API_BASE}/projects/${projectId}/documents/${documentId}/file`
  },
}

/**
 * Upload PDFs to the backend. Kept separate because the multipart path
 * differs between fetch and IPC transports.
 */
export async function uploadProjectFiles(
  projectId: number,
  files: File[],
  options: RequestOptions = {},
): Promise<UploadResponse> {
  const payloads: UploadFilePayload[] = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type || 'application/pdf',
      data: new Uint8Array(await file.arrayBuffer()),
    })),
  )
  const response = await transportUpload(
    `${API_BASE}/data/upload/${projectId}`,
    payloads,
    {
      timeoutMs: options.timeoutMs ?? 120_000,
      signal: options.signal,
      onProgress: options.onProgress,
    },
  )
  if (!response.ok) {
    throw apiErrorFromResponse(response.status, response.data)
  }
  return response.data as UploadResponse
}

/**
 * Resolve a preview image URL. Fetch transport returns the direct path;
 * IPC transport downloads the bytes and produces a blob URL (the renderer
 * never learns the backend port).
 */
export async function resolvePreviewUrl(
  projectId: number,
  documentId: number,
  page: number,
  previousUrl?: string,
): Promise<string> {
  const path = api.previewPath(projectId, documentId, page)
  if (detectTransport() === 'fetch') {
    if (previousUrl && previousUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previousUrl)
    }
    return path
  }
  const bytes = await transportBinary(path)
  if (previousUrl && previousUrl.startsWith('blob:')) {
    URL.revokeObjectURL(previousUrl)
  }
  const blob = new Blob([bytes as BlobPart], { type: 'image/png' })
  return URL.createObjectURL(blob)
}

export { ApiError }
