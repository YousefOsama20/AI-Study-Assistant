import { create } from 'zustand'
import { api } from '../lib/api/client'
import type { DocumentItem, Project } from '../types/api'
import { useSettingsStore } from './settings'

export interface RecentDocumentEntry {
  project: Pick<Project, 'project_id' | 'name'>
  document: DocumentItem
}

interface DashboardState {
  loading: boolean
  error: string | null
  projectCount: number
  documentCount: number
  readyCount: number
  failedCount: number
  recentProjects: Project[]
  recentProjectsLabel: 'accessed' | 'updated'
  recentDocuments: RecentDocumentEntry[]

  load: () => Promise<void>
}

const RECENT_PROJECTS_COUNT = 5
const RECENT_DOCUMENTS_COUNT = 6

export const useDashboardStore = create<DashboardState>()((set) => ({
  loading: false,
  error: null,
  projectCount: 0,
  documentCount: 0,
  readyCount: 0,
  failedCount: 0,
  recentProjects: [],
  recentProjectsLabel: 'updated',
  recentDocuments: [],

  load: async () => {
    set({ loading: true, error: null })
    try {
      // Exact counts derived from the backend: page through every project,
      // then list documents per project.
      const firstPage = await api.listProjects({
        page: 1,
        pageSize: 100,
      })
      const allProjects: Project[] = [...firstPage.projects]
      let page = firstPage.page
      while (page < firstPage.total_pages) {
        page += 1
        const next = await api.listProjects({ page, pageSize: 100 })
        if (next.projects.length === 0) break
        allProjects.push(...next.projects)
      }

      let documentCount = 0
      let readyCount = 0
      let failedCount = 0
      const recentDocuments: RecentDocumentEntry[] = []

      const docResults = await Promise.allSettled(
        allProjects.map((project) => api.listDocuments(project.project_id)),
      )

      docResults.forEach((result, index) => {
        const project = allProjects[index]
        if (!project || result.status !== 'fulfilled') return
        for (const document of result.value.documents) {
          documentCount += 1
          if (document.status === 'ready') readyCount += 1
          if (document.status === 'failed') failedCount += 1
          recentDocuments.push({
            project: { project_id: project.project_id, name: project.name },
            document,
          })
        }
      })

      recentDocuments.sort((a, b) => {
        const aTime = a.document.updated_at ?? a.document.created_at
        const bTime = b.document.updated_at ?? b.document.created_at
        return new Date(bTime).getTime() - new Date(aTime).getTime()
      })

      // Recently accessed via local tracking, fallback to recently updated
      const recentAccess = useSettingsStore.getState().recentProjects
      let recentProjects: Project[]
      let recentProjectsLabel: 'accessed' | 'updated'
      const accessedIds = recentAccess.map((r) => r.project_id)
      const accessedProjects = allProjects
        .filter((p) => accessedIds.includes(p.project_id))
        .sort(
          (a, b) =>
            accessedIds.indexOf(a.project_id) - accessedIds.indexOf(b.project_id),
        )
        .slice(0, RECENT_PROJECTS_COUNT)
      if (accessedProjects.length > 0) {
        recentProjects = accessedProjects
        recentProjectsLabel = 'accessed'
      } else {
        recentProjects = [...allProjects]
          .sort((a, b) => {
            const aTime = a.updated_at ?? a.created_at ?? ''
            const bTime = b.updated_at ?? b.created_at ?? ''
            return new Date(bTime).getTime() - new Date(aTime).getTime()
          })
          .slice(0, RECENT_PROJECTS_COUNT)
        recentProjectsLabel = 'updated'
      }

      set({
        loading: false,
        projectCount: firstPage.total,
        documentCount,
        readyCount,
        failedCount,
        recentProjects,
        recentProjectsLabel,
        recentDocuments: recentDocuments.slice(0, RECENT_DOCUMENTS_COUNT),
      })
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Failed to load dashboard',
      })
    }
  },
}))
