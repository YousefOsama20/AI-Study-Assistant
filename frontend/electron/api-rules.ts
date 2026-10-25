export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export const API_TIMEOUT_DEFAULT_MS = 30_000
export const API_TIMEOUT_UPLOAD_MS = 120_000
export const API_TIMEOUT_LONG_MS = 600_000
export const API_TIMEOUT_DELETE_MS = 60_000
export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024
export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024
export const MAX_UPLOAD_FILES = 20

export const ALLOWED_ROUTES: Array<{ method: ApiMethod; pattern: RegExp }> = [
  { method: 'GET', pattern: /^\/api\/v1\/health$/ },
  { method: 'GET', pattern: /^\/api\/v1\/system\/info$/ },
  { method: 'GET', pattern: /^\/api\/v1\/projects$/ },
  { method: 'POST', pattern: /^\/api\/v1\/projects$/ },
  { method: 'GET', pattern: /^\/api\/v1\/projects\/\d+$/ },
  { method: 'PATCH', pattern: /^\/api\/v1\/projects\/\d+$/ },
  { method: 'DELETE', pattern: /^\/api\/v1\/projects\/\d+$/ },
  { method: 'GET', pattern: /^\/api\/v1\/projects\/\d+\/documents$/ },
  { method: 'GET', pattern: /^\/api\/v1\/projects\/\d+\/documents\/\d+$/ },
  { method: 'DELETE', pattern: /^\/api\/v1\/projects\/\d+\/documents\/\d+$/ },
  {
    method: 'POST',
    pattern: /^\/api\/v1\/projects\/\d+\/documents\/\d+\/reprocess$/,
  },
  {
    method: 'GET',
    pattern: /^\/api\/v1\/projects\/\d+\/documents\/\d+\/preview\/\d+$/,
  },
  { method: 'GET', pattern: /^\/api\/v1\/projects\/\d+\/documents\/\d+\/file$/ },
  { method: 'POST', pattern: /^\/api\/v1\/data\/upload\/\d+$/ },
  { method: 'POST', pattern: /^\/api\/v1\/data\/process\/\d+$/ },
  { method: 'POST', pattern: /^\/api\/v1\/nlp\/index\/push\/\d+$/ },
  { method: 'GET', pattern: /^\/api\/v1\/nlp\/index\/info\/\d+$/ },
  { method: 'POST', pattern: /^\/api\/v1\/nlp\/index\/search\/\d+$/ },
  { method: 'POST', pattern: /^\/api\/v1\/nlp\/index\/answer\/\d+$/ },
  { method: 'POST', pattern: /^\/api\/v1\/nlp\/summary\/\d+$/ },
]

export const ALLOWED_BINARY_PATTERNS: RegExp[] = [
  /^\/api\/v1\/projects\/\d+\/documents\/\d+\/preview\/\d+$/,
  /^\/api\/v1\/projects\/\d+\/documents\/\d+\/file$/,
]

const SAFE_PATH_RE = /^\/api\/v1\/[A-Za-z0-9._~\-/?=&%+]*$/

export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2_048) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  if (raw.includes('..') || raw.includes('\\') || raw.includes('#')) return null
  if (!SAFE_PATH_RE.test(raw)) return null
  const pathname = raw.split('?')[0] ?? raw
  return pathname + raw.slice(pathname.length)
}

export function pathnameOf(safePath: string): string {
  return safePath.split('?')[0] ?? safePath
}

export function isAllowedRoute(method: string, pathname: string): boolean {
  return ALLOWED_ROUTES.some(
    (route) => route.method === method && route.pattern.test(pathname),
  )
}

export function timeoutForPath(method: string, pathname: string): number {
  if (
    pathname.includes('/data/upload/') ||
    pathname.includes('/data/process/') ||
    pathname.includes('/nlp/index/push/') ||
    pathname.includes('/nlp/summary/')
  ) {
    return API_TIMEOUT_LONG_MS
  }
  if (pathname.includes('/nlp/index/answer/')) {
    return API_TIMEOUT_UPLOAD_MS
  }
  if (method === 'DELETE') {
    return API_TIMEOUT_DELETE_MS
  }
  return API_TIMEOUT_DEFAULT_MS
}
