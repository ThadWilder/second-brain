'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { clsx } from 'clsx'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
  action?: { label: string; onClick: () => void }
}

interface ToastContextValue {
  showToast: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container — bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              'px-4 py-3 rounded-lg border text-sm shadow-lg animate-slide-in',
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-red-500/10 border-red-500/20 text-red-300'
            )}
          >
            <div className="flex items-start gap-2">
              <p className="flex-1">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 text-slate-500 hover:text-slate-300 text-xs mt-0.5"
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="mt-1.5 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
