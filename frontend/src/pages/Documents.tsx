import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  UploadCloud,
  FileText,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  Eye,
  ExternalLink,
  Play,
  Layers,
  AlertTriangle,
  Files,
} from 'lucide-react'
import { api } from '../lib/api/client'
import {
  isActiveProcessingStatus,
  type DocumentItem,
} from '../types/api'
import { useDocumentsStore } from '../stores/documents'
import { useBackendStore } from '../stores/backend'
import { useI18n } from '../lib/i18n'
import { cn, formatBytes, formatDateTime } from '../lib/utils'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/DropdownMenu'
import { DocumentStatusBadge } from '../components/documents/DocumentStatusBadge'
import { PreviewModal } from '../components/documents/PreviewModal'
import { pushToast } from '../stores/toasts'

const POLL_MS = 4_000
const MAX_UPLOAD_MB_FALLBACK = 10

function documentSignature(documents: DocumentItem[]): string {
  return documents
    .map((d) => `${d.document_id}:${d.status}:${d.updated_at ?? ''}`)
    .join('|')
}

export function DocumentsPage() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const projectId = Number(projectIdParam)
  const { t, locale } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()

  const bucket = useDocumentsStore((s) => s.buckets[projectId])
  const load = useDocumentsStore((s) => s.load)
  const upload = useDocumentsStore((s) => s.upload)
  const remove = useDocumentsStore((s) => s.remove)
  const reprocess = useDocumentsStore((s) => s.reprocess)
  const processAll = useDocumentsStore((s) => s.processAll)
  const buildIndex = useDocumentsStore((s) => s.buildIndex)
  const loadIndexInfo = useDocumentsStore((s) => s.loadIndexInfo)

  const systemInfo = useBackendStore((s) => s.systemInfo)
  const loadSystemInfo = useBackendStore((s) => s.loadSystemInfo)

  const [dragActive, setDragActive] = useState(false)
  const [preview, setPreview] = useState<{
    document: DocumentItem
    page: number
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null)
  const [indexDialog, setIndexDialog] = useState<'build' | 'rebuild' | null>(null)
  const [busyDocId, setBusyDocId] = useState<number | null>(null)
  const [processingAll, setProcessingAll] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const documents = bucket?.documents ?? []
  const loading = bucket?.loading ?? false
  const error = bucket?.error ?? null
  const uploading = bucket?.uploading ?? false
  const uploadProgress = bucket?.uploadProgress ?? null
  const indexing = bucket?.indexing ?? false
  const indexLoading = bucket?.indexLoading ?? false
  const indexRecordCount = bucket?.indexRecordCount ?? null
  const indexSignature = bucket?.indexSignature ?? null

  useEffect(() => {
    if (!Number.isInteger(projectId) || projectId <= 0) return
    void load(projectId)
  }, [projectId, load])

  useEffect(() => {
    if (!systemInfo) void loadSystemInfo()
  }, [systemInfo, loadSystemInfo])

  const hasActive = useMemo(
    () => documents.some((d) => isActiveProcessingStatus(d.status)),
    [documents],
  )

  useEffect(() => {
    if (!hasActive) return
    const timer = window.setInterval(() => {
      void load(projectId)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [hasActive, projectId, load])

  useEffect(() => {
    if (!hasActive && documents.some((d) => d.status === 'ready')) {
      void loadIndexInfo(projectId)
    }
  }, [hasActive, documents, projectId, loadIndexInfo])

  // Click-through from semantic search: ?preview=<documentId>&page=<n>
  useEffect(() => {
    const previewParam = searchParams.get('preview')
    if (!previewParam || documents.length === 0) return
    const documentId = Number(previewParam)
    const pageParam = Number(searchParams.get('page') ?? '1')
    const found = documents.find((d) => d.document_id === documentId)
    if (found) {
      setPreview({ document: found, page: Number.isFinite(pageParam) ? pageParam : 1 })
      const next = new URLSearchParams(searchParams)
      next.delete('preview')
      next.delete('page')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, documents, setSearchParams])

  const isStale =
    indexSignature !== null &&
    indexRecordCount !== null &&
    indexSignature !== documentSignature(documents)

  const maxSizeMb = systemInfo?.upload.max_size_mb ?? MAX_UPLOAD_MB_FALLBACK
  const allowedTypes = systemInfo?.upload.allowed_types ?? ['application/pdf']

  const validateFiles = useCallback(
    (files: File[]): File[] => {
      const valid: File[] = []
      for (const file of files) {
        const isPdf =
          file.type === 'application/pdf' ||
          file.name.toLowerCase().endsWith('.pdf')
        if (!isPdf || !allowedTypes.includes('application/pdf')) {
          pushToast({
            kind: 'error',
            title: t('documents.invalidType'),
            description: file.name,
          })
          continue
        }
        if (file.size > maxSizeMb * 1024 * 1024) {
          pushToast({
            kind: 'error',
            title: t('documents.uploadFailed'),
            description: `${file.name} — ${t('documents.maxUploadHint', { size: maxSizeMb })}`,
          })
          continue
        }
        valid.push(file)
      }
      return valid
    },
    [allowedTypes, maxSizeMb, t],
  )

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const files = validateFiles(Array.from(fileList))
      if (files.length > 0) void upload(projectId, files)
    },
    [validateFiles, upload, projectId],
  )

  const processDocument = useCallback(
    async (document: DocumentItem) => {
      setBusyDocId(document.document_id)
      try {
        await api.processProject(projectId, { fileId: document.stored_filename })
        await load(projectId)
      } catch (err) {
        pushToast({
          kind: 'error',
          title:
            err instanceof Error && err.message
              ? err.message
              : t('common.error'),
        })
      } finally {
        setBusyDocId(null)
      }
    },
    [projectId, load, t],
  )

  const handleProcessAll = useCallback(async () => {
    setProcessingAll(true)
    try {
      await processAll(projectId)
    } finally {
      setProcessingAll(false)
    }
  }, [processAll, projectId])

  const confirmIndex = useCallback(async () => {
    if (!indexDialog) return
    await buildIndex(projectId, indexDialog === 'rebuild')
    setIndexDialog(null)
  }, [indexDialog, buildIndex, projectId])

  const openOriginal = useCallback(
    (document: DocumentItem) => {
      if (window.minirag) {
        void window.minirag.openOriginalPdf({
          projectId,
          documentId: document.document_id,
        })
      } else {
        window.open(api.filePath(projectId, document.document_id), '_blank')
      }
    },
    [projectId],
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fg">{t('documents.title')}</h2>
          <p className="text-sm text-muted">{t('documents.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void handleProcessAll()}
            loading={processingAll}
            icon={<Play className="size-4" />}
            disabled={documents.length === 0}
          >
            {t('documents.processAll')}
          </Button>
          <Button
            variant={indexRecordCount === null ? 'primary' : 'secondary'}
            onClick={() =>
              setIndexDialog(indexRecordCount === null ? 'build' : 'rebuild')
            }
            loading={indexing}
            disabled={documents.length === 0 || indexLoading}
            icon={<Layers className="size-4" />}
          >
            {indexRecordCount === null
              ? t('documents.buildIndex')
              : t('documents.rebuildIndex')}
          </Button>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={t('documents.upload')}
        onClick={() => {
          fileInputRef.current?.click()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          handleFiles(event.dataTransfer.files)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
          dragActive
            ? 'border-primary bg-primary-soft'
            : 'border-border bg-surface hover:border-primary/50 hover:bg-primary-soft/30',
        )}
      >
        <UploadCloud
          className={cn('size-8', dragActive ? 'text-primary' : 'text-muted')}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-fg">
          {dragActive ? t('documents.dropActive') : t('documents.dropHint')}
        </p>
        <p className="text-xs text-muted">
          {t('documents.maxUploadHint', { size: maxSizeMb })}
        </p>
        <input
          id="pdf-upload-input"
          data-testid="pdf-upload-input"
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ''
          }}
        />
        {uploading ? (
          <div className="w-full max-w-xs" data-testid="upload-progress">
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round(uploadProgress ?? 0)}%` }}
              />
            </div>
            <span className="mt-1 block text-xs text-primary">
              {uploadProgress === null
                ? t('common.loading')
                : `${Math.round(uploadProgress)}%`}
            </span>
          </div>
        ) : null}
      </div>

      {isStale ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-soft px-4 py-3"
        >
          <div className="flex items-start gap-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">{t('documents.indexStaleTitle')}</p>
              <p className="text-xs opacity-90">{t('documents.indexStaleBody')}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIndexDialog('rebuild')}
            loading={indexing}
          >
            {t('documents.rebuildIndex')}
          </Button>
        </div>
      ) : null}

      {indexRecordCount !== null || indexLoading ? (
        <p className="text-xs text-muted">
          {indexLoading
            ? t('common.loading')
            : t('search.resultCount', { count: indexRecordCount ?? 0 })}
        </p>
      ) : null}

      {error ? (
        <Card className="border-danger/30">
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load(projectId)}>
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loading && documents.length === 0 ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={Files}
          title={t('documents.emptyTitle')}
          body={t('documents.emptyBody')}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {documents.map((doc) => {
              const busy = bucket?.busy?.[doc.document_id] ?? null
              const docBusy = busyDocId === doc.document_id || busy !== null
              return (
                <li
                  key={doc.document_id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <span className="rounded-md bg-surface-2 p-2 text-muted">
                    <FileText className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {doc.original_filename}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                      <span>{formatBytes(doc.file_size, locale)}</span>
                      {doc.page_count !== null ? (
                        <span>
                          {t('documents.pagesShort', { count: doc.page_count })}
                        </span>
                      ) : null}
                      <span>
                        {formatDateTime(
                          doc.updated_at ?? doc.created_at,
                          locale,
                        )}
                      </span>
                      {doc.status === 'failed' && doc.error_message ? (
                        <span
                          className="truncate text-danger"
                          title={doc.error_message}
                        >
                          {doc.error_message}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <DocumentStatusBadge status={doc.status} />
                  {docBusy ? (
                    <RefreshCw className="size-4 animate-spin text-primary" aria-hidden="true" />
                  ) : null}
                  <DropdownMenu
                    trigger={
                      <button
                        type="button"
                        aria-label={t('common.actions')}
                        className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    }
                  >
                    {doc.status === 'ready' ||
                    doc.status === 'failed' ||
                    doc.status === 'uploaded' ? (
                      <DropdownMenuItem
                        onSelect={() => void processDocument(doc)}
                      >
                        <span className="flex items-center gap-2">
                          <Play className="size-3.5" />
                          {doc.status === 'failed'
                            ? t('documents.retry')
                            : t('documents.process')}
                        </span>
                      </DropdownMenuItem>
                    ) : null}
                    {doc.status === 'ready' ? (
                      <DropdownMenuItem
                        onSelect={() => void reprocess(projectId, doc.document_id)}
                      >
                        <span className="flex items-center gap-2">
                          <RefreshCw className="size-3.5" />
                          {t('documents.reprocess')}
                        </span>
                      </DropdownMenuItem>
                    ) : null}
                    {doc.preview_image_count > 0 ? (
                      <DropdownMenuItem
                        onSelect={() => setPreview({ document: doc, page: 1 })}
                      >
                        <span className="flex items-center gap-2">
                          <Eye className="size-3.5" />
                          {t('documents.openPreview')}
                        </span>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => openOriginal(doc)}>
                      <span className="flex items-center gap-2">
                        <ExternalLink className="size-3.5" />
                        {t('documents.openOriginal')}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem danger onSelect={() => setDeleteTarget(doc)}>
                      <span className="flex items-center gap-2">
                        <Trash2 className="size-3.5" />
                        {t('common.delete')}
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {documents.length > 0 && indexRecordCount === null && !indexLoading ? (
        <p className="text-xs text-muted">{t('search.noIndexBody')}</p>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('documents.deleteConfirmTitle')}
        body={t('documents.deleteConfirmBody')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (!deleteTarget) return
          void remove(projectId, deleteTarget.document_id)
          setDeleteTarget(null)
        }}
      />

      <ConfirmDialog
        open={indexDialog !== null}
        onOpenChange={(open) => {
          if (!open) setIndexDialog(null)
        }}
        title={
          indexDialog === 'rebuild'
            ? t('documents.rebuildIndexConfirmTitle')
            : t('documents.buildIndexConfirmTitle')
        }
        body={
          indexDialog === 'rebuild'
            ? t('documents.rebuildIndexConfirmBody')
            : t('documents.buildIndexConfirmBody')
        }
        loading={indexing}
        onConfirm={() => void confirmIndex()}
      />

      <PreviewModal
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        projectId={projectId}
        document={preview?.document ?? null}
        initialPage={preview?.page ?? 1}
      />
    </div>
  )
}
