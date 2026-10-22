import type { BrowserWindowConstructorOptions } from 'electron'

export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
} satisfies BrowserWindowConstructorOptions['webPreferences']

export function isSafeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2_048) {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null
  }
  return parsed.toString()
}

export function isAllowedNavigation(
  url: string,
  devServerUrl: string | undefined,
): boolean {
  if (devServerUrl) {
    return url.startsWith(devServerUrl)
  }
  return url.startsWith('file://')
}
