import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  SECURE_WEB_PREFERENCES,
  isAllowedNavigation,
  isSafeExternalUrl,
} from '../electron/security'
import {
  ALLOWED_BINARY_PATTERNS,
  API_TIMEOUT_LONG_MS,
  isAllowedRoute,
  normalizePath,
  timeoutForPath,
} from '../electron/api-rules'

const electronMock = vi.hoisted(() => ({
  expose: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMock.expose },
  ipcRenderer: {
    invoke: electronMock.invoke,
    on: electronMock.on,
    removeListener: electronMock.removeListener,
  },
}))

let exposedBridge: BridgeApi

beforeAll(async () => {
  const preloadUrl = pathToFileURL(
    path.resolve(process.cwd(), 'electron/preload.ts'),
  ).href
  await import(/* @vite-ignore */ preloadUrl)
  const call = electronMock.expose.mock.calls[0]
  exposedBridge = call?.[1] as BridgeApi
})

interface BridgeApi {
  apiRequest: (options: {
    method: string
    path: string
    body?: unknown
    contentType?: string
    requestId?: string
    timeoutMs?: number
  }) => Promise<unknown>
  cancelRequest: (requestId: string) => Promise<unknown>
  uploadFiles: (
    path: string,
    files: unknown[],
    options?: { requestId?: string; timeoutMs?: number },
  ) => Promise<unknown>
  fetchBinary: (
    path: string,
    timeoutMs?: number,
  ) => Promise<{ status: number; ok: boolean; data: Uint8Array }>
  getAppVersion: () => Promise<string>
  getBackendStatus: () => Promise<unknown>
  restartBackend: () => Promise<unknown>
  openExternal: (url: string) => Promise<unknown>
  openOriginalPdf: (params: {
    projectId: number
    documentId: number
  }) => Promise<unknown>
  onBackendStatus: (
    callback: (status: { state: string; port: number | null; error: string | null }) => void,
  ) => () => void
  onUploadProgress: (
    callback: (progress: {
      requestId: string
      loaded: number
      total: number
    }) => void,
  ) => () => void
}

function bridgeApi(): BridgeApi {
  expect(exposedBridge).toBeDefined()
  return exposedBridge
}

describe('preload bridge', () => {
  beforeEach(() => {
    electronMock.invoke.mockReset().mockResolvedValue({})
    electronMock.on.mockClear()
    electronMock.removeListener.mockClear()
  })

  it('exposes a narrow API without raw ipcRenderer', () => {
    const api = bridgeApi()

    expect((api as unknown as Record<string, unknown>).ipcRenderer).toBeUndefined()
    expect(Object.keys(api).sort()).toEqual(
      [
        'apiRequest',
        'cancelRequest',
        'fetchBinary',
        'getAppVersion',
        'getBackendStatus',
        'onBackendStatus',
        'onUploadProgress',
        'openExternal',
        'openOriginalPdf',
        'restartBackend',
        'uploadFiles',
      ].sort(),
    )
  })

  it('uses only allowlisted invoke channels', async () => {
    const api = bridgeApi()
    const channels = new Set([
      'minirag:api-request',
      'minirag:cancel-request',
      'minirag:upload-files',
      'minirag:fetch-binary',
      'minirag:get-app-version',
      'minirag:get-backend-status',
      'minirag:restart-backend',
      'minirag:open-external',
      'minirag:open-original-pdf',
    ])

    await api.apiRequest({
      method: 'GET',
      path: '/api/v1/health',
      requestId: 'req-1',
      timeoutMs: 5_000,
    })
    await api.cancelRequest('req-1')
    await api.uploadFiles('/api/v1/data/upload/1', [], {
      requestId: 'upload-1',
      timeoutMs: 5_000,
    })
    expect(electronMock.invoke).toHaveBeenCalledWith(
      'minirag:upload-files',
      '/api/v1/data/upload/1',
      [],
      { requestId: 'upload-1', timeoutMs: 5_000 },
    )
    electronMock.invoke.mockResolvedValueOnce({
      status: 200,
      ok: true,
      data: new Uint8Array([1]),
    })
    await api.fetchBinary('/api/v1/projects/1/documents/2/preview/1', 5_000)
    await api.getAppVersion()
    await api.getBackendStatus()
    await api.restartBackend()
    await api.openExternal('https://example.com')
    await api.openOriginalPdf({ projectId: 1, documentId: 2 })

    expect(electronMock.invoke).toHaveBeenCalledTimes(9)
    for (const [channel] of electronMock.invoke.mock.calls) {
      expect(channels.has(channel as string)).toBe(true)
    }
  })

  it('forwards backend status events and supports unsubscribe', () => {
    const api = bridgeApi()
    const callback = vi.fn()

    const unsubscribe = api.onBackendStatus(callback)
    expect(electronMock.on).toHaveBeenCalledWith(
      'minirag:backend-status',
      expect.any(Function),
    )

    const listener = electronMock.on.mock.calls[0][1] as (...args: unknown[]) => void
    listener(null, { state: 'running', port: 5000, error: null })
    expect(callback).toHaveBeenCalledWith({
      state: 'running',
      port: 5000,
      error: null,
    })

    unsubscribe()
    expect(electronMock.removeListener).toHaveBeenCalledWith(
      'minirag:backend-status',
      listener,
    )
  })

  it('forwards upload progress events and supports unsubscribe', () => {
    const api = bridgeApi()
    const callback = vi.fn()

    const unsubscribe = api.onUploadProgress(callback)
    expect(electronMock.on).toHaveBeenCalledWith(
      'minirag:upload-progress',
      expect.any(Function),
    )

    const listener = electronMock.on.mock.calls[0][1] as (...args: unknown[]) => void
    listener(null, { requestId: 'upload-1', loaded: 50, total: 100 })
    expect(callback).toHaveBeenCalledWith({
      requestId: 'upload-1',
      loaded: 50,
      total: 100,
    })

    unsubscribe()
    expect(electronMock.removeListener).toHaveBeenCalledWith(
      'minirag:upload-progress',
      listener,
    )
  })
})

describe('electron security rules', () => {
  it('hardens the renderer window', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    })
  })

  it('only accepts absolute http(s) external URLs', () => {
    expect(isSafeExternalUrl('https://example.com/docs')).toBe(
      'https://example.com/docs',
    )
    expect(isSafeExternalUrl('http://localhost:5000')).toBe(
      'http://localhost:5000/',
    )
    expect(isSafeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(isSafeExternalUrl('file:///etc/passwd')).toBeNull()
    expect(isSafeExternalUrl('data:text/html,hi')).toBeNull()
    expect(isSafeExternalUrl('//example.com')).toBeNull()
    expect(isSafeExternalUrl(42)).toBeNull()
  })

  it('blocks navigation away from the app shell', () => {
    expect(isAllowedNavigation('file:///app/index.html', undefined)).toBe(true)
    expect(isAllowedNavigation('https://example.com', undefined)).toBe(false)
    expect(
      isAllowedNavigation('http://localhost:5173/projects', 'http://localhost:5173'),
    ).toBe(true)
    expect(
      isAllowedNavigation('https://example.com', 'http://localhost:5173'),
    ).toBe(false)
  })

  it('validates and normalizes API paths', () => {
    expect(normalizePath('/api/v1/projects?page=1')).toBe(
      '/api/v1/projects?page=1',
    )
    expect(normalizePath('//evil.example/api')).toBeNull()
    expect(normalizePath('/api/v1/../../etc/passwd')).toBeNull()
    expect(normalizePath('/api/v1/projects\\1')).toBeNull()
    expect(normalizePath('https://example.com/api')).toBeNull()
    expect(normalizePath(12)).toBeNull()
  })

  it('allowlists API routes by method and path', () => {
    expect(isAllowedRoute('GET', '/api/v1/health')).toBe(true)
    expect(isAllowedRoute('POST', '/api/v1/projects')).toBe(true)
    expect(isAllowedRoute('DELETE', '/api/v1/projects/4/documents/9')).toBe(true)
    expect(isAllowedRoute('GET', '/api/v1/projects/4/documents/9/file')).toBe(true)
    expect(isAllowedRoute('GET', '/api/v1/projects')).toBe(true)
    expect(isAllowedRoute('PUT', '/api/v1/projects/4')).toBe(false)
    expect(isAllowedRoute('GET', '/api/v1/admin')).toBe(false)
    expect(isAllowedRoute('GET', '/api/v1/projects/abc')).toBe(false)
  })

  it('restricts binary downloads and keeps long jobs on long timeouts', () => {
    const preview = '/api/v1/projects/1/documents/2/preview/3'
    const file = '/api/v1/projects/1/documents/2/file'
    expect(ALLOWED_BINARY_PATTERNS.some((pattern) => pattern.test(preview))).toBe(
      true,
    )
    expect(ALLOWED_BINARY_PATTERNS.some((pattern) => pattern.test(file))).toBe(
      true,
    )
    expect(
      ALLOWED_BINARY_PATTERNS.some((pattern) =>
        pattern.test('/api/v1/projects'),
      ),
    ).toBe(false)
    expect(timeoutForPath('POST', '/api/v1/data/process/1')).toBe(
      API_TIMEOUT_LONG_MS,
    )
  })
})
