import { stripUndefined } from '@/lib/firestoreSanitize'
import type { CanvasItem, OutlinerFolder, SheetCanvas } from '@/types'

/** Build a Firestore-safe sheet document body (no undefined fields). */
export function buildSheetPayload(
  uid: string,
  title: string,
  canvas: SheetCanvas,
  items: CanvasItem[],
  now: number,
  includeCreatedAt: boolean,
  folders: OutlinerFolder[] = [],
) {
  const base = {
    ownerId: uid,
    title,
    updatedAt: now,
    canvas,
    items,
    folders,
    ...(includeCreatedAt ? { createdAt: now } : {}),
  }
  return stripUndefined(base)
}
