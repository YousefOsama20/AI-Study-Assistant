import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Card({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-card',
        className,
      )}
      {...rest}
    />
  )
}

export function CardHeader({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1 border-b border-border px-5 py-4', className)}
      {...rest}
    />
  )
}

export function CardTitle({
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-base font-semibold text-fg', className)} {...rest} />
  )
}

export function CardDescription({
  className,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...rest} />
}

export function CardContent({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...rest} />
}

export function CardFooter({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t border-border px-5 py-3', className)}
      {...rest}
    />
  )
}
