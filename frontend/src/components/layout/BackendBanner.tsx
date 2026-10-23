import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, ServerCrash } from 'lucide-react'
import { useBackendStore } from '../../stores/backend'
import { useI18n } from '../../lib/i18n'
import { Button } from '../ui/Button'

const POLL_MS = 30_000

export function BackendBanner() {
  const health = useBackendStore((s) => s.health)
  const check = useBackendStore((s) => s.check)
  const processError = useBackendStore((s) => s.processError)
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      await check()
      if (!cancelled) setVisible(true)
    }
    void run()
    const timer = window.setInterval(() => {
      void check()
    }, POLL_MS)
    const unsubscribe = window.aiStudyAssistant?.onBackendStatus?.((status) => {
      if (status.state === 'running' || status.state === 'failed') {
        void check()
      }
    })
    return () => {
      cancelled = true
      window.clearInterval(timer)
      unsubscribe?.()
    }
  }, [check])

  if (!visible || health === 'ok') return null

  const isError = health === 'unreachable'
  const isChecking = health === 'checking'

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-sm ${
        isError
          ? 'border-danger/30 bg-danger-soft text-danger'
          : isChecking
            ? 'border-border bg-surface-2 text-muted'
            : 'border-warning/30 bg-warning-soft text-warning'
      }`}
    >
      <div className="flex items-center gap-2">
        {isError ? (
          <ServerCrash className="size-4 shrink-0" aria-hidden="true" />
        ) : isChecking ? (
          <Loader2
            className="size-4 shrink-0 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="font-medium">
          {health === 'checking'
            ? t('backend.checking')
            : health === 'degraded'
              ? t('backend.degraded')
              : t('backend.disconnected')}
        </span>
        {isError ? (
          <span className="hidden text-xs opacity-80 md:inline">
            {processError || t('backend.errorHint')}
          </span>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void check()
        }}
        icon={<RefreshCw className="size-3.5" />}
        className={
          isError
            ? 'text-danger hover:bg-danger/10'
            : isChecking
              ? 'text-muted hover:bg-surface'
              : 'text-warning hover:bg-warning/10'
        }
      >
        {t('common.retry')}
      </Button>
    </div>
  )
}
