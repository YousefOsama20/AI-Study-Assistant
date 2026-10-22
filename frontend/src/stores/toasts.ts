import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  kind: ToastKind
  title: string
  description?: string
  action?: ToastAction
}

interface ToastsState {
  toasts: ToastItem[]
  push: (toast: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
}

let toastCounter = 0

const TOAST_DURATION_MS: Record<ToastKind, number> = {
  success: 4500,
  info: 4500,
  warning: 6500,
  error: 8000,
}

export const useToastsStore = create<ToastsState>()((set) => ({
  toasts: [],
  push: (toast) => {
    toastCounter += 1
    const id = `toast-${toastCounter}`
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, TOAST_DURATION_MS[toast.kind])
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function pushToast(toast: Omit<ToastItem, 'id'>): void {
  useToastsStore.getState().push(toast)
}
