import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, locale = 'en'): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const digits = unitIndex === 0 ? 0 : value < 10 ? 1 : 0
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)} ${units[unitIndex]}`
}

export function formatScore(score: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(score)
}

export function formatDateTime(iso: string | null | undefined, locale = 'en'): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatDate(iso: string | null | undefined, locale = 'en'): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}
