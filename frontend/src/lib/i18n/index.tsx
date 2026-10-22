import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { en, type Dictionary, type TranslationKey } from './en'
import { ar } from './ar'
import { useSettingsStore } from '../../stores/settings'

export type Language = 'en' | 'ar'

const dictionaries: Record<Language, Dictionary> = { en, ar }

export function languageDir(language: Language): 'ltr' | 'rtl' {
  return language === 'ar' ? 'rtl' : 'ltr'
}

export function localeFor(language: Language): string {
  return language === 'ar' ? 'ar' : 'en'
}

interface I18nContextValue {
  language: Language
  dir: 'ltr' | 'rtl'
  locale: string
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useSettingsStore((s) => s.language)

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = languageDir(language)
  }, [language])

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      const dict = dictionaries[language] ?? en
      const template = dict[key] ?? en[key] ?? key
      return interpolate(template, params)
    },
    [language],
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      dir: languageDir(language),
      locale: localeFor(language),
      t,
    }),
    [language, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}

export function useT() {
  return useI18n().t
}

export type { TranslationKey }
