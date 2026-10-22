import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { SearchPage } from '@/pages/Search'
import { useSearchStore, type SearchBucket } from '@/stores/search'
import { apiErrorFromResponse } from '@/lib/api/errors'
import type { SearchResultItem } from '@/types/api'
import { renderAt } from './helpers'

const apiMock = vi.hoisted(() => ({
  search: vi.fn(),
}))

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return { ...actual, api: { ...actual.api, ...apiMock } }
})

const result: SearchResultItem = {
  text: 'Quantum entanglement links particles across distance.',
  score: 0.8123,
  asset_id: 4,
  asset_uuid: 'asset-uuid-4',
  asset_name: 'stored_physics.pdf',
  original_filename: 'physics-notes.pdf',
  page_number: 3,
  chunk_index: 7,
  chunk_id: 99,
}

function bucket(patch: Partial<SearchBucket> = {}): SearchBucket {
  return {
    query: 'quantum entanglement',
    limit: 5,
    threshold: 0.2,
    results: [],
    searched: true,
    loading: false,
    error: null,
    noIndex: false,
    ...patch,
  }
}

describe('SearchPage', () => {
  beforeEach(() => {
    apiMock.search.mockReset()
    useSearchStore.setState({ buckets: {} })
  })

  it('renders filename, page, score, and snippet', () => {
    useSearchStore.setState({ buckets: { 7: bucket({ results: [result] }) } })

    renderAt(<SearchPage />, '/projects/7/search', '/projects/:projectId/search')

    expect(screen.getByText('physics-notes.pdf')).toBeInTheDocument()
    expect(screen.getByText(/Page 3/)).toBeInTheDocument()
    expect(screen.getByText('0.8123')).toBeInTheDocument()
    expect(screen.getByText(/Quantum entanglement/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view page/i })).toBeInTheDocument()
  })

  it('shows the no-index state with a link to documents', () => {
    useSearchStore.setState({ buckets: { 7: bucket({ noIndex: true }) } })

    renderAt(<SearchPage />, '/projects/7/search', '/projects/:projectId/search')

    expect(screen.getByText(/search index not built/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /documents/i })).toBeInTheDocument()
  })

  it('maps the vector-index error to the no-index state', async () => {
    useSearchStore.setState({ buckets: { 7: bucket() } })
    apiMock.search.mockRejectedValue(
      apiErrorFromResponse(500, { signal: 'vectordb_search_error' }),
    )

    await useSearchStore.getState().run(7, 'quantum')

    const state = useSearchStore.getState().bucket(7)
    expect(state.noIndex).toBe(true)
    expect(state.error).toBeNull()
    expect(state.results).toEqual([])
  })

  it('stores successful results for the right project only', async () => {
    useSearchStore.setState({ buckets: { 7: bucket({ query: 'quantum' }) } })
    apiMock.search.mockResolvedValue({ signal: 'success', results: [result] })

    await useSearchStore.getState().run(7)

    expect(useSearchStore.getState().bucket(7).results).toEqual([result])
    expect(useSearchStore.getState().bucket(8).results).toEqual([])
    expect(apiMock.search).toHaveBeenCalledWith(7, {
      text: 'quantum',
      limit: 5,
      similarityThreshold: 0.2,
    })
  })
})
