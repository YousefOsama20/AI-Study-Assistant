import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'
import { useI18n } from '../../lib/i18n'

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  const { t } = useI18n()
  if (totalPages <= 1) return null
  return (
    <nav
      className="flex items-center justify-between gap-2"
      aria-label="Pagination"
    >
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        icon={<ChevronLeft className="size-4" />}
      >
        {t('common.back')}
      </Button>
      <span className="text-sm text-muted">
        {t('projects.pageOf', { page, pages: totalPages })}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        icon={
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        }
      >
        {t('common.next')}
      </Button>
    </nav>
  )
}
