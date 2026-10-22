import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  kind: ToastKind
  title: string
  description?: string
}

interface ToastsState {
  toasts: ToastItem[]
  push: (toast: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
}

let toastCounter = 0

export const useToastsStore = create<ToastsState>()((set) => ({
  toasts: [],
  push: (toast) => {
    toastCounter += 1
    const id = `toast-${toastCounter}`
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, toast.kind === 'error' ? 8000 : 4500)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function pushToast(toast: Omit<ToastItem, 'id'>): void {
  useToastsStore.getState().push(toast)
}
