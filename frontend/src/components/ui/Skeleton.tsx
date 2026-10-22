import { cn } from '../../lib/utils'

export function Skeleton({
  className,
}: {
  className?: string
}) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
      aria-hidden="true"
    />
  )
}

export function Spinner({
  className,
  label,
}: {
  className?: string
  label?: string
}) {
  return (
    <div role="status" className="inline-flex items-center gap-2 text-muted">
      <svg
        className={cn('size-4 animate-spin', className)}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      {label ? <span className="text-sm">{label}</span> : null}
      <span className="sr-only">{label ?? 'Loading'}</span>
    </div>
  )
}
