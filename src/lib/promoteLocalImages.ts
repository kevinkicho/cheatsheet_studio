import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { createId } from '@/lib/ids'
import {
  getLocalImageRecord,
  isEphemeralBlobUrl,
  isLocalAssetRef,
} from '@/lib/localImageStore'
import type { CanvasItem } from '@/types'

function extFromContentType(ct: string, name?: string): string {
  const fromName = name?.split('.').pop()?.toLowerCase()
  if (
    fromName &&
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(fromName)
  ) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('svg')) return 'svg'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  return 'bin'
}

/**
 * Before cloud save: upload IndexedDB-backed images to Firebase Storage and
 * rewrite card URLs. Also strips dead `blob:` URLs (cannot be recovered).
 * Returns items safe to write to Firestore + whether canvas should update.
 */
export async function promoteLocalImagesForCloud(
  uid: string,
  items: CanvasItem[],
): Promise<{ items: CanvasItem[]; changed: boolean }> {
  let changed = false
  const next: CanvasItem[] = []

  for (const item of items) {
    const url = item.imageUrl

    if (isEphemeralBlobUrl(url)) {
      // Unrecoverable after refresh — clear so Firestore doesn't store junk
      next.push({ ...item, imageUrl: undefined, imagePath: undefined })
      changed = true
      continue
    }

    if (!isLocalAssetRef(url) || !url) {
      next.push(item)
      continue
    }

    try {
      const rec = await getLocalImageRecord(url)
      if (!rec?.blob) {
        next.push(item)
        continue
      }
      const ext = extFromContentType(rec.contentType, rec.name)
      const path = `users/${uid}/images/${createId('img')}.${ext}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, rec.blob, {
        contentType: rec.contentType || 'application/octet-stream',
        customMetadata: rec.name
          ? { originalName: rec.name.slice(0, 200) }
          : undefined,
      })
      const downloadUrl = await getDownloadURL(storageRef)
      next.push({
        ...item,
        imageUrl: downloadUrl,
        imagePath: path,
      })
      changed = true
    } catch (e) {
      console.warn('[promoteLocalImages] upload failed, keeping local ref', e)
      // Keep local-asset ref — cloud save may still fail if other fields huge;
      // at least local display still works after refresh.
      next.push(item)
    }
  }

  return { items: next, changed }
}
