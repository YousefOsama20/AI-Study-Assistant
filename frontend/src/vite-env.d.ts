/// <reference types="vite/client" />

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
