import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useBackendStore } from '../stores/backend'
import { useSettingsStore } from '../stores/settings'
import { pushToast } from '../stores/toasts'
import { useI18n, type Language } from '../lib/i18n'
import { cn, formatBytes } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { RangeSlider } from '../components/ui/RangeSlider'
import { Select } from '../components/ui/Select'
import { Switch } from '../components/ui/Switch'
import type { ThemePreference, Density } from '../stores/settings'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-end font-medium text-fg">{value}</span>
    </div>
  )
}

export function SettingsPage() {
  const { t, locale } = useI18n()

  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const language = useSettingsStore((s) => s.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const density = useSettingsStore((s) => s.density)
  const setDensity = useSettingsStore((s) => s.setDensity)
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion)
  const defaultSearchLimit = useSettingsStore((s) => s.defaultSearchLimit)
  const setDefaultSearchLimit = useSettingsStore(
    (s) => s.setDefaultSearchLimit,
  )
  const defaultSearchThreshold = useSettingsStore(
    (s) => s.defaultSearchThreshold,
  )
  const setDefaultSearchThreshold = useSettingsStore(
    (s) => s.setDefaultSearchThreshold,
  )

  const health = useBackendStore((s) => s.health)
  const data = useBackendStore((s) => s.data)
  const systemInfo = useBackendStore((s) => s.systemInfo)
  const systemInfoError = useBackendStore((s) => s.systemInfoError)
  const restarting = useBackendStore((s) => s.restarting)

  useEffect(() => {
    void useBackendStore.getState().check()
    void useBackendStore.getState().loadSystemInfo()
  }, [])

  const canRestart =
    typeof window !== 'undefined' && Boolean(window.aiStudyAssistant)

  const healthLabel =
    health === 'ok'
      ? t('settings.healthOk')
      : health === 'degraded'
        ? t('settings.healthDegraded')
        : health === 'unreachable'
          ? t('settings.healthUnreachable')
          : t('backend.checking')

  async function handleRestart() {
    const ok = await useBackendStore.getState().restart()
    if (ok) {
      pushToast({
        kind: 'success',
        title: t('backend.restartSuccess'),
      })
    } else {
      pushToast({
        kind: 'error',
        title: t('backend.restartFailed'),
        action: {
          label: t('common.retry'),
          onClick: () => void handleRestart(),
        },
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{t('settings.title')}</h1>
        <p className="text-sm text-muted">{t('settings.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.appearance')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Select
            label={t('settings.theme')}
            value={theme}
            onChange={(event) =>
              setTheme(event.target.value as ThemePreference)
            }
          >
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
            <option value="system">{t('settings.themeSystem')}</option>
          </Select>
          <Select
            label={t('settings.density')}
            value={density}
            onChange={(event) => setDensity(event.target.value as Density)}
          >
            <option value="comfortable">
              {t('settings.densityComfortable')}
            </option>
            <option value="compact">{t('settings.densityCompact')}</option>
          </Select>
          <div className="flex flex-col gap-1.5">
            <Switch
              checked={reducedMotion}
              onCheckedChange={setReducedMotion}
              label={t('settings.reducedMotion')}
            />
            <p className="text-xs text-muted">
              {t('settings.reducedMotionHint')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.language')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            label={t('settings.language')}
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            <option value="en">{t('settings.languageEnglish')}</option>
            <option value="ar">{t('settings.languageArabic')}</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.searchDefaults')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Input
            type="number"
            min={1}
            max={20}
            label={t('settings.defaultSearchLimit')}
            value={defaultSearchLimit}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10)
              if (!Number.isNaN(parsed)) setDefaultSearchLimit(parsed)
            }}
          />
          <RangeSlider
            label={t('settings.defaultSearchThreshold')}
            value={defaultSearchThreshold}
            min={0}
            max={1}
            step={0.05}
            onChange={setDefaultSearchThreshold}
            formatValue={(value) => value.toFixed(2)}
            hint={t('search.thresholdHint')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.backendSection')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2" role="status">
            <span
              className={cn(
                'size-2 rounded-full',
                health === 'ok'
                  ? 'bg-success'
                  : health === 'degraded'
                    ? 'bg-warning'
                    : health === 'unreachable'
                      ? 'bg-danger'
                      : 'bg-muted animate-pulse',
              )}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-fg">{healthLabel}</span>
          </div>

          {data ? (
            <div className="flex flex-col gap-2">
              <InfoRow
                label={t('backend.database')}
                value={
                  data.database.connected
                    ? t('backend.connectedLabel')
                    : t('backend.notConnectedLabel')
                }
              />
              <InfoRow
                label={t('backend.vectordb')}
                value={`${data.vectordb.backend} · ${
                  data.vectordb.connected
                    ? t('backend.connectedLabel')
                    : t('backend.notConnectedLabel')
                }`}
              />
              <InfoRow
                label={t('backend.generationProvider')}
                value={`${data.generation.backend} · ${data.generation.model ?? ''}`}
              />
              <InfoRow
                label={t('backend.embeddingProvider')}
                value={`${data.embedding.backend} · ${data.embedding.model ?? ''}`}
              />
              <InfoRow
                label={t('settings.versionLabel')}
                value={data.app.version}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void useBackendStore.getState().check()}
            >
              {t('settings.healthCheck')}
            </Button>
            {canRestart ? (
              <Button
                variant="outline"
                loading={restarting}
                onClick={() => void handleRestart()}
              >
                {t('backend.restart')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {systemInfo ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.uploadLimits')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <InfoRow
                label={t('settings.maxFileSize')}
                value={formatBytes(
                  systemInfo.upload.max_size_mb * 1024 * 1024,
                  locale,
                )}
              />
              <InfoRow
                label={t('settings.allowedTypes')}
                value={systemInfo.upload.allowed_types.join(', ')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.providerInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <InfoRow
                label={t('backend.generationProvider')}
                value={`${systemInfo.providers.generation_backend} · ${systemInfo.providers.generation_model ?? ''}`}
              />
              <InfoRow
                label={t('backend.embeddingProvider')}
                value={`${systemInfo.providers.embedding_backend} · ${systemInfo.providers.embedding_model ?? ''}`}
              />
              <InfoRow
                label={t('settings.embeddingSize')}
                value={
                  systemInfo.providers.embedding_size != null
                    ? String(systemInfo.providers.embedding_size)
                    : '—'
                }
              />
              <InfoRow
                label={t('backend.vectordb')}
                value={systemInfo.vectordb.backend}
              />
              <InfoRow
                label={t('settings.distanceMethod')}
                value={systemInfo.vectordb.distance_method ?? '—'}
              />
              <p className="pt-2 text-xs text-muted">
                {t('settings.secretsNote')}
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}

      {systemInfoError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {systemInfoError}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void useBackendStore.getState().loadSystemInfo()}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted">{t('settings.configHint')}</p>
    </div>
  )
}
