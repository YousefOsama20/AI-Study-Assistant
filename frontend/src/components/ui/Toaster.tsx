import { X } from 'lucide-react'
import { useToastsStore } from '../../stores/toasts'
import { cn } from '../../lib/utils'
import { useI18n } from '../../lib/i18n'

const kindClasses = {
  success: 'border-success/30 bg-success-soft text-success',
  error: 'border-danger/30 bg-danger-soft text-danger',
  info: 'border-info/30 bg-info-soft text-info',
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
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start justify-between gap-3 rounded-md border px-4 py-3 shadow-pop animate-slide-up',
            kindClasses[toast.kind],
          )}
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">{toast.title}</p>
            {toast.description ? (
              <p className="text-xs opacity-80">{toast.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label={t('common.dismiss')}
            className="rounded p-0.5 hover:bg-black/5"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
