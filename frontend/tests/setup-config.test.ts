import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_SETUP_CONFIG,
  buildBackendEnv,
  configPath,
  ensureDockerPassword,
  generateDatabasePassword,
  normalizeSetupConfig,
  parseEnvFile,
  readSetupConfig,
  readSetupSecrets,
  saveSetupConfig,
  secretsPath,
} from '../electron/setup-config'

const tempDirs: string[] = []

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aistudy-config-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

describe('setup configuration', () => {
  it('uses safe defaults and normalizes invalid values', () => {
    expect(readSetupConfig(tempDir()).config).toEqual(DEFAULT_SETUP_CONFIG)
    const normalized = normalizeSetupConfig({
      database: { mode: 'other', host: 'bad host', port: 99999, name: 'bad name' },
      generation: { backend: 'other', model: '' },
      embedding: { backend: 'COHERE', model: '', size: 0, useGenerationProvider: false },
    })
    expect(normalized.database.mode).toBe('docker')
    expect(normalized.database.host).toBe(DEFAULT_SETUP_CONFIG.database.host)
    expect(normalized.database.port).toBe(65535)
    expect(normalized.generation.backend).toBe('OPENAI')
    expect(normalized.generation.model).toBe(DEFAULT_SETUP_CONFIG.generation.model)
    expect(normalized.embedding.backend).toBe('COHERE')
    expect(normalized.embedding.size).toBe(1)
  })

  it('stores secrets outside config.json and reports only booleans', () => {
    const dir = tempDir()
    const status = saveSetupConfig(dir, {
      config: DEFAULT_SETUP_CONFIG,
      setupComplete: true,
      databasePassword: 'super-secret-password',
      openaiApiKey: 'sk-secret-key',
    })

    expect(status.configured).toBe(true)
    expect(status.secrets.databasePasswordSet).toBe(true)
    expect(status.secrets.openaiKeySet).toBe(true)
    expect(JSON.stringify(status)).not.toContain('super-secret-password')
    expect(JSON.stringify(status)).not.toContain('sk-secret-key')

    const rawConfig = fs.readFileSync(configPath(dir), 'utf8')
    expect(rawConfig).not.toContain('super-secret-password')
    expect(rawConfig).not.toContain('sk-secret-key')

    const env = parseEnvFile(fs.readFileSync(secretsPath(dir), 'utf8'))
    expect(env.POSTGRES_PASSWORD).toBe('super-secret-password')
    expect(env.OPENAI_API_KEY).toBe('sk-secret-key')
  })

  it('preserves saved secrets when the wizard leaves fields blank', () => {
    const dir = tempDir()
    saveSetupConfig(dir, {
      config: DEFAULT_SETUP_CONFIG,
      setupComplete: true,
      databasePassword: 'db-pass',
      openaiApiKey: 'sk-first',
    })
    const next = saveSetupConfig(dir, {
      config: {
        generation: { backend: 'OPENAI', model: 'gpt-4.1-mini' },
        embedding: {
          backend: 'OPENAI',
          model: 'text-embedding-3-large',
          size: 3072,
          useGenerationProvider: true,
        },
      },
    })
    expect(next.configured).toBe(true)
    expect(next.config.generation.model).toBe('gpt-4.1-mini')
    expect(readSetupSecrets(dir).databasePassword).toBe('db-pass')
    expect(readSetupSecrets(dir).openaiApiKey).toBe('sk-first')
  })

  it('supports clearing a saved key explicitly', () => {
    const dir = tempDir()
    saveSetupConfig(dir, {
      config: DEFAULT_SETUP_CONFIG,
      setupComplete: true,
      databasePassword: 'db-pass',
      openaiApiKey: 'sk-first',
    })
    const next = saveSetupConfig(dir, { openaiApiKey: null })
    expect(next.configured).toBe(false)
    expect(readSetupSecrets(dir).openaiApiKey).toBeNull()
  })

  it('generates one Docker password and keeps it stable', () => {
    const dir = tempDir()
    const first = ensureDockerPassword(dir)
    const second = ensureDockerPassword(dir)
    expect(first.generated).toBe(true)
    expect(second.generated).toBe(false)
    expect(second.password).toBe(first.password)
    expect(first.password.length).toBeGreaterThanOrEqual(24)
    expect(generateDatabasePassword()).not.toBe(generateDatabasePassword())
  })

  it('rejects unsafe database identifiers before writing files', () => {
    const dir = tempDir()
    expect(() =>
      saveSetupConfig(dir, {
        config: {
          database: {
            ...DEFAULT_SETUP_CONFIG.database,
            name: 'bad; DROP DATABASE postgres',
          },
        },
      }),
    ).toThrow(/Database name/)
    expect(fs.existsSync(configPath(dir))).toBe(false)
  })

  it('maps the wizard configuration to backend environment variables', () => {
    const env = buildBackendEnv(
      {
        ...DEFAULT_SETUP_CONFIG,
        setupComplete: true,
        database: {
          ...DEFAULT_SETUP_CONFIG.database,
          mode: 'existing',
          port: 5432,
          name: 'study',
        },
        generation: { backend: 'COHERE', model: 'command-a-03-2025' },
        embedding: {
          backend: 'COHERE',
          model: 'embed-multilingual-light-v3.0',
          size: 384,
          useGenerationProvider: true,
        },
      },
      {
        databasePassword: 'pw',
        openaiApiKey: null,
        openaiApiUrl: null,
        cohereApiKey: 'co-key',
        geminiApiKey: null,
      },
      'C:/data',
      'token',
    )
    expect(env.POSTGRES_PORT).toBe('5432')
    expect(env.POSTGRES_MAIN_DATABASE).toBe('study')
    expect(env.POSTGRES_PASSWORD).toBe('pw')
    expect(env.GENERATION_BACKEND).toBe('COHERE')
    expect(env.EMBEDDING_BACKEND).toBe('COHERE')
    expect(env.COHERE_API_KEY).toBe('co-key')
    expect(env.AISTUDY_API_TOKEN).toBe('token')
    expect(env.AISTUDY_DATA_DIR).toBe('C:/data')
  })
})
