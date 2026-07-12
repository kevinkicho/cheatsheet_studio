/**
 * Transient drag/resize geometry painted without Zustand item writes.
 * Avoids re-rendering the whole sheet every pointer move.
 */

export type LiveMoveDrag = {
  type: 'move'
  origins: Record<string, { x: number; y: number }>
  dx: number
  dy: number
}

export type LiveResizeDrag = {
  type: 'resize'
  rects: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >
}

export type LiveCanvasDrag = LiveMoveDrag | LiveResizeDrag | null

let live: LiveCanvasDrag = null
const listeners = new Set<() => void>()

export function getLiveCanvasDrag(): LiveCanvasDrag {
  return live
}

export function setLiveCanvasDrag(next: LiveCanvasDrag): void {
  live = next
  for (const l of listeners) l()
}

export function clearLiveCanvasDrag(): void {
  if (live === null) return
  live = null
  for (const l of listeners) l()
}

export function subscribeLiveCanvasDrag(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

/** Resolved board rect for an item while a live drag is active. */
export function liveRectForItem(
  id: string,
  base: { x: number; y: number; width: number; height: number },
  drag: LiveCanvasDrag,
): { x: number; y: number; width: number; height: number } | null {
  if (!drag) return null
  if (drag.type === 'move') {
    const o = drag.origins[id]
    if (!o) return null
    return {
      x: o.x + drag.dx,
      y: o.y + drag.dy,
      width: base.width,
      height: base.height,
    }
  }
  const r = drag.rects[id]
  return r
    ? { x: r.x, y: r.y, width: r.width, height: r.height }
    : null
}
