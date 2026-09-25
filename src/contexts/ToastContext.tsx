import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../components/ui/Icon'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  durationMs: number
}

interface ToastContextValue {
  show: (message: string, type?: ToastType, durationMs?: number) => void
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
  info: (message: string, durationMs?: number) => void
  warning: (message: string, durationMs?: number) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}

const TOAST_ICONS: Record<ToastType, IconName> = {
  success: 'check',
  error: 'x',
  info: 'info',
  warning: 'helpCircle',
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, type: ToastType = 'info', durationMs = 3800) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { id, message, type, durationMs }])

    if (durationMs > 0) {
      window.setTimeout(() => {
        dismiss(id)
      }, durationMs)
    }
  }, [dismiss])

  const success = useCallback((message: string, durationMs?: number) => {
    show(message, 'success', durationMs)
  }, [show])

  const error = useCallback((message: string, durationMs?: number) => {
    show(message, 'error', durationMs ?? 5000)
  }, [show])

  const info = useCallback((message: string, durationMs?: number) => {
    show(message, 'info', durationMs)
  }, [show])

  const warning = useCallback((message: string, durationMs?: number) => {
    show(message, 'warning', durationMs)
  }, [show])

  const value = useMemo(
    () => ({ show, success, error, info, warning, dismiss }),
    [show, success, error, info, warning, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-portal" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.type}`}
            role="alert"
          >
            <span className="toast__icon" aria-hidden="true">
              <Icon name={TOAST_ICONS[toast.type]} size={16} />
            </span>
            <span className="toast__message">{toast.message}</span>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
