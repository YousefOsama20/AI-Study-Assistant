import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Database,
  FolderOpen,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Switch } from '../components/ui/Switch'
import { useI18n } from '../lib/i18n'
import { useBackendStore } from '../stores/backend'
import { cn } from '../lib/utils'
import logoMark from '../assets/logo-mark.png'

type Provider = ProviderBackendName

const PROVIDERS: Provider[] = ['OPENAI', 'COHERE', 'GEMINI']

const DEFAULT_CONFIG: SetupConfigPayload = {
  version: 1,
  setupComplete: false,
  database: {
    mode: 'docker',
    host: '127.0.0.1',
    port: 5400,
    name: 'ai_study_assistant',
    username: 'postgres',
  },
  generation: { backend: 'OPENAI', model: 'gpt-4o-mini' },
  embedding: {
    backend: 'OPENAI',
    model: 'text-embedding-3-small',
    size: 1536,
    useGenerationProvider: true,
  },
}

function providerDefaults(provider: Provider) {
  if (provider === 'COHERE') {
    return {
      generation: 'command-a-03-2025',
      embedding: 'embed-multilingual-light-v3.0',
      size: 384,
    }
  }
  if (provider === 'GEMINI') {
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

function secretKeyFor(provider: Provider): 'openaiKeySet' | 'cohereKeySet' | 'geminiKeySet' {
  if (provider === 'COHERE') return 'cohereKeySet'
  if (provider === 'GEMINI') return 'geminiKeySet'
  return 'openaiKeySet'
}

function providerLabel(provider: Provider): string {
  if (provider === 'COHERE') return 'Cohere'
  if (provider === 'GEMINI') return 'Google Gemini'
  return 'OpenAI'
}

export function SetupPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const bridge = typeof window !== 'undefined' ? window.aiStudyAssistant : undefined

  const [status, setStatus] = useState<SetupStatusPayload | null>(null)
  const [config, setConfig] = useState<SetupConfigPayload>(DEFAULT_CONFIG)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dbResult, setDbResult] = useState<DatabaseSetupResultPayload | null>(null)
  const [dbReady, setDbReady] = useState(false)
  const [databasePassword, setDatabasePassword] = useState('')
  const [keyInputs, setKeyInputs] = useState<Record<Provider, string>>({
    OPENAI: '',
    COHERE: '',
    GEMINI: '',
  })
  const [openaiApiUrl, setOpenaiApiUrl] = useState('')
  const [docker, setDocker] = useState<{
    installed: boolean
    running: boolean
    version: string | null
    composeVersion: string | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!bridge) return
    void bridge
      .getSetupStatus()
      .then((next) => {
        setStatus(next)
        setConfig(next.config)
        setDbReady(next.configured)
        setOpenaiApiUrl(next.secrets.openaiApiUrl ?? '')
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }, [bridge])

  const effectiveEmbeddingProvider = config.embedding.useGenerationProvider
    ? config.generation.backend
    : config.embedding.backend

  const requiredProviders = useMemo(() => {
    const providers = new Set<Provider>([config.generation.backend])
    providers.add(effectiveEmbeddingProvider)
    return [...providers]
  }, [config.generation.backend, effectiveEmbeddingProvider])

  const hasStoredKey = (provider: Provider) =>
    Boolean(status?.secrets[secretKeyFor(provider)])

  const hasKey = (provider: Provider) =>
    keyInputs[provider].trim().length > 0 || hasStoredKey(provider)

  const providersReady = requiredProviders.every(hasKey)

  function updateDatabase(patch: Partial<SetupConfigPayload['database']>) {
    setDbReady(false)
    setDbResult(null)
    setConfig((prev) => ({ ...prev, database: { ...prev.database, ...patch } }))
  }

  function updateGeneration(patch: Partial<SetupConfigPayload['generation']>) {
    setConfig((prev) => {
      const generation = { ...prev.generation, ...patch }
      const defaults = providerDefaults(generation.backend)
      if (prev.embedding.useGenerationProvider) {
        return {
          ...prev,
          generation,
          embedding: {
            ...prev.embedding,
            backend: generation.backend,
            model: defaults.embedding,
            size: defaults.size,
          },
        }
      }
      return { ...prev, generation }
    })
  }

  function updateEmbedding(patch: Partial<SetupConfigPayload['embedding']>) {
    setConfig((prev) => ({ ...prev, embedding: { ...prev.embedding, ...patch } }))
  }

  function setUseSameProvider(checked: boolean) {
    setConfig((prev) => {
      if (!checked) {
        return { ...prev, embedding: { ...prev.embedding, useGenerationProvider: false } }
      }
      const defaults = providerDefaults(prev.generation.backend)
      return {
        ...prev,
        embedding: {
          ...prev.embedding,
          useGenerationProvider: true,
          backend: prev.generation.backend,
          model: defaults.embedding,
          size: defaults.size,
        },
      }
    })
  }

  async function checkDocker() {
    if (!bridge) return
    setBusy('docker-check')
    setError(null)
    try {
      setDocker(await bridge.getDockerStatus())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  async function startDocker() {
    if (!bridge) return
    setBusy('docker-start')
    setError(null)
    try {
      const result = await bridge.startDockerDatabase({
        port: config.database.port,
        database: config.database.name,
        username: config.database.username,
      })
      setDocker(await bridge.getDockerStatus())
      setDbReady(false)
      setDbResult({
        ok: result.ok,
        message: result.passwordGenerated
          ? `${result.message} A database password was generated and stored securely.`
          : result.message,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  async function testDatabase() {
    if (!bridge) return
    setBusy('db-test')
    setError(null)
    setDbResult(null)
    try {
      const result = await bridge.testDatabase({
        ...config.database,
        password: databasePassword,
      })
      const json = result.json
      setDbResult(json)
      setDbReady(Boolean(json?.ok && json.vector_available))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  async function initializeDatabase() {
    if (!bridge) return
    setBusy('db-init')
    setError(null)
    setDbResult(null)
    try {
      const result = await bridge.initializeDatabase({
        ...config.database,
        password: databasePassword,
        create_database: true,
        run_migrations: true,
      })
      const json = result.json
      setDbResult(json)
      if (json?.ok) {
        setDbReady(true)
        setStep(1)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  async function saveAndFinish() {
    if (!bridge) return
    setBusy('save')
    setError(null)
    try {
      const secretInput: SetupSaveInputPayload = {
        config,
        setupComplete: true,
        ...(databasePassword ? { databasePassword } : {}),
        ...(keyInputs.OPENAI.trim() ? { openaiApiKey: keyInputs.OPENAI.trim() } : {}),
        ...(keyInputs.COHERE.trim() ? { cohereApiKey: keyInputs.COHERE.trim() } : {}),
        ...(keyInputs.GEMINI.trim() ? { geminiApiKey: keyInputs.GEMINI.trim() } : {}),
        ...(openaiApiUrl.trim() ? { openaiApiUrl: openaiApiUrl.trim() } : {}),
      }
      const next = await bridge.saveSetupConfig(secretInput)
      setStatus(next)
      if (!next.configured) {
        setError(t('setup.requiredKeys'))
        return
      }
      const restart = await bridge.restartBackend()
      if (!restart.ok) {
        setError(restart.error ?? t('setup.restartFailed'))
        return
      }
      void useBackendStore.getState().check()
      navigate('/', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const steps = [
    { icon: Database, label: t('setup.stepDatabase') },
    { icon: Sparkles, label: t('setup.stepProviders') },
    { icon: Check, label: t('setup.stepFinish') },
  ]

  if (!bridge) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t('setup.desktopOnlyTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted">{t('setup.desktopOnly')}</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center gap-3">
        <img src={logoMark} alt="" className="size-12 rounded-full" />
        <div>
          <h1 className="text-2xl font-semibold text-fg">{t('setup.title')}</h1>
          <p className="text-sm text-muted">{t('setup.subtitle')}</p>
        </div>
      </header>

      <ol className="flex items-center gap-2" aria-label={t('setup.progressLabel')}>
        {steps.map((item, index) => {
          const Icon = item.icon
          const active = step === index
          const complete = step > index
          return (
            <li key={item.label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  active
                    ? 'border-primary bg-primary text-primary-fg'
                    : complete
                      ? 'border-primary bg-primary-soft text-primary-text'
                      : 'border-border bg-surface text-muted',
                )}
              >
                {complete ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span
                className={cn(
                  'hidden text-sm sm:block',
                  active ? 'font-semibold text-fg' : 'text-muted',
                )}
              >
                {item.label}
              </span>
              {index < steps.length - 1 ? (
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              ) : null}
            </li>
          )
        })}
      </ol>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{error}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void bridge.openLogsFolder()}
          >
            <FolderOpen className="size-4" />
            {t('setup.openLogs')}
          </Button>
        </div>
      ) : null}

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('setup.databaseTitle')}</CardTitle>
            <p className="text-sm text-muted">{t('setup.databaseDescription')}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
              {(['docker', 'existing'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={config.database.mode === mode}
                  onClick={() => updateDatabase({ mode })}
                  className={cn(
                    'rounded-lg border px-4 py-3 text-start transition-colors',
                    config.database.mode === mode
                      ? 'border-primary bg-primary-soft'
                      : 'border-border bg-surface hover:bg-surface-2',
                  )}
                >
                  <span className="block text-sm font-semibold text-fg">
                    {mode === 'docker' ? t('setup.modeDocker') : t('setup.modeExisting')}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {mode === 'docker'
                      ? t('setup.modeDockerHint')
                      : t('setup.modeExistingHint')}
                  </span>
                </button>
              ))}
            </div>

            {config.database.mode === 'docker' ? (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-2/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-fg">{t('setup.dockerTitle')}</p>
                    <p className="text-xs text-muted">
                      {docker
                        ? docker.running
                          ? `${docker.version ?? 'Docker'} · ${docker.composeVersion ?? ''}`
                          : docker.error ?? t('setup.dockerNotRunning')
                        : t('setup.dockerHint')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={busy === 'docker-check'}
                    onClick={() => void checkDocker()}
                  >
                    <RefreshCw className="size-4" />
                    {t('setup.checkDocker')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    loading={busy === 'docker-start'}
                    onClick={() => void startDocker()}
                  >
                    {t('setup.startDatabase')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void bridge.openExternal(
                        'https://www.docker.com/products/docker-desktop/',
                      )
                    }
                  >
                    {t('setup.dockerDownload')}
                  </Button>
                </div>
                {docker && !docker.installed ? (
                  <p className="text-xs text-warning">{t('setup.dockerRequiredNote')}</p>
                ) : null}
              </div>
            ) : (
              <p className="rounded-md border border-border bg-surface-2/50 p-3 text-xs text-muted">
                {t('setup.existingSqlHint')}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('setup.host')}
                value={config.database.host}
                disabled={config.database.mode === 'docker'}
                onChange={(event) => updateDatabase({ host: event.target.value })}
              />
              <Input
                label={t('setup.port')}
                type="number"
                min={1}
                max={65535}
                value={config.database.port}
                disabled={config.database.mode === 'docker'}
                onChange={(event) =>
                  updateDatabase({ port: Number.parseInt(event.target.value, 10) || 0 })
                }
              />
              <Input
                label={t('setup.databaseName')}
                value={config.database.name}
                disabled={config.database.mode === 'docker'}
                onChange={(event) => updateDatabase({ name: event.target.value })}
              />
              <Input
                label={t('setup.username')}
                value={config.database.username}
                disabled={config.database.mode === 'docker'}
                onChange={(event) => updateDatabase({ username: event.target.value })}
              />
              <Input
                label={t('setup.password')}
                type="password"
                autoComplete="new-password"
                className="sm:col-span-2"
                value={databasePassword}
                placeholder={
                  status?.secrets.databasePasswordSet
                    ? t('setup.passwordKeep')
                    : undefined
                }
                onChange={(event) => {
                  setDatabasePassword(event.target.value)
                  setDbReady(false)
                }}
                hint={
                  config.database.mode === 'docker'
                    ? t('setup.passwordDockerHint')
                    : t('setup.passwordHint')
                }
              />
            </div>

            {dbResult ? (
              <div
                role="status"
                className={cn(
                  'rounded-md border px-4 py-3 text-sm',
                  dbResult.ok
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-danger/40 bg-danger/10 text-danger',
                )}
              >
                <p className="font-medium">
                  {dbResult.ok ? t('setup.dbConnected') : t('setup.dbFailed')}
                </p>
                <p className="mt-1 text-xs">{dbResult.message}</p>
                {dbResult.ok && !dbResult.vector_available ? (
                  <p className="mt-1 text-xs">{t('setup.vectorMissing')}</p>
                ) : null}
                {dbResult.ok && dbResult.migrations_applied ? (
                  <p className="mt-1 text-xs">{t('setup.dbInitDone')}</p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                loading={busy === 'db-test'}
                onClick={() => void testDatabase()}
              >
                {t('setup.testConnection')}
              </Button>
              <Button
                loading={busy === 'db-init'}
                onClick={() => void initializeDatabase()}
              >
                {t('setup.initialize')}
              </Button>
              <Button
                variant="ghost"
                disabled={!dbReady}
                onClick={() => setStep(1)}
              >
                {t('common.next')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('setup.providersTitle')}</CardTitle>
            <p className="text-sm text-muted">{t('setup.providersDescription')}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={t('setup.generationProvider')}
                value={config.generation.backend}
                onChange={(event) =>
                  updateGeneration({
                    backend: event.target.value as Provider,
                    model: providerDefaults(event.target.value as Provider).generation,
                  })
                }
              >
                {PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {providerLabel(provider)}
                  </option>
                ))}
              </Select>
              <Input
                label={t('setup.model')}
                value={config.generation.model}
                onChange={(event) => updateGeneration({ model: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-border p-4">
              <Switch
                checked={config.embedding.useGenerationProvider}
                onCheckedChange={setUseSameProvider}
                label={t('setup.useSameProvider')}
              />
              <p className="text-xs text-muted">{t('setup.useSameProviderHint')}</p>
            </div>

            {!config.embedding.useGenerationProvider ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Select
                  label={t('setup.embeddingProvider')}
                  value={config.embedding.backend}
                  onChange={(event) => {
                    const provider = event.target.value as Provider
                    const defaults = providerDefaults(provider)
                    updateEmbedding({
                      backend: provider,
                      model: defaults.embedding,
                      size: defaults.size,
                    })
                  }}
                >
                  {PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {providerLabel(provider)}
                    </option>
                  ))}
                </Select>
                <Input
                  label={t('setup.embeddingModel')}
                  value={config.embedding.model}
                  onChange={(event) => updateEmbedding({ model: event.target.value })}
                />
                <Input
                  label={t('setup.embeddingSize')}
                  type="number"
                  min={1}
                  max={8192}
                  value={config.embedding.size}
                  onChange={(event) =>
                    updateEmbedding({ size: Number.parseInt(event.target.value, 10) || 0 })
                  }
                />
              </div>
            ) : (
              <p className="text-xs text-muted">
                {t('setup.embeddingInherited', {
                  provider: providerLabel(effectiveEmbeddingProvider),
                  model: config.embedding.model,
                  size: config.embedding.size,
                })}
              </p>
            )}

            <div className="flex flex-col gap-4">
              {requiredProviders.map((provider) => (
                <div key={provider} className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={`${providerLabel(provider)} ${t('setup.apiKey')}`}
                    type="password"
                    autoComplete="off"
                    value={keyInputs[provider]}
                    placeholder={
                      hasStoredKey(provider) ? t('setup.apiKeySaved') : t('setup.apiKeyPlaceholder')
                    }
                    onChange={(event) =>
                      setKeyInputs((prev) => ({ ...prev, [provider]: event.target.value }))
                    }
                  />
                  {provider === 'OPENAI' ? (
                    <Input
                      label={t('setup.baseUrl')}
                      value={openaiApiUrl}
                      placeholder="https://api.openai.com/v1"
                      onChange={(event) => setOpenaiApiUrl(event.target.value)}
                      hint={t('setup.baseUrlHint')}
                    />
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStep(0)}>
                {t('common.back')}
              </Button>
              <Button disabled={!providersReady} onClick={() => setStep(2)}>
                {t('common.next')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('setup.reviewTitle')}</CardTitle>
            <p className="text-sm text-muted">{t('setup.reviewDescription')}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">{t('setup.databaseTitle')}</dt>
                <dd className="font-medium text-fg">
                  {config.database.mode === 'docker'
                    ? `${t('setup.modeDocker')} · ${config.database.host}:${config.database.port}`
                    : `${config.database.host}:${config.database.port}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t('setup.generationProvider')}</dt>
                <dd className="font-medium text-fg">
                  {providerLabel(config.generation.backend)} · {config.generation.model}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t('setup.embeddingProvider')}</dt>
                <dd className="font-medium text-fg">
                  {providerLabel(effectiveEmbeddingProvider)} · {config.embedding.model} ·{' '}
                  {config.embedding.size}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t('setup.databaseName')}</dt>
                <dd className="font-medium text-fg">{config.database.name}</dd>
              </div>
            </dl>

            <p className="rounded-md border border-border bg-surface-2/50 p-3 text-xs text-muted">
              {t('setup.finishHint')}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                {t('common.back')}
              </Button>
              <Button loading={busy === 'save'} onClick={() => void saveAndFinish()}>
                {busy === 'save' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('setup.saving')}
                  </>
                ) : (
                  t('setup.saveFinish')
                )}
              </Button>
              <Button variant="outline" onClick={() => void bridge.openLogsFolder()}>
                <FolderOpen className="size-4" />
                {t('setup.openLogs')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-center text-xs text-muted">{t('setup.footerNote')}</p>
    </main>
  )
}
