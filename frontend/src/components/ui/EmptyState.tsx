import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  body?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center ${className ?? ''}`}
    >
      {Icon ? (
        <div className="rounded-full bg-primary-soft p-3 text-primary-text">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
