/**
 * Bulk catalog in Firebase Realtime Database.
 *
 * One read of `catalog/v1` loads meta + all items (JSON string) — avoids
 * N Firestore document fetches on every app boot.
 *
 * Path:
 *   catalog/v1/meta      — CatalogMeta
 *   catalog/v1/itemsJson — stringified LibraryItem[]
 */
import { get, ref, set } from 'firebase/database'
import { rtdb } from '@/lib/firebase'
import type { LibraryItem } from '@/types'
import type { CatalogMeta, CatalogSnapshot } from './catalogTypes'
import { countsBySubject } from './catalogInventory'

const ROOT = 'catalog/v1'

export function isRtdbConfigured(): boolean {
  return Boolean(rtdb)
}

export async function loadCatalogFromRtdb(): Promise<CatalogSnapshot | null> {
  if (!rtdb) return null
  try {
    const snap = await get(ref(rtdb, ROOT))
    if (!snap.exists()) return null
    const val = snap.val() as {
      meta?: CatalogMeta
      itemsJson?: string
      items?: LibraryItem[]
    }
    let items: LibraryItem[] = []
    if (typeof val.itemsJson === 'string' && val.itemsJson.length > 2) {
      items = JSON.parse(val.itemsJson) as LibraryItem[]
    } else if (Array.isArray(val.items)) {
      items = val.items
    } else if (val.items && typeof val.items === 'object') {
      items = Object.values(val.items as Record<string, LibraryItem>)
    }
    if (!items.length) return null
    const meta: CatalogMeta = val.meta ?? {
      version: 1,
      updatedAt: Date.now(),
      itemCount: items.length,
      source: 'rtdb',
    }
    return {
      meta: { ...meta, itemCount: items.length, source: 'rtdb' },
      items,
    }
  } catch (e) {
    console.warn('[catalogRtdb] load failed', e)
    return null
  }
}

export async function publishCatalogToRtdb(
  items: LibraryItem[],
  opts?: { note?: string; model?: string; source?: CatalogMeta['source'] },
): Promise<CatalogMeta> {
  if (!rtdb) {
    throw new Error(
      'Realtime Database not configured. Set VITE_FIREBASE_DATABASE_URL in .env and enable RTDB in Firebase Console.',
    )
  }
  const meta: CatalogMeta = {
    version: Date.now(),
    updatedAt: Date.now(),
    itemCount: items.length,
    source: opts?.source ?? 'rtdb',
    model: opts?.model,
    note: opts?.note,
    bySubject: countsBySubject(items),
  }
  // Single bulk write — one download on next boot
  await set(ref(rtdb, ROOT), {
    meta,
    itemsJson: JSON.stringify(items),
  })
  return meta
}

export async function loadCatalogMetaOnly(): Promise<CatalogMeta | null> {
  if (!rtdb) return null
  try {
    const snap = await get(ref(rtdb, `${ROOT}/meta`))
    if (!snap.exists()) return null
    return snap.val() as CatalogMeta
  } catch {
    return null
  }
}
