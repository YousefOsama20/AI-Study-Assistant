import { contextBridge, ipcRenderer } from 'electron'
import type { SetupSaveInput, SetupStatus } from './setup-config'
import type { DockerStatus } from './docker-manager'

interface ApiRequestArg {
  method: string
  path: string
  body?: unknown
  contentType?: string
  requestId?: string
  timeoutMs?: number
}

interface UploadFileArg {
  name: string
  type: string
  data: Uint8Array
}

interface UploadOptions {
  requestId?: string
  timeoutMs?: number
}

interface UploadProgressPayload {
  requestId: string
  loaded: number
  total: number
}

interface BackendStatusPayload {
  state: 'stopped' | 'starting' | 'running' | 'failed'
  port: number | null
  error: string | null
}

const INVOKE_CHANNELS = [
  'aiStudyAssistant:api-request',
  'aiStudyAssistant:cancel-request',
  'aiStudyAssistant:upload-files',
  'aiStudyAssistant:fetch-binary',
  'aiStudyAssistant:get-app-version',
  'aiStudyAssistant:get-backend-status',
  'aiStudyAssistant:restart-backend',
  'aiStudyAssistant:open-external',
  'aiStudyAssistant:open-original-pdf',
  'aiStudyAssistant:setup-get-status',
  'aiStudyAssistant:setup-save',
  'aiStudyAssistant:setup-docker-status',
  'aiStudyAssistant:setup-docker-start',
  'aiStudyAssistant:setup-test-db',
  'aiStudyAssistant:setup-init-db',
  'aiStudyAssistant:setup-open-logs',
] as const

interface SetupResult<T> {
  status: number
  ok: boolean
  json: T | { message?: string; code?: string } | null
}

interface DatabaseSetupInput {
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
}

interface InitializeDatabaseInput extends DatabaseSetupInput {
  create_database?: boolean
  run_migrations?: boolean
}

const EVENT_CHANNELS = [
  'aiStudyAssistant:backend-status',
  'aiStudyAssistant:upload-progress',
] as const

type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
type EventChannel = (typeof EVENT_CHANNELS)[number]

function invoke(channel: InvokeChannel, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(channel, ...args)
}

contextBridge.exposeInMainWorld('aiStudyAssistant', {
  apiRequest(options: ApiRequestArg) {
    return invoke('aiStudyAssistant:api-request', {
      method: options?.method,
      path: options?.path,
      body: options?.body,
      contentType: options?.contentType,
      requestId: options?.requestId,
      timeoutMs: options?.timeoutMs,
    }) as Promise<{ status: number; ok: boolean; json: unknown }>
  },

  cancelRequest(requestId: string) {
    return invoke('aiStudyAssistant:cancel-request', requestId) as Promise<void>
  },

  uploadFiles(path: string, files: UploadFileArg[], options?: UploadOptions) {
    const safeFiles = Array.isArray(files)
      ? files.map((file) => ({
          name: file?.name,
          type: file?.type,
          data: file?.data instanceof Uint8Array ? file.data : new Uint8Array(),
        }))
      : []
    return invoke('aiStudyAssistant:upload-files', path, safeFiles, {
      requestId: options?.requestId,
      timeoutMs: options?.timeoutMs,
    }) as Promise<{
      status: number
      ok: boolean
      json: unknown
    }>
  },

  async fetchBinary(path: string, timeoutMs?: number) {
    const result = (await invoke('aiStudyAssistant:fetch-binary', path, timeoutMs)) as {
      status: number
      ok: boolean
      data: Uint8Array | ArrayBuffer
    }
    return {
      status: result.status,
      ok: result.ok,
      data:
        result.data instanceof Uint8Array
          ? result.data
          : new Uint8Array(result.data as ArrayBuffer),
    }
  },

  getAppVersion() {
    return invoke('aiStudyAssistant:get-app-version') as Promise<string>
  },

  getBackendStatus() {
    return invoke('aiStudyAssistant:get-backend-status') as Promise<BackendStatusPayload>
  },

  restartBackend() {
    return invoke('aiStudyAssistant:restart-backend') as Promise<{
      ok: boolean
      error: string | null
    }>
  },

  openExternal(url: string) {
    return invoke('aiStudyAssistant:open-external', url) as Promise<{
      ok: boolean
      error?: string
    }>
  },

  openOriginalPdf(params: { projectId: number; documentId: number }) {
    return invoke('aiStudyAssistant:open-original-pdf', {
      projectId: params?.projectId,
      documentId: params?.documentId,
    }) as Promise<{ ok: boolean; path?: string; error?: string }>
  },

  getSetupStatus() {
    return invoke('aiStudyAssistant:setup-get-status') as Promise<SetupStatus>
  },

  saveSetupConfig(input: SetupSaveInput) {
    return invoke('aiStudyAssistant:setup-save', input) as Promise<SetupStatus>
  },

  getDockerStatus() {
    return invoke('aiStudyAssistant:setup-docker-status') as Promise<DockerStatus>
  },

  startDockerDatabase(input: {
    port?: number
    database?: string
    username?: string
  }) {
    return invoke('aiStudyAssistant:setup-docker-start', input) as Promise<{
      ok: boolean
      containerStatus: string
      message: string
      passwordGenerated: boolean
    }>
  },

  testDatabase(input: DatabaseSetupInput) {
    return invoke(
      'aiStudyAssistant:setup-test-db',
      input,
    ) as Promise<SetupResult<unknown>>
  },

  initializeDatabase(input: InitializeDatabaseInput) {
    return invoke(
      'aiStudyAssistant:setup-init-db',
      input,
    ) as Promise<SetupResult<unknown>>
  },

  openLogsFolder() {
    return invoke('aiStudyAssistant:setup-open-logs') as Promise<{
      ok: boolean
      error: string | null
    }>
  },

  onBackendStatus(callback: (status: BackendStatusPayload) => void) {
    const channel: EventChannel = 'aiStudyAssistant:backend-status'
    const listener = (_event: unknown, status: BackendStatusPayload) => {
      callback(status)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  onUploadProgress(callback: (progress: UploadProgressPayload) => void) {
    const channel: EventChannel = 'aiStudyAssistant:upload-progress'
    const listener = (_event: unknown, progress: UploadProgressPayload) => {
      callback(progress)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },
})
