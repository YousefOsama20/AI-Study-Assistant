import type { SelectHTMLAttributes } from 'react'
import { useId } from 'react'
import { cn } from '../../lib/utils'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export function Select({
  className,
  label,
  id,
  children,
  ...rest
}: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={selectId} className="text-sm font-medium text-fg">
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        className={cn(
          'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  )
}
