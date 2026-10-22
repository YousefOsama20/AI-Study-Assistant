import { create } from 'zustand'
import { api, ApiError } from '../lib/api/client'
import type { HealthResponse, SystemInfoResponse } from '../types/api'

export type BackendHealth = 'checking' | 'ok' | 'degraded' | 'unreachable'
export type BackendProcessState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'failed'
  | 'unsupported'

interface BackendState {
  health: BackendHealth
  data: HealthResponse | null
  systemInfo: SystemInfoResponse | null
  systemInfoError: string | null
  processState: BackendProcessState
  processError: string | null
  restarting: boolean
  lastCheckedAt: number | null

  check: () => Promise<void>
  loadSystemInfo: () => Promise<void>
  refreshProcessState: () => Promise<void>
  restart: () => Promise<boolean>
  setProcessState: (state: BackendProcessState, error?: string | null) => void
}

export const useBackendStore = create<BackendState>()((set, get) => ({
  health: 'checking',
  data: null,
  systemInfo: null,
  systemInfoError: null,
  processState: typeof window !== 'undefined' && window.minirag ? 'starting' : 'unsupported',
  processError: null,
  restarting: false,
  lastCheckedAt: null,

  check: async () => {
    try {
      const data = await api.getHealth()
      set({
        health: data.status === 'ok' ? 'ok' : 'degraded',
        data,
        lastCheckedAt: Date.now(),
      })
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0
      set({
        health: status === 503 ? 'degraded' : 'unreachable',
        data: null,
        lastCheckedAt: Date.now(),
      })
    }
    void get().refreshProcessState()
  },

  loadSystemInfo: async () => {
    try {
      const systemInfo = await api.getSystemInfo()
      set({ systemInfo, systemInfoError: null })
    } catch (error) {
      set({
        systemInfoError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  refreshProcessState: async () => {
    if (!window.minirag) {
      set({ processState: 'unsupported', processError: null })
      return
    }
    try {
      const status = await window.minirag.getBackendStatus()
      set({ processState: status.state, processError: status.error })
    } catch {
      set({ processState: 'failed', processError: 'Status query failed' })
    }
  },

  restart: async () => {
    if (!window.minirag) return false
    set({ restarting: true })
    try {
      const result = await window.minirag.restartBackend()
      set({ restarting: false })
      if (result.ok) {
        await get().check()
        return true
      }
      set({ processError: result.error })
      return false
    } catch {
      set({ restarting: false, processError: 'Restart failed' })
      return false
    }
  },

  setProcessState: (processState, processError = null) =>
    set({ processState, processError }),
}))
