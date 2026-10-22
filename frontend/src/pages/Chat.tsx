import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Send,
  Trash2,
  RotateCcw,
  MessagesSquare,
  BookOpenText,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { useChatStore, type ChatViewMessage } from '../stores/chat'
import { useI18n } from '../lib/i18n'
import { cn, formatScore } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'

function SourcePanel({
  message,
  projectId,
}: {
  message: ChatViewMessage
  projectId: number
}) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const sources = message.sources ?? []
  if (sources.length === 0) return null

  return (
    <div className="mt-3 rounded-md border border-border bg-surface-2/60">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-start text-sm font-medium text-fg"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <BookOpenText className="size-4 text-primary" aria-hidden="true" />
          {t('chat.sources')}
          <Badge variant="outline">{sources.length}</Badge>
        </span>
        {expanded ? (
          <ChevronUp className="size-4 text-muted" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4 text-muted" aria-hidden="true" />
        )}
      </button>
      {expanded ? (
        <ul className="divide-y divide-border border-t border-border">
          {sources.map((source, index) => (
            <li key={`${source.chunk_id ?? index}-${index}`} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-fg">
                  {source.original_filename || source.asset_name || '—'}
                  {source.page_number !== null ? (
                    <span className="ms-1.5 text-xs font-normal text-muted">
                      {t('common.page')} {source.page_number}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs tabular-nums text-muted">
                  {formatScore(source.score, locale)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {source.chunk_text}
              </p>
              {source.asset_id !== null ? (
                <button
                  type="button"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={() =>
                    navigate(
                      `/projects/${projectId}/documents?preview=${source.asset_id}&page=${source.page_number ?? 1}`,
                    )
                  }
                >
                  {t('search.viewInPreview')}
                  <ArrowRight className="size-3 rtl:rotate-180" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function MessageBubble({
  message,
  projectId,
  onRetry,
}: {
  message: ChatViewMessage
  projectId: number
  onRetry: () => void
}) {
  const { t } = useI18n()

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-ee-sm bg-primary px-4 py-2.5 text-sm text-white">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide opacity-70">
            {t('chat.userLabel')}
          </p>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  if (message.pending) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg rounded-ss-sm border border-border bg-surface px-4 py-2.5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            {t('chat.assistantLabel')}
          </p>
          <div className="flex items-center gap-1.5" aria-label={t('chat.sending')}>
            <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    )
  }

  if (message.noContext) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg rounded-ss-sm border border-warning/30 bg-warning-soft px-4 py-2.5 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-warning">
            <Info className="size-4" aria-hidden="true" />
            {t('chat.noContextTitle')}
          </p>
          <p className="mt-1 text-warning/90">{t('chat.noContextBody')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-lg rounded-ss-sm border border-border bg-surface px-4 py-2.5 text-sm">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
          {t('chat.assistantLabel')}
        </p>
        {message.error ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-start gap-1.5 text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {message.content}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {t('chat.retry')}
            </Button>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            <SourcePanel message={message} projectId={projectId} />
          </>
        )}
      </div>
    </div>
  )
}

const suggestionKeys = [
  'chat.suggestions1',
  'chat.suggestions2',
  'chat.suggestions3',
] as const

export function ChatPage() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const projectId = Number(projectIdParam)
  const { t } = useI18n()

  const bucket = useChatStore((s) => s.buckets[projectId])
  const send = useChatStore((s) => s.send)
  const retry = useChatStore((s) => s.retry)
  const clear = useChatStore((s) => s.clear)

  const [input, setInput] = useState('')
  const [clearOpen, setClearOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  const messages = bucket?.messages ?? []
  const pending = bucket?.pending ?? false

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !stickToBottomRef.current) return
    element.scrollTop = element.scrollHeight
  }, [messages])

  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    stickToBottomRef.current = distance < 80
  }, [])

  const submit = async () => {
    const text = input.trim()
    if (!text || pending) return
    stickToBottomRef.current = true
    setInput('')
    await send(projectId, text)
  }

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fg">{t('chat.title')}</h2>
          <p className="text-sm text-muted">{t('chat.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">
            {t('chat.sessionOnlyNote')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setClearOpen(true)}
            disabled={messages.length === 0}
            icon={<Trash2 className="size-3.5" />}
          >
            {t('chat.clear')}
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto rounded-lg border border-border bg-surface-2/40 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <EmptyState
              icon={MessagesSquare}
              title={t('chat.emptyTitle')}
              body={t('chat.emptyBody')}
              className="border-none bg-transparent"
            />
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {suggestionKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    const text = t(key)
                    setInput(text)
                    void send(projectId, text)
                  }}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:border-primary/40 hover:text-fg"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                projectId={projectId}
                onRetry={() => void retry(projectId)}
              />
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder={t('chat.placeholder')}
          rows={2}
          className={cn(
            'min-h-11 flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg',
            'placeholder:text-muted/70',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
          aria-label={t('chat.placeholder')}
        />
        <Button
          type="submit"
          loading={pending}
          disabled={!input.trim() || pending}
          icon={<Send className="size-4" />}
        >
          {pending ? t('chat.sending') : t('chat.send')}
        </Button>
      </form>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={t('chat.clearConfirmTitle')}
        body={t('chat.clearConfirmBody')}
        confirmLabel={t('chat.clear')}
        danger
        onConfirm={() => {
          clear(projectId)
          setClearOpen(false)
        }}
      />
    </div>
  )
}
