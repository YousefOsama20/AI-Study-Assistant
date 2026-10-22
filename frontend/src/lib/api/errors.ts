export type ApiErrorKind =
  | 'http'
  | 'signal'
  | 'network'
  | 'timeout'
  | 'abort'
  | 'validation'

export class ApiError extends Error {
  readonly status: number
  readonly signal: string | null
  readonly details: unknown
  readonly kind: ApiErrorKind

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number; signal?: string | null; details?: unknown } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = options.status ?? 0
    this.signal = options.signal ?? null
    this.details = options.details ?? null
  }

  /** No relevant context was found for the RAG answer. */
  isNoContext(): boolean {
    return this.signal === 'rag_answer_error'
  }

  /** The vector index does not exist for this project. */
  isNoIndex(): boolean {
    return this.signal === 'vectordb_search_error'
  }

  isAbort(): boolean {
    return this.kind === 'abort'
  }
}

export function extractSignal(data: unknown): string | null {
  if (data && typeof data === 'object' && 'signal' in data) {
    const value = (data as { signal: unknown }).signal
    if (typeof value === 'string') return value
  }
  return null
}

export function apiErrorFromResponse(status: number, data: unknown): ApiError {
  const signal = extractSignal(data)
  if (status === 422) {
    return new ApiError('validation', 'Validation error', {
      status,
      signal,
      details: data,
    })
  }
  return new ApiError('http', `Request failed with status ${status}`, {
    status,
    signal,
    details: data,
  })
}
