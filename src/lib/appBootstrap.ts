/**
 * App initialization sequence — status checks for splash screen.
 * Min display time is enforced by the splash UI (default 5s).
 */
import { auth, db, isFirebaseEmulatorMode, rtdb } from '@/lib/firebase'
import { ollamaPing, resolveOllamaBackend, resolveOllamaBaseUrl } from '@/lib/ollamaClient'
import { loadCatalogMetaOnly, isRtdbConfigured } from '@/lib/catalogRtdb'
import { SEED_LIBRARY } from '@/data/seedLibrary'
import { useLibraryStore } from '@/stores/libraryStore'
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore'

export type BootstrapCheckId =
  | 'env'
  | 'auth'
  | 'rtdb'
  | 'catalog'
  | 'firestore'
  | 'ollama'
  | 'seed'

export type BootstrapCheckStatus = 'pending' | 'ok' | 'warn' | 'fail' | 'skip'

export type BootstrapCheck = {
  id: BootstrapCheckId
  label: string
  status: BootstrapCheckStatus
  detail: string
}

export type BootstrapResult = {
  checks: BootstrapCheck[]
  ready: boolean
  librarySource: string
  libraryCount: number
  durationMs: number
}

function check(
  id: BootstrapCheckId,
  label: string,
  status: BootstrapCheckStatus,
  detail: string,
): BootstrapCheck {
  return { id, label, status, detail }
}

/**
 * Run ordered init checks. Safe to call once per session.
 */
export async function runAppBootstrap(
  onUpdate?: (checks: BootstrapCheck[]) => void,
): Promise<BootstrapResult> {
  const t0 = performance.now()
  const checks: BootstrapCheck[] = []
  const push = (c: BootstrapCheck) => {
    checks.push(c)
    onUpdate?.([...checks])
  }

  // ── Env / Firebase config ────────────────────────────────────────────
  const hasProject = Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID)
  const hasApiKey = Boolean(import.meta.env.VITE_FIREBASE_API_KEY)
  if (isFirebaseEmulatorMode) {
    push(
      check(
        'env',
        'Firebase config',
        'ok',
        'Emulator mode (demo project)',
      ),
    )
  } else if (hasProject && hasApiKey) {
    push(
      check(
        'env',
        'Firebase config',
        'ok',
        `Project ${import.meta.env.VITE_FIREBASE_PROJECT_ID}`,
      ),
    )
  } else {
    push(
      check(
        'env',
        'Firebase config',
        'fail',
        'Missing VITE_FIREBASE_* in .env',
      ),
    )
  }

  // ── Auth ─────────────────────────────────────────────────────────────
  const user = auth.currentUser
  if (user) {
    push(
      check(
        'auth',
        'Authentication',
        'ok',
        user.email || user.uid.slice(0, 12),
      ),
    )
  } else {
    push(
      check(
        'auth',
        'Authentication',
        'warn',
        'Not signed in yet (or session restoring)',
      ),
    )
  }

  // ── RTDB ─────────────────────────────────────────────────────────────
  if (!isRtdbConfigured() || !rtdb) {
    push(
      check(
        'rtdb',
        'Realtime Database',
        'warn',
        'Not configured — set VITE_FIREBASE_DATABASE_URL; catalog falls back to seed/Firestore',
      ),
    )
  } else {
    try {
      const meta = await loadCatalogMetaOnly()
      if (meta) {
        push(
          check(
            'rtdb',
            'Realtime Database',
            'ok',
            `Connected · catalog meta v${meta.version} · ${meta.itemCount} items`,
          ),
        )
      } else {
        push(
          check(
            'rtdb',
            'Realtime Database',
            'warn',
            'Connected · no catalog/v1 snapshot yet (publish seed or enrich)',
          ),
        )
      }
    } catch (e) {
      push(
        check(
          'rtdb',
          'Realtime Database',
          'fail',
          e instanceof Error ? e.message : String(e),
        ),
      )
    }
  }

  // ── Library bulk load ────────────────────────────────────────────────
  let librarySource = 'seed'
  let libraryCount = SEED_LIBRARY.length
  try {
    const lib = await useLibraryStore.getState().load()
    librarySource = lib.source
    libraryCount = lib.count
    const st =
      lib.source === 'rtdb'
        ? 'ok'
        : lib.source === 'firestore'
          ? 'ok'
          : 'warn'
    push(
      check(
        'catalog',
        'Content catalog',
        st,
        `${lib.count} items from ${lib.source}`,
      ),
    )
  } catch (e) {
    push(
      check(
        'catalog',
        'Content catalog',
        'fail',
        e instanceof Error ? e.message : String(e),
      ),
    )
  }

  // ── Firestore reachability ───────────────────────────────────────────
  // libraryItems allows public read; sheets require owner. Prefer a real path.
  try {
    const libQ = query(collection(db, 'libraryItems'), limit(1))
    const libSnap = await getDocs(libQ)
    if (user) {
      try {
        const sheetQ = query(
          collection(db, 'sheets'),
          where('ownerId', '==', user.uid),
          limit(1),
        )
        await getDocs(sheetQ)
        push(
          check(
            'firestore',
            'Firestore',
            'ok',
            `Reachable · library ${libSnap.size ? 'has docs' : 'empty'} · sheets query OK`,
          ),
        )
      } catch (sheetErr) {
        const msg =
          sheetErr instanceof Error ? sheetErr.message : String(sheetErr)
        push(
          check(
            'firestore',
            'Firestore',
            /permission/i.test(msg) ? 'warn' : 'ok',
            `Library OK · sheets: ${msg.slice(0, 80)}`,
          ),
        )
      }
    } else {
      push(
        check(
          'firestore',
          'Firestore',
          'ok',
          `Reachable · libraryItems ${libSnap.empty ? 'empty (use seed/RTDB)' : 'readable'}`,
        ),
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    push(
      check(
        'firestore',
        'Firestore',
        /permission|offline|unavailable/i.test(msg) ? 'warn' : 'fail',
        msg.slice(0, 120),
      ),
    )
  }

  // ── Ollama proxy ─────────────────────────────────────────────────────
  try {
    const ping = await ollamaPing(resolveOllamaBaseUrl())
    if (ping.ok) {
      push(
        check(
          'ollama',
          'Ollama AI',
          'ok',
          `${ping.backend} · ${ping.models.slice(0, 3).join(', ') || 'tags ok'}`,
        ),
      )
    } else {
      push(
        check(
          'ollama',
          'Ollama AI',
          'warn',
          ping.error ||
            'Unavailable — enrich needs OLLAMA_API_KEY + npm run dev proxy',
        ),
      )
    }
  } catch (e) {
    push(
      check(
        'ollama',
        'Ollama AI',
        'warn',
        e instanceof Error ? e.message : String(e),
      ),
    )
  }

  // ── Seed always present ──────────────────────────────────────────────
  push(
    check(
      'seed',
      'Bundled seed library',
      'ok',
      `${SEED_LIBRARY.length} items always available offline`,
    ),
  )

  void resolveOllamaBackend

  const ready = !checks.some((c) => c.status === 'fail' && c.id === 'env')
  return {
    checks,
    ready,
    librarySource,
    libraryCount,
    durationMs: Math.round(performance.now() - t0),
  }
}

export const BOOTSTRAP_MIN_MS = 5_000
