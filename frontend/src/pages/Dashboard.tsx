import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FolderKanban,
  FileText,
  CircleCheck,
  CircleX,
  Plus,
  Upload,
  ArrowRight,
  Inbox,
} from 'lucide-react'
import { useDashboardStore } from '../stores/dashboard'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../lib/i18n'
import { formatDate, formatDateTime } from '../lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { DocumentStatusBadge } from '../components/documents/DocumentStatusBadge'

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  tone,
}: {
  icon: typeof FileText
  label: string
  value: number
  loading: boolean
  tone?: 'success' | 'danger'
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span
          className={
            tone === 'success'
              ? 'rounded-lg bg-success-soft p-3 text-success'
              : tone === 'danger'
                ? 'rounded-lg bg-danger-soft p-3 text-danger'
                : 'rounded-lg bg-primary-soft p-3 text-primary'
          }
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-12" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums text-fg">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const {
    loading,
    error,
    projectCount,
    documentCount,
    readyCount,
    failedCount,
    recentProjects,
    recentProjectsLabel,
    recentDocuments,
    load,
  } = useDashboardStore()
  const touchProject = useSettingsStore((s) => s.touchProject)
  const { t, locale } = useI18n()
  const navigate = useNavigate()

  useEffect(() => {
    void load()
  }, [load])

  const isEmpty = !loading && !error && projectCount === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/projects')}
            icon={<Upload className="size-4" />}
          >
            {t('dashboard.uploadDocuments')}
          </Button>
          <Button
            onClick={() => navigate('/projects')}
            icon={<Plus className="size-4" />}
          >
            {t('dashboard.createProject')}
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-danger/30">
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isEmpty ? (
        <EmptyState
          icon={Inbox}
          title={t('dashboard.noRecentProjects')}
          body={t('projects.emptyBody')}
          action={
            <Button onClick={() => navigate('/projects')}>
              {t('dashboard.createProject')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={FolderKanban}
              label={t('dashboard.statProjects')}
              value={projectCount}
              loading={loading}
            />
            <StatCard
              icon={FileText}
              label={t('dashboard.statDocuments')}
              value={documentCount}
              loading={loading}
            />
            <StatCard
              icon={CircleCheck}
              label={t('dashboard.statReady')}
              value={readyCount}
              loading={loading}
              tone="success"
            />
            <StatCard
              icon={CircleX}
              label={t('dashboard.statFailed')}
              value={failedCount}
              loading={loading}
              tone="danger"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>
                    {recentProjectsLabel === 'accessed'
                      ? t('dashboard.recentProjects')
                      : t('dashboard.recentProjectsFallback')}
                  </CardTitle>
                  <CardDescription>
                    <Link
                      to="/projects"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {t('dashboard.viewAllProjects')}
                      <ArrowRight className="size-3 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {loading ? (
                  <>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </>
                ) : recentProjects.length === 0 ? (
                  <p className="text-sm text-muted">{t('dashboard.noRecentProjects')}</p>
                ) : (
                  recentProjects.map((project) => (
                    <Link
                      key={project.project_id}
                      to={`/projects/${project.project_id}/documents`}
                      onClick={() =>
                        touchProject(project.project_id, project.name)
                      }
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2/50 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg">
                          {project.name}
                        </p>
                        <p className="text-xs text-muted">
                          {t('projects.documentCount', {
                            count: project.document_count,
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDate(project.updated_at ?? project.created_at, locale)}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.recentDocuments')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {loading ? (
                  <>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </>
                ) : recentDocuments.length === 0 ? (
                  <p className="text-sm text-muted">
                    {t('dashboard.noRecentDocuments')}
                  </p>
                ) : (
                  recentDocuments.map(({ project, document }) => (
                    <Link
                      key={document.document_id}
                      to={`/projects/${project.project_id}/documents`}
                      onClick={() => touchProject(project.project_id, project.name)}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2/50 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg">
                          {document.original_filename}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {project.name} · {formatDateTime(document.updated_at ?? document.created_at, locale)}
                        </p>
                      </div>
                      <DocumentStatusBadge status={document.status} />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
