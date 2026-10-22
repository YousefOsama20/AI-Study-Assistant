import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactElement, ReactNode } from 'react'
import { I18nProvider } from '@/lib/i18n'

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nProvider>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export function renderAt(
  ui: ReactElement,
  url: string,
  path: string = url,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
    options,
  )
}
