import path from 'path'
import { fileURLToPath } from 'url'
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

function filePathInside(url: string, root: string): boolean {
  let target: string
  try {
    target = fileURLToPath(url)
  } catch {
    return false
  }
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function isAllowedNavigation(
  url: string,
  devServerUrl: string | undefined,
  appRoot?: string,
): boolean {
  if (devServerUrl) {
    return url === devServerUrl || url.startsWith(`${devServerUrl}/`)
  }
  if (!url.startsWith('file://')) {
    return false
  }
  if (!appRoot) {
    return true
  }
  return filePathInside(url, appRoot)
}
