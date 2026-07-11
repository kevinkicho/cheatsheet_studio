import { beforeEach, describe, expect, it, vi } from 'vitest'

const onAuthStateChanged = vi.fn()
const signInWithPopup = vi.fn()
const signInWithRedirect = vi.fn()
const signOut = vi.fn()
const getRedirectResult = vi.fn()
const getDoc = vi.fn()
const setDoc = vi.fn()
const doc = vi.fn()

vi.mock('@/lib/firebase', () => ({
  auth: { app: {} },
  db: {},
  storage: {},
  googleProvider: { setCustomParameters: () => {} },
  logFirebaseSetup: () => {},
  connectFirebaseEmulatorsIfNeeded: () => {},
  isFirebaseEmulatorMode: false,
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...a: unknown[]) => onAuthStateChanged(...a),
  signInWithPopup: (...a: unknown[]) => signInWithPopup(...a),
  signInWithRedirect: (...a: unknown[]) => signInWithRedirect(...a),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: (...a: unknown[]) => signOut(...a),
  getRedirectResult: (...a: unknown[]) => getRedirectResult(...a),
  GoogleAuthProvider: class {},
}))

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => doc(...a),
  getDoc: (...a: unknown[]) => getDoc(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
  serverTimestamp: () => 'SERVER_TS',
}))

import { useAuthStore } from '@/stores/authStore'

describe('authStore (Firebase mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRedirectResult.mockResolvedValue(null)
    useAuthStore.setState({
      user: null,
      loading: true,
      error: null,
      emulatorMode: false,
    })
  })

  it('init subscribes to auth and clears loading on callback', () => {
    let authCb: ((u: unknown) => void) | undefined
    onAuthStateChanged.mockImplementation(
      (_auth: unknown, cb: (u: unknown) => void) => {
        authCb = cb
        return () => {}
      },
    )
    const unsub = useAuthStore.getState().init()
    expect(typeof unsub).toBe('function')
    expect(onAuthStateChanged).toHaveBeenCalled()

    const fakeUser = { uid: 'u1', displayName: 'Ada', email: 'a@b.c' }
    getDoc.mockResolvedValue({ exists: () => true })
    expect(authCb).toBeTypeOf('function')
    authCb!(fakeUser)
    expect(useAuthStore.getState().user).toEqual(fakeUser)
    expect(useAuthStore.getState().loading).toBe(false)
  })

  it('signInWithGoogle sets user on success', async () => {
    const fakeUser = { uid: 'u2', email: 'x@y.z' }
    signInWithPopup.mockResolvedValue({ user: fakeUser })
    getDoc.mockResolvedValue({ exists: () => true })
    const user = await useAuthStore.getState().signInWithGoogle()
    expect(user).toEqual(fakeUser)
    expect(useAuthStore.getState().user).toEqual(fakeUser)
    expect(useAuthStore.getState().error).toBeNull()
  })

  it('signInWithGoogle records formatted error on failure', async () => {
    signInWithPopup.mockRejectedValue(
      Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' }),
    )
    signInWithRedirect.mockRejectedValue(
      Object.assign(new Error('redirect fail'), {
        code: 'auth/operation-not-allowed',
      }),
    )
    const user = await useAuthStore.getState().signInWithGoogle()
    expect(user).toBeNull()
    expect(useAuthStore.getState().error).toMatch(/Google sign-in is not enabled|popup was blocked/i)
  })

  it('signOut clears user', async () => {
    useAuthStore.setState({ user: { uid: 'u' } as never })
    signOut.mockResolvedValue(undefined)
    await useAuthStore.getState().signOut()
    expect(signOut).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('clearError resets error string', () => {
    useAuthStore.setState({ error: 'boom' })
    useAuthStore.getState().clearError()
    expect(useAuthStore.getState().error).toBeNull()
  })

  it('signInWithEmailPassword refuses when not in emulator mode', async () => {
    const user = await useAuthStore
      .getState()
      .signInWithEmailPassword('a@b.c', 'secret')
    expect(user).toBeNull()
    expect(useAuthStore.getState().error).toMatch(/emulators/i)
  })
})
