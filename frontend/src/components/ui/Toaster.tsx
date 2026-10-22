import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react'
import { useToastsStore } from '../../stores/toasts'
import { cn } from '../../lib/utils'
import { useI18n } from '../../lib/i18n'

const kindMeta = {
  success: {
    icon: CheckCircle2,
    classes: 'border-success/30 bg-success-soft text-success',
  },
  error: {
    icon: XCircle,
    classes: 'border-danger/30 bg-danger-soft text-danger',
  },
  warning: {
    icon: AlertTriangle,
    classes: 'border-warning/30 bg-warning-soft text-warning',
  },
  info: {
    icon: Info,
    classes: 'border-info/30 bg-info-soft text-info',
  },
} as const

export function Toaster() {
  const toasts = useToastsStore((s) => s.toasts)
  const dismiss = useToastsStore((s) => s.dismiss)
  const { t } = useI18n()

  return (
    <div
      className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const meta = kindMeta[toast.kind]
        const Icon = meta.icon
        return (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 shadow-pop animate-slide-up',
              meta.classes,
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description ? (
                <p className="text-xs opacity-90">{toast.description}</p>
              ) : null}
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                  className="mt-1 self-start text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={t('common.dismiss')}
              className="rounded p-0.5 hover:bg-fg/10"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
