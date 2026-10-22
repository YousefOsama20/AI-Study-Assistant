import { useEffect } from 'react'
import { useSettingsStore, type ThemePreference } from '../stores/settings'

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return preference
}

export function useTheme(): void {
  const theme = useSettingsStore((s) => s.theme)
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)
  const density = useSettingsStore((s) => s.density)

  useEffect(() => {
    const apply = () => {
      const resolved = resolveTheme(theme)
      document.documentElement.classList.toggle('dark', resolved === 'dark')
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
