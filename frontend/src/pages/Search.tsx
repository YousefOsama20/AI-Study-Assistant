import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Search as SearchIcon,
  Layers,
  FileText,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import { useSearchStore } from '../stores/search'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../lib/i18n'
import { cn, formatScore, truncate } from '../lib/utils'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { RangeSlider } from '../components/ui/RangeSlider'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'

export function SearchPage() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const projectId = Number(projectIdParam)
  const { t, locale } = useI18n()
  const navigate = useNavigate()

  const bucket = useSearchStore((s) => s.buckets[projectId])
  const setQuery = useSearchStore((s) => s.setQuery)
  const setLimit = useSearchStore((s) => s.setLimit)
  const setThreshold = useSearchStore((s) => s.setThreshold)
  const run = useSearchStore((s) => s.run)
  const setDefaultSearchLimit = useSettingsStore((s) => s.setDefaultSearchLimit)
  const setDefaultSearchThreshold = useSettingsStore(
    (s) => s.setDefaultSearchThreshold,
  )

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const query = bucket?.query ?? ''
  const limit = bucket?.limit ?? 5
  const threshold = bucket?.threshold ?? 0.2
  const results = bucket?.results ?? []
  const searched = bucket?.searched ?? false
  const loading = bucket?.loading ?? false
  const error = bucket?.error ?? null
  const noIndex = bucket?.noIndex ?? false

  const submit = async () => {
    if (!query.trim() || loading) return
    setSubmitting(true)
    try {
      await run(projectId)
    } finally {
      setSubmitting(false)
    }
  }

  const hasQuery = query.trim().length > 0
  const showNoResults =
    searched && !loading && !error && !noIndex && results.length === 0

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-fg">{t('search.title')}</h2>
        <p className="text-sm text-muted">{t('search.subtitle')}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <Input
                ref={inputRef}
                label={t('search.queryLabel')}
                placeholder={t('search.queryPlaceholder')}
                value={query}
                onChange={(event) => setQuery(projectId, event.target.value)}
              />
            </div>
            <Button
              type="submit"
              loading={loading || submitting}
              disabled={!hasQuery}
              icon={<SearchIcon className="size-4" />}
              className="sm:self-end"
            >
              {loading ? t('search.searching') : t('search.submit')}
            </Button>
          </form>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('search.limitLabel')}
              type="number"
              min={1}
              max={20}
              value={limit}
              onChange={(event) => {
                const parsed = Number(event.target.value)
                if (Number.isFinite(parsed)) {
                  setLimit(projectId, parsed)
                  setDefaultSearchLimit(parsed)
                }
              }}
            />
            <RangeSlider
              label={t('search.thresholdLabel')}
              value={threshold}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) => {
                setThreshold(projectId, value)
                setDefaultSearchThreshold(value)
              }}
              hint={t('search.thresholdHint')}
              formatValue={(value) => value.toFixed(2)}
            />
          </div>
        </CardContent>
      </Card>

      {noIndex ? (
        <EmptyState
          icon={Layers}
          title={t('search.noIndexTitle')}
          body={t('search.noIndexBody')}
          action={
            <Button
              onClick={() => navigate(`/projects/${projectId}/documents`)}
              icon={<ArrowRight className="size-4 rtl:rotate-180" />}
            >
              {t('nav.documents')}
            </Button>
          }
        />
      ) : error ? (
        <Card className="border-danger/30">
          <CardContent
            role="alert"
            className="flex items-center justify-between gap-3"
          >
            <p className="flex items-center gap-2 text-sm text-danger">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={() => void submit()}>
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !searched ? (
        <EmptyState
          icon={SearchIcon}
          title={t('search.emptyTitle')}
          body={t('search.emptyBody')}
        />
      ) : showNoResults ? (
        <EmptyState
          icon={SearchIcon}
          title={t('search.noResultsTitle')}
          body={t('search.noResultsBody')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {t('search.resultCount', { count: results.length })}
          </p>
          {results.map((result, index) => (
            <Card key={`${result.chunk_id ?? index}-${index}`}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-surface-2 p-1.5 text-muted">
                      <FileText className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-medium text-fg">
                      {result.original_filename || result.asset_name || '—'}
                    </span>
                    {result.page_number !== null ? (
                      <Badge variant="outline">
                        {t('common.page')} {result.page_number}
                      </Badge>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      result.score >= 0.7
                        ? 'text-info'
                        : result.score >= 0.4
                          ? 'text-warning'
                          : 'text-muted',
                    )}
                    title={t('common.similarity')}
                  >
                    {formatScore(result.score, locale)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {truncate(result.text, 600)}
                </p>
                {result.page_number !== null || result.asset_id !== null ? (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/projects/${projectId}/documents?preview=${result.asset_id}&page=${result.page_number ?? 1}`,
                        )
                      }
                      icon={<ArrowRight className="size-3.5 rtl:rotate-180" />}
                    >
                      {t('search.viewInPreview')}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
