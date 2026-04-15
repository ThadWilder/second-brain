'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

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
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    // Replace previous toast so only one shows at a time
    setToasts([{ ...toast, id }])
    // Clear any existing timers
    for (const [, timer] of timersRef.current) clearTimeout(timer)
    timersRef.current.clear()
    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
    timersRef.current.set(id, timer)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container — bottom-right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-slide-up rounded-lg px-4 py-3 text-sm shadow-lg"
            style={{ background: '#2c2014', color: '#f5ede3', border: '1px solid #4a3828' }}
          >
            <div className="flex items-center gap-3">
              <p className="flex-1 font-medium">{toast.message}</p>
              {toast.action && (
                <button
                  onClick={() => { toast.action!.onClick(); dismiss(toast.id) }}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                  style={{ background: '#1a7a6d', color: '#e0f5f0' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#22998a' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#1a7a6d' }}
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 opacity-50 hover:opacity-100 text-xs transition-opacity"
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
