import { create } from 'zustand'
import { api, ApiError } from '../lib/api/client'
import type {
  ChatHistoryMessage,
  SourceCitation,
  SummaryDocument,
} from '../types/api'

export interface SummaryMeta {
  cached: boolean
  truncated: boolean
  chunkCount: number
  generatedAt: string
}

export interface ChatViewMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  kind?: 'answer' | 'summary'
  sources?: SourceCitation[]
  documents?: SummaryDocument[]
  summaryMeta?: SummaryMeta
  noContext?: boolean
  noSummaryChunks?: boolean
  error?: boolean
  pending?: boolean
}

interface ChatRequest {
  kind: 'answer' | 'summary'
  text: string
  language?: string
  forceRefresh?: boolean
}

export interface ChatBucket {
  messages: ChatViewMessage[]
  pending: boolean
  pendingAction: ChatRequest['kind'] | null
  error: string | null
  lastRequest: ChatRequest | null
}

function emptyBucket(): ChatBucket {
  return {
    messages: [],
    pending: false,
    pendingAction: null,
    error: null,
    lastRequest: null,
  }
}

interface ChatState {
  buckets: Record<number, ChatBucket>
  bucket: (projectId: number) => ChatBucket
  send: (projectId: number, text: string, language?: string) => Promise<void>
  summarize: (
    projectId: number,
    displayText: string,
    language?: string,
    forceRefresh?: boolean,
  ) => Promise<void>
  retry: (projectId: number) => Promise<void>
  clear: (projectId: number) => void
}

let messageCounter = 0
function nextId(): string {
  messageCounter += 1
  return `msg-${messageCounter}`
}

export const useChatStore = create<ChatState>()((set, get) => {
  function update(projectId: number, patch: Partial<ChatBucket>): void {
    set((s) => ({
      buckets: {
        ...s.buckets,
        [projectId]: { ...(s.buckets[projectId] ?? emptyBucket()), ...patch },
      },
    }))
  }

  function buildHistory(projectId: number): ChatHistoryMessage[] {
    return get()
      .bucket(projectId)
      .messages.filter((m) => !m.pending && !m.error && !m.noContext && !m.noSummaryChunks)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }))
  }

  async function requestAnswer(
    projectId: number,
    text: string,
    language?: string,
  ): Promise<void> {
    const bucket = get().bucket(projectId)
    const history = buildHistory(projectId)

    const userMessage: ChatViewMessage = {
      id: nextId(),
      role: 'user',
      content: text,
    }
    const pendingId = nextId()
    const pendingMessage: ChatViewMessage = {
      id: pendingId,
      role: 'assistant',
      content: '',
      kind: 'answer',
      pending: true,
    }

    update(projectId, {
      messages: [...bucket.messages, userMessage, pendingMessage],
      pending: true,
      pendingAction: 'answer',
      error: null,
      lastRequest: { kind: 'answer', text, language },
    })

    try {
      const response = await api.answer(projectId, {
        text,
        chatHistory: history,
        language,
      })
      update(projectId, {
        pending: false,
        pendingAction: null,
        messages: get()
          .bucket(projectId)
          .messages.map((m) =>
            m.id === pendingId
              ? {
                  id: pendingId,
                  role: 'assistant' as const,
                  kind: 'answer' as const,
                  content: response.answer,
                  sources: response.sources,
                }
              : m,
          ),
      })
    } catch (error) {
      if (error instanceof ApiError && error.isNoContext()) {
        update(projectId, {
          pending: false,
          pendingAction: null,
          messages: get()
            .bucket(projectId)
            .messages.map((m) =>
              m.id === pendingId
                ? {
                    id: pendingId,
                    role: 'assistant' as const,
                    kind: 'answer' as const,
                    content: '',
                    noContext: true,
                  }
                : m,
            ),
        })
        return
      }
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'The answer request failed.'
      update(projectId, {
        pending: false,
        pendingAction: null,
        error: message,
        messages: get()
          .bucket(projectId)
          .messages.map((m) =>
            m.id === pendingId
              ? {
                  id: pendingId,
                  role: 'assistant' as const,
                  kind: 'answer' as const,
                  content: message,
                  error: true,
                }
              : m,
          ),
      })
    }
  }

  async function requestSummary(
    projectId: number,
    text: string,
    language?: string,
    forceRefresh?: boolean,
  ): Promise<void> {
    const bucket = get().bucket(projectId)

    const userMessage: ChatViewMessage = {
      id: nextId(),
      role: 'user',
      content: text,
    }
    const pendingId = nextId()
    const pendingMessage: ChatViewMessage = {
      id: pendingId,
      role: 'assistant',
      content: '',
      kind: 'summary',
      pending: true,
    }

    update(projectId, {
      messages: [...bucket.messages, userMessage, pendingMessage],
      pending: true,
      pendingAction: 'summary',
      error: null,
      lastRequest: { kind: 'summary', text, language, forceRefresh },
    })

    try {
      const response = await api.summarize(projectId, { language, forceRefresh })
      update(projectId, {
        pending: false,
        pendingAction: null,
        messages: get()
          .bucket(projectId)
          .messages.map((m) =>
            m.id === pendingId
              ? {
                  id: pendingId,
                  role: 'assistant' as const,
                  kind: 'summary' as const,
                  content: response.summary,
                  documents: response.documents,
                  summaryMeta: {
                    cached: response.cached,
                    truncated: response.truncated,
                    chunkCount: response.chunk_count,
                    generatedAt: response.generated_at,
                  },
                }
              : m,
          ),
      })
    } catch (error) {
      if (error instanceof ApiError && error.isNoSummaryChunks()) {
        update(projectId, {
          pending: false,
          pendingAction: null,
          messages: get()
            .bucket(projectId)
            .messages.map((m) =>
              m.id === pendingId
                ? {
                    id: pendingId,
                    role: 'assistant' as const,
                    kind: 'summary' as const,
                    content: '',
                    noSummaryChunks: true,
                  }
                : m,
            ),
        })
        return
      }
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'The summary request failed.'
      update(projectId, {
        pending: false,
        pendingAction: null,
        error: message,
        messages: get()
          .bucket(projectId)
          .messages.map((m) =>
            m.id === pendingId
              ? {
                  id: pendingId,
                  role: 'assistant' as const,
                  kind: 'summary' as const,
                  content: message,
                  error: true,
                }
              : m,
          ),
      })
    }
  }

  return {
    buckets: {},

    bucket: (projectId) => get().buckets[projectId] ?? emptyBucket(),

    send: async (projectId, text, language) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (get().bucket(projectId).pending) return
      await requestAnswer(projectId, trimmed, language)
    },

    summarize: async (projectId, displayText, language, forceRefresh) => {
      if (get().bucket(projectId).pending) return
      await requestSummary(projectId, displayText, language, forceRefresh)
    },

    retry: async (projectId) => {
      const bucket = get().bucket(projectId)
      if (bucket.pending) return
      const request = bucket.lastRequest
      if (!request) return

      const messages = [...bucket.messages]
      while (
        messages.length > 0 &&
        (messages[messages.length - 1].error ||
          messages[messages.length - 1].pending ||
          ((messages[messages.length - 1].role === 'assistant' ||
            messages[messages.length - 1].role === 'user') &&
            (messages[messages.length - 1].noContext ||
              messages[messages.length - 1].noSummaryChunks)))
      ) {
        messages.pop()
      }
      while (
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' &&
        messages[messages.length - 1].content === request.text
      ) {
        messages.pop()
      }

      update(projectId, { messages, lastRequest: null })
      if (request.kind === 'summary') {
        await requestSummary(
          projectId,
          request.text,
          request.language,
          request.forceRefresh,
        )
      } else {
        await requestAnswer(projectId, request.text, request.language)
      }
    },

    clear: (projectId) =>
      set((s) => ({
        buckets: { ...s.buckets, [projectId]: emptyBucket() },
      })),
  }
})
