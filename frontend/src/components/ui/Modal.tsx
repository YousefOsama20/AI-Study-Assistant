import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { useI18n } from '../../lib/i18n'

export interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const { t } = useI18n()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/45 animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-surface shadow-pop animate-slide-up',
            'max-h-[85vh] overflow-auto',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-base font-semibold text-fg">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label={t('common.close')}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
