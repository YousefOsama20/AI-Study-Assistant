import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderKanban,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react'
import { useProjectsStore } from '../stores/projects'
import { useSettingsStore } from '../stores/settings'
import { pushToast } from '../stores/toasts'
import { useI18n } from '../lib/i18n'
import { formatDate } from '../lib/utils'
import { ApiError } from '../lib/api/client'
import type { Project } from '../types/api'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardFooter } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/ui/DropdownMenu'
import { EmptyState } from '../components/ui/EmptyState'
import { Input, Textarea } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'
import { Skeleton } from '../components/ui/Skeleton'

export function ProjectsPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()

  const projects = useProjectsStore((s) => s.projects)
  const total = useProjectsStore((s) => s.total)
  const page = useProjectsStore((s) => s.page)
  const pageSize = useProjectsStore((s) => s.pageSize)
  const totalPages = useProjectsStore((s) => s.totalPages)
  const search = useProjectsStore((s) => s.search)
  const loading = useProjectsStore((s) => s.loading)
  const error = useProjectsStore((s) => s.error)
  const setSearch = useProjectsStore((s) => s.setSearch)

  const projectViewMode = useSettingsStore((s) => s.projectViewMode)
  const setProjectViewMode = useSettingsStore((s) => s.setProjectViewMode)
  const [view, setView] = useState<'grid' | 'list'>(() => projectViewMode)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [deleting, setDeleting] = useState<Project | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  useEffect(() => {
    void useProjectsStore.getState().fetch()
  }, [])

  function changeView(mode: 'grid' | 'list') {
    setView(mode)
    setProjectViewMode(mode)
  }

  function openCreate() {
    setEditing(null)
    setName('')
    setDescription('')
    setNameError(null)
    setModalOpen(true)
  }

  function openEdit(project: Project) {
    setEditing(project)
    setName(project.name)
    setDescription(project.description ?? '')
    setNameError(null)
    setModalOpen(true)
  }

  function openDocuments(project: Project) {
    useSettingsStore.getState().touchProject(project.project_id, project.name)
    navigate(`/projects/${project.project_id}/documents`)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError(t('common.required'))
      return
    }
    setNameError(null)
    setSubmitting(true)
    try {
      if (editing) {
        await useProjectsStore.getState().update(editing.project_id, {
          name: trimmed,
          description: description.trim() || undefined,
        })
        pushToast({ kind: 'success', title: t('projects.updated') })
      } else {
        await useProjectsStore.getState().create({
          name: trimmed,
          description: description.trim() || undefined,
        })
        pushToast({ kind: 'success', title: t('projects.created') })
      }
      setModalOpen(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setNameError(t('projects.duplicateName'))
      } else {
        pushToast({
          kind: 'error',
          title: editing ? t('projects.updateFailed') : t('projects.createFailed'),
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await useProjectsStore.getState().remove(deleting.project_id)
      pushToast({ kind: 'success', title: t('projects.deleted') })
      setDeleting(null)
    } catch {
      pushToast({ kind: 'error', title: t('projects.deleteFailed') })
    } finally {
      setDeletingBusy(false)
    }
  }

  function renderMenu(project: Project) {
    return (
      <DropdownMenu
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            aria-label={t('common.actions')}
            icon={<MoreHorizontal className="size-4" />}
          />
        }
      >
        <DropdownMenuItem onSelect={() => openEdit(project)}>
          {t('common.edit')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={() => setDeleting(project)}>
          {t('common.delete')}
        </DropdownMenuItem>
      </DropdownMenu>
    )
  }

  function renderLinks(project: Project) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => openDocuments(project)}>
          {t('projects.openDocuments')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/projects/${project.project_id}/search`)}
        >
          {t('projects.openSearch')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/projects/${project.project_id}/chat`)}
        >
          {t('projects.openChat')}
        </Button>
      </>
    )
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const isSearchEmpty = search.trim().length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{t('projects.title')}</h1>
          <p className="text-sm text-muted">{t('projects.subtitle')}</p>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={openCreate}>
          {t('projects.create')}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('projects.searchPlaceholder')}
            aria-label={t('common.search')}
            className="ps-9"
          />
        </div>
        <div className="flex items-center gap-1" role="group">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('projects.viewGrid')}
            aria-pressed={view === 'grid'}
            className={
              view === 'grid' ? 'bg-primary-soft text-primary-text' : undefined
            }
            icon={<LayoutGrid className="size-4" />}
            onClick={() => changeView('grid')}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('projects.viewList')}
            aria-pressed={view === 'list'}
            className={
              view === 'list' ? 'bg-primary-soft text-primary-text' : undefined
            }
            icon={<List className="size-4" />}
            onClick={() => changeView('list')}
          />
        </div>
      </div>

      {loading && projects.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="flex flex-col gap-3 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-3 h-8 w-full" />
            </Card>
          ))}
        </div>
      ) : error && projects.length === 0 ? (
        <EmptyState
          title={t('common.error')}
          body={error}
          action={
            <Button
              variant="outline"
              onClick={() => void useProjectsStore.getState().fetch()}
            >
              {t('common.retry')}
            </Button>
          }
        />
      ) : total === 0 ? (
        isSearchEmpty ? (
          <EmptyState
            icon={Search}
            title={t('projects.emptySearchTitle')}
            body={t('projects.emptySearchBody')}
          />
        ) : (
          <EmptyState
            icon={FolderKanban}
            title={t('projects.emptyTitle')}
            body={t('projects.emptyBody')}
            action={
              <Button icon={<Plus className="size-4" />} onClick={openCreate}>
                {t('projects.create')}
              </Button>
            }
          />
        )
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.project_id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openDocuments(project)}
                    className="min-w-0 text-start text-base font-semibold text-fg hover:text-primary-text"
                  >
                    <span className="block truncate">{project.name}</span>
                  </button>
                  {renderMenu(project)}
                </div>
                {project.description ? (
                  <p className="line-clamp-2 text-sm text-muted">
                    {project.description}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  <Badge variant="primary">
                    {t('projects.documentCount', {
                      count: project.document_count,
                    })}
                  </Badge>
                  <span className="text-xs text-muted">
                    {formatDate(project.updated_at, locale)}
                  </span>
                </div>
              </CardContent>
              <CardFooter className="flex-wrap gap-1.5">
                {renderLinks(project)}
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {projects.map((project) => (
            <div
              key={project.project_id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => openDocuments(project)}
                  className="block max-w-full truncate text-start text-sm font-semibold text-fg hover:text-primary-text"
                >
                  {project.name}
                </button>
                {project.description ? (
                  <p className="truncate text-xs text-muted">
                    {project.description}
                  </p>
                ) : null}
              </div>
              <Badge variant="primary">
                {t('projects.documentCount', { count: project.document_count })}
              </Badge>
              <span className="hidden text-xs text-muted sm:block">
                {formatDate(project.updated_at, locale)}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {renderLinks(project)}
                {renderMenu(project)}
              </div>
            </div>
          ))}
        </div>
      )}

      {projects.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {t('projects.showing', { from, to, total })}
          </p>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={(nextPage) =>
              void useProjectsStore.getState().fetch({ page: nextPage })
            }
          />
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? t('projects.editTitle') : t('projects.createTitle')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="project-form"
              loading={submitting}
            >
              {submitting
                ? t('common.saving')
                : editing
                  ? t('common.save')
                  : t('common.create')}
            </Button>
          </>
        }
      >
        <form
          id="project-form"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('projects.nameLabel')}
            placeholder={t('projects.namePlaceholder')}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (nameError) setNameError(null)
            }}
            error={nameError}
            maxLength={255}
            required
            autoFocus
          />
          <Textarea
            label={t('projects.descriptionLabel')}
            placeholder={t('projects.descriptionPlaceholder')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('projects.deleteConfirmTitle')}
        body={t('projects.deleteConfirmBody')}
        confirmLabel={t('common.delete')}
        danger
        loading={deletingBusy}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
