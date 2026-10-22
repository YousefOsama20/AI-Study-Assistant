import { useBackendStore } from '../../stores/backend'
import { useI18n } from '../../lib/i18n'
import { cn } from '../../lib/utils'

const dotClasses = {
  ok: 'bg-success',
  degraded: 'bg-warning',
  unreachable: 'bg-danger',
  checking: 'bg-muted animate-pulse',
} as const

export function BackendStatusChip() {
  const health = useBackendStore((s) => s.health)
  const { t } = useI18n()

  const label =
    health === 'ok'
      ? t('backend.connected')
      : health === 'degraded'
        ? t('backend.degraded')
        : health === 'checking'
          ? t('backend.checking')
          : t('backend.disconnected')

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium',
        health === 'ok' ? 'text-success' : health === 'unreachable' ? 'text-danger' : 'text-warning',
      )}
      title={label}
    >
      <span className={cn('size-2 rounded-full', dotClasses[health])} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </span>
  )
}
