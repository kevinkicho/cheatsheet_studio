import { create } from 'zustand'
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import {
  auth,
  connectFirebaseEmulatorsIfNeeded,
  db,
  googleProvider,
  isFirebaseEmulatorMode,
  logFirebaseSetup,
} from '@/lib/firebase'
import { formatAuthError } from '@/lib/authErrors'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  /** True when app is wired to local Firebase emulators. */
  emulatorMode: boolean
  init: () => () => void
  signInWithGoogle: () => Promise<User | null>
  signInWithGoogleRedirect: () => Promise<void>
  /**
   * Email/password sign-in for emulator E2E (and local dev only).
   * Creates the user if they do not exist yet.
   */
  signInWithEmailPassword: (
    email: string,
    password: string,
  ) => Promise<User | null>
  signOut: () => Promise<void>
  clearError: () => void
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/** Best-effort profile write — never blocks login UI. */
async function ensureUserProfile(user: User) {
  try {
    await withTimeout(
      (async () => {
        const ref = doc(db, 'users', user.uid)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          await setDoc(ref, {
            displayName: user.displayName ?? 'User',
            email: user.email ?? '',
            photoURL: user.photoURL ?? null,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          })
        } else {
          await setDoc(
            ref,
            { lastLoginAt: serverTimestamp() },
            { merge: true },
          )
        }
      })(),
      4000,
    )
  } catch (e) {
    console.warn(
      '[auth] Profile write skipped (enable Cloud Firestore + deploy rules later):',
      e,
    )
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  emulatorMode: isFirebaseEmulatorMode,

  init: () => {
    connectFirebaseEmulatorsIfNeeded()
    logFirebaseSetup()

    void getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          set({ user: result.user, loading: false, error: null })
          void ensureUserProfile(result.user)
        }
      })
      .catch((e) => {
        console.error('[auth] getRedirectResult failed', e)
        set({ error: formatAuthError(e) })
      })

    const unsub = onAuthStateChanged(auth, (user) => {
      // Never await network before unlocking the UI.
      set({ user, loading: false })
      if (user) {
        void ensureUserProfile(user)
      }
    })
    return unsub
  },

  signInWithGoogle: async () => {
    set({ error: null })
    try {
      const result = await signInWithPopup(auth, googleProvider)
      set({ user: result.user, loading: false, error: null })
      void ensureUserProfile(result.user)
      return result.user
    } catch (e) {
      console.error('[auth] signInWithPopup failed', e)
      const message = formatAuthError(e)
      set({ error: message })

      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: string }).code)
          : ''
      if (code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, googleProvider)
          return null
        } catch (redirectErr) {
          console.error('[auth] redirect fallback failed', redirectErr)
          set({ error: formatAuthError(redirectErr) })
        }
      }
      return null
    }
  },

  signInWithGoogleRedirect: async () => {
    set({ error: null })
    try {
      await signInWithRedirect(auth, googleProvider)
    } catch (e) {
      console.error('[auth] signInWithRedirect failed', e)
      set({ error: formatAuthError(e) })
    }
  },

  signInWithEmailPassword: async (email, password) => {
    if (!isFirebaseEmulatorMode) {
      set({
        error:
          'Email/password sign-in is only enabled when Firebase emulators are on (VITE_USE_FIREBASE_EMULATORS=true).',
      })
      return null
    }
    set({ error: null })
    connectFirebaseEmulatorsIfNeeded()
    try {
      let result
      try {
        result = await signInWithEmailAndPassword(auth, email, password)
      } catch (e) {
        const code =
          e && typeof e === 'object' && 'code' in e
            ? String((e as { code: string }).code)
            : ''
        if (
          code === 'auth/user-not-found' ||
          code === 'auth/invalid-credential' ||
          code === 'auth/invalid-login-credentials'
        ) {
          result = await createUserWithEmailAndPassword(auth, email, password)
        } else {
          throw e
        }
      }
      set({ user: result.user, loading: false, error: null })
      void ensureUserProfile(result.user)
      return result.user
    } catch (e) {
      console.error('[auth] email/password failed', e)
      set({ error: formatAuthError(e) })
      return null
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth)
    set({ user: null })
  },

  clearError: () => set({ error: null }),
}))
