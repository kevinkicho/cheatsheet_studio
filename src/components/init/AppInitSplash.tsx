/**
 * Flash / splash screen — min 5s initialization sequence with live checks.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
  BOOTSTRAP_MIN_MS,
  runAppBootstrap,
  type BootstrapCheck,
  type BootstrapResult,
} from '@/lib/appBootstrap'
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Circle } from 'lucide-react'

function StatusIcon({ status }: { status: BootstrapCheck['status'] }) {
  if (status === 'ok')
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
  if (status === 'warn')
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
  if (status === 'fail')
    return <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
  if (status === 'pending')
    return (
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />
    )
  return <Circle className="h-4 w-4 shrink-0 text-zinc-600" />
}

export function AppInitSplash({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(false)
  const [checks, setChecks] = useState<BootstrapCheck[]>([])
  const [result, setResult] = useState<BootstrapResult | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let cancelled = false
    const t0 = Date.now()
    const tick = window.setInterval(() => {
      const e = Date.now() - t0
      setElapsed(e)
      setProgress(Math.min(100, (e / BOOTSTRAP_MIN_MS) * 100))
    }, 100)

    void (async () => {
      const res = await runAppBootstrap((live) => {
        if (!cancelled) setChecks(live)
      })
      if (cancelled) return
      setResult(res)
      setChecks(res.checks)
      const wait = Math.max(0, BOOTSTRAP_MIN_MS - (Date.now() - t0))
      await new Promise((r) => setTimeout(r, wait))
      if (!cancelled) setDone(true)
    })()

    return () => {
      cancelled = true
      clearInterval(tick)
    }
  }, [])

  if (done) return <>{children}</>

  const sec = (elapsed / 1000).toFixed(1)
  const minSec = (BOOTSTRAP_MIN_MS / 1000).toFixed(0)

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-200"
      data-testid="app-init-splash"
    >
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl shadow-indigo-500/5">
        <div className="mb-1 text-center text-lg font-semibold tracking-tight text-zinc-100">
          CheatSheet Studio
        </div>
        <p className="mb-5 text-center text-[11px] text-zinc-500">
          Initialization · minimum {minSec}s · checking services
        </p>

        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-indigo-500 transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mb-4 text-center text-[10px] tabular-nums text-zinc-600">
          {sec}s / {minSec}s
          {result
            ? ` · catalog ${result.libraryCount} (${result.librarySource})`
            : ' · running checks…'}
        </p>

        <ul className="space-y-2">
          {(checks.length
            ? checks
            : [
                {
                  id: 'env' as const,
                  label: 'Starting…',
                  status: 'pending' as const,
                  detail: 'Boot sequence',
                },
              ]
          ).map((c) => (
            <li
              key={c.id + c.label}
              className="flex items-start gap-2 rounded-md border border-zinc-800/80 bg-zinc-950/50 px-2.5 py-2"
              data-testid={`bootstrap-check-${c.id}`}
              data-status={c.status}
            >
              <StatusIcon status={c.status} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-zinc-200">
                  {c.label}
                </p>
                <p className="truncate text-[10px] leading-snug text-zinc-500">
                  {c.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {result && !result.ready ? (
          <p className="mt-4 text-center text-[10px] text-rose-300/90">
            Some checks failed — you can still continue after the timer; fix
            .env / Firebase if the app misbehaves.
          </p>
        ) : (
          <p className="mt-4 text-center text-[10px] text-zinc-600">
            Loading catalog from RTDB when available; seed is always offline.
          </p>
        )}
      </div>
    </div>
  )
}
