import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { I18nProvider, useI18n } from '@/lib/i18n'
import { useTheme } from '@/hooks/useTheme'
import { useSettingsStore } from '@/stores/settings'

function LanguageProbe() {
  const { t, dir } = useI18n()
  return <p>{`${t('nav.projects')}:${dir}`}</p>
}

function ThemeProbe() {
  useTheme()
  return null
}

describe('navigation', () => {
  it('navigates between sidebar destinations', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <Sidebar />
          <Routes>
            <Route path="/" element={<div>dashboard-page</div>} />
            <Route path="/projects" element={<div>projects-page</div>} />
            <Route path="/settings" element={<div>settings-page</div>} />
            <Route path="/about" element={<div>about-page</div>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )

    expect(screen.getByText('dashboard-page')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /projects/i }))
    expect(screen.getByText('projects-page')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /settings/i }))
    expect(screen.getByText('settings-page')).toBeInTheDocument()
  })
})

describe('language and theme preferences', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'en', theme: 'light' })
  })

  afterEach(() => {
    useSettingsStore.setState({ language: 'en', theme: 'light' })
    document.documentElement.classList.remove('dark')
    delete document.documentElement.dataset.theme
    document.documentElement.style.colorScheme = ''
  })

  it('switches to Arabic and applies RTL', () => {
    useSettingsStore.setState({ language: 'ar' })

    render(
      <I18nProvider>
        <LanguageProbe />
      </I18nProvider>,
    )

    expect(screen.getByText('المشاريع:rtl')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('applies the dark theme and persists it', () => {
    useSettingsStore.setState({ theme: 'dark' })

    render(<ThemeProbe />)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    const persisted = JSON.parse(
      window.localStorage.getItem('minirag-settings') ?? '{}',
    ) as { state?: { theme?: string } }
    expect(persisted.state?.theme).toBe('dark')
  })

  it('resolves the system theme through prefers-color-scheme', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia

    try {
      useSettingsStore.setState({ theme: 'system' })
      render(<ThemeProbe />)

      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })
})
