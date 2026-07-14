import type { CanvasItem, PrintMargins, SheetCanvas } from '@/types'
import { DEFAULT_MARGINS, normalizeGridExtent } from '@/types'
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

/**
 * Pack cards for print cheatsheets: multi-column, density-scaled sizes,
 * semantic font sizes, optional fit-to-print-box.
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
  const gap = Math.max(2, options.gap ?? (density === 'xs' ? 6 : density === 'sm' ? 8 : 12))
  const mode = options.mode ?? 'columns'
  const fitPrint = options.fitPrint !== false
  const groupByFolder = options.groupByFolder !== false
  const box = getContentBox(canvas)

  const visible = items.filter((i) => !i.hidden)
  const hidden = items.filter((i) => i.hidden)

  // Base sizes from current boxes, scaled by density
  const scaled = visible.map((it) => {
    const isProc = isProcessItem(it)
    const isHead = isHeadingCard(it)
    const scale = isHead
      ? Math.min(1, preset.sizeScale * 1.05)
      : isProc
        ? preset.processSizeScale
        : preset.sizeScale
    const lrProc =
      isProc &&
      (it.mermaidDirection === 'LR' ||
        it.mermaidDirection === 'RL' ||
        /flowchart\s+LR/i.test(it.mermaidSource ?? '') ||
        /flowchart\s+RL/i.test(it.mermaidSource ?? ''))
    const mindProc =
      isProc &&
      (it.mermaidKind === 'mindmap' ||
        /\bmindmap\b/i.test(it.mermaidSource ?? ''))
    // Process charts need real room — short LR boxes (h~70) make export embeds unreadable
    const minW = isHead
      ? 160
      : isProc
        ? lrProc
          ? 400
          : mindProc
            ? 240
            : 220
        : 100
    const minH = isHead
      ? 24
      : isProc
        ? mindProc
          ? 240
          : lrProc
            ? 100
            : 220
        : 48
    const maxW = isHead
      ? box.width
      : isProc
        ? Math.min(box.width, lrProc ? box.width : mindProc ? 420 : 340)
        : Math.min(box.width, 300)
    const w = Math.max(minW, Math.min(maxW, Math.round(it.width * scale)))
    const h = Math.max(
      minH,
      Math.round(
        (isHead ? Math.min(it.height, 48) : it.height) * (isHead ? 0.85 : scale),
      ),
    )
    return {
      ...it,
      width: w,
      height: h,
      style: {
        ...it.style,
        fontSize: preset.fontSize,
        titleFontSize: preset.titleFontSize,
      },
      autoFit: false,
      contentFill: true,
    }
  })

  const colCount =
    mode === 'flow'
      ? 1
      : options.columns === 'auto' || options.columns == null
        ? guessCheatColumns(scaled.length, density, box.width)
        : Math.min(3, Math.max(1, options.columns))

  // xs/sm midterm sheets: shelf-wrap fills horizontal gaps (columns leave dead space)
  const useShelf =
    mode === 'flow' ||
    colCount === 1 ||
    density === 'xs' ||
    density === 'sm'

  // Folders (layers) first when present, else heading bands — agent collocation
  const placed: CanvasItem[] = []
  let cursorY = box.top
  let z = 1

  const sections = splitCheatSections(scaled, {
    groupByFolder,
    folders: options.folders,
  })

  for (const section of sections) {
    const heading = section.find(isHeadingCard)
    const body = section.filter((i) => !isHeadingCard(i))

    if (heading) {
      placed.push({
        ...heading,
        x: Math.round(box.left),
        y: Math.round(cursorY),
        width: Math.min(heading.width, box.width),
        zIndex: z++,
      })
      cursorY += heading.height + gap
    }

    if (body.length === 0) continue

    // Same-folder clusters pack tightly (shelf / multi-col) as one band
    if (useShelf) {
      let x = box.left
      let rowH = 0
      let y = cursorY
      for (const it of body) {
        if (x > box.left && x + it.width > box.left + box.width) {
          x = box.left
          y += rowH + gap
          rowH = 0
        }
        placed.push({
          ...it,
          x: Math.round(x),
          y: Math.round(y),
          zIndex: z++,
        })
        x += it.width + gap
        rowH = Math.max(rowH, it.height)
      }
      cursorY = y + rowH + gap
    } else {
      const colGap = gap
      const colW = Math.floor(
        (box.width - colGap * (colCount - 1)) / colCount,
      )
      const colHeights = Array.from({ length: colCount }, () => cursorY)
      for (const it of body) {
        let col = 0
        for (let c = 1; c < colCount; c++) {
          if (colHeights[c]! < colHeights[col]!) col = c
        }
        const w = Math.min(it.width, colW)
        const x = box.left + col * (colW + colGap)
        const y = colHeights[col]!
        placed.push({
          ...it,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          zIndex: z++,
        })
        colHeights[col] = y + it.height + gap
      }
      cursorY = Math.max(...colHeights) + gap * 0.5
    }
  }

  let result = placed
  let pageCount = Math.max(1, canvas.printPageCount ?? 1)
  const maxBottom = result.reduce(
    (m, it) => Math.max(m, it.y + it.height),
    box.top,
  )
  const contentBottom = box.top + box.height

  if (fitPrint && maxBottom > contentBottom + 4) {
    const overflow = maxBottom - box.top
    const avail = box.height
    const shrink = Math.max(0.45, Math.min(1, (avail - gap) / overflow))
    if (shrink < 0.98) {
      result = result.map((it) => ({
        ...it,
        x: Math.round(box.left + (it.x - box.left) * shrink),
        y: Math.round(box.top + (it.y - box.top) * shrink),
        width: Math.max(48, Math.round(it.width * shrink)),
        height: Math.max(28, Math.round(it.height * shrink)),
        style: {
          ...it.style,
          fontSize: Math.max(
            9,
            Math.round((it.style?.fontSize ?? preset.fontSize) * Math.sqrt(shrink)),
          ),
          titleFontSize: Math.max(
            7,
            Math.round(
              (it.style?.titleFontSize ?? preset.titleFontSize) *
                Math.sqrt(shrink),
            ),
          ),
        },
      }))
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

  const byId = new Map(result.map((p) => [p.id, p]))
  const merged = [
    ...items.map((old) => {
      if (old.hidden) return old
      const n = byId.get(old.id)
      if (!n) return { ...old, autoFit: false }
      return n
    }),
    // keep hidden as-is (already in items)
  ]
  // Avoid duplicating hidden if they were in items already
  void hidden

  return { items: merged, printPageCount: pageCount }
}

function guessCheatColumns(
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

