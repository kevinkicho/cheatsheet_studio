import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'
import {
  connectDatabaseEmulator,
  getDatabase,
  type Database,
} from 'firebase/database'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

/**
 * Client Firebase config — loaded only from Vite env vars.
 * Copy `.env.example` → `.env` and fill values from Firebase Console.
 *
 * Emulator mode: set VITE_USE_FIREBASE_EMULATORS=true (see package scripts).
 * Uses demo project id when emulators are on so no real GCP project is required.
 */
const useEmulators =
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' ||
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === '1'

const demoConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'localhost',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-cheatsheet',
  storageBucket: 'demo-cheatsheet.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:demo',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-cheatsheet',
}

/** Trim env strings; empty → undefined (avoids BOM/space-only values). */
function envTrim(key: string): string | undefined {
  const v = import.meta.env[key] as string | undefined
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length ? t : undefined
}

const projectId = envTrim('VITE_FIREBASE_PROJECT_ID')

const envConfig = {
  apiKey: envTrim('VITE_FIREBASE_API_KEY'),
  authDomain: envTrim('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId,
  storageBucket: envTrim('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: envTrim('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: envTrim('VITE_FIREBASE_APP_ID'),
  databaseURL:
    envTrim('VITE_FIREBASE_DATABASE_URL') ||
    (projectId
      ? `https://${projectId}-default-rtdb.firebaseio.com`
      : undefined),
}

const hasEnvConfig = Boolean(
  envConfig.apiKey &&
    envConfig.projectId &&
    envConfig.apiKey !== 'demo-api-key' &&
    envConfig.apiKey.startsWith('AIza'),
)

/**
 * When env keys are missing (CI unit tests, fresh clone without .env), use the
 * demo placeholder so `getAuth` does not throw `auth/invalid-api-key` on import.
 * Real cloud calls still need a configured project; seed/local paths work offline.
 */
const firebaseConfig = useEmulators
  ? demoConfig
  : hasEnvConfig
    ? (envConfig as typeof demoConfig)
    : demoConfig

if (!useEmulators && !hasEnvConfig) {
  console.error(
    '[firebase] Missing config. Copy .env.example → .env, fill Firebase web app keys, restart `npm run dev`. Using placeholder config for import safety (tests/CI).',
    {
      hasApiKey: Boolean(envConfig.apiKey),
      hasProjectId: Boolean(envConfig.projectId),
      mode: import.meta.env.MODE,
    },
  )
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

/**
 * Realtime Database for bulk catalog snapshot (`catalog/v1`).
 * Null when databaseURL is missing (tests / demo without RTDB).
 */
export const rtdb: Database | null = (() => {
  const url =
    (firebaseConfig as { databaseURL?: string }).databaseURL ||
    (envConfig.databaseURL as string | undefined)
  if (!url && !useEmulators) return null
  try {
    return getDatabase(
      app,
      url || `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`,
    )
  } catch (e) {
    console.warn('[firebase] RTDB unavailable', e)
    return null
  }
})()

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
googleProvider.addScope('profile')
googleProvider.addScope('email')

/** True when talking to local Firebase emulators. */
export const isFirebaseEmulatorMode = useEmulators

let emulatorsConnected = false

/**
 * Connect Auth / Firestore / Storage emulators once (safe to call from init).
 * Hosts/ports match firebase.json → emulators.
 */
export function connectFirebaseEmulatorsIfNeeded() {
  if (!useEmulators || emulatorsConnected) return
  emulatorsConnected = true

  const authHost =
    import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
  const fsHost =
    import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1'
  const fsPort = Number(
    import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8080,
  )
  const storageHost =
    import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1'
  const storagePort = Number(
    import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_PORT || 9199,
  )

  const rtdbHost =
    import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1'
  const rtdbPort = Number(
    import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR_PORT || 9000,
  )
  if (rtdb) {
    try {
      connectDatabaseEmulator(rtdb, rtdbHost, rtdbPort)
    } catch {
      /* already connected */
    }
  }

  // Auth emulator is enough for signed-in UI E2E (no Java).
  // Firestore/Storage emulators need Java — connect only when ports are intended
  // (full suite: npm run test:e2e:emulators:full / npm run emulators).
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })

  const connectAll =
    import.meta.env.VITE_FIREBASE_EMULATORS_ALL === 'true' ||
    import.meta.env.VITE_FIREBASE_EMULATORS_ALL === '1'

  if (connectAll) {
    connectFirestoreEmulator(db, fsHost, fsPort)
    connectStorageEmulator(storage, storageHost, storagePort)
  }

  console.info('[firebase] Emulators connected', {
    auth: authHost,
    firestore: connectAll ? `${fsHost}:${fsPort}` : 'production-or-offline',
    storage: connectAll ? `${storageHost}:${storagePort}` : 'production-or-offline',
    projectId: firebaseConfig.projectId,
  })
}

/** Safe to log in the browser console for debugging auth setup. */
export function logFirebaseSetup() {
  console.info('[firebase] project:', firebaseConfig.projectId)
  console.info('[firebase] authDomain:', firebaseConfig.authDomain)
  console.info('[firebase] storageBucket:', firebaseConfig.storageBucket)
  console.info('[firebase] emulators:', useEmulators)
  console.info(
    '[firebase] apiKey present:',
    Boolean(firebaseConfig.apiKey) && (firebaseConfig.apiKey?.length ?? 0) > 10,
  )
}
