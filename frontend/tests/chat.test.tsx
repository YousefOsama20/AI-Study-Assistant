import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatPage } from '@/pages/Chat'
import { useChatStore } from '@/stores/chat'
import { apiErrorFromResponse } from '@/lib/api/errors'
import type {
  AnswerResponse,
  ProjectSummaryResponse,
  SourceCitation,
} from '@/types/api'
import { renderAt } from './helpers'

const apiMock = vi.hoisted(() => ({
  answer: vi.fn(),
  summarize: vi.fn(),
}))

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return { ...actual, api: { ...actual.api, ...apiMock } }
})

const source: SourceCitation = {
  asset_id: 4,
  asset_uuid: 'asset-uuid-4',
  asset_name: 'stored_physics.pdf',
  original_filename: 'physics-notes.pdf',
  page_number: 3,
  chunk_text: 'Entanglement links particles across distance.',
  score: 0.7,
  chunk_index: 2,
  chunk_id: 21,
}

function answer(overrides: Partial<AnswerResponse> = {}): AnswerResponse {
  return {
    signal: 'success',
    answer: 'Entanglement is a quantum correlation.',
    sources: [source],
    chat_history: [],
    ...overrides,
  }
}

function summary(
  overrides: Partial<ProjectSummaryResponse> = {},
): ProjectSummaryResponse {
  return {
    signal: 'project_summary_success',
    summary: '## Overview\nA **bold** idea about entanglement.',
    documents: [
      {
        document_id: 4,
        filename: 'physics-notes.pdf',
        page_count: 10,
        chunk_count: 12,
        first_page: 1,
        last_page: 10,
      },
    ],
    chunk_count: 12,
    cached: false,
    truncated: false,
    language: 'en',
    generated_at: '2026-10-23T10:00:00Z',
    ...overrides,
  }
}

describe('ChatPage', () => {
  beforeEach(() => {
    apiMock.answer.mockReset()
    apiMock.summarize.mockReset()
    useChatStore.setState({ buckets: {} })
  })

  function renderChat() {
    return renderAt(<ChatPage />, '/projects/7/chat', '/projects/:projectId/chat')
  }

  it('submits on Enter and renders citations with page and score', async () => {
    apiMock.answer.mockResolvedValue(answer())
    const user = userEvent.setup()
    renderChat()

    const input = screen.getByRole('textbox')
    await user.type(input, 'What is entanglement?')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(apiMock.answer).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ text: 'What is entanglement?' }),
      )
    })

    expect(
      await screen.findByText('Entanglement is a quantum correlation.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sources/i }))

    expect(screen.getByText('physics-notes.pdf')).toBeInTheDocument()
    expect(screen.getByText(/Page 3/)).toBeInTheDocument()
    expect(screen.getByText('0.7000')).toBeInTheDocument()
    expect(
      screen.getByText('Entanglement links particles across distance.'),
    ).toBeInTheDocument()
  })

  it('keeps Shift+Enter as a newline and does not submit', async () => {
    const user = userEvent.setup()
    renderChat()

    const input = screen.getByRole('textbox')
    await user.type(input, 'Line one')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(input).toHaveValue('Line one\n')
    expect(apiMock.answer).not.toHaveBeenCalled()
  })

  it('retries the last question after a failure', async () => {
    apiMock.answer
      .mockRejectedValueOnce(new Error('backend unavailable'))
      .mockResolvedValueOnce(answer({ answer: 'Recovered answer.' }))

    const user = userEvent.setup()
    renderChat()

    await user.type(screen.getByRole('textbox'), 'Retry me')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('backend unavailable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByText('Recovered answer.')).toBeInTheDocument()
    expect(apiMock.answer).toHaveBeenCalledTimes(2)
  })

  it('maps rag_answer_error to an honest no-context message', async () => {
    apiMock.answer.mockRejectedValue(
      apiErrorFromResponse(500, { signal: 'rag_answer_error' }),
    )

    await useChatStore.getState().send(7, 'Unknown topic')

    const messages = useChatStore.getState().bucket(7).messages
    expect(messages).toHaveLength(2)
    expect(messages[1].noContext).toBe(true)
    expect(messages[1].sources).toBeUndefined()
  })

  it('isolates conversations per project', async () => {
    apiMock.answer.mockResolvedValue(answer({ answer: 'ok', sources: [] }))

    await useChatStore.getState().send(1, 'first project')
    await useChatStore.getState().send(2, 'second project')

    expect(useChatStore.getState().bucket(1).messages).toHaveLength(2)
    expect(useChatStore.getState().bucket(2).messages).toHaveLength(2)

    useChatStore.getState().clear(1)

    expect(useChatStore.getState().bucket(1).messages).toHaveLength(0)
    expect(useChatStore.getState().bucket(2).messages).toHaveLength(2)
  })

  it('summarizes the project from the chat header and renders the summary', async () => {
    apiMock.summarize.mockResolvedValue(summary())
    const user = userEvent.setup()
    renderChat()

    await user.click(
      screen.getAllByRole('button', { name: /summarize project/i })[0],
    )

    await waitFor(() => {
      expect(apiMock.summarize).toHaveBeenCalledWith(7, {
        language: 'en',
        forceRefresh: undefined,
      })
    })

    expect(await screen.findByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('bold')).toBeInTheDocument()
    expect(screen.getByText('physics-notes.pdf')).toBeInTheDocument()
    expect(screen.getByText('Project summary')).toBeInTheDocument()
  })

  it('shows a helpful message when the project has no processed chunks', async () => {
    apiMock.summarize.mockRejectedValue(
      apiErrorFromResponse(400, { signal: 'project_summary_no_chunks' }),
    )

    await useChatStore.getState().summarize(7, 'Summarize project', 'en')

    const messages = useChatStore.getState().bucket(7).messages
    expect(messages).toHaveLength(2)
    expect(messages[1].noSummaryChunks).toBe(true)
  })

  it('retries a failed project summary instead of a chat answer', async () => {
    apiMock.summarize
      .mockRejectedValueOnce(new Error('summary backend unavailable'))
      .mockResolvedValueOnce(summary({ summary: '## Overview\nRecovered summary.' }))

    const user = userEvent.setup()
    renderChat()

    await user.click(
      screen.getAllByRole('button', { name: /summarize project/i })[0],
    )

    expect(
      await screen.findByText(/could not be generated/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByText('Recovered summary.')).toBeInTheDocument()
    expect(apiMock.summarize).toHaveBeenCalledTimes(2)
    expect(apiMock.answer).not.toHaveBeenCalled()
  })
})
