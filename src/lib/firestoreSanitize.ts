/**
 * Firestore rejects `undefined` anywhere in a document.
 * Strip undefined (and keep null) so addDoc/updateDoc don't fail silently.
 */
export function stripUndefined<T>(value: T): T {
  if (value === undefined) {
    return value
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => stripUndefined(v))
      .filter((v) => v !== undefined) as T
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue
    out[k] = stripUndefined(v)
  }
  return out as T
}

export function formatFirestoreError(e: unknown): string {
  if (!e || typeof e !== 'object') return 'Unknown Firestore error'
  const err = e as { code?: string; message?: string }
  const code = err.code ?? ''
  const msg = err.message ?? String(e)

  if (code === 'permission-denied' || /permission/i.test(msg)) {
    return 'Permission denied. Sign in again and confirm firestore.rules are deployed.'
  }
  if (code === 'failed-precondition' || /index/i.test(msg)) {
    return 'Missing Firestore index. Deploy indexes: firebase deploy --only firestore:indexes'
  }
  if (code === 'unavailable' || /offline|network/i.test(msg)) {
    return 'Firestore unavailable (network). Check connection and that Firestore is enabled.'
  }
  if (code === 'not-found' || /NOT_FOUND|database/i.test(msg)) {
    return 'Firestore database not found. Create the (default) database in Firebase Console.'
  }
  if (/undefined/i.test(msg)) {
    return 'Invalid data (undefined field). Try Save again after refresh.'
  }
  return msg.length > 180 ? msg.slice(0, 180) + '…' : msg
}
