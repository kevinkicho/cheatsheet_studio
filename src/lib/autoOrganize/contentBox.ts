import type { PrintMargins, SheetCanvas } from '@/types'
import { DEFAULT_MARGINS, normalizeGridExtent } from '@/types'
import {
  clampPrintPageCount,
  computePrintPageOrigins,
  getPrintPageSize,
  normalizePrintPageLayout,
} from '@/lib/printSizes'
import { ORGANIZE_GRID } from './constants'

/**
 * Snap a coordinate to the grid, optionally offset from a content-box origin
 * so lines align with the printable area (not board 0,0).
 */
export function snapToGridValue(
  n: number,
  grid = ORGANIZE_GRID,
  origin = 0,
): number {
  if (!Number.isFinite(n) || grid <= 0) return n
  return Math.round((n - origin) / grid) * grid + origin
}

/**
 * Content box for auto-organize = print page (not full workspace) − margins.
 * Falls back to workspace if print size is missing.
 * @param pageOrigin optional page frame origin (multi-page layouts)
 */
export function getContentBox(
  canvas: SheetCanvas,
  pageOrigin: { x: number; y: number } = { x: 0, y: 0 },
) {
  const margins: PrintMargins = {
    ...DEFAULT_MARGINS,
    ...(canvas.margins ?? {}),
  }

  const page = getPrintPageSize(
    canvas.printSizeId ?? 'letter',
    canvas.orientation ?? 'portrait',
  )
  const pageW = page.width
  const pageH = page.height

  const maxMarginX = Math.max(0, Math.floor((pageW - 80) / 2))
  const maxMarginY = Math.max(0, Math.floor((pageH - 80) / 2))
  const left = Math.min(Math.max(0, margins.left), maxMarginX)
  const right = Math.min(Math.max(0, margins.right), maxMarginX)
  const top = Math.min(Math.max(0, margins.top), maxMarginY)
  const bottom = Math.min(Math.max(0, margins.bottom), maxMarginY)

  const contentLeft = pageOrigin.x + left
  const contentTop = pageOrigin.y + top
  const contentWidth = Math.max(80, pageW - left - right)
  const contentHeight = Math.max(80, pageH - top - bottom)

  return {
    left: contentLeft,
    top: contentTop,
    width: contentWidth,
    height: contentHeight,
    right: contentLeft + contentWidth,
    bottom: contentTop + contentHeight,
    pageWidth: pageW,
    pageHeight: pageH,
    margins: { top, right, bottom, left },
    /** False unless built via getPackContentBox with dissolve. */
    dissolved: false as boolean,
    dissolvedPageCount: 1,
  }
}

export type PackContentBox = ReturnType<typeof getContentBox>

/**
 * Content box for Auto-layout packing.
 *
 * When `dissolvePrintArea` is on and multiple pages exist, contiguous pages
 * merge into one continuous printable band: **inter-page margin gutters are
 * freed** so pack height grows to `pages × pageH − outer top/bottom margins`.
 *
 * **Width always respects the printable content box** (page − left/right
 * margins) — dissolve does not grow sideways past the green print area.
 */
export function getPackContentBox(
  canvas: SheetCanvas,
  opts?: { dissolvePrintArea?: boolean },
): PackContentBox {
  const base = getContentBox(canvas)
  const count = Math.max(1, clampPrintPageCount(canvas.printPageCount ?? 1))
  if (!opts?.dissolvePrintArea || count <= 1) {
    return { ...base, dissolved: false, dissolvedPageCount: count }
  }

  // Free only inter-page gutters (vertical). Keep full left/right margins.
  const freeH = Math.max(
    base.height,
    count * base.pageHeight - base.margins.top - base.margins.bottom,
  )

  return {
    left: base.left,
    top: base.top,
    width: base.width,
    height: freeH,
    right: base.right,
    bottom: base.top + freeH,
    pageWidth: base.pageWidth,
    pageHeight: base.pageHeight,
    margins: { ...base.margins },
    dissolved: true,
    dissolvedPageCount: count,
  }
}

/** Page frame origins for the current multi-page layout. */
export function getPrintPageOriginsForCanvas(canvas: SheetCanvas) {
  const page = getPrintPageSize(
    canvas.printSizeId ?? 'letter',
    canvas.orientation ?? 'portrait',
  )
  const count = clampPrintPageCount(canvas.printPageCount ?? 1)
  const layout = normalizePrintPageLayout(canvas.printPageLayout)
  return computePrintPageOrigins(
    page,
    count,
    layout,
    canvas.printPagePositions,
  )
}

/** All printable content boxes for the current multi-page layout. */

/**
 * Snap origin for a board point based on grid extent:
 * - board → (0,0)
 * - page → top-left of the page frame under the point
 * - printable → top-left of that page’s margin content box
 */
export function getPrintAwareSnapOrigin(
  x: number,
  y: number,
  canvas: SheetCanvas,
): { ox: number; oy: number } {
  const extent = normalizeGridExtent(canvas.gridExtent)
  if (canvas.showPrintArea === false || extent === 'board') {
    return { ox: 0, oy: 0 }
  }

  const page = getPrintPageSize(
    canvas.printSizeId ?? 'letter',
    canvas.orientation ?? 'portrait',
  )
  const origins = getPrintPageOriginsForCanvas(canvas)
  if (origins.length === 0) return { ox: 0, oy: 0 }

  type Region = { ox: number; oy: number; left: number; top: number; right: number; bottom: number }
  const regions: Region[] = origins.map((o) => {
    if (extent === 'printable') {
      const box = getContentBox(canvas, o)
      return {
        ox: box.left,
        oy: box.top,
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      }
    }
    // full page
    return {
      ox: o.x,
      oy: o.y,
      left: o.x,
      top: o.y,
      right: o.x + page.width,
      bottom: o.y + page.height,
    }
  })

  for (const r of regions) {
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) {
      return { ox: r.ox, oy: r.oy }
    }
  }

  let best = regions[0]!
  let bestD = Infinity
  for (const r of regions) {
    const cx = Math.min(Math.max(x, r.left), r.right)
    const cy = Math.min(Math.max(y, r.top), r.bottom)
    const d = (x - cx) ** 2 + (y - cy) ** 2
    if (d < bestD) {
      bestD = d
      best = r
    }
  }
  return { ox: best.ox, oy: best.oy }
}



