import { create } from 'zustand'
import { api, ApiError, uploadProjectFiles } from '../lib/api/client'
import type { DocumentItem } from '../types/api'
import { pushToast } from './toasts'

// ---------------------------------------------------------------------------
// Documents (isolated per project)
// ---------------------------------------------------------------------------

export interface DocumentBucket {
  documents: DocumentItem[]
  loading: boolean
  error: string | null
  uploading: boolean
  uploadProgress: number | null
  processing: boolean
  indexing: boolean
  indexLoading: boolean
  indexError: string | null
  indexRecordCount: number | null
  indexSignature: string | null
  busy: Record<number, string | null>
}

function emptyBucket(): DocumentBucket {
  return {
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
  }
}

function docSignature(documents: DocumentItem[]): string {
  return documents
    .map((d) => `${d.document_id}:${d.status}:${d.updated_at ?? ''}`)
    .join('|')
}

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.isAbort()) return ''
    return error.message || fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}

interface DocumentsState {
  buckets: Record<number, DocumentBucket>
  bucket: (projectId: number) => DocumentBucket
  load: (projectId: number) => Promise<void>
  loadIndexInfo: (projectId: number) => Promise<void>
  upload: (projectId: number, files: File[]) => Promise<void>
  remove: (projectId: number, documentId: number) => Promise<void>
  reprocess: (projectId: number, documentId: number) => Promise<void>
  processAll: (projectId: number) => Promise<void>
  buildIndex: (projectId: number, rebuild: boolean) => Promise<void>
}

export const useDocumentsStore = create<DocumentsState>()((set, get) => {
  function updateBucket(
    projectId: number,
    patch: Partial<DocumentBucket>,
  ): void {
    set((s) => ({
      buckets: {
        ...s.buckets,
        [projectId]: { ...(s.buckets[projectId] ?? emptyBucket()), ...patch },
      },
    }))
  }

  function patchBusy(
    projectId: number,
    documentId: number,
    value: string | null,
  ): void {
    set((s) => {
      const bucket = s.buckets[projectId] ?? emptyBucket()
      return {
        buckets: {
          ...s.buckets,
          [projectId]: {
            ...bucket,
            busy: { ...bucket.busy, [documentId]: value },
          },
        },
      }
    })
  }

  return {
    buckets: {},

    bucket: (projectId) => get().buckets[projectId] ?? emptyBucket(),

    load: async (projectId) => {
      updateBucket(projectId, { loading: true, error: null })
      try {
        const response = await api.listDocuments(projectId)
        updateBucket(projectId, {
          documents: response.documents,
          loading: false,
        })
        void get().loadIndexInfo(projectId)
      } catch (error) {
        updateBucket(projectId, {
          loading: false,
          error: messageFromError(error, 'Failed to load documents'),
        })
      }
    },

    loadIndexInfo: async (projectId) => {
      updateBucket(projectId, { indexLoading: true, indexError: null })
      try {
        const info = await api.getIndexInfo(projectId)
        const bucket = get().bucket(projectId)
        const recordCount = info.collection_info?.record_count ?? null
        updateBucket(projectId, {
          indexLoading: false,
          indexRecordCount: recordCount,
          indexSignature:
            recordCount === null || recordCount === undefined
              ? null
              : bucket.indexSignature ?? docSignature(bucket.documents),
        })
      } catch {
        updateBucket(projectId, {
          indexLoading: false,
          indexRecordCount: null,
          indexSignature: null,
        })
      }
    },

    upload: async (projectId, files) => {
      if (files.length === 0) return
      updateBucket(projectId, { uploading: true, uploadProgress: 0 })
      try {
        const response = await uploadProjectFiles(projectId, files, {
          onProgress: (progress) => {
            updateBucket(projectId, { uploadProgress: progress.percent })
          },
        })
        const duplicates = response.files.filter((f) => f.duplicate)
        const created = response.files.filter((f) => !f.duplicate)
        if (created.length > 0) {
          pushToast({
            kind: 'success',
            title: `Uploaded ${created.length} file${created.length === 1 ? '' : 's'}`,
          })
        }
        for (const duplicate of duplicates) {
          pushToast({
            kind: 'info',
            title: `${duplicate.filename} skipped — duplicate content`,
          })
        }
        updateBucket(projectId, { uploading: false, uploadProgress: null })
        await get().load(projectId)
      } catch (error) {
        updateBucket(projectId, { uploading: false, uploadProgress: null })
        pushToast({
          kind: 'error',
          title: messageFromError(error, 'Upload failed'),
          action: {
            label: 'Retry',
            onClick: () => void get().upload(projectId, files),
          },
        })
      }
    },

    remove: async (projectId, documentId) => {
      patchBusy(projectId, documentId, 'deleting')
      try {
        await api.deleteDocument(projectId, documentId)
        pushToast({ kind: 'success', title: 'Document deleted' })
        await get().load(projectId)
      } catch (error) {
        pushToast({
          kind: 'error',
          title: messageFromError(error, 'Could not delete the document'),
        })
      } finally {
        patchBusy(projectId, documentId, null)
      }
    },

    reprocess: async (projectId, documentId) => {
      patchBusy(projectId, documentId, 'reprocessing')
      try {
        await api.reprocessDocument(projectId, documentId)
        pushToast({ kind: 'success', title: 'Document reprocessed' })
        await get().load(projectId)
      } catch (error) {
        pushToast({
          kind: 'error',
          title: messageFromError(error, 'Reprocessing failed'),
          action: {
            label: 'Retry',
            onClick: () => void get().reprocess(projectId, documentId),
          },
        })
      } finally {
        patchBusy(projectId, documentId, null)
      }
    },

    processAll: async (projectId) => {
      updateBucket(projectId, { processing: true })
      try {
        const response = await api.processProject(projectId)
        if (response.failed_files.length > 0) {
          pushToast({
            kind:
              response.processed_files > 0 ? 'warning' : 'error',
            title:
              response.processed_files > 0
                ? `${response.processed_files} file(s) processed, ${response.failed_files.length} failed`
                : `${response.failed_files.length} file(s) failed to process`,
            description: response.failed_files[0]?.error,
            action: {
              label: 'Retry',
              onClick: () => void get().processAll(projectId),
            },
          })
        } else {
          pushToast({
            kind: 'success',
            title: `Processed ${response.processed_files} file(s)`,
            description: `${response.inserted_chunks} chunks inserted`,
          })
        }
        await get().load(projectId)
      } catch (error) {
        pushToast({
          kind: 'error',
          title: messageFromError(error, 'Processing failed'),
          action: {
            label: 'Retry',
            onClick: () => void get().processAll(projectId),
          },
        })
      } finally {
        updateBucket(projectId, { processing: false })
      }
    },

    buildIndex: async (projectId, rebuild) => {
      updateBucket(projectId, { indexing: true })
      try {
        const response = await api.pushIndex(projectId, { doReset: rebuild })
        pushToast({
          kind: 'success',
          title: `Index ${rebuild ? 'rebuilt' : 'built'}`,
          description: `${response.inserted_items_count} vectors inserted`,
        })
        const bucket = get().bucket(projectId)
        updateBucket(projectId, {
          indexRecordCount: response.inserted_items_count,
          indexSignature: docSignature(bucket.documents),
        })
        void get().loadIndexInfo(projectId)
      } catch (error) {
        pushToast({
          kind: 'error',
          title: messageFromError(error, 'Index build failed'),
          action: {
            label: 'Retry',
            onClick: () => void get().buildIndex(projectId, rebuild),
          },
        })
      } finally {
        updateBucket(projectId, { indexing: false })
      }
    },
  }
})
