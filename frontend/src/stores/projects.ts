import { create } from 'zustand'
import { api, ApiError } from '../lib/api/client'
import type { Project } from '../types/api'

interface ProjectsState {
  projects: Project[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  search: string
  loading: boolean
  error: string | null

  setSearch: (search: string) => void
  fetch: (overrides?: {
    page?: number
    pageSize?: number
    search?: string
  }) => Promise<void>
  create: (body: { name: string; description?: string }) => Promise<Project>
  update: (
    projectId: number,
    body: { name?: string; description?: string },
  ) => Promise<Project>
  remove: (projectId: number) => Promise<void>
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.details) {
    const details = error.details as { detail?: unknown }
    if (typeof details.detail === 'string') return details.detail
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  search: '',
  loading: false,
  error: null,

  setSearch: (search) => {
    set({ search, page: 1 })
    void get().fetch({ search, page: 1 })
  },

  fetch: async (overrides = {}) => {
    const state = get()
    const page = overrides.page ?? state.page
    const pageSize = overrides.pageSize ?? state.pageSize
    const search = overrides.search ?? state.search
    set({ loading: true, error: null })
    try {
      const response = await api.listProjects({ page, pageSize, search })
      set({
        projects: response.projects,
        total: response.total,
        page: response.page,
        pageSize: response.page_size,
        totalPages: response.total_pages,
        loading: false,
      })
    } catch (error) {
      set({ loading: false, error: errorMessage(error, 'Failed to load projects') })
    }
  },

  create: async (body) => {
    const response = await api.createProject(body, {})
    await get().fetch()
    return response.project
  },

  update: async (projectId, body) => {
    const response = await api.updateProject(projectId, body, {})
    await get().fetch()
    return response.project
  },

  remove: async (projectId) => {
    await api.deleteProject(projectId, {})
    await get().fetch()
  },
}))
