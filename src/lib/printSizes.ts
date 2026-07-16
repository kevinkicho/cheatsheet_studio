/**
 * Print page presets rendered on the canvas at 96 CSS px per inch
 * (standard browser mapping for print-like layouts).
 */
export type PrintSizeId =
  | 'letter'
  | 'legal'
  | 'tabloid'
  | 'a3'
  | 'a4'
  | 'a5'
  | 'custom'

export type PageOrientation = 'portrait' | 'landscape'

export interface PrintSizePreset {
  id: PrintSizeId
  label: string
  /** Short label for the top bar */
  shortLabel: string
  description: string
  /** Physical size string for UI */
  physical: string
  /** Portrait width in px @ 96dpi */
  widthIn: number
  /** Portrait height in px @ 96dpi */
  heightIn: number
}

const IN = 96 // px per inch

export const PRINT_SIZE_PRESETS: PrintSizePreset[] = [
  {
    id: 'letter',
    label: 'US Letter',
    shortLabel: 'Letter',
    description: 'Standard US letter paper',
    physical: '8.5 × 11 in',
    widthIn: 8.5 * IN,
    heightIn: 11 * IN,
  },
  {
    id: 'legal',
    label: 'US Legal',
    shortLabel: 'Legal',
    description: 'US legal paper',
    physical: '8.5 × 14 in',
    widthIn: 8.5 * IN,
    heightIn: 14 * IN,
  },
  {
    id: 'tabloid',
    label: 'Tabloid',
    shortLabel: 'Tabloid',
    description: 'Ledger / tabloid',
    physical: '11 × 17 in',
    widthIn: 11 * IN,
    heightIn: 17 * IN,
  },
  {
    id: 'a4',
    label: 'A4',
    shortLabel: 'A4',
    description: 'ISO A4 (most common outside US)',
    physical: '210 × 297 mm',
    widthIn: Math.round((210 / 25.4) * IN),
    heightIn: Math.round((297 / 25.4) * IN),
  },
  {
    id: 'a3',
    label: 'A3',
    shortLabel: 'A3',
    description: 'ISO A3',
    physical: '297 × 420 mm',
    widthIn: Math.round((297 / 25.4) * IN),
    heightIn: Math.round((420 / 25.4) * IN),
  },
  {
    id: 'a5',
    label: 'A5',
    shortLabel: 'A5',
    description: 'ISO A5 (half of A4)',
    physical: '148 × 210 mm',
    widthIn: Math.round((148 / 25.4) * IN),
    heightIn: Math.round((210 / 25.4) * IN),
  },
]

export const DEFAULT_PRINT_SIZE_ID: PrintSizeId = 'letter'
export const DEFAULT_ORIENTATION: PageOrientation = 'portrait'

export function getPrintPreset(id: PrintSizeId): PrintSizePreset | undefined {
  return PRINT_SIZE_PRESETS.find((p) => p.id === id)
}

export function resolvePagePixels(
  printSizeId: PrintSizeId = DEFAULT_PRINT_SIZE_ID,
  orientation: PageOrientation = DEFAULT_ORIENTATION,
  customWidth?: number,
  customHeight?: number,
): { width: number; height: number } {
  if (printSizeId === 'custom') {
    return {
      width: Math.max(200, customWidth ?? 816),
      height: Math.max(200, customHeight ?? 1056),
    }
  }

  const preset = getPrintPreset(printSizeId) ?? getPrintPreset('letter')!
  const w = Math.round(preset.widthIn)
  const h = Math.round(preset.heightIn)
  if (orientation === 'landscape') {
    return { width: h, height: w }
  }
  return { width: w, height: h }
}

export function formatPageSizeLabel(
  printSizeId: PrintSizeId,
  orientation: PageOrientation,
): string {
  if (printSizeId === 'custom') return 'Custom'
  const preset = getPrintPreset(printSizeId)
  if (!preset) return 'Letter'
  const ori = orientation === 'landscape' ? ' Landscape' : ''
  return `${preset.shortLabel}${ori}`
}

/** Print page pixel size for the current preset (independent of workspace size). */
export function getPrintPageSize(
  printSizeId: PrintSizeId = DEFAULT_PRINT_SIZE_ID,
  orientation: PageOrientation = DEFAULT_ORIENTATION,
): { width: number; height: number } {
  return resolvePagePixels(printSizeId, orientation)
}

/**
 * Gap between multi-page frames on the free workspace.
 * Keep as a multiple of the default 24px grid so stacked/row/grid pages
 * stay phase-aligned with the printable content grid (margins default 48px).
 */
export const PRINT_PAGE_STACK_GAP = 24

/**
 * How print page frames are arranged on the free board.
 * - vertical: top → bottom stack (default)
 * - horizontal: left → right row
 * - grid: square-ish columns × rows
 * - free: user drag-and-place positions
 */
export type PrintPageLayout = 'vertical' | 'horizontal' | 'grid' | 'free'

export const DEFAULT_PRINT_PAGE_LAYOUT: PrintPageLayout = 'vertical'

export interface PrintPageOrigin {
  x: number
  y: number
}

/** Clamp user page-count input. */
export function clampPrintPageCount(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(20, Math.round(n)))
}

export function normalizePrintPageLayout(
  layout: unknown,
): PrintPageLayout {
  if (
    layout === 'vertical' ||
    layout === 'horizontal' ||
    layout === 'grid' ||
    layout === 'free'
  ) {
    return layout
  }
  return DEFAULT_PRINT_PAGE_LAYOUT
}

/** Column count for grid layout (near-square packing). */
export function gridColumnCount(pageCount: number): number {
  const n = clampPrintPageCount(pageCount)
  if (n <= 1) return 1
  return Math.ceil(Math.sqrt(n))
}

/** Row count for grid layout given column count. */
export function gridRowCount(pageCount: number, cols?: number): number {
  const n = clampPrintPageCount(pageCount)
  if (n <= 1) return 1
  const c = cols ?? gridColumnCount(n)
  return Math.max(1, Math.ceil(n / c))
}

/**
 * Outer pixel size of a multi-page arrangement with **zero inter-page gap**
 * (dissolve mode): pages abutted into one super-page rectangle.
 *
 * - vertical: 1 × N
 * - horizontal: N × 1
 * - grid: near-square cols × rows (e.g. 6 → 3×2)
 * - free: treated as vertical stack for packing (free positions ignored)
 */
export function dissolvedOuterPageSize(
  page: { width: number; height: number },
  pageCount: number,
  layout: PrintPageLayout = DEFAULT_PRINT_PAGE_LAYOUT,
): {
  outerW: number
  outerH: number
  cols: number
  rows: number
  layout: PrintPageLayout
} {
  const n = clampPrintPageCount(pageCount)
  const mode = normalizePrintPageLayout(layout)
  if (n <= 1) {
    return {
      outerW: page.width,
      outerH: page.height,
      cols: 1,
      rows: 1,
      layout: mode,
    }
  }
  if (mode === 'horizontal') {
    return {
      outerW: n * page.width,
      outerH: page.height,
      cols: n,
      rows: 1,
      layout: mode,
    }
  }
  if (mode === 'grid') {
    const cols = gridColumnCount(n)
    const rows = gridRowCount(n, cols)
    return {
      outerW: cols * page.width,
      outerH: rows * page.height,
      cols,
      rows,
      layout: mode,
    }
  }
  // vertical + free (pack as vertical dissolve)
  return {
    outerW: page.width,
    outerH: n * page.height,
    cols: 1,
    rows: n,
    layout: mode === 'free' ? 'vertical' : mode,
  }
}

/**
 * Auto layout origins (ignores free positions). Used when seeding free mode
 * or when layout is not free.
 */
export function autoPrintPageOrigins(
  page: { width: number; height: number },
  pageCount: number,
  layout: Exclude<PrintPageLayout, 'free'> | 'vertical' = 'vertical',
  gap = PRINT_PAGE_STACK_GAP,
): PrintPageOrigin[] {
  const n = clampPrintPageCount(pageCount)
  if (layout === 'horizontal') {
    return Array.from({ length: n }, (_, i) => ({
      x: i * (page.width + gap),
      y: 0,
    }))
  }
  if (layout === 'grid') {
    const cols = gridColumnCount(n)
    return Array.from({ length: n }, (_, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      return {
        x: col * (page.width + gap),
        y: row * (page.height + gap),
      }
    })
  }
  // vertical
  return Array.from({ length: n }, (_, i) => ({
    x: 0,
    y: i * (page.height + gap),
  }))
}

/**
 * Resolve page frame origins for the current layout mode.
 * Free mode uses stored positions (with vertical fallback for missing entries).
 */
export function computePrintPageOrigins(
  page: { width: number; height: number },
  pageCount: number,
  layout: PrintPageLayout = DEFAULT_PRINT_PAGE_LAYOUT,
  freePositions?: PrintPageOrigin[] | null,
  gap = PRINT_PAGE_STACK_GAP,
): PrintPageOrigin[] {
  const n = clampPrintPageCount(pageCount)
  const mode = normalizePrintPageLayout(layout)

  if (mode === 'free') {
    const fallback = autoPrintPageOrigins(page, n, 'vertical', gap)
    return Array.from({ length: n }, (_, i) => {
      const p = freePositions?.[i]
      if (
        p &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y)
      ) {
        return { x: Math.round(p.x), y: Math.round(p.y) }
      }
      return fallback[i]!
    })
  }

  return autoPrintPageOrigins(
    page,
    n,
    mode as Exclude<PrintPageLayout, 'free'>,
    gap,
  )
}

/**
 * Bounding box of all page frames under the current layout.
 * Used for workspace sizing and fit-to-viewport.
 */
export function multiPageLayoutBounds(
  page: { width: number; height: number },
  pageCount: number,
  layout: PrintPageLayout = DEFAULT_PRINT_PAGE_LAYOUT,
  freePositions?: PrintPageOrigin[] | null,
  gap = PRINT_PAGE_STACK_GAP,
): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  origins: PrintPageOrigin[]
} {
  const origins = computePrintPageOrigins(
    page,
    pageCount,
    layout,
    freePositions,
    gap,
  )
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const o of origins) {
    minX = Math.min(minX, o.x)
    minY = Math.min(minY, o.y)
    maxX = Math.max(maxX, o.x + page.width)
    maxY = Math.max(maxY, o.y + page.height)
  }
  if (!Number.isFinite(minX)) {
    return {
      minX: 0,
      minY: 0,
      maxX: page.width,
      maxY: page.height,
      width: page.width,
      height: page.height,
      origins,
    }
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    origins,
  }
}

/**
 * Total size occupied by N page frames (legacy name — vertical stack default).
 * Prefer multiPageLayoutBounds for layout-aware sizing.
 */
export function multiPageStackSize(
  page: { width: number; height: number },
  pageCount: number,
  gap = PRINT_PAGE_STACK_GAP,
): { width: number; height: number } {
  const b = multiPageLayoutBounds(page, pageCount, 'vertical', null, gap)
  return { width: b.width, height: b.height }
}

/** Top Y of page index (0-based) in the vertical stack (legacy). */
export function printPageOffsetY(
  pageHeight: number,
  pageIndex: number,
  gap = PRINT_PAGE_STACK_GAP,
): number {
  return pageIndex * (pageHeight + gap)
}

/**
 * Grow / shrink free-position array to match page count.
 * New pages continue below the last known page (or vertical stack).
 */
export function resizeFreePagePositions(
  existing: PrintPageOrigin[] | undefined | null,
  page: { width: number; height: number },
  pageCount: number,
  gap = PRINT_PAGE_STACK_GAP,
): PrintPageOrigin[] {
  const n = clampPrintPageCount(pageCount)
  const next: PrintPageOrigin[] = []
  for (let i = 0; i < n; i++) {
    const p = existing?.[i]
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      next.push({ x: Math.round(p.x), y: Math.round(p.y) })
    } else if (i > 0 && next[i - 1]) {
      const prev = next[i - 1]!
      next.push({ x: prev.x, y: prev.y + page.height + gap })
    } else {
      next.push({ x: 0, y: i * (page.height + gap) })
    }
  }
  return next
}
