import { useEffect } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

export type ToastKind = 'success' | 'error' | 'info'

export type ToastMessage = {
  id: string
  kind: ToastKind
  title: string
  detail?: string
}

type Props = {
  toast: ToastMessage | null
  onDismiss: () => void
  /** Auto-dismiss ms (0 = sticky). Default 4500. */
  durationMs?: number
}

export function Toast({ toast, onDismiss, durationMs = 4500 }: Props) {
  useEffect(() => {
    if (!toast || durationMs <= 0) return
    const t = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(t)
  }, [toast, durationMs, onDismiss])

  if (!toast) return null

  const Icon =
    toast.kind === 'success'
      ? CheckCircle2
      : toast.kind === 'error'
        ? AlertCircle
        : Info

  const ring =
    toast.kind === 'success'
      ? 'border-emerald-500/40 bg-emerald-950/95 text-emerald-50'
      : toast.kind === 'error'
        ? 'border-rose-500/40 bg-rose-950/95 text-rose-50'
        : 'border-sky-500/40 bg-sky-950/95 text-sky-50'

  const iconCls =
    toast.kind === 'success'
      ? 'text-emerald-400'
      : toast.kind === 'error'
        ? 'text-rose-400'
        : 'text-sky-400'

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="app-toast"
      className={`pointer-events-auto fixed bottom-4 right-4 z-[200] flex max-w-sm items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-2xl backdrop-blur ${ring}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconCls}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{toast.title}</p>
        {toast.detail && (
          <p className="mt-0.5 text-[11px] leading-snug opacity-80">
            {toast.detail}
          </p>
        )}
      </div>
      <button
        type="button"
        title="Dismiss"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
