import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { DocumentsPage } from '@/pages/Documents'
import { DocumentStatusBadge } from '@/components/documents/DocumentStatusBadge'
import { useBackendStore } from '@/stores/backend'
import { useDocumentsStore, type DocumentBucket } from '@/stores/documents'
import type { DocumentItem, ProcessingStatus, SystemInfoResponse } from '@/types/api'
import { renderAt, renderWithProviders } from './helpers'

const systemInfo: SystemInfoResponse = {
  app_name: 'Mini-RAG',
  version: '1.0.0',
  upload: { max_size_mb: 10, allowed_types: ['application/pdf'] },
  providers: {
    generation_backend: 'gemini',
    generation_model: 'gemini-2.0-flash',
    embedding_backend: 'gemini',
    embedding_model: 'text-embedding-004',
    embedding_size: 768,
  },
  vectordb: { backend: 'pgvector', distance_method: 'cosine' },
  preview: { max_pages: 10, dpi: 150, format: 'PNG' },
  chunking: { default_size: 1000, default_overlap: 200 },
}

function makeDocument(status: ProcessingStatus): DocumentItem {
  return {
    document_id: 11,
    document_uuid: 'uuid-11',
    original_filename: 'notes.pdf',
    stored_filename: 'stored_notes.pdf',
    file_size: 1024,
    page_count: 4,
    status,
    error_message: null,
    preview_image_count: 4,
    created_at: '2026-01-01T00:00:00',
    updated_at: null,
  }
}

function bucketWith(document: DocumentItem): DocumentBucket {
  return {
    documents: [document],
    loading: false,
    error: null,
    uploading: false,
    uploadProgress: null,
    processing: false,
    indexing: false,
    indexLoading: false,
    indexError: null,
    indexRecordCount: null,
    indexSignature: null,
    busy: {},
  }
}

describe('DocumentStatusBadge', () => {
  it.each([
    ['uploaded', 'Uploaded'],
    ['extracting', 'Extracting'],
    ['chunking', 'Chunking'],
    ['embedding', 'Embedding'],
    ['indexing', 'Indexing'],
    ['ready', 'Ready'],
    ['failed', 'Failed'],
  ] as const)('renders the %s label', (status, label) => {
    renderWithProviders(<DocumentStatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('document polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useBackendStore.setState({ systemInfo, health: 'ok' })
  })

  afterEach(() => {
    vi.useRealTimers()
    useDocumentsStore.setState({ buckets: {} })
  })

  it('polls while a document is processing and stops on unmount', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    useDocumentsStore.setState({
      load: load as unknown as (projectId: number) => Promise<void>,
      buckets: { 7: bucketWith(makeDocument('embedding')) },
    })

    const { unmount } = renderAt(
      <DocumentsPage />,
      '/projects/7/documents',
      '/projects/:projectId/documents',
    )

    expect(load).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(4_000)
    })
    expect(load).toHaveBeenCalledTimes(2)

    unmount()
    act(() => {
      vi.advanceTimersByTime(12_000)
    })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not poll when every document is settled', () => {
    const load = vi.fn().mockResolvedValue(undefined)
    useDocumentsStore.setState({
      load: load as unknown as (projectId: number) => Promise<void>,
      buckets: { 7: bucketWith(makeDocument('ready')) },
    })

    renderAt(
      <DocumentsPage />,
      '/projects/7/documents',
      '/projects/:projectId/documents',
    )

    expect(load).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(12_000)
    })
    expect(load).toHaveBeenCalledTimes(1)
  })
})
