import { Badge } from '../ui/Badge'
import { Spinner } from '../ui/Skeleton'
import { useI18n } from '../../lib/i18n'
import type { ProcessingStatus } from '../../types/api'

export function DocumentStatusBadge({
  status,
}: {
  status: ProcessingStatus
}) {
  const { t } = useI18n()

  if (status === 'ready') {
    return <Badge variant="success">{t('status.ready')}</Badge>
  }
  if (status === 'failed') {
    return <Badge variant="danger">{t('status.failed')}</Badge>
  }
  return (
    <Badge variant="info">
      <Spinner className="size-3" />
      {t(`status.${status}`)}
    </Badge>
  )
}

export function statusLabelKey(
  status: ProcessingStatus,
): `status.${ProcessingStatus}` {
  return `status.${status}`
}
