import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const script = readFileSync(
  resolve(process.cwd(), 'public/theme-init.js'),
  'utf8',
)

function runThemeInit(): void {
  new Function(script)()
}

function mockSystemDark(dark: boolean): () => void {
  const original = window.matchMedia
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes('prefers-color-scheme: dark'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}

function resetRoot(): void {
  document.documentElement.className = ''
  delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = ''
}

afterEach(() => {
  resetRoot()
})

describe('theme-init', () => {
  it('applies a persisted dark preference before the app renders', () => {
    window.localStorage.setItem(
      'minirag-settings',
      JSON.stringify({ state: { theme: 'dark' } }),
    )
    runThemeInit()

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('keeps an explicit light preference even when the system is dark', () => {
    const restore = mockSystemDark(true)
    try {
      window.localStorage.setItem(
        'minirag-settings',
        JSON.stringify({ state: { theme: 'light' } }),
      )
      runThemeInit()

      expect(document.documentElement.dataset.theme).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.style.colorScheme).toBe('light')
    } finally {
      restore()
    }
  })

  it('resolves system mode from the operating system preference', () => {
    const restore = mockSystemDark(true)
    try {
      window.localStorage.setItem(
        'minirag-settings',
        JSON.stringify({ state: { theme: 'system' } }),
      )
      runThemeInit()

      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    } finally {
      restore()
    }
  })

  it('falls back to light for malformed persisted settings', () => {
    window.localStorage.setItem('minirag-settings', '{not-json')
    runThemeInit()

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
