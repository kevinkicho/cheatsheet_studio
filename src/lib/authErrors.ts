import { FirebaseError } from 'firebase/app'

/** Map Firebase Auth error codes to actionable UI messages. */
export function formatAuthError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Sign-in failed. Please try again.'
  }

  const code =
    error instanceof FirebaseError
      ? error.code
      : (error as { code?: string }).code

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled. In Firebase Console → Authentication → Sign-in method, enable Google and save.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized. In Authentication → Settings → Authorized domains, add localhost (and 127.0.0.1 if needed).'
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked by the browser. Allow popups for this site, or use “Sign in with redirect”.'
    case 'auth/popup-closed-by-user':
      return 'Sign-in window was closed before finishing. Try again and complete the Google account picker.'
    case 'auth/cancelled-popup-request':
      return 'Another sign-in popup was already open. Close other popups and try once more.'
    case 'auth/network-request-failed':
      return 'Network error talking to Firebase. Check your internet connection / VPN / ad-blocker.'
    case 'auth/invalid-api-key':
      return 'Invalid Firebase API key. Check .env matches the web app config, then restart npm run dev.'
    case 'auth/configuration-not-found':
      return 'Auth is not fully set up for this project. Open Authentication in Firebase Console and complete the setup wizard.'
    case 'auth/internal-error':
      return 'Firebase internal error — often means Google provider is incomplete (missing support email) or OAuth client is misconfigured.'
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.'
    default: {
      const detail = code ? ` (${code})` : ''
      return `${error.message}${detail}`
    }
  }
}
