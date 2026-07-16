/** 8-point free-transform handles (corners + edges). */
export type ResizeHandle =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw'

export const MIN_CARD_W = 80
export const MIN_CARD_H = 48

export type Rect = { x: number; y: number; w: number; h: number }

export type ItemRect = {
  x: number
  y: number
  width: number
  height: number
}

/** Cursor CSS for each handle. */
export const RESIZE_CURSOR: Record<ResizeHandle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

/**
 * Resize a rect from a handle by pointer delta (canvas space).
 * Opposite edge/corner stays fixed (true free transform).
 */
export function applyHandleToRect(
  bounds: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minW = MIN_CARD_W,
  minH = MIN_CARD_H,
): Rect {
  let { x, y, w, h } = bounds

  const growE = () => {
    w = Math.max(minW, bounds.w + dx)
  }
  const growW = () => {
    const nw = Math.max(minW, bounds.w - dx)
    x = bounds.x + (bounds.w - nw)
    w = nw
  }
  const growS = () => {
    h = Math.max(minH, bounds.h + dy)
  }
  const growN = () => {
    const nh = Math.max(minH, bounds.h - dy)
    y = bounds.y + (bounds.h - nh)
    h = nh
  }

  switch (handle) {
    case 'e':
      growE()
      break
    case 'w':
      growW()
      break
    case 's':
      growS()
      break
    case 'n':
      growN()
      break
    case 'se':
      growE()
      growS()
      break
    case 'sw':
      growW()
      growS()
      break
    case 'ne':
      growE()
      growN()
      break
    case 'nw':
      growW()
      growN()
      break
  }

  return { x, y, w, h }
}

/**
 * Map items from an old group bounds into a new group bounds (uniform scale
 * from the transformed box). Used for multi-select free transform.
 */
export function mapItemsToNewBounds(
  items: Record<string, ItemRect>,
  oldBounds: Rect,
  newBounds: Rect,
  minW = MIN_CARD_W,
  minH = MIN_CARD_H,
): Record<string, ItemRect> {
  const ox = oldBounds.w > 0.5 ? oldBounds.w : 1
  const oy = oldBounds.h > 0.5 ? oldBounds.h : 1
  const sx = newBounds.w / ox
  const sy = newBounds.h / oy
  const out: Record<string, ItemRect> = {}
  for (const [id, it] of Object.entries(items)) {
    out[id] = {
      x: newBounds.x + (it.x - oldBounds.x) * sx,
      y: newBounds.y + (it.y - oldBounds.y) * sy,
      width: Math.max(minW, it.width * sx),
      height: Math.max(minH, it.height * sy),
    }
  }
  return out
}

/** Bounds of a set of item rects (no padding). */
export function boundsOfItems(items: Iterable<ItemRect>): Rect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let n = 0
  for (const it of items) {
    n++
    minX = Math.min(minX, it.x)
    minY = Math.min(minY, it.y)
    maxX = Math.max(maxX, it.x + it.width)
    maxY = Math.max(maxY, it.y + it.height)
  }
  if (n === 0 || !Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * Absolute positions for 8 free-transform handles.
 * Anchored on the edge/corner center so half the control sits outside
 * the card (needs parent overflow: visible).
 */
export const HANDLE_LAYOUT: {
  id: ResizeHandle
  className: string
}[] = [
  {
    id: 'nw',
    className: 'absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2',
  },
  {
    id: 'n',
    className: 'absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2',
  },
  {
    id: 'ne',
    className: 'absolute right-0 top-0 translate-x-1/2 -translate-y-1/2',
  },
  {
    id: 'e',
    className: 'absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
  },
  {
    id: 'se',
    className: 'absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2',
  },
  {
    id: 's',
    className: 'absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
  },
  {
    id: 'sw',
    className: 'absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2',
  },
  {
    id: 'w',
    className: 'absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
  },
]

/** Visible grip size (px, canvas space). Hit area is larger. */
export const HANDLE_VISUAL_PX = 10
/**
 * Base pointer target for grips (canvas px at zoom=1).
 * Prefer handleHitPx(zoom) so screen-space target stays ~22px when zoomed out.
 */
export const HANDLE_HIT_PX = 22

/**
 * Screen-stable hit size for free-transform grips.
 * Handles live in canvas space (inside the zoomed surface), so a fixed 16px
 * target becomes ~8px on screen at 50% zoom — hard to grab. Inverse-zoom
 * keeps ~minScreenPx under the cursor.
 */
export function handleHitPx(
  zoom: number,
  minScreenPx = 22,
  maxCanvasPx = 44,
): number {
  const z = Number.isFinite(zoom) && zoom > 0.05 ? zoom : 1
  return Math.min(
    maxCanvasPx,
    Math.max(HANDLE_HIT_PX, Math.round(minScreenPx / z)),
  )
}

/**
 * Cards sit above layout-panel title chips (titles use z≈25–40). Without this
 * base, low zIndex cards render under title chips and feel “unclickable”.
 */
export const CARD_STACK_BASE = 100

/**
 * Float for the active single-selected card so corner grips (half outside the
 * box) are not stolen by a higher-z neighbor sitting on that corner.
 * Multi-select uses a similar boost in CanvasItemView / MultiSelectFrame.
 */
export const CARD_SELECTED_FLOAT = 10_000
