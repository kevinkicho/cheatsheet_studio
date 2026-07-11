import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

/**
 * Client Firebase config — loaded only from Vite env vars.
 * Copy `.env.example` → `.env` and fill values from Firebase Console
 * (Project settings → Your apps → Web app config).
 * Do not hardcode secrets in source; `.env` is gitignored.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as
    | string
    | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as
    | string
    | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    '[firebase] Missing config. Copy .env.example → .env, fill Firebase web app keys, restart `npm run dev`.',
    {
      hasApiKey: Boolean(firebaseConfig.apiKey),
      hasProjectId: Boolean(firebaseConfig.projectId),
    },
  )
}

export const app = initializeApp(firebaseConfig as Required<typeof firebaseConfig>)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
googleProvider.addScope('profile')
googleProvider.addScope('email')

/** Safe to log in the browser console for debugging auth setup. */
export function logFirebaseSetup() {
  console.info('[firebase] project:', firebaseConfig.projectId)
  console.info('[firebase] authDomain:', firebaseConfig.authDomain)
  console.info(
    '[firebase] apiKey present:',
    Boolean(firebaseConfig.apiKey) && (firebaseConfig.apiKey?.length ?? 0) > 10,
  )
}
