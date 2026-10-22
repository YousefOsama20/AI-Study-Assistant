import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectsPage } from '@/pages/Projects'
import { useProjectsStore } from '@/stores/projects'
import { I18nProvider } from '@/lib/i18n'
import type { Project } from '@/types/api'
import { renderWithProviders } from './helpers'

const apiMock = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return { ...actual, ...apiMock, api: { ...actual.api, ...apiMock } }
})

function makeProject(id: number, name: string): Project {
  return {
    project_id: id,
    project_uuid: `uuid-${id}`,
    name,
    description: null,
    document_count: 0,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  }
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    useProjectsStore.setState({
      projects: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      search: '',
      loading: false,
      error: null,
    })
    apiMock.listProjects.mockReset()
    apiMock.createProject.mockReset()
    apiMock.updateProject.mockReset()
    apiMock.deleteProject.mockReset()
  })

  it('lists projects returned by the API', async () => {
    apiMock.listProjects.mockResolvedValue({
      projects: [makeProject(1, 'Thesis Notes'), makeProject(2, 'Course Slides')],
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    })

    renderWithProviders(<ProjectsPage />)

    expect(await screen.findByText('Thesis Notes')).toBeInTheDocument()
    expect(screen.getByText('Course Slides')).toBeInTheDocument()
    expect(apiMock.listProjects).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      search: '',
    })
  })

  it('creates a project through the modal', async () => {
    apiMock.listProjects.mockResolvedValue({
      projects: [],
      total: 0,
      page: 1,
      page_size: 10,
      total_pages: 1,
    })
    apiMock.createProject.mockResolvedValue({
      signal: 'success',
      project: makeProject(3, 'Lab Reports'),
    })
    apiMock.listProjects.mockResolvedValue({
      projects: [makeProject(3, 'Lab Reports')],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    })

    const user = userEvent.setup()
    renderWithProviders(<ProjectsPage />)

    await user.click(await screen.findByRole('button', { name: /new project/i }))
    await user.type(screen.getByLabelText(/name/i), 'Lab Reports')
    await user.click(screen.getByRole('button', { name: /^(create|save)/i }))

    await waitFor(() => {
      expect(apiMock.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Lab Reports' }),
        expect.anything(),
      )
    })
    expect(await screen.findByText('Lab Reports')).toBeInTheDocument()
  })

  it('shows a required error when the name is blank', async () => {
    apiMock.listProjects.mockResolvedValue({
      projects: [],
      total: 0,
      page: 1,
      page_size: 10,
      total_pages: 1,
    })

    const user = userEvent.setup()
    renderWithProviders(<ProjectsPage />)

    await user.click(await screen.findByRole('button', { name: /new project/i }))
    await user.click(screen.getByRole('button', { name: /^(create|save)/i }))

    expect(await screen.findByText(/required/i)).toBeInTheDocument()
    expect(apiMock.createProject).not.toHaveBeenCalled()
  })

  it('renders an API error state', async () => {
    apiMock.listProjects.mockRejectedValue(new Error('boom'))

    renderWithProviders(<ProjectsPage />)

    expect(await screen.findByText(/boom/)).toBeInTheDocument()
  })

  it('edits a project through the actions menu', async () => {
    apiMock.listProjects
      .mockResolvedValueOnce({
        projects: [makeProject(5, 'Old Name')],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      })
      .mockResolvedValueOnce({
        projects: [makeProject(5, 'New Name')],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      })
    apiMock.updateProject.mockResolvedValue({
      signal: 'success',
      project: makeProject(5, 'New Name'),
    })

    const user = userEvent.setup()
    renderWithProviders(<ProjectsPage />)

    expect(await screen.findByText('Old Name')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByText('Edit'))

    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'New Name')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(apiMock.updateProject).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ name: 'New Name' }),
        expect.anything(),
      )
    })
    expect(await screen.findByText('New Name')).toBeInTheDocument()
  })

  it('deletes a project after confirmation', async () => {
    apiMock.listProjects
      .mockResolvedValueOnce({
        projects: [makeProject(6, 'Disposable')],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      })
      .mockResolvedValueOnce({
        projects: [],
        total: 0,
        page: 1,
        page_size: 10,
        total_pages: 1,
      })
    apiMock.deleteProject.mockResolvedValue({ signal: 'success' })

    const user = userEvent.setup()
    renderWithProviders(<ProjectsPage />)

    expect(await screen.findByText('Disposable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByText('Delete'))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(apiMock.deleteProject).toHaveBeenCalledWith(6, expect.anything())
    })
    await waitFor(() => {
      expect(screen.queryByText('Disposable')).not.toBeInTheDocument()
    })
  })

  function renderWithWorkspaceRoutes() {
    return render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/projects']}>
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route
              path="/projects/:projectId/search"
              element={<div>workspace-search</div>}
            />
            <Route
              path="/projects/:projectId/chat"
              element={<div>workspace-chat</div>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
  }

  it('links to the project-scoped search workspace', async () => {
    apiMock.listProjects.mockResolvedValue({
      projects: [makeProject(3, 'Lab Reports')],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    })
    const user = userEvent.setup()
    const view = renderWithWorkspaceRoutes()

    expect(await screen.findByText('Lab Reports')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('workspace-search')).toBeInTheDocument()

    view.unmount()
  })

  it('links to the project-scoped chat workspace', async () => {
    apiMock.listProjects.mockResolvedValue({
      projects: [makeProject(3, 'Lab Reports')],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    })
    const user = userEvent.setup()
    const view = renderWithWorkspaceRoutes()

    expect(await screen.findByText('Lab Reports')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Chat' }))
    expect(await screen.findByText('workspace-chat')).toBeInTheDocument()

    view.unmount()
  })
})
