import { Navigate } from 'react-router-dom'
import { BookOpen, Layers, MousePointer2, Sigma } from 'lucide-react'
import { SignInButton } from '@/components/auth/SignInButton'
import { useAuthStore } from '@/stores/authStore'

export function Landing() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)

  // Auto-enter workspace once auth resolves with a user.
  if (!loading && user) {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 font-bold">
              Σ
            </div>
            <span className="text-lg font-semibold">CheatSheet Studio</span>
          </div>
          <SignInButton />
        </header>

        <section className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-medium text-indigo-300">
              Math · Science · Economics · Finance
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
              Build living cheat sheets from equations, tables & figures
            </h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-400">
              Drag formulas from a curated library onto a freeform canvas.
              Create custom LaTeX, import images, resize panels, and save
              everything to Firebase under your Google account.
            </p>
            <div className="mt-8">
              <SignInButton />
            </div>
            <AuthChecklist />
          </div>

          <div className="relative rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex gap-2">
              <div className="h-2 w-2 rounded-full bg-red-400/80" />
              <div className="h-2 w-2 rounded-full bg-amber-400/80" />
              <div className="h-2 w-2 rounded-full bg-emerald-400/80" />
            </div>
            <div className="space-y-3 font-mono text-sm text-indigo-200">
              <p className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
                x = (−b ± √(b² − 4ac)) / 2a
              </p>
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                E = mc²
              </p>
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                PV = FV / (1+r)ⁿ
              </p>
            </div>
            <p className="mt-4 text-center text-xs text-zinc-500">
              Preview of canvas cards · drag from library · edit properties
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: BookOpen,
              title: 'Subject library',
              body: 'Math, physics, chemistry, biology, economics, finance.',
            },
            {
              icon: MousePointer2,
              title: 'Drag canvas',
              body: 'Place, move, and resize items freely on your sheet.',
            },
            {
              icon: Sigma,
              title: 'Custom LaTeX',
              body: 'Author equations with live KaTeX preview.',
            },
            {
              icon: Layers,
              title: 'Synced sheets',
              body: 'Google sign-in; sheets stored in Firestore.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
            >
              <Icon className="mb-2 h-5 w-5 text-indigo-400" />
              <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function AuthChecklist() {
  return (
    <details className="mt-6 max-w-lg rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
      <summary className="cursor-pointer font-medium text-zinc-300">
        Sign-in not working? Check these
      </summary>
      <ol className="mt-2 list-decimal space-y-1.5 pl-4 leading-relaxed">
        <li>
          Firebase Console → <strong className="text-zinc-200">Authentication</strong> →
          Sign-in method → <strong className="text-zinc-200">Google</strong> is Enabled
          (not only “Auth” product toggled on).
        </li>
        <li>
          When enabling Google, set a <strong className="text-zinc-200">Project support email</strong>{' '}
          and click Save.
        </li>
        <li>
          Authentication → Settings → Authorized domains includes{' '}
          <code className="text-indigo-300">localhost</code>.
        </li>
        <li>
          We use <strong className="text-zinc-200">Firestore</strong> for data (not Realtime
          Database). Enable Firestore separately if sheets/profiles fail after login.
        </li>
        <li>
          Restart the dev server after changing <code className="text-indigo-300">.env</code>:
          stop it, then <code className="text-indigo-300">npm run dev</code>.
        </li>
        <li>
          Open the browser console (F12) — look for{' '}
          <code className="text-indigo-300">[auth]</code> /{' '}
          <code className="text-indigo-300">[firebase]</code> logs and the red error banner above.
        </li>
      </ol>
    </details>
  )
}
