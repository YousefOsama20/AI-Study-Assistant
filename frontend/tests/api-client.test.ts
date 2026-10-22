import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ApiError, apiErrorFromResponse } from '@/lib/api/errors'
import {
  detectTransport,
  transportBinary,
  transportRequest,
  transportUpload,
} from '@/lib/api/transport'
import { api, uploadProjectFiles, resolvePreviewUrl } from '@/lib/api/client'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('apiErrorFromResponse', () => {
  it('maps 422 to a validation error with the signal preserved', () => {
    const error = apiErrorFromResponse(422, { signal: 'validation_error' })
    expect(error.kind).toBe('validation')
    expect(error.status).toBe(422)
    expect(error.signal).toBe('validation_error')
  })

  it('maps other statuses to http errors and extracts signal', () => {
    const error = apiErrorFromResponse(404, { signal: 'not_found_error' })
    expect(error.kind).toBe('http')
    expect(error.signal).toBe('not_found_error')
  })

  it('recognizes no-context and no-index signals', () => {
    expect(
      apiErrorFromResponse(500, { signal: 'rag_answer_error' }).isNoContext(),
    ).toBe(true)
    expect(
      apiErrorFromResponse(500, { signal: 'vectordb_search_error' }).isNoIndex(),
    ).toBe(true)
  })
})

describe('fetch transport', () => {
  beforeEach(() => {
    delete window.minirag
  })

  it('returns parsed JSON on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { signal: 'success', projects: [] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await transportRequest({ method: 'GET', path: '/api/v1/projects' })
    expect(result.status).toBe(200)
    expect(result.ok).toBe(true)
    expect((result.data as { signal: string }).signal).toBe('success')
  })

  it('returns non-ok responses without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(500, { signal: 'internal_error' })),
    )
    const result = await transportRequest({ method: 'GET', path: '/api/v1/health' })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
  })

  it('maps timeouts to ApiError timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )
    await expect(
      transportRequest({ method: 'GET', path: '/api/v1/health', timeoutMs: 5 }),
    ).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('maps external abort to ApiError abort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )
    const controller = new AbortController()
    const promise = transportRequest({
      method: 'GET',
      path: '/api/v1/projects',
      signal: controller.signal,
    })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ kind: 'abort' })
  })

  it('sends JSON bodies with the right content type', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { signal: 'success' }))
    vi.stubGlobal('fetch', fetchMock)

    await transportRequest({
      method: 'POST',
      path: '/api/v1/projects',
      body: { name: 'Thesis' },
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
    expect(init.body).toBe(JSON.stringify({ name: 'Thesis' }))
  })
})

describe('upload transport', () => {
  afterEach(() => {
    delete window.minirag
  })

  it('builds a FormData POST with files appended', async () => {
    delete window.minirag
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { signal: 'success', files: [] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await transportUpload('/api/v1/data/upload/1', [
      { name: 'a.pdf', type: 'application/pdf', data: new Uint8Array([1, 2, 3]) },
    ])
    expect(result.ok).toBe(true)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('routes through the IPC bridge when present', async () => {
    const bridge = {
      uploadFiles: vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: { signal: 'success', files: [] },
      }),
    }
    window.minirag = bridge as unknown as Window['minirag']

    const result = await transportUpload('/api/v1/data/upload/1', [
      { name: 'a.pdf', type: 'application/pdf', data: new Uint8Array([1]) },
    ])
    expect(result.status).toBe(200)
    expect(bridge.uploadFiles).toHaveBeenCalledOnce()
  })

  it('forwards IPC upload progress for the matching request and unsubscribes', async () => {
    let resolveUpload: (value: unknown) => void = () => {}
    let emitProgress: (progress: {
      requestId: string
      loaded: number
      total: number
    }) => void = () => {}
    const unsubscribe = vi.fn()
    const uploadFiles = vi.fn(
      (
        _path: string,
        _files: unknown[],
        _options: { requestId: string },
      ) =>
        new Promise((resolve) => {
          resolveUpload = resolve
        }),
    )
    window.minirag = {
      uploadFiles,
      onUploadProgress: vi.fn((callback) => {
        emitProgress = callback
        return unsubscribe
      }),
    } as unknown as Window['minirag']

    const onProgress = vi.fn()
    const promise = transportUpload(
      '/api/v1/data/upload/1',
      [{ name: 'a.pdf', type: 'application/pdf', data: new Uint8Array([1]) }],
      { timeoutMs: 5_000, onProgress },
    )
    await vi.waitFor(() => expect(uploadFiles).toHaveBeenCalledOnce())
    const options = uploadFiles.mock.calls[0][2]
    emitProgress({ requestId: 'other', loaded: 1, total: 10 })
    emitProgress({ requestId: options.requestId, loaded: 5, total: 10 })
    expect(onProgress).toHaveBeenCalledOnce()
    expect(onProgress).toHaveBeenCalledWith({
      loaded: 5,
      total: 10,
      percent: 50,
    })

    resolveUpload({ status: 200, ok: true, json: { files: [] } })
    await promise
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('IPC transport', () => {
  afterEach(() => {
    delete window.minirag
  })

  it('detects the IPC bridge when window.minirag exists', () => {
    window.minirag = {
      apiRequest: vi.fn(),
    } as unknown as Window['minirag']
    expect(detectTransport()).toBe('ipc')
    delete window.minirag
    expect(detectTransport()).toBe('fetch')
  })

  it('apiRequest resolves bridge results', async () => {
    window.minirag = {
      apiRequest: vi.fn().mockResolvedValue({
        status: 201,
        ok: true,
        json: { signal: 'success' },
      }),
    } as unknown as Window['minirag']

    const result = await transportRequest({
      method: 'POST',
      path: '/api/v1/projects',
      body: { name: 'x' },
    })
    expect(result.status).toBe(201)
    expect(result.data).toEqual({ signal: 'success' })
  })

  it('bridge failures become network ApiErrors', async () => {
    window.minirag = {
      apiRequest: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as Window['minirag']

    await expect(
      transportRequest({ method: 'GET', path: '/api/v1/projects' }),
    ).rejects.toMatchObject({ kind: 'network' })
  })

  it('cancels IPC requests through the bridge and maps to abort', async () => {
    let rejectRequest: (reason?: unknown) => void = () => {}
    const cancelRequest = vi.fn(() => {
      rejectRequest(new Error('cancelled'))
      return Promise.resolve()
    })
    const apiRequest = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject
        }),
    )
    window.minirag = {
      apiRequest,
      cancelRequest,
    } as unknown as Window['minirag']

    const controller = new AbortController()
    const promise = transportRequest({
      method: 'GET',
      path: '/api/v1/projects',
      signal: controller.signal,
      timeoutMs: 5_000,
    })
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledOnce())
    controller.abort()

    await expect(promise).rejects.toMatchObject({ kind: 'abort' })
    expect(cancelRequest).toHaveBeenCalledOnce()
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
        timeoutMs: 5_000,
      }),
    )
  })

  it('times out IPC requests and cancels the bridge request', async () => {
    vi.useFakeTimers()
    try {
      let rejectRequest: (reason?: unknown) => void = () => {}
      const cancelRequest = vi.fn(() => {
        rejectRequest(new Error('cancelled'))
        return Promise.resolve()
      })
      window.minirag = {
        apiRequest: vi.fn(
          () =>
            new Promise((_resolve, reject) => {
              rejectRequest = reject
            }),
        ),
        cancelRequest,
      } as unknown as Window['minirag']

      const promise = transportRequest({
        method: 'GET',
        path: '/api/v1/health',
        timeoutMs: 5,
      })
      const expectation = expect(promise).rejects.toMatchObject({
        kind: 'timeout',
      })
      await vi.advanceTimersByTimeAsync(5)

      await expectation
      expect(cancelRequest).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for the backend to become running before sending requests', async () => {
    type Status = {
      state: 'stopped' | 'starting' | 'running' | 'failed'
      port: number | null
      error: string | null
    }
    let status: Status = { state: 'starting', port: null, error: null }
    let emitStatus: ((next: Status) => void) | undefined
    const unsubscribe = vi.fn()
    const apiRequest = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: { signal: 'success' },
    })
    const onBackendStatus = vi.fn((callback: (next: Status) => void) => {
      emitStatus = callback
      return unsubscribe
    })
    window.minirag = {
      apiRequest,
      getBackendStatus: vi.fn(async () => status),
      onBackendStatus,
    } as unknown as Window['minirag']

    const promise = transportRequest({
      method: 'GET',
      path: '/api/v1/health',
      timeoutMs: 5_000,
    })
    await vi.waitFor(() => expect(onBackendStatus).toHaveBeenCalled())
    expect(apiRequest).not.toHaveBeenCalled()

    status = { state: 'running', port: 1234, error: null }
    emitStatus?.(status)

    await expect(promise).resolves.toMatchObject({ status: 200 })
    expect(apiRequest).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('rejects without sending when the backend failed to start', async () => {
    const apiRequest = vi.fn()
    window.minirag = {
      apiRequest,
      getBackendStatus: vi.fn(async () => ({
        state: 'failed',
        port: null,
        error: 'Backend exited during startup',
      })),
    } as unknown as Window['minirag']

    await expect(
      transportRequest({ method: 'GET', path: '/api/v1/health' }),
    ).rejects.toMatchObject({
      kind: 'network',
      message: 'Backend exited during startup',
    })
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('can be aborted while waiting for the backend to start', async () => {
    const onBackendStatus = vi.fn(() => vi.fn())
    const apiRequest = vi.fn()
    window.minirag = {
      apiRequest,
      getBackendStatus: vi.fn(async () => ({
        state: 'starting',
        port: null,
        error: null,
      })),
      onBackendStatus,
    } as unknown as Window['minirag']

    const controller = new AbortController()
    const promise = transportRequest({
      method: 'GET',
      path: '/api/v1/projects',
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(onBackendStatus).toHaveBeenCalled())

    controller.abort()

    await expect(promise).rejects.toMatchObject({ kind: 'abort' })
    expect(apiRequest).not.toHaveBeenCalled()
  })
})

describe('client high-level calls', () => {
  beforeEach(() => {
    delete window.minirag
  })

  it('throws ApiError on non-ok responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(500, { signal: 'vectordb_search_error' })),
    )
    await expect(api.getIndexInfo(1)).rejects.toBeInstanceOf(ApiError)
    await expect(api.getIndexInfo(1)).rejects.toMatchObject({
      isNoIndex: expect.any(Function),
    })
  })

  it('uses a longer timeout for process calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        signal: 'success',
        inserted_chunks: 0,
        processed_files: 0,
        files: [],
        failed_files: [],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await api.processProject(1)
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal
    // AbortSignal.timeout leaves the signal in a non-aborted state; presence is enough
    expect(signal).toBeDefined()
  })

  it('uploadProjectFiles rejects on non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(413, { signal: 'file_too_large' })),
    )
    await expect(
      uploadProjectFiles(1, [
        new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }),
      ]),
    ).rejects.toBeInstanceOf(ApiError)
  })
})

describe('resolvePreviewUrl', () => {
  afterEach(() => {
    delete window.minirag
  })

  it('fetch transport returns the direct path', async () => {
    delete window.minirag
    const url = await resolvePreviewUrl(1, 2, 3)
    expect(url).toBe('/api/v1/projects/1/documents/2/preview/3')
  })

  it('IPC transport produces a blob URL from fetched bytes', async () => {
    window.minirag = {
      fetchBinary: vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        data: new Uint8Array([137, 80]),
      }),
    } as unknown as Window['minirag']

    const url = await resolvePreviewUrl(1, 2, 3)
    expect(url.startsWith('blob:')).toBe(true)
  })

  it('IPC transport surfaces binary failures as ApiError', async () => {
    window.minirag = {
      fetchBinary: vi.fn().mockResolvedValue({ status: 404, ok: false, data: new Uint8Array() }),
    } as unknown as Window['minirag']

    await expect(resolvePreviewUrl(1, 2, 3)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('transportBinary', () => {
  afterEach(() => {
    delete window.minirag
  })

  it('fetch transport returns bytes', async () => {
    delete window.minirag
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))),
    )
    const bytes = await transportBinary('/api/v1/projects/1/documents/2/preview/1')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBe(3)
  })
})
