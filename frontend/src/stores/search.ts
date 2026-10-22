import { create } from 'zustand'
import { api, ApiError } from '../lib/api/client'
import type { SearchResultItem } from '../types/api'
import { useSettingsStore } from './settings'

export interface SearchBucket {
  query: string
  limit: number
  threshold: number
  results: SearchResultItem[]
  searched: boolean
  loading: boolean
  error: string | null
  noIndex: boolean
}

function emptyBucket(): SearchBucket {
  const settings = useSettingsStore.getState()
  return {
    query: '',
    limit: settings.defaultSearchLimit,
    threshold: settings.defaultSearchThreshold,
    results: [],
    searched: false,
    loading: false,
    error: null,
    noIndex: false,
  }
}

interface SearchState {
  buckets: Record<number, SearchBucket>
  bucket: (projectId: number) => SearchBucket
  setQuery: (projectId: number, query: string) => void
  setLimit: (projectId: number, limit: number) => void
  setThreshold: (projectId: number, threshold: number) => void
  run: (projectId: number, queryOverride?: string) => Promise<void>
  reset: (projectId: number) => void
}

export const useSearchStore = create<SearchState>()((set, get) => {
  function update(
    projectId: number,
    patch: Partial<SearchBucket>,
  ): void {
    set((s) => ({
      buckets: {
        ...s.buckets,
        [projectId]: { ...(s.buckets[projectId] ?? emptyBucket()), ...patch },
      },
    }))
  }

  return {
    buckets: {},

    bucket: (projectId) => get().buckets[projectId] ?? emptyBucket(),

    setQuery: (projectId, query) => update(projectId, { query }),
    setLimit: (projectId, limit) =>
      update(projectId, { limit: Math.min(20, Math.max(1, limit)) }),
    setThreshold: (projectId, threshold) =>
      update(projectId, { threshold: Math.min(1, Math.max(0, threshold)) }),

    run: async (projectId, queryOverride) => {
      const bucket = get().bucket(projectId)
      const text = (queryOverride ?? bucket.query).trim()
      if (!text) return
      update(projectId, {
        loading: true,
        error: null,
        noIndex: false,
        searched: true,
        query: text,
      })
      try {
        const response = await api.search(projectId, {
          text,
          limit: bucket.limit,
          similarityThreshold: bucket.threshold,
        })
        update(projectId, { results: response.results, loading: false })
      } catch (error) {
        if (error instanceof ApiError && error.isNoIndex()) {
          update(projectId, {
            loading: false,
            results: [],
            noIndex: true,
            error: null,
          })
          return
        }
        update(projectId, {
          loading: false,
          results: [],
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Search failed',
        })
      }
    },

    reset: (projectId) =>
      set((s) => ({
        buckets: { ...s.buckets, [projectId]: emptyBucket() },
      })),
  }
})
