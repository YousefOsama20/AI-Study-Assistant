/// <reference types="vite/client" />

type ProviderBackendName = 'OPENAI' | 'COHERE' | 'GEMINI'

interface SetupConfigPayload {
  version: 1
  setupComplete: boolean
  database: {
    mode: 'docker' | 'existing'
    host: string
    port: number
    name: string
    username: string
  }
  generation: {
    backend: ProviderBackendName
    model: string
  }
  embedding: {
    backend: ProviderBackendName
    model: string
    size: number
    useGenerationProvider: boolean
  }
}

interface SetupStatusPayload {
  configured: boolean
  setupComplete: boolean
  config: SetupConfigPayload
  secrets: {
    databasePasswordSet: boolean
    openaiKeySet: boolean
    cohereKeySet: boolean
    geminiKeySet: boolean
    openaiApiUrl: string | null
  }
}

interface SetupSaveInputPayload {
  config?: Partial<SetupConfigPayload> | null
  setupComplete?: boolean
  databasePassword?: string | null
  openaiApiKey?: string | null
  openaiApiUrl?: string | null
  cohereApiKey?: string | null
  geminiApiKey?: string | null
}

interface DatabaseSetupInputPayload {
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
}

interface DatabaseSetupResultPayload {
  ok: boolean
  code?: string
  message?: string
  server_reachable?: boolean
  database_exists?: boolean
  vector_available?: boolean
  vector_installed?: boolean
  vector_version?: string | null
  server_version?: string | null
  created_database?: boolean
  database_existed?: boolean
  extension_created?: boolean
  migrations_applied?: boolean
  revision?: string | null
}

interface ElectronBridge {
  apiRequest(options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    path: string
    body?: unknown
    contentType?: string
    requestId?: string
    timeoutMs?: number
  }): Promise<{ status: number; ok: boolean; json: unknown }>
  cancelRequest(requestId: string): Promise<void>
  uploadFiles(
    path: string,
    files: { name: string; type: string; data: Uint8Array }[],
    options?: { requestId?: string; timeoutMs?: number },
  ): Promise<{ status: number; ok: boolean; json: unknown }>
  fetchBinary(
    path: string,
    timeoutMs?: number,
  ): Promise<{ status: number; ok: boolean; data: Uint8Array }>
  getAppVersion(): Promise<string>
  getBackendStatus(): Promise<{
    state: 'stopped' | 'starting' | 'running' | 'failed'
    port: number | null
    error: string | null
  }>
  restartBackend(): Promise<{ ok: boolean; error: string | null }>
  openExternal(url: string): Promise<{ ok: boolean; error?: string }>
  openOriginalPdf(params: {
    projectId: number
    documentId: number
  }): Promise<{ ok: boolean; path?: string; error?: string }>
  getSetupStatus(): Promise<SetupStatusPayload>
  saveSetupConfig(input: SetupSaveInputPayload): Promise<SetupStatusPayload>
  getDockerStatus(): Promise<{
    installed: boolean
    running: boolean
    version: string | null
    composeVersion: string | null
    composeFile: string | null
    error: string | null
  }>
  startDockerDatabase(input: {
    port?: number
    database?: string
    username?: string
  }): Promise<{
    ok: boolean
    containerStatus: string
    message: string
    passwordGenerated: boolean
  }>
  testDatabase(
    input: DatabaseSetupInputPayload,
  ): Promise<{
    status: number
    ok: boolean
    json: DatabaseSetupResultPayload | null
  }>
  initializeDatabase(
    input: DatabaseSetupInputPayload & {
      create_database?: boolean
      run_migrations?: boolean
    },
  ): Promise<{
    status: number
    ok: boolean
    json: DatabaseSetupResultPayload | null
  }>
  openLogsFolder(): Promise<{ ok: boolean; error: string | null }>
  onBackendStatus(
    cb: (status: {
      state: 'stopped' | 'starting' | 'running' | 'failed'
      port: number | null
      error: string | null
    }) => void,
  ): () => void
  onUploadProgress(
    cb: (progress: {
      requestId: string
      loaded: number
      total: number
    }) => void,
  ): () => void
}

interface Window {
  aiStudyAssistant?: ElectronBridge
}

declare module '*.svg' {
  const content: string
  export default content
}
