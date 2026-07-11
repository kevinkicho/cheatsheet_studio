import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

export function SignInButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)
  const signInWithGoogleRedirect = useAuthStore((s) => s.signInWithGoogleRedirect)
  const user = useAuthStore((s) => s.user)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)
  const [busy, setBusy] = useState(false)

  if (user) {
    return (
      <button
        type="button"
        onClick={() => navigate('/app')}
        className={`inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-400 ${className}`}
      >
        Open workspace →
      </button>
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            clearError()
            setBusy(true)
            try {
              const signedIn = await signInWithGoogle()
              if (signedIn) {
                navigate('/app', { replace: true })
              }
            } finally {
              setBusy(false)
            }
          }}
          className={`inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-400 disabled:opacity-60 ${className}`}
        >
          <LogIn className="h-4 w-4" />
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            clearError()
            setBusy(true)
            try {
              await signInWithGoogleRedirect()
            } finally {
              setBusy(false)
            }
          }}
          className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
        >
          Use redirect instead
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="max-w-md rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm leading-relaxed text-red-200"
        >
          {error}
        </div>
      )}
    </div>
  )
}
