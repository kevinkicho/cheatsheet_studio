import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, LogIn } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

/** Default credentials for emulator E2E (Auth emulator only). */
export const EMULATOR_E2E_EMAIL = 'e2e@cheatsheet.test'
export const EMULATOR_E2E_PASSWORD = 'e2e-test-password-123'

export function SignInButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)
  const signInWithGoogleRedirect = useAuthStore(
    (s) => s.signInWithGoogleRedirect,
  )
  const signInWithEmailPassword = useAuthStore(
    (s) => s.signInWithEmailPassword,
  )
  const emulatorMode = useAuthStore((s) => s.emulatorMode)
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
        {emulatorMode && (
          <button
            type="button"
            data-testid="emulator-sign-in"
            disabled={busy}
            title="Auth emulator email/password (E2E / local only)"
            onClick={async () => {
              clearError()
              setBusy(true)
              try {
                const signedIn = await signInWithEmailPassword(
                  EMULATOR_E2E_EMAIL,
                  EMULATOR_E2E_PASSWORD,
                )
                if (signedIn) {
                  navigate('/app', { replace: true })
                }
              } finally {
                setBusy(false)
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {busy ? 'Signing in…' : 'Emulator sign-in'}
          </button>
        )}
      </div>
      {emulatorMode && (
        <p className="text-[10px] text-amber-500/80" data-testid="emulator-banner">
          Firebase emulators mode — use “Emulator sign-in” for local E2E.
        </p>
      )}
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
