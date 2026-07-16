import type { LibraryItem } from '@/types'

/**
 * Estimated card size when placing a library item on the board.
 * Matches canvasStore.addFromLibrary / CanvasDragPreview defaults.
 */
export function estimateLibraryCardSize(lib: LibraryItem): {
  width: number
  height: number
} {
  if (lib.type === 'table' && lib.tableMarkdown) {
    const lines = lib.tableMarkdown
      .trim()
      .split('\n')
      .filter(
        (l) => l.includes('|') && !/^\|?\s*[-:| ]+\s*\|?$/.test(l.trim()),
      )
    const cols = Math.max(
      ...lines.map(
        (l) =>
          l
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|').length,
      ),
      1,
    )
    const rows = Math.max(lines.length, 1)
    return {
      width: Math.min(520, Math.max(220, cols * 88 + 40)),
      height: Math.min(480, Math.max(100, rows * 28 + 48)),
    }
  }
  if (lib.type === 'figure' || lib.type === 'plot') {
    return { width: 240, height: 220 }
  }
  if (lib.type === 'definition') {
    const bodyLen = (lib.body ?? '').length
    return {
      width: Math.min(360, Math.max(200, 180 + Math.min(bodyLen, 120))),
      height: Math.min(220, Math.max(88, 64 + Math.ceil(bodyLen / 40) * 18)),
    }
  }
  if (lib.type === 'list') {
    const n = Math.max(lib.listItems?.length ?? 1, 1)
    return {
      width: 260,
      height: Math.min(320, Math.max(80, 40 + n * 28)),
    }
  }
  if (lib.type === 'callout') {
    const bodyLen = (lib.body ?? '').length
    return {
      width: Math.min(340, Math.max(200, 160 + Math.min(bodyLen, 100))),
      height: Math.min(200, Math.max(72, 56 + Math.ceil(bodyLen / 50) * 16)),
    }
  }
  if (lib.type === 'code') {
    const lines = Math.max((lib.code ?? '').split('\n').length, 1)
    const maxLine = Math.max(
      ...(lib.code ?? '')
        .split('\n')
        .map((l) => l.length),
      12,
    )
    return {
      width: Math.min(420, Math.max(200, maxLine * 7 + 40)),
      height: Math.min(360, Math.max(72, 36 + lines * 18)),
    }
  }
  if (lib.type === 'constant') {
    return { width: 260, height: 80 }
  }
  if (lib.type === 'identity-set') {
    const n = Math.max(lib.identities?.length ?? 1, 1)
    return {
      width: 300,
      height: Math.min(280, Math.max(72, 36 + n * 36)),
    }
  }
  if (lib.type === 'matrix') {
    const rows = lib.matrixRows?.length ?? 2
    const cols = lib.matrixRows?.[0]?.length ?? 2
    return {
      width: Math.min(360, Math.max(160, cols * 48 + 48)),
      height: Math.min(280, Math.max(80, rows * 36 + 40)),
    }
  }
  // Equations — tight default; autoFit snugs further after KaTeX measures
  return { width: 240, height: 72 }
}

export type DragEndLike = {
  activatorEvent: Event
  delta: { x: number; y: number }
  active: {
    rect: {
      current: {
        translated?: {
          left: number
          top: number
          width: number
          height: number
        } | null
        initial?: {
          left: number
          top: number
          width: number
          height: number
        } | null
      }
    }
  }
}

/**
 * Client rect of the in-flight drag preview (where the ghost is drawn).
 * Prefer the live DragOverlay DOM; fall back to the active node’s translated rect.
 */
export function dragPreviewClientRect(event: DragEndLike): {
  left: number
  top: number
  width: number
  height: number
} | null {
  // dnd-kit DragOverlay is portaled to document.body while dragging
  const overlay =
    typeof document !== 'undefined'
      ? (document.querySelector(
          '[data-dnd-kit-drag-overlay], #dnd-kit-advanced-draggables-overlay, body > div[style*="pointer-events"]',
        ) as HTMLElement | null)
      : null

  // Prefer an element that looks like our card preview (has ring / known size)
  const fromDom =
    (typeof document !== 'undefined' &&
      (document.querySelector(
        '[data-canvas-drag-preview]',
      ) as HTMLElement | null)) ||
    null

  const el = fromDom ?? null
  if (el) {
    const r = el.getBoundingClientRect()
    // Prefer explicit measured box from CanvasDragPreview (stable, no ring/subpixel drift)
    const attrW = Number(el.getAttribute('data-preview-width'))
    const attrH = Number(el.getAttribute('data-preview-height'))
    const width =
      Number.isFinite(attrW) && attrW > 4
        ? attrW
        : r.width
    const height =
      Number.isFinite(attrH) && attrH > 4
        ? attrH
        : r.height
    if (width > 4 && height > 4) {
      return { left: r.left, top: r.top, width, height }
    }
  }

  // Fallback: active draggable translated rect (library tile position while dragging)
  const t = event.active.rect.current.translated
  if (t && Number.isFinite(t.left) && Number.isFinite(t.top)) {
    return {
      left: t.left,
      top: t.top,
      width: t.width,
      height: t.height,
    }
  }

  // Last resort: cursor
  const ae = event.activatorEvent
  if (
    ae &&
    typeof (ae as PointerEvent).clientX === 'number' &&
    Number.isFinite((ae as PointerEvent).clientX)
  ) {
    return {
      left: (ae as PointerEvent).clientX + event.delta.x,
      top: (ae as PointerEvent).clientY + event.delta.y,
      width: 0,
      height: 0,
    }
  }

  void overlay
  return null
}

/**
 * Convert the drag-preview’s top-left (client) to canvas coordinates.
 * Surface uses transform: scale(zoom) with origin top-left.
 */
export function previewRectToCanvasDrop(
  preview: { left: number; top: number },
  surfaceRect: { left: number; top: number },
  zoom: number,
): { x: number; y: number } {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return {
    x: Math.max(0, Math.round((preview.left - surfaceRect.left) / z)),
    y: Math.max(0, Math.round((preview.top - surfaceRect.top) / z)),
  }
}

/**
 * Convert drag-preview screen size → canvas card size.
 * The ghost lives outside the zoomed surface (always 1:1 CSS px), so we
 * undo board zoom so the dropped card matches the ghost’s on-screen box.
 */
export function previewSizeToCanvasSize(
  preview: { width: number; height: number },
  zoom: number,
): { width: number; height: number } {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return {
    width: Math.max(40, Math.round(preview.width / z)),
    height: Math.max(30, Math.round(preview.height / z)),
  }
}

/** Options when placing a library item (e.g. from drag-preview WYSIWYG drop). */
export type AddFromLibraryOptions = {
  /** Explicit card size in canvas units (from live drag preview). */
  width?: number
  height?: number
  /**
   * When true, size already matches the ghost — freeze autoFit so a second
   * measure pass does not jump width/height after drop.
   */
  matchPreview?: boolean
}

/** @deprecated Prefer dragPreviewClientRect + previewRectToCanvasDrop */
export function dragEndClientPoint(event: DragEndLike): {
  clientX: number
  clientY: number
} {
  const r = dragPreviewClientRect(event)
  if (r) return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
  return { clientX: 0, clientY: 0 }
}

/** @deprecated Prefer previewRectToCanvasDrop for WYSIWYG placement */
export function clientPointToCanvasDrop(
  clientX: number,
  clientY: number,
  surfaceRect: { left: number; top: number },
  zoom: number,
  card: { width: number; height: number },
  anchor: 'center' | 'top-left' = 'top-left',
): { x: number; y: number } {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const canvasX = (clientX - surfaceRect.left) / z
  const canvasY = (clientY - surfaceRect.top) / z
  const x = anchor === 'center' ? canvasX - card.width / 2 : canvasX
  const y = anchor === 'center' ? canvasY - card.height / 2 : canvasY
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
  }
}

/**
 * Place a card at the center of the currently visible main-canvas viewport
 * (what the user is looking at), not a fixed top-left cascade.
 *
 * Falls back to a small corner stack if the canvas DOM is not mounted.
 */
export function placeCardInVisibleViewport(
  card: { width: number; height: number },
  cascadeIndex = 0,
): { x: number; y: number } {
  if (typeof document === 'undefined') {
    return {
      x: 90 + (cascadeIndex % 5) * 28,
      y: 90 + (cascadeIndex % 5) * 28,
    }
  }

  const surface = document.getElementById('main-canvas-surface')
  const vp =
    (document.querySelector(
      '[data-main-canvas-viewport]',
    ) as HTMLElement | null) ??
    (() => {
      let el: HTMLElement | null = surface?.parentElement ?? null
      while (el) {
        const { overflow, overflowX, overflowY } = getComputedStyle(el)
        if (
          /auto|scroll/.test(overflow) ||
          /auto|scroll/.test(overflowX) ||
          /auto|scroll/.test(overflowY)
        ) {
          return el
        }
        el = el.parentElement
      }
      return null
    })()

  if (!surface) {
    return {
      x: 90 + (cascadeIndex % 5) * 28,
      y: 90 + (cascadeIndex % 5) * 28,
    }
  }

  const zoomRaw = Number(surface.dataset.zoom)
  const zoom = Number.isFinite(zoomRaw) && zoomRaw > 0.01 ? zoomRaw : 1
  const surfaceRect = surface.getBoundingClientRect()

  // Center of the visible viewport in client (screen) coords
  let clientX: number
  let clientY: number
  if (vp) {
    const r = vp.getBoundingClientRect()
    clientX = r.left + r.width / 2
    clientY = r.top + r.height / 2
  } else {
    clientX = surfaceRect.left + surfaceRect.width / 2
    clientY = surfaceRect.top + surfaceRect.height / 2
  }

  const base = clientPointToCanvasDrop(
    clientX,
    clientY,
    { left: surfaceRect.left, top: surfaceRect.top },
    zoom,
    card,
    'center',
  )
  // Slight cascade so repeated adds don't perfectly stack
  const step = (cascadeIndex % 6) * 20
  return {
    x: Math.max(0, base.x + step),
    y: Math.max(0, base.y + step),
  }
}
