import type { PrintMargins, SheetCanvas } from '@/types'
import { DEFAULT_MARGINS, normalizeGridExtent } from '@/types'
import {
  clampPrintPageCount,
  computePrintPageOrigins,
  dissolvedOuterPageSize,
  getPrintPageSize,
  normalizePrintPageLayout,
  PRINT_PAGE_STACK_GAP,
  type PrintPageLayout,
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
    /** Layout used for dissolve outer size (when dissolved). */
    dissolveLayout: 'vertical' as ReturnType<typeof normalizePrintPageLayout>,
    dissolveCols: 1,
    dissolveRows: 1,
  }
}

export type PackContentBox = ReturnType<typeof getContentBox>

/**
 * Content box for Auto-layout packing.
 *
 * When `dissolvePrintArea` is on and multiple pages exist, pages merge into
 * **one super-page printable rectangle**:
 *
 * - **Outer margins only** (user margin settings on the exterior of the
 *   combined arrangement). Inter-page gutters and facing margins are gone.
 * - Layout-aware outer size:
 *   - vertical: 1 × N pages tall
 *   - horizontal: N × 1 pages wide
 *   - grid: cols × rows (e.g. 6 pages → 3×2), abutted with gap 0
 *   - free: pack as vertical dissolve
 *
 * Example (Letter 816×1056, margins 48, 6-page **grid** 3×2):
 * - outer 2448×2112, printable 2352×2016 (48px only on the outside).
 */
export function getPackContentBox(
  canvas: SheetCanvas,
  opts?: { dissolvePrintArea?: boolean },
): PackContentBox {
  const base = getContentBox(canvas)
  const count = Math.max(1, clampPrintPageCount(canvas.printPageCount ?? 1))
  const layout = normalizePrintPageLayout(canvas.printPageLayout)
  if (!opts?.dissolvePrintArea || count <= 1) {
    return {
      ...base,
      dissolved: false,
      dissolvedPageCount: count,
      dissolveLayout: layout,
      dissolveCols: 1,
      dissolveRows: 1,
    }
  }

  const page = {
    width: base.pageWidth,
    height: base.pageHeight,
  }
  const outer = dissolvedOuterPageSize(page, count, layout)
  const m = base.margins
  // Only exterior margins of the combined super-page are non-printable
  const contentWidth = Math.max(80, outer.outerW - m.left - m.right)
  const contentHeight = Math.max(80, outer.outerH - m.top - m.bottom)

  return {
    left: base.left,
    top: base.top,
    width: contentWidth,
    height: contentHeight,
    right: base.left + contentWidth,
    bottom: base.top + contentHeight,
    pageWidth: base.pageWidth,
    pageHeight: base.pageHeight,
    margins: { ...m },
    dissolved: true,
    dissolvedPageCount: count,
    dissolveLayout: outer.layout,
    dissolveCols: outer.cols,
    dissolveRows: outer.rows,
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
  const dissolve = canvas.dissolvePrintArea === true
  // Dissolve: abut pages (gap 0) for vertical / horizontal / grid so board
  // coordinates match continuous pack space. Free keeps user positions.
  const gap =
    dissolve && layout !== 'free' && count > 1 ? 0 : PRINT_PAGE_STACK_GAP
  return computePrintPageOrigins(
    page,
    count,
    layout,
    canvas.printPagePositions,
    gap,
  )
}

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

  // Dissolved multipage: one continuous printable / page super-rect
  if (
    canvas.dissolvePrintArea === true &&
    origins.length > 1 &&
    normalizePrintPageLayout(canvas.printPageLayout) !== 'free'
  ) {
    const pack = getPackContentBox(canvas, { dissolvePrintArea: true })
    const o0 = origins[0]!
    if (extent === 'printable') {
      return { ox: pack.left, oy: pack.top }
    }
    // full page super-rect origin
    return { ox: o0.x, oy: o0.y }
  }

  type Region = {
    ox: number
    oy: number
    left: number
    top: number
    right: number
    bottom: number
  }
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

/**
 * How many print page *frames* to keep after a multipage pack.
 *
 * Final count is driven by **actual packed content extent**, not the ideal-cell
 * page budget used while sizing cards. Flooring with `plannedPages` used to
 * invent empty page frames after Auto-layout (content fit page 1; UI showed 2).
 *
 * Rules:
 * - Single-page pack → 1
 * - Dissolved **grid** / **horizontal**: never below the user’s configured
 *   page count; grow if content overflows the super-page printable rect
 * - Dissolved **vertical**: height-based; keep user floor so re-pack does not
 *   silently drop frames the user set up
 * - Non-dissolved multipage: height-based stack tiles only (may drop empty frames)
 * - `plannedPages` is ignored for the final floor (kept on the API for callers)
 */
export function resolvePackedPrintPageCount(args: {
  multiPage: boolean
  dissolve: boolean
  layout: PrintPageLayout | string | undefined
  userPageCount: number
  /** @deprecated Ignored — do not invent empty frames from ideal-cell budgets. */
  plannedPages?: number
  pageWidth: number
  pageHeight: number
  margins: { top: number; right: number; bottom: number; left: number }
  contentBottom: number
  contentRight: number
  packLeft: number
  packTop: number
}): number {
  if (!args.multiPage) return 1
  const user = clampPrintPageCount(args.userPageCount)
  const layout = normalizePrintPageLayout(args.layout)
  const needW = Math.max(0, args.contentRight - args.packLeft)
  const needH = Math.max(0, args.contentBottom - args.packTop)
  const { pageWidth: pageW, pageHeight: pageH, margins: m } = args

  if (args.dissolve) {
    if (layout === 'grid') {
      let n = user
      while (n < 20) {
        const o = dissolvedOuterPageSize(
          { width: pageW, height: pageH },
          n,
          'grid',
        )
        const pw = o.outerW - m.left - m.right
        const ph = o.outerH - m.top - m.bottom
        if (pw + 1 >= needW && ph + 1 >= needH) break
        n++
      }
      return clampPrintPageCount(Math.max(n, user))
    }
    if (layout === 'horizontal') {
      let n = 1
      while (n < 20 && n * pageW - m.left - m.right + 1 < needW) n++
      return clampPrintPageCount(Math.max(n, user))
    }
    // vertical / free dissolve
    const byH = Math.max(
      1,
      Math.ceil((needH + m.top) / Math.max(1, pageH)),
    )
    return clampPrintPageCount(Math.max(byH, user))
  }

  const byH = Math.max(
    1,
    Math.ceil((needH + m.top) / Math.max(1, pageH)),
  )
  return clampPrintPageCount(byH)
}

