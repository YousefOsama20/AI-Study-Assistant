import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...rest }, ref) => {
    const autoId = useId()
    const inputId = id ?? autoId
    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-fg"
          >
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          className={cn(
            'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg',
            'placeholder:text-muted/70',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            error && 'border-danger',
            className,
          )}
          {...rest}
        />
        {hint && !error ? (
          <p className="text-xs text-muted">{hint}</p>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    )
  },
)
Input.displayName = 'Input'

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string | null
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...rest }, ref) => {
    const autoId = useId()
    const inputId = id ?? autoId
    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            {label}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          className={cn(
            'min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg',
            'placeholder:text-muted/70',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            error && 'border-danger',
            className,
          )}
          {...rest}
        />
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    )
  },
)
Textarea.displayName = 'Textarea'
