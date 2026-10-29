import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'

export type ProviderBackend = 'OPENAI' | 'COHERE' | 'GEMINI'
export type DatabaseMode = 'docker' | 'existing'

export interface SetupConfig {
  version: 1
  setupComplete: boolean
  database: {
    mode: DatabaseMode
    host: string
    port: number
    name: string
    username: string
  }
  generation: {
    backend: ProviderBackend
    model: string
  }
  embedding: {
    backend: ProviderBackend
    model: string
    size: number
    useGenerationProvider: boolean
  }
}

export interface SetupSecrets {
  databasePassword: string | null
  openaiApiKey: string | null
  openaiApiUrl: string | null
  cohereApiKey: string | null
  geminiApiKey: string | null
}

export interface SetupStatus {
  configured: boolean
  setupComplete: boolean
  config: SetupConfig
  secrets: {
    databasePasswordSet: boolean
    openaiKeySet: boolean
    cohereKeySet: boolean
    geminiKeySet: boolean
    openaiApiUrl: string | null
  }
}

export interface SetupSaveInput {
  config?: Partial<SetupConfig> | null
  setupComplete?: boolean
  databasePassword?: string | null
  openaiApiKey?: string | null
  openaiApiUrl?: string | null
  cohereApiKey?: string | null
  geminiApiKey?: string | null
}

const PROVIDERS: ProviderBackend[] = ['OPENAI', 'COHERE', 'GEMINI']
const DB_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/
const USERNAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/
const HOST_RE = /^[A-Za-z0-9._:-]{1,255}$/
const MODEL_RE = /^[A-Za-z0-9._:/@-]{1,200}$/

export const DEFAULT_SETUP_CONFIG: SetupConfig = {
  version: 1,
  setupComplete: false,
  database: {
    mode: 'docker',
    host: '127.0.0.1',
    port: 5400,
    name: 'ai_study_assistant',
    username: 'postgres',
  },
  generation: {
    backend: 'OPENAI',
    model: 'gpt-4o-mini',
  },
  embedding: {
    backend: 'OPENAI',
    model: 'text-embedding-3-small',
    size: 1536,
    useGenerationProvider: true,
  },
}

export function configPath(userDataDir: string): string {
  return path.join(userDataDir, 'config.json')
}

export function secretsPath(userDataDir: string): string {
  return path.join(userDataDir, '.env')
}

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      result[key] = value
    }
  }
  return result
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

function normalizeProvider(value: unknown, fallback: ProviderBackend): ProviderBackend {
  const candidate = String(value ?? '').trim().toUpperCase() as ProviderBackend
  return PROVIDERS.includes(candidate) ? candidate : fallback
}

function normalizeModel(value: unknown, fallback: string): string {
  const candidate = String(value ?? '').trim()
  return MODEL_RE.test(candidate) ? candidate : fallback
}

export function normalizeSetupConfig(raw: unknown): SetupConfig {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const database =
    input.database && typeof input.database === 'object'
      ? (input.database as Record<string, unknown>)
      : {}
  const generation =
    input.generation && typeof input.generation === 'object'
      ? (input.generation as Record<string, unknown>)
      : {}
  const embedding =
    input.embedding && typeof input.embedding === 'object'
      ? (input.embedding as Record<string, unknown>)
      : {}

  const mode: DatabaseMode = database.mode === 'existing' ? 'existing' : 'docker'
  const host = String(database.host ?? DEFAULT_SETUP_CONFIG.database.host).trim()
  const name = String(database.name ?? DEFAULT_SETUP_CONFIG.database.name).trim()
  const username = String(database.username ?? DEFAULT_SETUP_CONFIG.database.username).trim()

  return {
    version: 1,
    setupComplete: input.setupComplete === true,
    database: {
      mode,
      host: HOST_RE.test(host) ? host : DEFAULT_SETUP_CONFIG.database.host,
      port: clampNumber(database.port, DEFAULT_SETUP_CONFIG.database.port, 1, 65535),
      name: DB_NAME_RE.test(name) ? name : DEFAULT_SETUP_CONFIG.database.name,
      username: USERNAME_RE.test(username)
        ? username
        : DEFAULT_SETUP_CONFIG.database.username,
    },
    generation: {
      backend: normalizeProvider(
        generation.backend,
        DEFAULT_SETUP_CONFIG.generation.backend,
      ),
      model: normalizeModel(
        generation.model,
        DEFAULT_SETUP_CONFIG.generation.model,
      ),
    },
    embedding: {
      backend: normalizeProvider(
        embedding.backend,
        DEFAULT_SETUP_CONFIG.embedding.backend,
      ),
      model: normalizeModel(
        embedding.model,
        DEFAULT_SETUP_CONFIG.embedding.model,
      ),
      size: clampNumber(embedding.size, DEFAULT_SETUP_CONFIG.embedding.size, 1, 8192),
      useGenerationProvider: embedding.useGenerationProvider !== false,
    },
  }
}

export function readSetupConfig(userDataDir: string): {
  config: SetupConfig
  exists: boolean
} {
  const content = readText(configPath(userDataDir))
  if (content === null) {
    return { config: { ...DEFAULT_SETUP_CONFIG }, exists: false }
  }
  try {
    return {
      config: normalizeSetupConfig(JSON.parse(content) as unknown),
      exists: true,
    }
  } catch {
    return { config: { ...DEFAULT_SETUP_CONFIG }, exists: true }
  }
}

export function readSetupSecrets(userDataDir: string): SetupSecrets {
  const content = readText(secretsPath(userDataDir))
  const env = content ? parseEnvFile(content) : {}
  return {
    databasePassword: env.POSTGRES_PASSWORD || null,
    openaiApiKey: env.OPENAI_API_KEY || null,
    openaiApiUrl: env.OPENAI_API_URL || null,
    cohereApiKey: env.COHERE_API_KEY || null,
    geminiApiKey: env.GEMINI_API_KEY || null,
  }
}

export function generateDatabasePassword(): string {
  return randomBytes(24).toString('base64url')
}

function providerSecret(
  backend: ProviderBackend,
  secrets: SetupSecrets,
): string | null {
  if (backend === 'OPENAI') return secrets.openaiApiKey
  if (backend === 'COHERE') return secrets.cohereApiKey
  return secrets.geminiApiKey
}

export function isSetupComplete(config: SetupConfig, secrets: SetupSecrets): boolean {
  const databasePasswordRequired = config.database.mode === 'docker'
  if (databasePasswordRequired && !secrets.databasePassword) return false
  if (!providerSecret(config.generation.backend, secrets)) return false
  const embeddingBackend = config.embedding.useGenerationProvider
    ? config.generation.backend
    : config.embedding.backend
  if (!providerSecret(embeddingBackend, secrets)) return false
  return config.database.name.length > 0
}

export function getSetupStatus(userDataDir: string): SetupStatus {
  const { config, exists } = readSetupConfig(userDataDir)
  const secrets = readSetupSecrets(userDataDir)
  return {
    configured: exists && config.setupComplete && isSetupComplete(config, secrets),
    setupComplete: config.setupComplete,
    config,
    secrets: {
      databasePasswordSet: Boolean(secrets.databasePassword),
      openaiKeySet: Boolean(secrets.openaiApiKey),
      cohereKeySet: Boolean(secrets.cohereApiKey),
      geminiKeySet: Boolean(secrets.geminiApiKey),
      openaiApiUrl: secrets.openaiApiUrl,
    },
  }
}

function assertValidConfig(config: SetupConfig): void {
  if (!HOST_RE.test(config.database.host)) {
    throw new Error('Enter a valid database host name or IP address.')
  }
  if (!DB_NAME_RE.test(config.database.name)) {
    throw new Error(
      'Database name must start with a letter or underscore and contain only letters, numbers, and underscores.',
    )
  }
  if (!USERNAME_RE.test(config.database.username)) {
    throw new Error('Enter a valid PostgreSQL user name.')
  }
  if (!MODEL_RE.test(config.generation.model)) {
    throw new Error('Enter a valid generation model name.')
  }
  if (!MODEL_RE.test(config.embedding.model)) {
    throw new Error('Enter a valid embedding model name.')
  }
  if (!Number.isInteger(config.database.port) || config.database.port < 1 || config.database.port > 65535) {
    throw new Error('Database port must be between 1 and 65535.')
  }
  if (!Number.isInteger(config.embedding.size) || config.embedding.size < 1 || config.embedding.size > 8192) {
    throw new Error('Embedding size must be between 1 and 8192.')
  }
}

function envValue(value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error('Configuration values may not contain line breaks.')
  }
  if (/^[A-Za-z0-9._:/@+-]*$/.test(value)) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function atomicWrite(file: string, content: string, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temp, content, { encoding: 'utf8', mode })
    try {
      fs.renameSync(temp, file)
    } catch {
      fs.rmSync(file, { force: true })
      fs.renameSync(temp, file)
    }
    if (mode !== undefined) {
      try {
        fs.chmodSync(file, mode)
      } catch {
        // Windows applies per-user ACLs from %APPDATA%; chmod is best effort.
      }
    }
  } finally {
    fs.rmSync(temp, { force: true })
  }
}

function writeSecrets(userDataDir: string, secrets: SetupSecrets): void {
  const entries: [string, string | null][] = [
    ['POSTGRES_PASSWORD', secrets.databasePassword],
    ['OPENAI_API_KEY', secrets.openaiApiKey],
    ['OPENAI_API_URL', secrets.openaiApiUrl],
    ['COHERE_API_KEY', secrets.cohereApiKey],
    ['GEMINI_API_KEY', secrets.geminiApiKey],
  ]
  const lines = [
    '# Managed by AI-Study-Assistant. Do not commit this file.',
    '# Secrets are read by the Electron main process and passed to the backend.',
  ]
  for (const [key, value] of entries) {
    if (value !== null && value !== '') {
      lines.push(`${key}=${envValue(value)}`)
    }
  }
  atomicWrite(secretsPath(userDataDir), `${lines.join('\n')}\n`, 0o600)
}

function normalizeSecretInput(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 4096 || /[\r\n]/.test(value)) {
    throw new Error('Invalid secret value.')
  }
  return value
}

function assertValidRawConfig(input: Partial<SetupConfig> | null | undefined): void {
  const database = input?.database
  if (database) {
    if (database.host !== undefined && !HOST_RE.test(String(database.host).trim())) {
      throw new Error('Enter a valid database host name or IP address.')
    }
    if (database.name !== undefined && !DB_NAME_RE.test(String(database.name).trim())) {
      throw new Error(
        'Database name must start with a letter or underscore and contain only letters, numbers, and underscores.',
      )
    }
    if (
      database.username !== undefined &&
      !USERNAME_RE.test(String(database.username).trim())
    ) {
      throw new Error('Enter a valid PostgreSQL user name.')
    }
    if (
      database.port !== undefined &&
      (!Number.isInteger(database.port) || database.port < 1 || database.port > 65535)
    ) {
      throw new Error('Database port must be between 1 and 65535.')
    }
  }
  if (
    input?.generation?.model !== undefined &&
    !MODEL_RE.test(String(input.generation.model).trim())
  ) {
    throw new Error('Enter a valid generation model name.')
  }
  if (
    input?.embedding?.model !== undefined &&
    !MODEL_RE.test(String(input.embedding.model).trim())
  ) {
    throw new Error('Enter a valid embedding model name.')
  }
  if (
    input?.embedding?.size !== undefined &&
    (!Number.isInteger(input.embedding.size) ||
      input.embedding.size < 1 ||
      input.embedding.size > 8192)
  ) {
    throw new Error('Embedding size must be between 1 and 8192.')
  }
}

export function saveSetupConfig(
  userDataDir: string,
  input: SetupSaveInput,
): SetupStatus {
  assertValidRawConfig(input.config)
  const current = readSetupConfig(userDataDir)
  const merged = normalizeSetupConfig({
    ...current.config,
    ...(input.config ?? {}),
    database: {
      ...current.config.database,
      ...(input.config?.database ?? {}),
    },
    generation: {
      ...current.config.generation,
      ...(input.config?.generation ?? {}),
    },
    embedding: {
      ...current.config.embedding,
      ...(input.config?.embedding ?? {}),
    },
  })
  assertValidConfig(merged)

  const existing = readSetupSecrets(userDataDir)
  const mergeSecret = (
    value: unknown,
    current: string | null,
  ): string | null => {
    const normalized = normalizeSecretInput(value)
    return normalized === undefined ? current : normalized
  }
  const nextSecrets: SetupSecrets = {
    databasePassword: mergeSecret(input.databasePassword, existing.databasePassword),
    openaiApiKey: mergeSecret(input.openaiApiKey, existing.openaiApiKey),
    openaiApiUrl: mergeSecret(input.openaiApiUrl, existing.openaiApiUrl),
    cohereApiKey: mergeSecret(input.cohereApiKey, existing.cohereApiKey),
    geminiApiKey: mergeSecret(input.geminiApiKey, existing.geminiApiKey),
  }

  const requestedComplete =
    input.setupComplete === undefined ? merged.setupComplete : input.setupComplete === true
  merged.setupComplete = requestedComplete && isSetupComplete(merged, nextSecrets)

  atomicWrite(configPath(userDataDir), `${JSON.stringify(merged, null, 2)}\n`)
  writeSecrets(userDataDir, nextSecrets)
  return getSetupStatus(userDataDir)
}

export function ensureDockerPassword(userDataDir: string): {
  password: string
  generated: boolean
} {
  const existing = readSetupSecrets(userDataDir)
  if (existing.databasePassword) {
    return { password: existing.databasePassword, generated: false }
  }
  const password = generateDatabasePassword()
  writeSecrets(userDataDir, { ...existing, databasePassword: password })
  return { password, generated: true }
}

export function buildBackendEnv(
  config: SetupConfig,
  secrets: SetupSecrets,
  dataDir: string,
  apiToken: string,
): Record<string, string> {
  const embeddingBackend = config.embedding.useGenerationProvider
    ? config.generation.backend
    : config.embedding.backend

  const env: Record<string, string> = {
    AISTUDY_PACKAGED: config.setupComplete ? '1' : '0',
    AISTUDY_AUTO_MIGRATE: config.setupComplete ? '1' : '0',
    AISTUDY_DATA_DIR: dataDir,
    AISTUDY_API_TOKEN: apiToken,
    POSTGRES_HOST: config.database.host,
    POSTGRES_PORT: String(config.database.port),
    POSTGRES_MAIN_DATABASE: config.database.name,
    POSTGRES_USERNAME: config.database.username,
    GENERATION_BACKEND: config.generation.backend,
    GENERATION_MODEL_ID: config.generation.model,
    EMBEDDING_BACKEND: embeddingBackend,
    EMBEDDING_MODEL_ID: config.embedding.model,
    EMBEDDING_MODEL_SIZE: String(config.embedding.size),
    VECTOR_DB_BACKEND: 'PGVECTOR',
  }
  if (secrets.databasePassword) {
    env.POSTGRES_PASSWORD = secrets.databasePassword
  }
  if (secrets.openaiApiKey) env.OPENAI_API_KEY = secrets.openaiApiKey
  if (secrets.openaiApiUrl) env.OPENAI_API_URL = secrets.openaiApiUrl
  if (secrets.cohereApiKey) env.COHERE_API_KEY = secrets.cohereApiKey
  if (secrets.geminiApiKey) env.GEMINI_API_KEY = secrets.geminiApiKey
  return env
}

export function defaultModelsFor(backend: ProviderBackend): {
  generation: string
  embedding: string
  size: number
} {
  if (backend === 'COHERE') {
    return {
      generation: 'command-a-03-2025',
      embedding: 'embed-multilingual-light-v3.0',
      size: 384,
    }
  }
  if (backend === 'GEMINI') {
    return {
      generation: 'gemini-2.0-flash',
      embedding: 'text-embedding-004',
      size: 768,
    }
  }
  return {
    generation: 'gpt-4o-mini',
    embedding: 'text-embedding-3-small',
    size: 1536,
  }
}
