import { createId } from '@/lib/ids'

/**
 * Persistent local image storage (IndexedDB).
 *
 * `blob:` URLs from URL.createObjectURL die on refresh. We store the file
 * bytes in IndexedDB and keep a stable `local-asset:<id>` ref on the card.
 * FigureView resolves that ref to a session blob URL for display.
 */

const DB_NAME = 'cheatsheet-local-images'
const DB_VERSION = 1
const STORE = 'images'

export const LOCAL_ASSET_PREFIX = 'local-asset:'

export function isLocalAssetRef(url: string | undefined | null): boolean {
  return Boolean(url && url.startsWith(LOCAL_ASSET_PREFIX))
}

/** Session-only object URLs — never persist these on cards. */
export function isEphemeralBlobUrl(url: string | undefined | null): boolean {
  return Boolean(url && url.startsWith('blob:'))
}

export function isPersistentImageUrl(url: string | undefined | null): boolean {
  if (!url) return false
  if (isEphemeralBlobUrl(url)) return false
  return (
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('data:image/') ||
    isLocalAssetRef(url)
  )
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to open image database'))
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () =>
      reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export type LocalImageRecord = {
  blob: Blob
  contentType: string
  name?: string
  createdAt: number
}

/** Store a file/blob; returns a durable `local-asset:<id>` reference. */
export async function saveLocalImage(
  file: Blob,
  meta?: { name?: string; contentType?: string },
): Promise<string> {
  const id = createId('asset')
  const contentType =
    meta?.contentType ||
    file.type ||
    'application/octet-stream'
  const record: LocalImageRecord = {
    blob: file,
    contentType,
    name: meta?.name,
    createdAt: Date.now(),
  }
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).put(record, id))
  } finally {
    db.close()
  }
  return `${LOCAL_ASSET_PREFIX}${id}`
}

export async function getLocalImageRecord(
  ref: string,
): Promise<LocalImageRecord | null> {
  if (!isLocalAssetRef(ref)) return null
  const id = ref.slice(LOCAL_ASSET_PREFIX.length)
  if (!id) return null
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const row = await idbReq(
      tx.objectStore(STORE).get(id) as IDBRequest<LocalImageRecord | undefined>,
    )
    return row ?? null
  } catch {
    return null
  } finally {
    db.close()
  }
}

/** Read as File-like Blob for Storage upload. */
export async function getLocalImageBlob(ref: string): Promise<Blob | null> {
  const rec = await getLocalImageRecord(ref)
  return rec?.blob ?? null
}

/** File → data URL (fallback if IndexedDB fails). Keeps GIFs animated. */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      if (typeof r === 'string') resolve(r)
      else reject(new Error('Failed to read file as data URL'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(file)
  })
}

/**
 * Prefer IndexedDB (`local-asset:`) so large GIFs survive refresh without
 * bloating Firestore. Falls back to data URL if IDB is unavailable.
 */
export async function persistLocalImageFile(
  file: File | Blob,
  name?: string,
): Promise<{ url: string; via: 'idb' | 'data' }> {
  const contentType =
    file.type ||
    (name?.toLowerCase().endsWith('.gif') ? 'image/gif' : 'image/png')
  try {
    const url = await saveLocalImage(file, {
      name: name ?? (file instanceof File ? file.name : undefined),
      contentType,
    })
    return { url, via: 'idb' }
  } catch (e) {
    console.warn('[localImageStore] IndexedDB failed, using data URL', e)
    const url = await fileToDataUrl(file)
    return { url, via: 'data' }
  }
}
