import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { useI18n } from '../../lib/i18n'
import type { ProcessingStatus } from '../../types/api'

export function DocumentStatusBadge({
  status,
}: {
  status: ProcessingStatus
}) {
  const { t } = useI18n()

  if (status === 'ready') {
    return (
      <Badge variant="success">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        {t('status.ready')}
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge variant="danger">
        <XCircle className="size-3" aria-hidden="true" />
        {t('status.failed')}
      </Badge>
    )
  }
  if (status === 'uploaded') {
    return (
      <Badge variant="default">
        <Clock3 className="size-3" aria-hidden="true" />
        {t('status.uploaded')}
      </Badge>
    )
  }
  return (
    <Badge variant="info">
      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      {t(`status.${status}`)}
    </Badge>
  )
}

export function statusLabelKey(
  status: ProcessingStatus,
): `status.${ProcessingStatus}` {
  return `status.${status}`
}
