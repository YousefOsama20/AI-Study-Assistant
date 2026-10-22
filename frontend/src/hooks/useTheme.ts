import { useEffect } from 'react'
import { useSettingsStore, type ThemePreference } from '../stores/settings'

export const THEME_COLORS = {
  light: '#F8F4EC',
  dark: '#211B1A',
} as const

export function resolveTheme(
  preference: ThemePreference,
): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return preference
}

export function applyTheme(preference: ThemePreference): 'light' | 'dark' {
  const resolved = resolveTheme(preference)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.theme = resolved
  root.style.colorScheme = resolved

  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  if (themeColor) {
    themeColor.content = THEME_COLORS[resolved]
  }

  return resolved
}

export function useTheme(): void {
  const theme = useSettingsStore((s) => s.theme)
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)
  const density = useSettingsStore((s) => s.density)

  useEffect(() => {
    const apply = () => {
      applyTheme(theme)
    }
    apply()
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion)
  }, [reducedMotion])

  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])
}
