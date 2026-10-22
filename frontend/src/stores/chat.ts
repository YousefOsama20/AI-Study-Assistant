import { create } from 'zustand'
import { api, ApiError } from '../lib/api/client'
import type { ChatHistoryMessage, SourceCitation } from '../types/api'
import { useSettingsStore } from './settings'

export interface ChatViewMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceCitation[]
  noContext?: boolean
  error?: boolean
  pending?: boolean
}

export interface ChatBucket {
  messages: ChatViewMessage[]
  pending: boolean
  error: string | null
  lastUserText: string | null
}

function emptyBucket(): ChatBucket {
  return { messages: [], pending: false, error: null, lastUserText: null }
}

interface ChatState {
  buckets: Record<number, ChatBucket>
  bucket: (projectId: number) => ChatBucket
  send: (projectId: number, text: string) => Promise<void>
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

  async function requestAnswer(projectId: number, text: string): Promise<void> {
    const bucket = get().bucket(projectId)
    const settings = useSettingsStore.getState()

    const history: ChatHistoryMessage[] = bucket.messages
      .filter((m) => !m.pending && !m.error && !m.noContext)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }))

    const userMessage: ChatViewMessage = { id: nextId(), role: 'user', content: text }
    const pendingId = nextId()
    const pendingMessage: ChatViewMessage = {
      id: pendingId,
      role: 'assistant',
      content: '',
      pending: true,
    }

    update(projectId, {
      messages: [...bucket.messages, userMessage, pendingMessage],
      pending: true,
      error: null,
      lastUserText: text,
    })

    try {
      const response = await api.answer(projectId, {
        text,
        limit: settings.defaultSearchLimit,
        chatHistory: history,
      })
      update(projectId, {
        pending: false,
        messages: get()
          .bucket(projectId)
          .messages.map((m) =>
            m.id === pendingId
              ? {
                  id: pendingId,
                  role: 'assistant' as const,
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
          messages: get()
            .bucket(projectId)
            .messages.map((m) =>
              m.id === pendingId
                ? {
                    id: pendingId,
                    role: 'assistant' as const,
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
        error: message,
        messages: get()
          .bucket(projectId)
          .messages.map((m) =>
            m.id === pendingId
              ? {
                  id: pendingId,
                  role: 'assistant' as const,
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

    send: async (projectId, text) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (get().bucket(projectId).pending) return
      await requestAnswer(projectId, trimmed)
    },

    retry: async (projectId) => {
      const bucket = get().bucket(projectId)
      if (bucket.pending) return
      const last = bucket.lastUserText
      if (!last) return
      // Drop trailing error/assistant+user pair from the failed attempt
      const messages = [...bucket.messages]
      while (
        messages.length > 0 &&
        (messages[messages.length - 1].error ||
          messages[messages.length - 1].pending ||
          (messages[messages.length - 1].role === 'assistant' &&
            messages[messages.length - 1].noContext))
      ) {
        messages.pop()
      }
      if (
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' &&
        messages[messages.length - 1].content === last
      ) {
        messages.pop()
      }
      update(projectId, { messages, lastUserText: null })
      await requestAnswer(projectId, last)
    },

    clear: (projectId) =>
      set((s) => ({
        buckets: { ...s.buckets, [projectId]: emptyBucket() },
      })),
  }
})
