import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentsPage } from '@/pages/Documents'
import { useDocumentsStore } from '@/stores/documents'
import { useBackendStore } from '@/stores/backend'
import { useToastsStore } from '@/stores/toasts'
import type { SystemInfoResponse } from '@/types/api'
import { renderAt } from './helpers'

const apiMock = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  getIndexInfo: vi.fn(),
  deleteDocument: vi.fn(),
  reprocessDocument: vi.fn(),
  processProject: vi.fn(),
  pushIndex: vi.fn(),
}))

const uploadMock = vi.hoisted(() => ({
  uploadProjectFiles: vi.fn(),
}))

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return {
    ...actual,
    ...apiMock,
    uploadProjectFiles: uploadMock.uploadProjectFiles,
    api: { ...actual.api, ...apiMock },
  }
})

const systemInfo: SystemInfoResponse = {
  app_name: 'Mini-RAG',
  version: '1.0.0',
  upload: { max_size_mb: 10, allowed_types: ['application/pdf'] },
  providers: {
    generation_backend: 'gemini',
    generation_model: 'gemini-2.0-flash',
    embedding_backend: 'huggingface',
    embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
    embedding_size: 384,
  },
  vectordb: { backend: 'pgvector', distance_method: 'cosine' },
  preview: { max_pages: 10, dpi: 144, format: 'png' },
  chunking: { default_size: 1000, default_overlap: 200 },
}

describe('upload validation', () => {
  beforeEach(() => {
    apiMock.listDocuments.mockReset().mockResolvedValue({ documents: [], total: 0 })
    apiMock.getIndexInfo.mockReset().mockResolvedValue({
      signal: 'success',
      collection_info: { record_count: 0 },
    })
    uploadMock.uploadProjectFiles.mockReset()

    useDocumentsStore.setState({
      buckets: {
        7: {
          documents: [],
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
        },
      },
    })
    useBackendStore.setState({
      systemInfo,
      systemInfoError: null,
      health: 'ok',
    })
    useToastsStore.setState({ toasts: [] })
  })

  function fileInput(): HTMLInputElement {
    return screen.getByTestId('pdf-upload-input') as HTMLInputElement
  }

  it('rejects non-PDF files with a warning toast', async () => {
    renderAt(<DocumentsPage />, '/projects/7/documents', '/projects/:projectId/documents')

    const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(fileInput(), { target: { files: [textFile] } })

    await waitFor(() => {
      const toasts = useToastsStore.getState().toasts
      expect(toasts.some((toast) => /pdf/i.test(toast.title))).toBe(true)
      expect(toasts.some((toast) => toast.kind === 'warning')).toBe(true)
    })
    expect(uploadMock.uploadProjectFiles).not.toHaveBeenCalled()
  })

  it('rejects oversize PDFs and reports the limit', async () => {
    const user = userEvent.setup()
    renderAt(<DocumentsPage />, '/projects/7/documents', '/projects/:projectId/documents')

    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', {
      type: 'application/pdf',
    })
    await user.upload(fileInput(), big)

    await waitFor(() => {
      const toasts = useToastsStore.getState().toasts
      expect(
        toasts.some(
          (toast) =>
            (toast.title.includes('big.pdf') ||
              /10/.test(toast.description ?? '')) &&
            toast.kind === 'error',
        ),
      ).toBe(true)
    })
    expect(uploadMock.uploadProjectFiles).not.toHaveBeenCalled()
  })

  it('accepts multiple PDFs and forwards them to the upload API', async () => {
    uploadMock.uploadProjectFiles.mockResolvedValue({
      signal: 'success',
      files: [
        { filename: 'a.pdf', file_id: 'f1', document_id: 1, duplicate: false },
        { filename: 'b.pdf', file_id: 'f2', document_id: 2, duplicate: true },
      ],
    })
    apiMock.listDocuments.mockResolvedValue({ documents: [], total: 0 })

    const user = userEvent.setup()
    renderAt(<DocumentsPage />, '/projects/7/documents', '/projects/:projectId/documents')

    const files = [
      new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }),
      new File([new Uint8Array([2])], 'b.pdf', { type: 'application/pdf' }),
    ]
    await user.upload(fileInput(), files)

    await waitFor(() => {
      expect(uploadMock.uploadProjectFiles).toHaveBeenCalledWith(7, files, expect.anything())
    })
  })

  it('shows upload progress reported by the API', async () => {
    let resolveUpload: (value: unknown) => void = () => {}
    uploadMock.uploadProjectFiles.mockImplementation(
      (
        _projectId: number,
        _files: File[],
        options?: { onProgress?: (progress: { percent: number }) => void },
      ) =>
        new Promise((resolve) => {
          resolveUpload = resolve
          options?.onProgress?.({ percent: 50 })
        }),
    )

    const user = userEvent.setup()
    renderAt(<DocumentsPage />, '/projects/7/documents', '/projects/:projectId/documents')

    await user.upload(
      fileInput(),
      new File([new Uint8Array([4])], 'progress.pdf', {
        type: 'application/pdf',
      }),
    )

    expect(await screen.findByTestId('upload-progress')).toBeInTheDocument()
    expect(await screen.findByText('50%')).toBeInTheDocument()

    resolveUpload({ signal: 'success', files: [] })
    await waitFor(() => {
      expect(screen.queryByTestId('upload-progress')).not.toBeInTheDocument()
    })
  })

  it('surfaces backend duplicate detection as an info toast', async () => {
    uploadMock.uploadProjectFiles.mockResolvedValue({
      signal: 'success',
      files: [
        { filename: 'dup.pdf', file_id: 'f9', document_id: 9, duplicate: true },
      ],
    })
    apiMock.listDocuments.mockResolvedValue({ documents: [], total: 0 })

    const user = userEvent.setup()
    renderAt(<DocumentsPage />, '/projects/7/documents', '/projects/:projectId/documents')

    await user.upload(
      fileInput(),
      new File([new Uint8Array([3])], 'dup.pdf', { type: 'application/pdf' }),
    )

    await waitFor(() => {
      const toasts = useToastsStore.getState().toasts
      expect(toasts.some((toast) => /duplicate/i.test(toast.title))).toBe(true)
    })
  })
})
