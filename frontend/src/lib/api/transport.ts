import { ApiError } from './errors'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type TransportKind = 'fetch' | 'ipc'

export interface TransportRequest {
  method: HttpMethod
  path: string
  body?: unknown
  contentType?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export interface TransportResponse {
  status: number
  ok: boolean
  data: unknown
}

export interface UploadFilePayload {
  name: string
  type: string
  data: Uint8Array
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface TransportUploadOptions {
  timeoutMs?: number
  signal?: AbortSignal
  onProgress?: (progress: UploadProgress) => void
}

const DEFAULT_TIMEOUT_MS = 30_000
const BACKEND_READY_TIMEOUT_MS = 60_000
const BACKEND_STATUS_POLL_MS = 500

type BackendStatusPayload = Awaited<
  ReturnType<NonNullable<Window['minirag']>['getBackendStatus']>
>

function backendNotRunning(status: BackendStatusPayload): ApiError {
  return new ApiError(
    'network',
    status.error?.trim() ? status.error : 'Backend is not running',
  )
}

async function waitForBackendReady(signal?: AbortSignal): Promise<void> {
  if (!hasIpcBridge() || !window.minirag) return
  const bridge = window.minirag
  if (typeof bridge.getBackendStatus !== 'function') return

  if (signal?.aborted) {
    throw new ApiError('abort', 'Request aborted')
  }

  const initial = await bridge.getBackendStatus()
  if (initial.state === 'running') return
  if (initial.state === 'failed' || initial.state === 'stopped') {
    throw backendNotRunning(initial)
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let pollTimer = 0
    let timeoutTimer = 0
    let unsubscribe: (() => void) | undefined

    const cleanup = () => {
      window.clearInterval(pollTimer)
      window.clearTimeout(timeoutTimer)
      unsubscribe?.()
      signal?.removeEventListener('abort', onAbort)
    }
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      action()
    }
    const settleFromStatus = (status: BackendStatusPayload) => {
      if (status.state === 'running') {
        finish(resolve)
        return
      }
      if (status.state === 'failed' || status.state === 'stopped') {
        finish(() => reject(backendNotRunning(status)))
      }
    }
    const check = async () => {
      if (settled) return
      try {
        settleFromStatus(await bridge.getBackendStatus())
      } catch {
        return
      }
    }
    const onAbort = () => {
      finish(() => reject(new ApiError('abort', 'Request aborted')))
    }

    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    unsubscribe = bridge.onBackendStatus?.(settleFromStatus)
    void check()
    pollTimer = window.setInterval(() => {
      void check()
    }, BACKEND_STATUS_POLL_MS)
    timeoutTimer = window.setTimeout(() => {
      finish(() =>
        reject(
          new ApiError(
            'timeout',
            `Backend did not become ready within ${BACKEND_READY_TIMEOUT_MS / 1000}s`,
          ),
        ),
      )
    }, BACKEND_READY_TIMEOUT_MS)
  })
}

export function detectTransport(): TransportKind {
  if (typeof window !== 'undefined' && window.minirag) return 'ipc'
  return 'fetch'
}

function hasIpcBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.minirag)
}

let ipcRequestCounter = 0

function nextIpcRequestId(): string {
  ipcRequestCounter += 1
  return `r${Date.now().toString(36)}-${ipcRequestCounter.toString(36)}`
}

function cancelIpcRequest(requestId: string): void {
  void window.minirag?.cancelRequest?.(requestId)?.catch(() => {})
}

async function fetchRequest(
  req: TransportRequest,
): Promise<TransportResponse> {
  const controller = new AbortController()
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onExternalAbort = () => controller.abort()
  req.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const init: RequestInit = {
      method: req.method,
      signal: controller.signal,
      headers: {},
    }
    if (req.body !== undefined) {
      init.headers = {
        ...(init.headers as Record<string, string>),
        'Content-Type': req.contentType ?? 'application/json',
      }
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
    const response = await fetch(req.path, init)
    const text = await response.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
    return { status: response.status, ok: response.ok, data }
  } catch (error) {
    if (timedOut) {
      throw new ApiError('timeout', `Request timed out after ${timeoutMs}ms`)
    }
    if (req.signal?.aborted) {
      throw new ApiError('abort', 'Request aborted')
    }
    throw new ApiError('network', 'Network request failed', {
      details: error instanceof Error ? error.message : String(error),
    })
  } finally {
    window.clearTimeout(timer)
    req.signal?.removeEventListener('abort', onExternalAbort)
  }
}

async function ipcRequest(req: TransportRequest): Promise<TransportResponse> {
  if (!window.minirag) {
    throw new ApiError('network', 'Electron bridge is not available')
  }
  if (req.signal?.aborted) {
    throw new ApiError('abort', 'Request aborted')
  }

  await waitForBackendReady(req.signal)
  if (req.signal?.aborted) {
    throw new ApiError('abort', 'Request aborted')
  }

  const requestId = nextIpcRequestId()
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    cancelIpcRequest(requestId)
  }, timeoutMs)
  const onExternalAbort = () => cancelIpcRequest(requestId)
  req.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const result = await window.minirag.apiRequest({
      method: req.method,
      path: req.path,
      body: req.body,
      contentType: req.contentType,
      requestId,
      timeoutMs,
    })
    return { status: result.status, ok: result.ok, data: result.json }
  } catch (error) {
    if (timedOut) {
      throw new ApiError('timeout', `Request timed out after ${timeoutMs}ms`)
    }
    if (req.signal?.aborted) {
      throw new ApiError('abort', 'Request aborted')
    }
    throw new ApiError('network', 'IPC request failed', {
      details: error instanceof Error ? error.message : String(error),
    })
  } finally {
    window.clearTimeout(timer)
    req.signal?.removeEventListener('abort', onExternalAbort)
  }
}

export async function transportRequest(
  req: TransportRequest,
): Promise<TransportResponse> {
  if (hasIpcBridge()) return ipcRequest(req)
  return fetchRequest(req)
}

function buildUploadForm(files: UploadFilePayload[]): FormData {
  const form = new FormData()
  for (const file of files) {
    form.append(
      'files',
      new Blob([file.data as BlobPart], { type: file.type }),
      file.name,
    )
  }
  return form
}

function uploadProgress(loaded: number, total: number): UploadProgress {
  return {
    loaded,
    total,
    percent: total > 0 ? Math.min(100, (loaded / total) * 100) : 0,
  }
}

function xhrUpload(
  path: string,
  files: UploadFilePayload[],
  options: TransportUploadOptions,
): Promise<TransportResponse> {
  const form = buildUploadForm(files)
  const timeoutMs = options.timeoutMs ?? 120_000

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let timedOut = false
    let settled = false
    let timer = 0
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      action()
    }
    const onExternalAbort = () => xhr.abort()
    const cleanup = () => {
      window.clearTimeout(timer)
      options.signal?.removeEventListener('abort', onExternalAbort)
    }

    timer = window.setTimeout(() => {
      timedOut = true
      xhr.abort()
    }, timeoutMs)
    options.signal?.addEventListener('abort', onExternalAbort, { once: true })

    xhr.open('POST', path)
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      options.onProgress?.(uploadProgress(event.loaded, event.total))
    }
    xhr.onload = () => {
      cleanup()
      let data: unknown = null
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        data = null
      }
      const status = xhr.status
      finish(() =>
        resolve({ status, ok: status >= 200 && status < 300, data }),
      )
    }
    xhr.onerror = () => {
      cleanup()
      finish(() => reject(new ApiError('network', 'Upload failed')))
    }
    xhr.onabort = () => {
      cleanup()
      if (timedOut) {
        finish(() =>
          reject(
            new ApiError('timeout', `Upload timed out after ${timeoutMs}ms`),
          ),
        )
      } else {
        finish(() => reject(new ApiError('abort', 'Upload aborted')))
      }
    }

    if (options.signal?.aborted) {
      cleanup()
      finish(() => reject(new ApiError('abort', 'Upload aborted')))
      return
    }
    xhr.send(form)
  })
}

async function ipcUpload(
  path: string,
  files: UploadFilePayload[],
  options: TransportUploadOptions,
): Promise<TransportResponse> {
  if (!window.minirag) {
    throw new ApiError('network', 'Electron bridge is not available')
  }
  if (options.signal?.aborted) {
    throw new ApiError('abort', 'Upload aborted')
  }

  await waitForBackendReady(options.signal)
  if (options.signal?.aborted) {
    throw new ApiError('abort', 'Upload aborted')
  }

  const requestId = nextIpcRequestId()
  const timeoutMs = options.timeoutMs ?? 120_000
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    cancelIpcRequest(requestId)
  }, timeoutMs)
  const onExternalAbort = () => cancelIpcRequest(requestId)
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })
  const unsubscribe = options.onProgress
    ? window.minirag.onUploadProgress?.((progress) => {
        if (progress.requestId !== requestId) return
        options.onProgress?.(
          uploadProgress(progress.loaded, progress.total),
        )
      })
    : undefined

  try {
    const result = await window.minirag.uploadFiles(path, files, {
      requestId,
      timeoutMs,
    })
    return { status: result.status, ok: result.ok, data: result.json }
  } catch (error) {
    if (timedOut) {
      throw new ApiError('timeout', `Upload timed out after ${timeoutMs}ms`)
    }
    if (options.signal?.aborted) {
      throw new ApiError('abort', 'Upload aborted')
    }
    throw new ApiError('network', 'IPC upload failed', {
      details: error instanceof Error ? error.message : String(error),
    })
  } finally {
    window.clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
    unsubscribe?.()
  }
}

export async function transportUpload(
  path: string,
  files: UploadFilePayload[],
  options: TransportUploadOptions = {},
): Promise<TransportResponse> {
  if (hasIpcBridge()) return ipcUpload(path, files, options)
  if (options.onProgress) return xhrUpload(path, files, options)
  return fetchUpload(path, files, options)
}

async function fetchUpload(
  path: string,
  files: UploadFilePayload[],
  options: TransportUploadOptions,
): Promise<TransportResponse> {
  const form = buildUploadForm(files)
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 120_000
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onExternalAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const response = await fetch(path, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    const text = await response.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
    return { status: response.status, ok: response.ok, data }
  } catch (error) {
    if (timedOut) {
      throw new ApiError('timeout', `Upload timed out after ${timeoutMs}ms`)
    }
    if (options.signal?.aborted) {
      throw new ApiError('abort', 'Upload aborted')
    }
    throw new ApiError('network', 'Upload failed', {
      details: error instanceof Error ? error.message : String(error),
    })
  } finally {
    window.clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}

export async function transportBinary(
  path: string,
  timeoutMs = 30_000,
): Promise<Uint8Array> {
  if (hasIpcBridge() && window.minirag) {
    await waitForBackendReady()
    const result = await window.minirag.fetchBinary(path, timeoutMs)
    if (!result.ok) {
      throw new ApiError('http', `Binary fetch failed (${result.status})`, {
        status: result.status,
      })
    }
    return result.data
  }

  const response = await fetch(path, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) {
    throw new ApiError('http', `Binary fetch failed (${response.status})`, {
      status: response.status,
    })
  }
  const buffer = await response.arrayBuffer()
  return new Uint8Array(buffer)
}
