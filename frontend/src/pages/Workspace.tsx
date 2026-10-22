import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  MessageSquareText,
  Pencil,
  Search as SearchIcon,
  Files,
  AlertTriangle,
} from 'lucide-react'
import { api } from '../lib/api/client'
import { isActiveProcessingStatus, type Project } from '../types/api'
import { useDocumentsStore } from '../stores/documents'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../lib/i18n'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input, Textarea } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { pushToast } from '../stores/toasts'

function WorkspaceStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'success' | 'danger' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          tone === 'success'
            ? 'text-success'
            : tone === 'danger'
              ? 'text-danger'
              : tone === 'warning'
                ? 'text-warning'
                : 'text-fg',
        )}
      >
        {value}
      </p>
    </div>
  )
}

const tabLinks = [
  {
    to: 'documents',
    labelKey: 'workspace.documents',
    icon: Files,
  },
  {
    to: 'search',
    labelKey: 'workspace.search',
    icon: SearchIcon,
  },
  {
    to: 'chat',
    labelKey: 'workspace.chat',
    icon: MessageSquareText,
  },
] as const

export function WorkspacePage() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const projectId = Number(projectIdParam)
  const { t } = useI18n()
  const touchProject = useSettingsStore((s) => s.touchProject)
  const documentsBucket = useDocumentsStore((s) => s.buckets[projectId])
  const loadDocuments = useDocumentsStore((s) => s.load)

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const loadProject = useCallback(async () => {
    if (!Number.isInteger(projectId) || projectId <= 0) {
      setError('Invalid project')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const response = await api.getProject(projectId)
      const loaded = response.project as Project | undefined
      if (!loaded) {
        setError(t('errors.notFound'))
        return
      }
      setProject(loaded)
      setError(null)
      touchProject(loaded.project_id, loaded.name)
    } catch {
      setError(t('errors.notFound'))
    } finally {
      setLoading(false)
    }
  }, [projectId, t, touchProject])

  useEffect(() => {
    void loadProject()
  }, [loadProject])

  useEffect(() => {
    if (!project || documentsBucket) return
    void loadDocuments(projectId)
  }, [project, projectId, documentsBucket, loadDocuments])

  const documents = documentsBucket?.documents ?? []
  const readyCount = documents.filter((doc) => doc.status === 'ready').length
  const failedCount = documents.filter((doc) => doc.status === 'failed').length
  const processingCount = documents.filter((doc) =>
    isActiveProcessingStatus(doc.status),
  ).length

  const openEdit = () => {
    if (!project) return
    setEditName(project.name)
    setEditDescription(project.description ?? '')
    setNameError(null)
    setEditOpen(true)
  }

  const saveEdit = async () => {
    const trimmed = editName.trim()
    if (!trimmed) {
      setNameError(t('common.required'))
      return
    }
    setSaving(true)
    try {
      const response = await api.updateProject(projectId, {
        name: trimmed,
        description: editDescription.trim(),
      })
      setProject(response.project)
      touchProject(response.project.project_id, response.project.name)
      pushToast({ kind: 'success', title: t('projects.updated') })
      setEditOpen(false)
    } catch {
      pushToast({ kind: 'error', title: t('projects.updateFailed') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t('workspace.backToProjects')}
        </Link>
        {project ? (
          <Button
            variant="outline"
            size="sm"
            onClick={openEdit}
            icon={<Pencil className="size-3.5" />}
          >
            {t('workspace.editProject')}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      ) : error || !project ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <p className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {error ?? t('errors.notFound')}
          </p>
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => void loadProject()}>
              {t('common.retry')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold text-fg">{project.name}</h1>
            {project.description ? (
              <p className="mt-1 text-sm text-muted">{project.description}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <WorkspaceStat
              label={t('workspace.statDocuments')}
              value={documents.length}
            />
            <WorkspaceStat
              label={t('workspace.statReady')}
              value={readyCount}
              tone="success"
            />
            <WorkspaceStat
              label={t('workspace.statProcessing')}
              value={processingCount}
              tone="warning"
            />
            <WorkspaceStat
              label={t('workspace.statFailed')}
              value={failedCount}
              tone="danger"
            />
          </div>
          <nav aria-label={t('nav.workspace')}>
            <div className="flex gap-1 border-b border-border">
              {tabLinks.map((link) => {
                const Icon = link.icon
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'border-primary text-primary-text'
                          : 'border-transparent text-muted hover:text-fg',
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t(link.labelKey)}
                  </NavLink>
                )
              })}
            </div>
          </nav>
        </>
      )}

      <Outlet />

      <Modal
        open={editOpen}
        onOpenChange={setEditOpen}
        title={t('projects.editTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void saveEdit()} loading={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label={t('projects.nameLabel')}
            placeholder={t('projects.namePlaceholder')}
            value={editName}
            maxLength={255}
            error={nameError}
            onChange={(event) => {
              setEditName(event.target.value)
              if (nameError) setNameError(null)
            }}
          />
          <Textarea
            label={t('projects.descriptionLabel')}
            placeholder={t('projects.descriptionPlaceholder')}
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
