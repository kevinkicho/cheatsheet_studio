import type { CanvasItem, PrintMargins, SheetCanvas } from '@/types'
import {
  DEFAULT_MARGINS,
  DEFAULT_TITLE_FONT_SIZE,
  normalizeGridExtent,
  titleBandPx,
} from '@/types'
import {
  clampPrintPageCount,
  computePrintPageOrigins,
  getPrintPageSize,
  normalizePrintPageLayout,
} from '@/lib/printSizes'

/**
 * Default snap / display grid (px).
 * 24px aligns with 0.5″ (48px) Letter margins: 48/24 = 2 cells.
 */
export const ORGANIZE_GRID = 24
const DEFAULT_GAP = 16

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
export function getAllPrintContentBoxes(canvas: SheetCanvas) {
  return getPrintPageOriginsForCanvas(canvas).map((o) =>
    getContentBox(canvas, o),
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

function snapUp(n: number, grid: number) {
  return Math.ceil(n / grid) * grid
}

function snapDown(n: number, grid: number) {
  return Math.floor(n / grid) * grid
}

/**
 * Grid-based auto-organize:
 *
 * 1. Take the printable content box (page − margins) at click time
 * 2. Divide it into a fine grid (default 24px — fits 0.5″ margins)
 * 3. Sort cards by current reading order (top→bottom, left→right)
 * 4. Pack left→right, wrap to next grid row when the next card won't fit
 * 5. Snap every position to the grid so columns/rows line up cleanly
 *
 * Card sizes are preserved (only snapped up to whole cells for spacing math).
 * autoFit is frozen so measure-pass doesn't undo the layout.
 */
export function layoutItemsInRows(
  items: CanvasItem[],
  canvas: SheetCanvas,
  options: { gap?: number; grid?: number } = {},
): CanvasItem[] {
  if (items.length === 0) return items

  const gap = options.gap ?? DEFAULT_GAP
  const grid = Math.max(4, options.grid ?? canvas.gridSpacing ?? ORGANIZE_GRID)
  const box = getContentBox(canvas)

  // Grid origin = content box top-left; usable columns/rows in cell units
  const originX = box.left
  const originY = box.top
  // Snap content width down so we never place past the margin edge
  const usableW = snapDown(box.width, grid)
  const usableH = snapDown(box.height, grid)
  if (usableW < grid || usableH < grid) {
    // Degenerate margins — pin everything to content origin
    return items.map((item, i) => ({
      ...item,
      x: originX,
      y: originY + i * (item.height + gap),
      autoFit: false,
    }))
  }

  // Reading order from where the user left things
  const ordered = [...items].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    if (a.x !== b.x) return a.x - b.x
    return a.id.localeCompare(b.id)
  })

  // Cursor in grid cells relative to origin
  let cellX = 0
  let cellY = 0
  let rowHeightCells = 0

  const gapCells = Math.max(1, Math.round(gap / grid))
  const maxCellsX = Math.floor(usableW / grid)
  const maxCellsY = Math.floor(usableH / grid)

  const placed: CanvasItem[] = []

  for (const item of ordered) {
    // How many cells this card occupies (at least 1×1)
    const wCells = Math.max(1, snapUp(item.width, grid) / grid)
    const hCells = Math.max(1, snapUp(item.height, grid) / grid)

    // Wrap if this card doesn't fit on the current row
    if (cellX > 0 && cellX + wCells > maxCellsX) {
      cellX = 0
      cellY += rowHeightCells + gapCells
      rowHeightCells = 0
    }

    // If a single card is wider than the whole content grid, still place at col 0
    const placeX = Math.min(cellX, Math.max(0, maxCellsX - wCells))
    let placeY = cellY

    // If we ran past bottom, keep packing downward (user can change margins/page)
    // but prefer to stay in-bounds when possible
    if (placeY + hCells > maxCellsY && cellY === 0) {
      placeY = 0
    }

    const x = originX + placeX * grid
    const y = originY + placeY * grid

    placed.push({
      ...item,
      x: Math.round(x),
      y: Math.round(y),
      // Keep original pixel size so content scale-to-fit still looks right
      autoFit: false,
    })

    cellX = placeX + wCells + gapCells
    rowHeightCells = Math.max(rowHeightCells, hCells)

    // If cursor ran off the right edge, advance row for next card
    if (cellX >= maxCellsX) {
      cellX = 0
      cellY += rowHeightCells + gapCells
      rowHeightCells = 0
    }
  }

  // Merge back by id so store identity stays stable
  const byId = new Map(placed.map((p) => [p.id, p]))
  return items.map((old) => {
    const n = byId.get(old.id)
    if (!n) return { ...old, autoFit: false }
    return {
      ...old,
      x: n.x,
      y: n.y,
      autoFit: false,
    }
  })
}

/** Semantic content density for cheatsheet packing (not raw px in the UI). */
export type ContentDensity = 'xs' | 'sm' | 'md' | 'lg'

export type CheatsheetLayoutMode = 'columns' | 'flow'

export type CheatsheetLayoutOptions = {
  /** Gap between cards (px). Default 10. */
  gap?: number
  /** 1–3 or auto (guess from density + count). */
  columns?: number | 'auto'
  /**
   * How small content/cards get:
   * xs = densest midterm, lg = roomy study sheet.
   */
  density?: ContentDensity
  /** Pack into multi-column grid (default) or single-row flow wrap. */
  mode?: CheatsheetLayoutMode
  /**
   * After packing, uniformly shrink so everything fits the print content box
   * (and bump print pages only if still overflowing and multiPage is true).
   */
  fitPrint?: boolean
  /** Prefer more pages instead of extreme shrink when overflowing. Default false. */
  multiPage?: boolean
  /**
   * When true (default), items that share a Layers `folderId` pack as a
   * contiguous cluster (tight shelf) before the next folder — agent workflow.
   */
  groupByFolder?: boolean
  /**
   * Optional folder order (from sheet.folders). Lower `order` first.
   * Ungrouped (no folderId) packs last.
   */
  folders?: Array<{ id: string; order?: number; name?: string }>
}

/** Maps density labels → size scale + ItemStyle font sizes (vector KaTeX/tables). */
export const DENSITY_PRESETS: Record<
  ContentDensity,
  {
    label: string
    hint: string
    sizeScale: number
    fontSize: number
    titleFontSize: number
    /** Process charts start larger — scale them a bit more aggressively. */
    processSizeScale: number
  }
> = {
  xs: {
    label: 'Extra small',
    hint: 'Densest midterm — more cards per page',
    sizeScale: 0.58,
    fontSize: 11,
    titleFontSize: 8,
    // Keep process charts large enough that Mermaid nodes stay readable
    processSizeScale: 0.72,
  },
  sm: {
    label: 'Small',
    hint: 'Tight cheat sheet (recommended)',
    sizeScale: 0.72,
    fontSize: 13,
    titleFontSize: 9,
    processSizeScale: 0.85,
  },
  md: {
    label: 'Medium',
    hint: 'Balanced study layout',
    sizeScale: 0.88,
    fontSize: 15,
    titleFontSize: 10,
    processSizeScale: 0.95,
  },
  lg: {
    label: 'Large',
    hint: 'Roomy cards, fewer per page',
    sizeScale: 1,
    fontSize: 17,
    titleFontSize: 11,
    processSizeScale: 1,
  },
}

function isProcessItem(it: CanvasItem): boolean {
  return it.type === 'process-chart' || Boolean(it.mermaidSource)
}

/**
 * Split items into layout sections.
 * Prefer Layers folders (folderId) so same-folder cards stay clustered;
 * within a folder (or root), heading cards start a new band.
 */
export function splitCheatSections(
  items: CanvasItem[],
  opts: {
    groupByFolder?: boolean
    folders?: Array<{ id: string; order?: number }>
  } = {},
): CanvasItem[][] {
  const groupByFolder = opts.groupByFolder !== false
  const hasFolders =
    groupByFolder && items.some((i) => Boolean(i.folderId))

  if (!hasFolders) {
    return splitByHeadings(items)
  }

  const orderMap = new Map<string, number>()
  for (const f of opts.folders ?? []) {
    orderMap.set(f.id, f.order ?? 0)
  }

  // Preserve first-seen order among folders, then sort by explicit order
  const firstIndex = new Map<string | null, number>()
  items.forEach((it, i) => {
    const key = it.folderId ?? null
    if (!firstIndex.has(key)) firstIndex.set(key, i)
  })

  const folderKeys = Array.from(firstIndex.keys()).sort((a, b) => {
    if (a == null && b == null) return 0
    if (a == null) return 1 // ungrouped last
    if (b == null) return -1
    const oa = orderMap.has(a) ? orderMap.get(a)! : firstIndex.get(a)!
    const ob = orderMap.has(b) ? orderMap.get(b)! : firstIndex.get(b)!
    if (oa !== ob) return oa - ob
    return (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0)
  })

  const sections: CanvasItem[][] = []
  for (const key of folderKeys) {
    const group = items.filter((i) => (i.folderId ?? null) === key)
    // Within folder: heading bands still apply
    for (const sub of splitByHeadings(group)) {
      sections.push(sub)
    }
  }
  return sections.length ? sections : [items]
}

function splitByHeadings(items: CanvasItem[]): CanvasItem[][] {
  const sections: CanvasItem[][] = []
  let cur: CanvasItem[] = []
  for (const it of items) {
    if (isHeadingCard(it) && cur.length > 0) {
      sections.push(cur)
      cur = [it]
    } else {
      cur.push(it)
    }
  }
  if (cur.length) sections.push(cur)
  return sections
}

function isHeadingCard(it: CanvasItem): boolean {
  if (it.mermaidSource || it.tableMarkdown || it.type === 'process-chart') {
    return false
  }
  const title = (it.title ?? '').trim()
  const t = (it.latex ?? '').trim()
  if (!t) return false
  // Numbered section dividers ("1. …") and \textbf{\text{…}} banners
  if (/^\d+\.\s+\S/.test(title) && t.includes('\\text{') && t.length < 160) {
    return true
  }
  if (it.showTitle === false && t.includes('\\text{') && t.length < 160) {
    return true
  }
  if (
    (/^\\text\{/.test(t) || /^\\textbf\{\\text\{/.test(t)) &&
    t.length < 160
  ) {
    return true
  }
  return false
}

// ─── Grid area-proportional pack (agent-friendly cheatsheet layout) ─────────

/**
 * Smallest title text we allow after pack / fit-print shrink.
 * Matches app default card title size — the practical lower bound for
 * “characters a human can still read on a printed midterm sheet.”
 */
export const MIN_READABLE_TITLE_FONT = DEFAULT_TITLE_FONT_SIZE

/** Smallest body (KaTeX) font after shrink. */
export const MIN_READABLE_BODY_FONT = 12

/**
 * When total ideal area exceeds this fraction of the page, shrink uniformly.
 * We never *grow* past ideal — oversized cards letterbox content (empty gutters).
 */
export const GRID_PACK_FILL_TARGET = 0.92

/**
 * Minimum card size so the title band + one line of content stay readable.
 * Snapped to the organize grid by callers.
 */
export function minReadableCardSize(
  titleFont: number = MIN_READABLE_TITLE_FONT,
): { w: number; h: number } {
  const band = titleBandPx(titleFont)
  return {
    w: 72,
    h: Math.max(40, band + 22),
  }
}

function isLrProcess(it: CanvasItem): boolean {
  return (
    isProcessItem(it) &&
    (it.mermaidDirection === 'LR' ||
      it.mermaidDirection === 'RL' ||
      /flowchart\s+LR/i.test(it.mermaidSource ?? '') ||
      /flowchart\s+RL/i.test(it.mermaidSource ?? ''))
  )
}

function isMindProcess(it: CanvasItem): boolean {
  return (
    isProcessItem(it) &&
    (it.mermaidKind === 'mindmap' ||
      /\bmindmap\b/i.test(it.mermaidSource ?? ''))
  )
}

/**
 * Ideal content-native size (export 19 baseline).
 * Formula / diagram drives size — not title string length (that re-inflated
 * empty shells). Never grow past this in allocateAreaOnGrid.
 */
export function estimateIdealBlockSize(
  it: CanvasItem,
  maxW: number,
  titleFont: number = MIN_READABLE_TITLE_FONT,
): { w: number; h: number } {
  const min = minReadableCardSize(titleFont)
  const band = titleBandPx(titleFont)
  const showTitle = it.showTitle !== false && Boolean((it.title ?? '').trim())
  const titleH = showTitle ? band : 0

  if (isHeadingCard(it)) {
    return {
      w: Math.min(maxW, Math.max(160, Math.round(maxW * 0.98))),
      h: Math.max(22, band + 2),
    }
  }

  if (isProcessItem(it)) {
    const src = it.mermaidSource ?? ''
    const lines = Math.max(3, src.split('\n').filter(Boolean).length)
    if (isMindProcess(it)) {
      return {
        w: Math.min(maxW, 200),
        h: Math.min(220, Math.max(160, 120 + lines * 8)) + titleH,
      }
    }
    if (isLrProcess(it)) {
      return {
        w: Math.min(maxW, Math.max(280, Math.round(maxW * 0.42))),
        h: Math.max(min.h, 56 + titleH),
      }
    }
    return {
      w: Math.min(maxW, 160),
      h: Math.min(260, Math.max(140, 100 + lines * 12)) + titleH,
    }
  }

  if (it.type === 'table' || it.tableMarkdown) {
    const rows = (it.tableMarkdown ?? '').split('\n').filter(Boolean).length
    const cols = ((it.tableMarkdown ?? '').split('\n')[0] ?? '').split('|')
      .length
    return {
      w: Math.min(maxW, Math.max(min.w, 72 + cols * 32)),
      h: Math.max(min.h, 28 + rows * 14 + titleH),
    }
  }

  if (it.imageUrl || it.type === 'figure') {
    return { w: Math.min(maxW, 140), h: Math.max(min.h, 100 + titleH) }
  }

  // Equation — snug to latex (short FV / Continuous stay compact like export 19)
  const latex = it.latex ?? ''
  const len = latex.replace(/\\[a-zA-Z]+/g, 'X').replace(/[{}^_]/g, '').length
  const display =
    latex.includes('\\frac') ||
    latex.includes('\\sum') ||
    latex.includes('\\int') ||
    latex.includes('\\prod') ||
    latex.includes('\\\\')
  const stacked = (latex.match(/\\frac/g) || []).length
  const w = Math.min(
    maxW,
    Math.max(min.w, Math.min(200, 44 + len * (display ? 4.5 : 3.6))),
  )
  const bodyH = display ? 36 + stacked * 8 : 22
  const h = Math.max(min.h, bodyH + titleH + 4)
  return { w: Math.round(w), h: Math.round(h) }
}

/**
 * Snap width/height to whole grid cells.
 * Rounds to nearest cell (not always ceil) so we don’t inflate aspect by a full cell.
 */
export function snapSizeToGrid(
  w: number,
  h: number,
  grid: number,
  maxW: number,
  maxH: number,
): { w: number; h: number; cw: number; ch: number } {
  const g = Math.max(4, grid)
  const maxCw = Math.max(1, Math.floor(maxW / g))
  const maxCh = Math.max(1, Math.floor(maxH / g))
  let cw = Math.max(1, Math.round(w / g))
  let ch = Math.max(1, Math.round(h / g))
  // Never round down to 0; if very small, at least 1 cell
  if (w > g * 0.4 && cw < 1) cw = 1
  if (h > g * 0.4 && ch < 1) ch = 1
  cw = Math.min(cw, maxCw)
  ch = Math.min(ch, maxCh)
  return { w: cw * g, h: ch * g, cw, ch }
}

/**
 * Fit ideal sizes onto the page:
 * - **Never grow** past ideal (avoids empty gutters inside cards)
 * - Shrink uniformly only when total area / shelf height overflows the page
 * - Preserve aspect ratios; enforce min-readable sizes
 */
export function allocateAreaOnGrid(
  ideals: Array<{ id: string; w: number; h: number; minW: number; minH: number }>,
  pageW: number,
  pageH: number,
  grid: number,
  fillTarget = GRID_PACK_FILL_TARGET,
): Map<string, { w: number; h: number }> {
  const out = new Map<string, { w: number; h: number }>()
  if (ideals.length === 0) return out

  const pageArea = Math.max(1, pageW * pageH)
  const budget = pageArea * fillTarget
  let sum = ideals.reduce((a, b) => a + b.w * b.h, 0)
  if (sum < 1) sum = 1

  // Only shrink when over budget — never inflate past content-native ideal
  let scale = sum > budget ? Math.sqrt(budget / sum) : 1
  scale = Math.min(1, Math.max(0.55, scale))

  const apply = (s: number) => {
    for (const it of ideals) {
      let w = Math.max(it.minW, Math.round(it.w * s))
      let h = Math.max(it.minH, Math.round(it.h * s))
      w = Math.min(pageW, w)
      h = Math.min(pageH, h)
      const snapped = snapSizeToGrid(w, h, grid, pageW, pageH)
      const minSnap = snapSizeToGrid(it.minW, it.minH, grid, pageW, pageH)
      out.set(it.id, {
        w: Math.max(minSnap.w, snapped.w),
        h: Math.max(minSnap.h, snapped.h),
      })
    }
  }

  apply(scale)

  // If shelf height still overshoots the page, shrink further (not below mins)
  for (let guard = 0; guard < 8; guard++) {
    let estH = 0
    let rowW = 0
    let rowH = 0
    const gap = Math.max(grid / 2, 6)
    for (const it of ideals) {
      const sz = out.get(it.id)!
      if (rowW > 0 && rowW + sz.w > pageW) {
        estH += rowH + gap
        rowW = 0
        rowH = 0
      }
      rowW += sz.w + gap
      rowH = Math.max(rowH, sz.h)
    }
    estH += rowH
    if (estH <= pageH * 1.02) break
    scale *= 0.92
    if (scale < 0.5) break
    apply(scale)
  }

  return out
}

/**
 * Bottom-left / shelf pack on a discrete grid: place each rect at the first
 * free cell that fits (left→right, top→bottom).
 */
export function packRectsOnGrid(
  rects: Array<{ id: string; cw: number; ch: number }>,
  cols: number,
  rows: number,
): Map<string, { c: number; r: number }> {
  const pos = new Map<string, { c: number; r: number }>()
  if (cols < 1 || rows < 1) return pos

  // Occupancy: row-major boolean grid
  const occ: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  )

  const fits = (c0: number, r0: number, cw: number, ch: number) => {
    if (c0 + cw > cols || r0 + ch > rows) return false
    for (let r = r0; r < r0 + ch; r++) {
      for (let c = c0; c < c0 + cw; c++) {
        if (occ[r]![c]) return false
      }
    }
    return true
  }

  const mark = (c0: number, r0: number, cw: number, ch: number) => {
    for (let r = r0; r < r0 + ch; r++) {
      for (let c = c0; c < c0 + cw; c++) {
        occ[r]![c] = true
      }
    }
  }

  // Place larger rects first for denser packing (stable by original order on ties)
  const order = rects
    .map((r, i) => ({ r, i, area: r.cw * r.ch }))
    .sort((a, b) => b.area - a.area || a.i - b.i)

  for (const { r } of order) {
    const cw = Math.min(r.cw, cols)
    const ch = Math.min(r.ch, rows)
    let placed = false
    for (let r0 = 0; r0 <= rows - ch && !placed; r0++) {
      for (let c0 = 0; c0 <= cols - cw && !placed; c0++) {
        if (fits(c0, r0, cw, ch)) {
          mark(c0, r0, cw, ch)
          pos.set(r.id, { c: c0, r: r0 })
          placed = true
        }
      }
    }
    if (!placed) {
      // Overflow: stack below known max row (multi-page signal)
      let maxR = 0
      for (const p of pos.values()) maxR = Math.max(maxR, p.r + 1)
      // find max occupied row
      for (let r0 = 0; r0 < rows; r0++) {
        if (occ[r0]!.some(Boolean)) maxR = Math.max(maxR, r0 + 1)
      }
      pos.set(r.id, { c: 0, r: maxR })
      // don't mark beyond grid — positions may exceed rows (fitPrint handles)
    }
  }

  return pos
}

/**
 * Pack cards for print cheatsheets using a **grid cell** model:
 *
 * 1. Group by folder / heading (topics)
 * 2. Ideal size per block (heuristic seed for placement)
 * 3. Area budget vs printable page → shrink-only if overflowing
 * 4. Snap edges to the organize grid
 * 5. Bottom-left pack on the occupancy grid
 * 6. Equations/tables: autoFit=true so canvas measures real KaTeX and snugs
 *    the card (avoids empty guts from heuristic W×H ≠ painted content)
 * 7. Never shrink title/body fonts below readable floor
 */
export function packCheatsheetLayout(
  items: CanvasItem[],
  canvas: SheetCanvas,
  options: CheatsheetLayoutOptions = {},
): { items: CanvasItem[]; printPageCount: number } {
  if (items.length === 0) {
    return { items, printPageCount: Math.max(1, canvas.printPageCount ?? 1) }
  }

  const density = options.density ?? 'sm'
  const preset = DENSITY_PRESETS[density]
  // Title never below app default; density may only go *up* from the floor
  const titleFont = Math.max(MIN_READABLE_TITLE_FONT, preset.titleFontSize)
  const bodyFont = Math.max(MIN_READABLE_BODY_FONT, preset.fontSize)
  const grid = Math.max(4, canvas.gridSpacing ?? ORGANIZE_GRID)
  const gapPx = Math.max(
    grid / 2,
    options.gap ?? (density === 'xs' ? 6 : density === 'sm' ? 8 : 12),
  )
  const gapCells = Math.max(0, Math.round(gapPx / grid) - 0) // visual gap via pack spacing
  void gapCells
  const fitPrint = options.fitPrint !== false
  const groupByFolder = options.groupByFolder !== false
  const box = getContentBox(canvas)

  const visible = items.filter((i) => !i.hidden)
  const minCard = minReadableCardSize(titleFont)

  // Ideal sizes (content-native aspect), then shrink-only fit onto the page
  const ideals = visible.map((it) => {
    const ideal = estimateIdealBlockSize(it, box.width, titleFont)
    // Density: xs slightly tighter, lg slightly roomier — never a big inflate
    const dScale =
      density === 'xs' ? 0.92 : density === 'sm' ? 1 : density === 'md' ? 1.05 : 1.1
    const w = Math.max(minCard.w, Math.round(ideal.w * dScale))
    const h = Math.max(
      isHeadingCard(it) ? 22 : minCard.h,
      Math.round(ideal.h * dScale),
    )
    return {
      id: it.id,
      w,
      h,
      minW: isHeadingCard(it) ? 120 : minCard.w,
      minH: isHeadingCard(it) ? 22 : minCard.h,
      item: it,
    }
  })

  const allocated = allocateAreaOnGrid(
    ideals.map(({ id, w, h, minW, minH }) => ({ id, w, h, minW, minH })),
    box.width,
    box.height,
    grid,
    GRID_PACK_FILL_TARGET,
  )

  // Section order (folders → topics) then pack each section's body on the grid
  const sized: CanvasItem[] = ideals.map((row) => {
    const sz = allocated.get(row.id) ?? { w: row.w, h: row.h }
    const it = row.item
    const isProc = isProcessItem(it)
    const isFig = Boolean(it.imageUrl) || it.type === 'figure'
    const isHead = isHeadingCard(it)
    // Export-19 paint model:
    // - equations/tables: natural size (contentFill false) — no letterbox zoom
    // - process/figures: contentFill true (SVG fills the card)
    // - no autoFit race
    return {
      ...it,
      width: sz.w,
      height: isHead
        ? Math.max(22, Math.min(sz.h, titleBandPx(titleFont) + 6))
        : sz.h,
      style: {
        ...it.style,
        fontSize: bodyFont,
        titleFontSize: titleFont,
      },
      autoFit: false,
      contentFill: isProc || isFig,
    }
  })

  const sections = splitCheatSections(sized, {
    groupByFolder,
    folders: options.folders,
  })

  const cols = Math.max(1, Math.floor(box.width / grid))
  const rows = Math.max(1, Math.floor(box.height / grid))
  const placed: CanvasItem[] = []
  let z = 1

  // Global occupancy across the whole page so sections share one grid
  const occPos = new Map<string, { c: number; r: number }>()
  const pending: Array<{ id: string; cw: number; ch: number; item: CanvasItem }> =
    []

  // Headings: full-width bands inserted as sequence constraints —
  // pack section-by-section: heading at next free row, then body rects
  let cursorRow = 0

  for (const section of sections) {
    const heading = section.find(isHeadingCard)
    const body = section.filter((i) => !isHeadingCard(i))

    if (heading) {
      const hw = Math.min(
        cols,
        Math.max(1, Math.ceil(Math.min(heading.width, box.width) / grid)),
      )
      const hh = Math.max(1, Math.ceil(heading.height / grid))
      // Find first free row for full-width-ish heading
      let r0 = cursorRow
      occPos.set(heading.id, { c: 0, r: r0 })
      placed.push({
        ...heading,
        x: Math.round(box.left),
        y: Math.round(box.top + r0 * grid),
        width: Math.round(Math.min(box.width, hw * grid)),
        height: Math.round(hh * grid),
        zIndex: z++,
      })
      cursorRow = r0 + hh + Math.max(0, Math.round(gapPx / grid) - 1)
    }

    if (body.length === 0) continue

    // Local pack in the remaining grid below cursorRow
    const localRows = Math.max(1, rows - cursorRow + 40) // allow overflow rows
    const bodyRects = body.map((it) => ({
      id: it.id,
      cw: Math.max(1, Math.ceil(it.width / grid)),
      ch: Math.max(1, Math.ceil(it.height / grid)),
      item: it,
    }))
    // Temporarily pack into a sub-grid of height localRows
    const sub = packRectsOnGrid(
      bodyRects.map(({ id, cw, ch }) => ({ id, cw, ch })),
      cols,
      localRows,
    )
    let sectionMaxR = cursorRow
    for (const it of body) {
      const p = sub.get(it.id) ?? { c: 0, r: 0 }
      const absR = cursorRow + p.r
      const absC = p.c
      occPos.set(it.id, { c: absC, r: absR })
      const cw = Math.max(1, Math.ceil(it.width / grid))
      const ch = Math.max(1, Math.ceil(it.height / grid))
      placed.push({
        ...it,
        x: Math.round(box.left + absC * grid),
        y: Math.round(box.top + absR * grid),
        width: Math.round(Math.min(box.width - absC * grid, cw * grid)),
        height: Math.round(ch * grid),
        zIndex: z++,
      })
      sectionMaxR = Math.max(sectionMaxR, absR + ch)
    }
    cursorRow = sectionMaxR + Math.max(0, Math.round(gapPx / grid) - 1)
    void pending
  }

  let result = placed
  let pageCount = Math.max(1, canvas.printPageCount ?? 1)
  const maxBottom = result.reduce(
    (m, it) => Math.max(m, it.y + it.height),
    box.top,
  )
  const contentBottom = box.top + box.height

  // Fit-print: shrink only while fonts stay ≥ readable floor
  if (fitPrint && maxBottom > contentBottom + 4) {
    const overflow = maxBottom - box.top
    const avail = box.height
    const shrink = Math.max(0.55, Math.min(1, (avail - gapPx) / overflow))
    if (shrink < 0.98) {
      const minSz = minReadableCardSize(titleFont)
      result = result.map((it) => {
        const isHead = isHeadingCard(it)
        return {
          ...it,
          x: Math.round(box.left + (it.x - box.left) * shrink),
          y: Math.round(box.top + (it.y - box.top) * shrink),
          width: Math.max(
            isHead ? 80 : minSz.w,
            Math.round(it.width * shrink),
          ),
          height: Math.max(
            isHead ? 20 : minSz.h,
            Math.round(it.height * shrink),
          ),
          style: {
            ...it.style,
            fontSize: Math.max(
              MIN_READABLE_BODY_FONT,
              Math.round(
                (it.style?.fontSize ?? bodyFont) * Math.sqrt(shrink),
              ),
            ),
            titleFontSize: Math.max(
              MIN_READABLE_TITLE_FONT,
              Math.round(
                (it.style?.titleFontSize ?? titleFont) * Math.sqrt(shrink),
              ),
            ),
          },
        }
      })
    }
    const bottom2 = result.reduce(
      (m, it) => Math.max(m, it.y + it.height),
      box.top,
    )
    if (options.multiPage && bottom2 > contentBottom + 8) {
      pageCount = Math.min(
        20,
        Math.max(pageCount, Math.ceil((bottom2 - box.top) / box.height)),
      )
    }
  }

  // Snap position to grid; keep size as allocated (do NOT snapUp — that
  // re-inflated 40px snug heights back to 48 and brought empty guts back).
  result = result.map((it) => {
    const snapped = snapSizeToGrid(
      it.width,
      it.height,
      grid,
      box.width,
      box.height,
    )
    return {
      ...it,
      x: snapToGridValue(it.x, grid, box.left),
      y: snapToGridValue(it.y, grid, box.top),
      // Prefer allocated size; only ensure at least one cell
      width: Math.max(grid, Math.min(box.width, snapped.w)),
      height: Math.max(grid, snapped.h),
    }
  })

  const byId = new Map(result.map((p) => [p.id, p]))
  const merged = items.map((old) => {
    if (old.hidden) return old
    const n = byId.get(old.id)
    if (!n) return { ...old, autoFit: false }
    // Bump contentFitKey so CanvasItemView remounts measure path after pack
    const textCard = n.autoFit === true
    return {
      ...n,
      contentFitKey: textCard
        ? (old.contentFitKey ?? 0) + 1
        : old.contentFitKey,
    }
  })

  return { items: merged, printPageCount: pageCount }
}

/** @deprecated Column guess kept for callers; grid pack ignores columns. */
export function guessCheatColumns(
  n: number,
  density: ContentDensity,
  boxW: number,
): number {
  if (n <= 3) return 1
  if (boxW < 480) return 1
  if (density === 'xs' || density === 'sm') {
    if (n >= 14 && boxW >= 640) return 3
    if (n >= 6) return 2
  }
  if (n >= 10 && boxW >= 600) return 2
  return 1
}

