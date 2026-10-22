import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  FileQuestion,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Skeleton'
import { useI18n } from '../../lib/i18n'
import { api, resolvePreviewUrl } from '../../lib/api/client'
import type { DocumentItem } from '../../types/api'

export interface PreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  document: DocumentItem | null
  initialPage?: number
}

export function PreviewModal({
  open,
  onOpenChange,
  projectId,
  document,
  initialPage = 1,
}: PreviewModalProps) {
  const { t } = useI18n()
  const totalPages = document?.preview_image_count ?? 0
  const [page, setPage] = useState(initialPage)
  const [zoom, setZoom] = useState(1)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (open) {
      setPage(initialPage)
      setZoom(1)
    }
  }, [open, initialPage])

  const loadPage = useCallback(async () => {
    if (!open || !document || totalPages <= 0) {
      setUrl(null)
      setMissing(totalPages <= 0)
      return
    }
    if (page < 1 || page > totalPages) {
      setMissing(true)
      setUrl(null)
      return
    }
    setLoading(true)
    setMissing(false)
    try {
      const nextUrl = await resolvePreviewUrl(
        projectId,
        document.document_id,
        page,
        url ?? undefined,
      )
      setUrl(nextUrl)
    } catch {
      setMissing(true)
      setUrl(null)
    } finally {
      setLoading(false)
    }
  }, [open, document, page, projectId, totalPages, url])

  useEffect(() => {
    void loadPage()
  }, [open, document?.document_id, page, projectId])

  useEffect(() => {
    return () => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    }
  }, [url])

  const openOriginal = () => {
    if (!document) return
    if (window.aiStudyAssistant) {
      void window.aiStudyAssistant.openOriginalPdf({
        projectId,
        documentId: document.document_id,
      })
    } else {
      window.open(api.filePath(projectId, document.document_id), '_blank')
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('preview.title')}
      description={document?.original_filename}
      className="max-w-3xl"
      footer={
        <>
          <div className="me-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || totalPages <= 0}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              icon={<ChevronLeft className="size-4 rtl:rotate-180" />}
              aria-label={t('preview.previous')}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || totalPages <= 0}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              icon={<ChevronRight className="size-4 rtl:rotate-180" />}
              aria-label={t('preview.next')}
            />
            <span className="ms-2 text-sm text-muted tabular-nums">
              {totalPages > 0
                ? t('preview.pageOf', { page, total: totalPages })
                : t('documents.noPreview')}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            icon={<ZoomIn className="size-4" />}
            aria-label={t('preview.zoomIn')}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            icon={<ZoomOut className="size-4" />}
            aria-label={t('preview.zoomOut')}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={openOriginal}
            icon={<ExternalLink className="size-4" />}
          >
            {t('preview.openOriginal')}
          </Button>
        </>
      }
    >
      <div className="flex min-h-64 items-center justify-center overflow-auto rounded-md border border-border bg-surface-2 p-2">
        {loading ? (
          <Spinner label={t('preview.loading')} />
        ) : missing || !url ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted">
            <FileQuestion className="size-8" aria-hidden="true" />
            <p className="text-sm">
              {totalPages <= 0 ? t('preview.missingDocument') : t('preview.missing')}
            </p>
          </div>
        ) : (
          <img
            src={url}
            alt={`${document?.original_filename ?? 'PDF'} — ${t('common.page')} ${page}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            className="max-w-full rounded bg-white shadow-card"
          />
        )}
      </div>
    </Modal>
  )
}
