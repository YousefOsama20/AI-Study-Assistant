import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from '../lib/i18n'

export type ThemePreference = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'
export type ProjectViewMode = 'grid' | 'list'

export interface RecentProjectEntry {
  project_id: number
  name: string
  accessed_at: string
}

interface SettingsState {
  theme: ThemePreference
  language: Language
  sidebarCollapsed: boolean
  density: Density
  reducedMotion: boolean
  defaultSearchLimit: number
  defaultSearchThreshold: number
  projectViewMode: ProjectViewMode
  recentProjects: RecentProjectEntry[]

  setTheme: (theme: ThemePreference) => void
  setLanguage: (language: Language) => void
  toggleSidebar: () => void
  setDensity: (density: Density) => void
  setReducedMotion: (value: boolean) => void
  setDefaultSearchLimit: (value: number) => void
  setDefaultSearchThreshold: (value: number) => void
  setProjectViewMode: (mode: ProjectViewMode) => void
  touchProject: (project_id: number, name: string) => void
  forgetProject: (project_id: number) => void
}

const RECENT_PROJECTS_MAX = 8

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'en',
      sidebarCollapsed: false,
      density: 'comfortable',
      reducedMotion: false,
      defaultSearchLimit: 5,
      defaultSearchThreshold: 0.2,
      projectViewMode: 'grid',
      recentProjects: [],

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setDensity: (density) => set({ density }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setDefaultSearchLimit: (value) =>
        set({ defaultSearchLimit: Math.min(20, Math.max(1, Math.round(value))) }),
      setDefaultSearchThreshold: (value) =>
        set({
          defaultSearchThreshold: Math.min(1, Math.max(0, value)),
        }),
      setProjectViewMode: (projectViewMode) => set({ projectViewMode }),
      touchProject: (project_id, name) =>
        set((s) => {
          const rest = s.recentProjects.filter(
            (p) => p.project_id !== project_id,
          )
          return {
            recentProjects: [
              { project_id, name, accessed_at: new Date().toISOString() },
              ...rest,
            ].slice(0, RECENT_PROJECTS_MAX),
          }
        }),
      forgetProject: (project_id) =>
        set((s) => ({
          recentProjects: s.recentProjects.filter(
            (p) => p.project_id !== project_id,
          ),
        })),
    }),
    {
      name: 'minirag-settings',
      partialize: (s) => ({
        theme: s.theme,
        language: s.language,
        sidebarCollapsed: s.sidebarCollapsed,
        density: s.density,
        reducedMotion: s.reducedMotion,
        defaultSearchLimit: s.defaultSearchLimit,
        defaultSearchThreshold: s.defaultSearchThreshold,
        projectViewMode: s.projectViewMode,
        recentProjects: s.recentProjects,
      }),
    },
  ),
)
