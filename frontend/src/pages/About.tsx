import { useEffect } from 'react'
import { useBackendStore } from '../stores/backend'
import { useI18n } from '../lib/i18n'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Card, CardContent } from '../components/ui/Card'
import logoMark from '../assets/logo-mark.png'

const STACK = [
  'React 18',
  'TypeScript',
  'Vite',
  'Tailwind CSS',
  'Electron',
  'FastAPI',
  'PostgreSQL + pgvector',
]

export function AboutPage() {
  const { t } = useI18n()
  const health = useBackendStore((s) => s.health)
  const systemInfo = useBackendStore((s) => s.systemInfo)

  useEffect(() => {
    void useBackendStore.getState().check()
    if (useBackendStore.getState().systemInfo === null) {
      void useBackendStore.getState().loadSystemInfo()
    }
  }, [])

  const healthLabel =
    health === 'ok'
      ? t('settings.healthOk')
      : health === 'degraded'
        ? t('settings.healthDegraded')
        : health === 'unreachable'
          ? t('settings.healthUnreachable')
          : t('backend.checking')

  return (
    <div className="flex justify-center py-6">
      <Card className="w-full max-w-xl">
        <CardContent className="flex flex-col items-center gap-4 px-8 py-10 text-center">
          <img
            src={logoMark}
            alt=""
            className="size-20 rounded-full shadow-card"
            decoding="async"
          />
          <h1 className="text-xl font-semibold text-fg">{t('app.name')}</h1>
          <p className="text-sm text-muted">
            {t('about.version', { version: systemInfo?.version ?? '1.0.0' })}
          </p>
          <p className="max-w-prose text-sm text-muted">
            {t('about.description')}
          </p>

          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('about.stack')}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {STACK.map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('about.backendStatus')}
            </p>
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium',
                health === 'ok'
                  ? 'text-success'
                  : health === 'unreachable'
                    ? 'text-danger'
                    : health === 'degraded'
                      ? 'text-warning'
                      : 'text-muted',
              )}
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  health === 'ok'
                    ? 'bg-success'
                    : health === 'degraded'
                      ? 'bg-warning'
                      : health === 'unreachable'
                        ? 'bg-danger'
                        : 'bg-muted animate-pulse',
                )}
                aria-hidden="true"
              />
              {healthLabel}
            </span>
          </div>

          <div className="flex w-full flex-col items-center gap-1 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('about.license')}
            </p>
            <p className="text-sm text-fg">{t('about.licenseText')}</p>
            <p className="text-xs text-muted">{t('about.repoHint')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
