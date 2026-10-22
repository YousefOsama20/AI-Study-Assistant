import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { randomBytes } from 'crypto'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { BackendManager } from './backend-manager'
import { shouldDisableGpu } from './platform'
import {
  ALLOWED_BINARY_PATTERNS,
  API_TIMEOUT_DEFAULT_MS,
  API_TIMEOUT_LONG_MS,
  API_TIMEOUT_UPLOAD_MS,
  MAX_JSON_BODY_BYTES,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILES,
  isAllowedRoute,
  normalizePath,
  pathnameOf,
  timeoutForPath,
} from './api-rules'
import {
  SECURE_WEB_PREFERENCES,
  isAllowedNavigation,
  isSafeExternalUrl,
} from './security'

const FRONTEND_ROOT = path.join(__dirname, '..', '..')
const REPO_ROOT = path.join(FRONTEND_ROOT, '..')
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

if (shouldDisableGpu()) {
  app.disableHardwareAcceleration()
}

function requireBackendPort(manager: BackendManager): number {
  const port = manager.getPort()
  if (port === null) {
    throw new Error('Backend is not running')
  }
  return port
}

interface ApiRequestOptions {
  method: string
  path: string
  body?: unknown
  contentType?: string
  requestId?: string
  timeoutMs?: number
}

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const pendingRequests = new Map<string, AbortController>()

function normalizeRequestId(raw: unknown): string | null {
  return typeof raw === 'string' && REQUEST_ID_RE.test(raw) ? raw : null
}

function registerPendingRequest(requestId: string | null): AbortController {
  const controller = new AbortController()
  if (requestId) {
    if (pendingRequests.has(requestId)) {
      throw new Error('Duplicate request id')
    }
    pendingRequests.set(requestId, controller)
  }
  return controller
}

function clearPendingRequest(requestId: string | null): void {
  if (requestId) pendingRequests.delete(requestId)
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

interface UploadFilePayload {
  name: string
  type: string
  data: Uint8Array
}

interface UploadProgressPayload {
  requestId: string
  loaded: number
  total: number
}

function buildMultipartBody(files: UploadFilePayload[]): {
  boundary: string
  body: Buffer
} {
  const boundary = `----MiniRAG${randomBytes(12).toString('hex')}`
  const parts: Buffer[] = []
  for (const file of files) {
    const name = file.name.replace(/[\r\n"]/g, '_')
    const type = file.type.replace(/[\r\n]/g, '') || 'application/pdf'
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="files"; filename="${name}"\r\n` +
          `Content-Type: ${type}\r\n\r\n`,
      ),
    )
    parts.push(Buffer.from(file.data))
    parts.push(Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { boundary, body: Buffer.concat(parts) }
}

function streamUploadRequest(options: {
  port: number
  path: string
  files: UploadFilePayload[]
  timeoutMs: number
  signal: AbortSignal
  onProgress?: (loaded: number, total: number) => void
}): Promise<{ status: number; ok: boolean; json: unknown }> {
  const { boundary, body } = buildMultipartBody(options.files)

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      action()
    }

    const request = http.request(
      {
        host: '127.0.0.1',
        port: options.port,
        path: options.path,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('error', (error) => {
          finish(() => reject(error))
        })
        response.on('aborted', () => {
          finish(() => reject(new Error('Upload response aborted')))
        })
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json: unknown = null
          try {
            json = text ? JSON.parse(text) : null
          } catch {
            json = null
          }
          const status = response.statusCode ?? 0
          finish(() =>
            resolve({
              status,
              ok: status >= 200 && status < 300,
              json,
            }),
          )
        })
      },
    )

    const timer = setTimeout(
      () => request.destroy(new Error('Upload timed out')),
      options.timeoutMs,
    )
    const onAbort = () => request.destroy(new Error('Upload cancelled'))
    if (options.signal.aborted) {
      onAbort()
    } else {
      options.signal.addEventListener('abort', onAbort, { once: true })
    }

    request.on('close', () => {
      clearTimeout(timer)
      options.signal.removeEventListener('abort', onAbort)
    })
    request.on('error', (error) => {
      clearTimeout(timer)
      finish(() => reject(error))
    })

    const chunkSize = 64 * 1024
    let offset = 0
    const writeNext = () => {
      while (offset < body.length) {
        const next = Math.min(offset + chunkSize, body.length)
        const chunk = body.subarray(offset, next)
        offset = next
        const canContinue = request.write(chunk)
        options.onProgress?.(offset, body.length)
        if (!canContinue) {
          request.once('drain', writeNext)
          return
        }
      }
      request.end()
    }
    writeNext()
  })
}

function registerIpcHandlers(manager: BackendManager): void {
  ipcMain.handle('minirag:api-request', async (_event, options: ApiRequestOptions) => {
    const method = typeof options?.method === 'string' ? options.method : ''
    const safePath = normalizePath(options?.path)
    const pathname = safePath ? pathnameOf(safePath) : null
    const requestId =
      options?.requestId === undefined ? null : normalizeRequestId(options.requestId)
    if (
      !safePath ||
      pathname === null ||
      !(['GET', 'POST', 'PATCH', 'DELETE'] as string[]).includes(method) ||
      !isAllowedRoute(method, pathname) ||
      (options?.requestId !== undefined && requestId === null)
    ) {
      throw new Error('API request is not allowed')
    }
    if (
      options.body !== undefined &&
      options.contentType !== undefined &&
      options.contentType !== 'application/json'
    ) {
      throw new Error('Only application/json content type is allowed')
    }

    const port = requireBackendPort(manager)
    let body: string | undefined
    if (options.body !== undefined && method !== 'GET') {
      body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
      if (Buffer.byteLength(body, 'utf8') > MAX_JSON_BODY_BYTES) {
        throw new Error('Request body is too large')
      }
    }

    const defaultTimeout = timeoutForPath(method, pathname)
    const requestedTimeout =
      typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
        ? Math.trunc(options.timeoutMs)
        : defaultTimeout
    const timeoutMs = Math.min(
      Math.max(requestedTimeout, 1_000),
      API_TIMEOUT_LONG_MS,
    )

    const controller = registerPendingRequest(requestId)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`http://127.0.0.1:${port}${safePath}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined
            ? { 'Content-Type': options.contentType ?? 'application/json' }
            : {}),
        },
        body,
        redirect: 'error',
        signal: controller.signal,
      })
      return {
        status: response.status,
        ok: response.ok,
        json: await readJsonResponse(response),
      }
    } finally {
      clearTimeout(timer)
      clearPendingRequest(requestId)
    }
  })

  ipcMain.handle('minirag:cancel-request', (_event, rawRequestId: unknown) => {
    const requestId = normalizeRequestId(rawRequestId)
    if (!requestId) return
    pendingRequests.get(requestId)?.abort()
  })

  ipcMain.handle(
    'minirag:upload-files',
    async (
      event,
      rawPath: unknown,
      rawFiles: unknown,
      rawOptions?: { requestId?: unknown; timeoutMs?: unknown },
    ): Promise<{ status: number; ok: boolean; json: unknown }> => {
      const safePath = normalizePath(rawPath)
      const pathname = safePath ? pathnameOf(safePath) : null
      if (
        !safePath ||
        pathname === null ||
        !isAllowedRoute('POST', pathname) ||
        !pathname.includes('/data/upload/')
      ) {
        throw new Error('Upload path is not allowed')
      }
      if (!Array.isArray(rawFiles) || rawFiles.length === 0 || rawFiles.length > MAX_UPLOAD_FILES) {
        throw new Error('Invalid files payload')
      }
      const requestId =
        rawOptions?.requestId === undefined
          ? null
          : normalizeRequestId(rawOptions.requestId)
      if (rawOptions?.requestId !== undefined && requestId === null) {
        throw new Error('Invalid request id')
      }

      const files: UploadFilePayload[] = []
      for (const file of rawFiles) {
        const candidate = file as { name?: unknown; type?: unknown; data?: unknown }
        const name = typeof candidate.name === 'string' ? candidate.name : ''
        const type = typeof candidate.type === 'string' ? candidate.type : ''
        if (!name || /[\\/]/.test(name) || name.includes('..')) {
          throw new Error('Invalid file name')
        }
        if (!type.toLowerCase().includes('pdf') && !name.toLowerCase().endsWith('.pdf')) {
          throw new Error('Only PDF uploads are allowed')
        }
        const data = candidate.data
        if (!(data instanceof Uint8Array) || data.byteLength === 0) {
          throw new Error('Invalid file data')
        }
        if (data.byteLength > MAX_UPLOAD_FILE_BYTES) {
          throw new Error(`File exceeds the ${MAX_UPLOAD_FILE_BYTES / 1024 / 1024}MB limit`)
        }
        files.push({
          name,
          type: type || 'application/pdf',
          data,
        })
      }

      const requestedTimeout =
        typeof rawOptions?.timeoutMs === 'number' &&
        Number.isFinite(rawOptions.timeoutMs)
          ? Math.trunc(rawOptions.timeoutMs)
          : API_TIMEOUT_LONG_MS
      const timeoutMs = Math.min(
        Math.max(requestedTimeout, 1_000),
        API_TIMEOUT_LONG_MS,
      )

      const port = requireBackendPort(manager)
      const controller = registerPendingRequest(requestId)
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await streamUploadRequest({
          port,
          path: safePath,
          files,
          timeoutMs,
          signal: controller.signal,
          onProgress: (loaded, total) => {
            if (!requestId || event.sender.isDestroyed()) return
            const payload: UploadProgressPayload = {
              requestId,
              loaded,
              total,
            }
            event.sender.send('minirag:upload-progress', payload)
          },
        })
      } finally {
        clearTimeout(timer)
        clearPendingRequest(requestId)
      }
    },
  )

  ipcMain.handle(
    'minirag:fetch-binary',
    async (_event, rawPath: unknown, rawTimeoutMs: unknown) => {
      const safePath = normalizePath(rawPath)
      const pathname = safePath ? pathnameOf(safePath) : null
      if (!safePath || pathname === null || !ALLOWED_BINARY_PATTERNS.some((p) => p.test(pathname))) {
        throw new Error('Binary fetch path is not allowed')
      }
      const requested = typeof rawTimeoutMs === 'number' ? rawTimeoutMs : API_TIMEOUT_DEFAULT_MS
      const timeoutMs = Math.min(Math.max(Math.trunc(requested), 1_000), API_TIMEOUT_UPLOAD_MS)

      const port = requireBackendPort(manager)
      const response = await fetch(`http://127.0.0.1:${port}${safePath}`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
      const buffer = Buffer.from(await response.arrayBuffer())
      return { status: response.status, ok: response.ok, data: buffer }
    },
  )

  ipcMain.handle('minirag:get-app-version', () => app.getVersion())
  ipcMain.handle('minirag:get-backend-status', () => manager.getStatus())
  ipcMain.handle('minirag:restart-backend', () => manager.restart())

  ipcMain.handle('minirag:open-external', async (_event, rawUrl: unknown) => {
    const safeUrl = isSafeExternalUrl(rawUrl)
    if (!safeUrl) {
      return { ok: false, error: 'Only valid http(s) links can be opened' }
    }
    await shell.openExternal(safeUrl)
    return { ok: true }
  })

  ipcMain.handle(
    'minirag:open-original-pdf',
    async (
      _event,
      params: { projectId?: unknown; documentId?: unknown },
    ): Promise<{ ok: boolean; path?: string; error?: string }> => {
      const projectId = params?.projectId
      const documentId = params?.documentId
      if (
        typeof projectId !== 'number' ||
        !Number.isInteger(projectId) ||
        projectId <= 0 ||
        typeof documentId !== 'number' ||
        !Number.isInteger(documentId) ||
        documentId <= 0
      ) {
        return { ok: false, error: 'Invalid document reference' }
      }
      try {
        const port = requireBackendPort(manager)
        const filePath = `/api/v1/projects/${projectId}/documents/${documentId}/file`
        const response = await fetch(`http://127.0.0.1:${port}${filePath}`, {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(API_TIMEOUT_DEFAULT_MS),
        })
        if (!response.ok) {
          return { ok: false, error: `Document download failed (${response.status})` }
        }
        const buffer = Buffer.from(await response.arrayBuffer())
        const dir = path.join(os.tmpdir(), 'mini-rag-study-assistant')
        fs.mkdirSync(dir, { recursive: true })
        const target = path.join(dir, `document-${documentId}.pdf`)
        fs.writeFileSync(target, buffer)
        const openError = await shell.openPath(target)
        if (openError) {
          return { ok: false, error: openError }
        }
        return { ok: true, path: target }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )
}

function hardenWindow(win: BrowserWindow, devUrl: string | undefined): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, devUrl)) {
      event.preventDefault()
    }
  })
}

function createWindow(manager: BackendManager): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#f4f2ee',
    autoHideMenuBar: true,
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.once('ready-to-show', () => win.show())
  hardenWindow(win, DEV_SERVER_URL)

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL)
  } else {
    void win.loadFile(
      path.join(FRONTEND_ROOT, 'build', 'renderer', 'index.html'),
    )
  }

  manager.on('status', (status) => {
    if (!win.isDestroyed()) {
      win.webContents.send('minirag:backend-status', status)
    }
  })

  return win
}

let backendStopping = false

async function main(): Promise<void> {
  app.setPath('userData', path.join(app.getPath('appData'), 'Mini-RAG Study Assistant'))

  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }

  await app.whenReady()

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  const manager = new BackendManager({
    userDataDir: app.getPath('userData'),
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot: REPO_ROOT,
  })
  registerIpcHandlers(manager)

  void manager.start().catch((error: unknown) => {
    // Status surface is the renderer banner; keep the message in the log/status only.
    process.stderr.write(
      `[mini-rag] backend failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
    )
  })
  createWindow(manager)

  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(manager)
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', (event) => {
    if (backendStopping) return
    backendStopping = true
    event.preventDefault()
    void manager.stop().finally(() => app.quit())
  })
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `[mini-rag] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  )
  app.quit()
})
