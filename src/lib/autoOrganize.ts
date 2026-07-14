import type {
  CanvasItem,
  LayoutPanel,
  PanelShape,
  PrintMargins,
  SheetCanvas,
} from '@/types'
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

/**
 * How topic/category groups are marked on the board after Auto-layout:
 * - **labels** — full-width (or region-width) heading banner rows (current default)
 * - **panels** — encapsulating frame around cards that belong together (no banner rows)
 * - **both** — banners + panel frames
 * - **none** — dense pack only, no group chrome
 */
export type GroupChrome = 'labels' | 'panels' | 'both' | 'none'

export const GROUP_CHROME_PRESETS: Record<
  GroupChrome,
  { label: string; hint: string }
> = {
  labels: {
    label: 'Topic labels',
    hint: 'Category/topic banners as rows (columns of sections)',
  },
  panels: {
    label: 'Panels',
    hint: 'Encapsulating box around each related cluster',
  },
  both: {
    label: 'Labels + panels',
    hint: 'Banners and encapsulating frames',
  },
  none: {
    label: 'None',
    hint: 'Pack only — no group chrome',
  },
}

/** Soft accents for panel frames (cycle by section index). */
export const LAYOUT_PANEL_ACCENTS = [
  'rgba(99, 102, 241, 0.55)', // indigo
  'rgba(16, 185, 129, 0.5)', // emerald
  'rgba(244, 114, 182, 0.5)', // pink
  'rgba(56, 189, 248, 0.5)', // sky
  'rgba(251, 191, 36, 0.5)', // amber
  'rgba(167, 139, 250, 0.5)', // violet
] as const

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
   * Topic chrome: labels (banners), panels (frames), both, or none.
   * Default `labels` (legacy cheatsheet rows of category labels).
   */
  groupChrome?: GroupChrome
  /**
   * After packing, uniformly shrink so everything fits the print content box
   * when multiPage is false. With multiPage (default), content spans pages
   * instead of being crushed onto one frame.
   */
  fitPrint?: boolean
  /**
   * Prefer more pages instead of extreme shrink when overflowing.
   * Default **true** — kitchen-sink / midterm sheets need multipage.
   * Set false only for single-page dense midterms.
   */
  multiPage?: boolean
  /**
   * When true (default), items that share a Layers `folderId` pack as a
   * contiguous cluster (tight shelf) before the next folder — agent workflow.
   */
  groupByFolder?: boolean
  /**
   * Optional folder tree (from sheet.folders). Includes parentId for hierarchy.
   * Ungrouped (no folderId) packs last.
   */
  folders?: Array<{
    id: string
    order?: number
    name?: string
    parentId?: string | null
  }>
  /**
   * Panel chrome pad (px) from cards to the panel stroke. Default **8**.
   * Works **with** `gap`: free-flow leaves `gap + 2×panelPadding` between
   * topic content boxes so panel frames don’t collide.
   */
  panelPadding?: number
  /**
   * Panel packing geometry when chrome includes panels:
   * - rect: tight box + standard gaps
   * - polygon (n-gon): tight box + denser flush packing
   */
  panelShape?: PanelShape
  /**
   * Order of topic/folder groups before packing.
   * - none: document order + densest packing (default)
   * - name-asc / name-desc: panels in readable name order
   */
  groupSort?: GroupSortOrder
  /**
   * Single hierarchy depth (legacy). Prefer `panelGroupLevels` multi-select.
   * When both set, `panelGroupLevels` wins.
   */
  panelGroupLevel?: PanelGroupLevel
  /**
   * Multi-select hierarchy depths for **nested** panels.
   * Example `[1, 2]`: outer panel per top folder (1, 2, 3…) wrapping inner
   * panels per subsection (1.1, 1.2…). Cards pack at the deepest selected level.
   * Default `[1]`.
   */
  panelGroupLevels?: PanelGroupLevel[]
  /**
   * Merge contiguous print pages into one continuous pack band (free inter-page
   * margin gutters so max printable height/width grows). Auto-layout uses this
   * as its space budget; export can honor the same continuous area.
   */
  dissolvePrintArea?: boolean
}

/**
 * Snapshot of Auto-layout options used for export filenames / debugging shares.
 * (No folders — only user-facing pack knobs.)
 */
export type AutoLayoutExportSnapshot = {
  density: ContentDensity
  groupChrome: GroupChrome
  panelShape?: PanelShape
  panelPadding?: number
  panelGroupLevels?: PanelGroupLevel[]
  groupSort?: GroupSortOrder
  gap?: number
  multiPage?: boolean
  dissolvePrintArea?: boolean
}

/** Strip characters unsafe in Windows / macOS download names. */
export function sanitizeExportFileStem(raw: string): string {
  return (raw || 'cheatsheet')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') // trailing dots/spaces break Windows
    .slice(0, 120) || 'cheatsheet'
}

/**
 * Compact tag of Auto-layout knobs for filenames, e.g.
 * `auto_sm_panels_ngon_L1-2_az_gap6`
 *
 * Decode: density · chrome · shape · levels · sort · panel gap px
 */
export function formatAutoLayoutFileTag(
  opts: Partial<CheatsheetLayoutOptions> | AutoLayoutExportSnapshot,
): string {
  const density = opts.density ?? 'sm'
  const chrome = opts.groupChrome ?? 'labels'
  const parts: string[] = ['auto', density, chrome]

  const panelsOn = chrome === 'panels' || chrome === 'both'
  if (panelsOn) {
    const shape = opts.panelShape ?? 'rect'
    parts.push(shape === 'polygon' ? 'ngon' : 'rect')
    const levels = normalizePanelGroupLevels(
      opts.panelGroupLevels,
      opts.panelGroupLevel,
    )
    parts.push(`L${levels.join('-')}`)
  }

  const sort = opts.groupSort ?? 'none'
  parts.push(
    sort === 'name-asc' ? 'az' : sort === 'name-desc' ? 'za' : 'nosort',
  )

  // Always tag main free-flow gap; panel chrome pad when panels are on
  parts.push(`gap${Math.round(opts.gap ?? 8)}`)
  if (panelsOn) {
    parts.push(`pgap${Math.round(opts.panelPadding ?? 8)}`)
  }

  if (opts.multiPage === false) parts.push('1page')
  if (opts.dissolvePrintArea) parts.push('dissolve')

  return parts.join('_')
}

/**
 * Default download stem: `{sheetTitle}__{autoLayoutTag}` when layout was applied.
 */
export function buildExportFileNameStem(
  sheetTitle: string,
  layout?: AutoLayoutExportSnapshot | null,
): string {
  const base = sanitizeExportFileStem(sheetTitle)
  if (!layout) return base
  const tag = formatAutoLayoutFileTag(layout)
  // Keep combined stem under a practical download length
  const maxBase = Math.max(24, 160 - tag.length - 2)
  const shortBase =
    base.length > maxBase ? base.slice(0, maxBase).replace(/[. ]+$/g, '') : base
  return `${shortBase}__${tag}`
}

/** Pick a shareable snapshot from full pack options. */
export function snapshotAutoLayoutOptions(
  opts: CheatsheetLayoutOptions,
): AutoLayoutExportSnapshot {
  return {
    density: opts.density ?? 'sm',
    groupChrome: opts.groupChrome ?? 'labels',
    panelShape: opts.panelShape,
    panelPadding: opts.panelPadding,
    panelGroupLevels: opts.panelGroupLevels,
    groupSort: opts.groupSort,
    gap: opts.gap,
    multiPage: opts.multiPage,
    dissolvePrintArea: opts.dissolvePrintArea,
  }
}

/**
 * Hierarchy depth for panel grouping (from tree root).
 * - `1` — top sections (1, 2, 3…)
 * - `2` — subsections (1.1, 1.2…)
 * - `3` — third level (1.1.a…); deeper paths clamp here
 */
export type PanelGroupLevel = 1 | 2 | 3

/** Normalize multi/single level options → sorted unique 1|2|3 (at least [1]). */
export function normalizePanelGroupLevels(
  levels?: PanelGroupLevel[] | null,
  legacy?: PanelGroupLevel | null,
): PanelGroupLevel[] {
  const raw =
    levels && levels.length > 0
      ? levels
      : legacy != null
        ? [legacy]
        : ([1] as PanelGroupLevel[])
  const set = new Set<PanelGroupLevel>()
  for (const L of raw) {
    const n = Math.min(3, Math.max(1, Math.floor(Number(L) || 1))) as PanelGroupLevel
    if (n === 1 || n === 2 || n === 3) set.add(n)
  }
  if (set.size === 0) set.add(1)
  return [...set].sort((a, b) => a - b)
}

/** Sort groups by hierarchical folder/heading name. */
export type GroupSortOrder = 'none' | 'name-asc' | 'name-desc'

export const GROUP_SORT_PRESETS: Record<
  GroupSortOrder,
  { label: string; hint: string }
> = {
  none: {
    label: 'No sorting',
    hint: 'Densest free-flow only (no name bias)',
  },
  'name-asc': {
    label: 'Name A→Z',
    hint: 'Free-flow with ascending flow: earlier names tend top-left → later bottom-right',
  },
  'name-desc': {
    label: 'Name Z→A',
    hint: 'Free-flow with descending flow: later names tend top-left → earlier bottom-right',
  },
}

export const PANEL_SHAPE_PRESETS: Record<
  PanelShape,
  { label: string; hint: string }
> = {
  rect: {
    label: 'Rectangle',
    hint: 'Full box around the group (empty corner included)',
  },
  polygon: {
    label: 'N-gon (L-fill)',
    hint: 'Solid L/stepped chrome (no donuts); densest on deepest level',
  },
}
/**
 * Density presets — **must** produce clearly different card sizes and fonts.
 * Scales apply to content-native ideals; cards never go below readable mins
 * derived from font size (see `minCardForFonts`).
 */
export const DENSITY_PRESETS: Record<
  ContentDensity,
  {
    label: string
    hint: string
    /** Multiply estimateIdealBlockSize (equations/tables/figures). */
    sizeScale: number
    fontSize: number
    titleFontSize: number
    /** Process charts — slightly larger than equations at same density. */
    processSizeScale: number
  }
> = {
  xs: {
    label: 'Extra small',
    hint: 'Most cards per page — still readable KaTeX',
    sizeScale: 0.8,
    fontSize: 12,
    titleFontSize: 9,
    processSizeScale: 0.88,
  },
  sm: {
    label: 'Small',
    hint: 'Tight cheat sheet (recommended)',
    sizeScale: 0.95,
    fontSize: 14,
    titleFontSize: 10,
    processSizeScale: 1.0,
  },
  md: {
    label: 'Medium',
    hint: 'Balanced study layout — larger formulas',
    sizeScale: 1.15,
    fontSize: 16,
    titleFontSize: 11,
    processSizeScale: 1.18,
  },
  lg: {
    label: 'Large',
    hint: 'Roomy cards — exam-table readability',
    sizeScale: 1.4,
    fontSize: 18,
    titleFontSize: 12,
    processSizeScale: 1.35,
  },
}

/**
 * Minimum card outer size so title + one line of KaTeX stay visible
 * (prevents “empty tiny boxes” after aggressive density scale).
 */
export function minCardForFonts(
  bodyFont: number,
  titleFont: number = bodyFont,
): { w: number; h: number } {
  const band = titleBandPx(titleFont)
  return {
    w: Math.max(104, Math.round(bodyFont * 7)),
    h: Math.max(56, band + Math.round(bodyFont * 2.6) + 12),
  }
}

function isProcessItem(it: CanvasItem): boolean {
  return it.type === 'process-chart' || Boolean(it.mermaidSource)
}

type FolderRef = { id: string; name?: string; parentId?: string | null }

/**
 * Ancestor chain root → leaf for a folder id.
 * Example: 1.1.a → [id_of_1, id_of_1.1, id_of_1.1.a]
 */
export function folderAncestorChain(
  folderId: string | null | undefined,
  folders: FolderRef[] = [],
): string[] {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const leafToRoot: string[] = []
  let cur: string | null | undefined = folderId
  const seen = new Set<string>()
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur)
    leafToRoot.push(cur)
    cur = byId.get(cur)!.parentId
  }
  // Unknown id (not in folders list): treat as single-node chain
  if (leafToRoot.length === 0 && folderId) return [folderId]
  return leafToRoot.reverse()
}

/**
 * Map a card’s folder to the folder that owns its panel at depth `level` (1–3).
 * Paths deeper than 3 clamp to the 3rd ancestor from the root.
 */
export function folderAtGroupLevel(
  folderId: string | null | undefined,
  folders: FolderRef[] = [],
  level: PanelGroupLevel = 1,
): string | null {
  if (!folderId) return null
  const depth = Math.min(3, Math.max(1, Math.floor(Number(level) || 1)))
  const chain = folderAncestorChain(folderId, folders)
  if (chain.length === 0) return folderId
  const idx = Math.min(depth, chain.length) - 1
  return chain[idx] ?? folderId
}

/** Max depth of the folder tree (1 = only top-level). */
export function maxFolderDepth(folders: FolderRef[] = []): number {
  if (folders.length === 0) return 1
  let max = 1
  for (const f of folders) {
    max = Math.max(max, folderAncestorChain(f.id, folders).length)
  }
  return max
}

/** Fixed UI options: Level 1 / 2 / 3 — multi-select for nested panels. */
export function panelGroupLevelOptions(): Array<{
  level: PanelGroupLevel
  label: string
  hint: string
}> {
  return [
    {
      level: 1,
      label: 'Level 1',
      hint: 'Outer: top sections (1, 2, 3…)',
    },
    {
      level: 2,
      label: 'Level 2',
      hint: 'Inner: subsections (1.1, 1.2…)',
    },
    {
      level: 3,
      label: 'Level 3',
      hint: 'Innermost: third level from top',
    },
  ]
}

/**
 * Hierarchical path for a folder (parent / child / …), multi-level deep.
 */
export function folderHierarchyPath(
  folderId: string | null | undefined,
  folders: FolderRef[] = [],
): string {
  if (!folderId) return ''
  const byId = new Map(folders.map((f) => [f.id, f]))
  const chain = folderAncestorChain(folderId, folders)
  if (chain.length === 0) return folderId
  return chain
    .map((id) => {
      const f = byId.get(id)
      return (f?.name ?? id).trim() || id
    })
    .join(' / ')
}

/** Sort key for a section: hierarchy path (+ heading when leaf bands). */
export function sectionSortKey(
  section: CanvasItem[],
  folders: Array<{ id: string; name?: string; parentId?: string | null }> = [],
  panelGroupLevel: PanelGroupLevel = 1,
): string {
  const raw =
    section.find((i) => i.folderId)?.folderId ??
    section.find((i) => !isHeadingCard(i))?.folderId ??
    null
  const folderId = folderAtGroupLevel(raw, folders, panelGroupLevel)
  const path = folderHierarchyPath(folderId, folders)
  return `${path}\u0000`.toLocaleLowerCase()
}

/**
 * Reorder sections by hierarchical name (or leave document order).
 */
export function sortCheatSections(
  sections: CanvasItem[][],
  order: GroupSortOrder,
  folders: Array<{ id: string; name?: string; parentId?: string | null }> = [],
  panelGroupLevel: PanelGroupLevel = 1,
): CanvasItem[][] {
  if (order === 'none' || sections.length <= 1) return sections
  const dir = order === 'name-desc' ? -1 : 1
  return [...sections].sort((a, b) => {
    const ka = sectionSortKey(a, folders, panelGroupLevel)
    const kb = sectionSortKey(b, folders, panelGroupLevel)
    if (ka < kb) return -1 * dir
    if (ka > kb) return 1 * dir
    return 0
  })
}

/**
 * Split items into layout sections.
 * Prefer Layers folders (folderId) so same-folder cards stay clustered.
 *
 * `panelGroupLevel` (1|2|3) controls which ancestor owns the panel:
 * - 1: top-level — 1.1 + 1.2 cards merge into panel “1”
 * - 2 / 3: truncate path at that depth from the root
 *
 * Base order (before groupSort): first appearance of each group key in items.
 */
export function splitCheatSections(
  items: CanvasItem[],
  opts: {
    groupByFolder?: boolean
    folders?: Array<{
      id: string
      order?: number
      name?: string
      parentId?: string | null
    }>
    groupSort?: GroupSortOrder
    panelGroupLevel?: PanelGroupLevel
  } = {},
): CanvasItem[][] {
  const groupByFolder = opts.groupByFolder !== false
  const folders = opts.folders ?? []
  const rawLevel = opts.panelGroupLevel ?? 1
  const level = (Math.min(3, Math.max(1, Number(rawLevel) || 1)) ||
    1) as PanelGroupLevel
  const hasFolders =
    groupByFolder && items.some((i) => Boolean(i.folderId))

  let sections: CanvasItem[][]
  if (!hasFolders) {
    sections = splitByHeadings(items)
  } else {
    // Map each card to its panel group key (ancestor at level 1–3)
    const groupKeyOf = (it: CanvasItem): string | null => {
      const raw = it.folderId ?? null
      if (!raw) return null
      return folderAtGroupLevel(raw, folders, level)
    }

    const firstIndex = new Map<string | null, number>()
    items.forEach((it, i) => {
      const key = groupKeyOf(it)
      if (!firstIndex.has(key)) firstIndex.set(key, i)
    })

    const folderKeys = Array.from(firstIndex.keys()).sort((a, b) => {
      if (a == null && b == null) return 0
      if (a == null) return 1 // ungrouped last
      if (b == null) return -1
      return (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0)
    })

    sections = []
    for (const key of folderKeys) {
      const group = items.filter((i) => groupKeyOf(i) === key)
      // One continuous panel per hierarchy node (no heading-split → extra panels)
      if (group.length) sections.push(group)
    }
    if (sections.length === 0) sections = [items]
  }

  return sortCheatSections(
    sections,
    opts.groupSort ?? 'none',
    folders,
    level,
  )
}

/**
 * Continuous n-gon regions: each topic is a **solid** block (not free-grid
 * card interleaving). Optional residual L-annex keeps at most **two** rect
 * components → simple outlines (4–6 exterior sides), not stepped polyominoes.
 *
 * Used only for panel chrome cells; cards stay in the base AABB from dense
 * region placement.
 */
export type RegionBox = {
  index: number
  c: number
  r: number
  cw: number
  ch: number
}

/**
 * Grow each solid region into free cells (right / down / left / up) while
 * staying a single rectangle. Compacts panels together without weird shapes.
 */
export function growRegionsCompact(
  regions: RegionBox[],
  pageCols: number,
  minGap = 0,
): RegionBox[] {
  if (pageCols < 1 || regions.length === 0) return []
  const gap = Math.max(0, minGap)
  const boxes: RegionBox[] = regions.map((r) => ({
    ...r,
    cw: Math.min(pageCols, Math.max(1, r.cw)),
    ch: Math.max(1, r.ch),
  }))

  const key = (c: number, r: number) => `${c},${r}`
  const rebuildOcc = (ignore?: number) => {
    const occ = new Set<string>()
    for (const b of boxes) {
      if (ignore != null && b.index === ignore) continue
      // Reserve gap around other boxes so panels stay slightly separated
      const c0 = b.c - gap
      const r0 = b.r - gap
      const c1 = b.c + b.cw + gap
      const r1 = b.r + b.ch + gap
      for (let r = Math.max(0, r0); r < r1; r++) {
        for (let c = Math.max(0, c0); c < Math.min(pageCols, c1); c++) {
          occ.add(key(c, r))
        }
      }
    }
    return occ
  }

  const freeStrip = (
    occ: Set<string>,
    c0: number,
    r0: number,
    cw: number,
    ch: number,
  ) => {
    if (c0 < 0 || r0 < 0 || cw < 1 || ch < 1 || c0 + cw > pageCols) return false
    for (let r = r0; r < r0 + ch; r++) {
      for (let c = c0; c < c0 + cw; c++) {
        if (occ.has(key(c, r))) return false
      }
    }
    return true
  }

  // Several sweeps: expand largest first so big panels claim nearby gutters
  for (let sweep = 0; sweep < 12; sweep++) {
    let grew = false
    const order = [...boxes].sort(
      (a, b) => b.cw * b.ch - a.cw * a.ch || a.index - b.index,
    )
    for (const b of order) {
      const occ = rebuildOcc(b.index)
      // Right
      if (freeStrip(occ, b.c + b.cw, b.r, 1, b.ch)) {
        b.cw += 1
        grew = true
        continue
      }
      // Down
      if (freeStrip(occ, b.c, b.r + b.ch, b.cw, 1)) {
        b.ch += 1
        grew = true
        continue
      }
      // Left
      if (b.c > 0 && freeStrip(occ, b.c - 1, b.r, 1, b.ch)) {
        b.c -= 1
        b.cw += 1
        grew = true
        continue
      }
      // Up
      if (b.r > 0 && freeStrip(occ, b.c, b.r - 1, b.cw, 1)) {
        b.r -= 1
        b.ch += 1
        grew = true
      }
    }
    if (!grew) break
  }
  return boxes
}

/**
 * After compact rectangular growth, claim at most one residual free rectangle
 * per topic as an L-annex (second solid component). Skips annexes that would
 * create fragmented / many-sided chrome.
 */
export function claimSimpleLAnnexes(
  bases: RegionBox[],
  pageCols: number,
  minGap = 0,
): Map<number, Array<{ c: number; r: number; cw: number; ch: number }>> {
  const out = new Map<
    number,
    Array<{ c: number; r: number; cw: number; ch: number }>
  >()
  if (pageCols < 1) return out
  const gap = Math.max(0, minGap)
  const boxes = bases.map((b) => ({ ...b }))
  const annexOf = new Map<number, { c: number; r: number; cw: number; ch: number }>()

  const key = (c: number, r: number) => `${c},${r}`
  const buildOcc = () => {
    const occ = new Set<string>()
    const mark = (c0: number, r0: number, cw: number, ch: number, g: number) => {
      for (let r = Math.max(0, r0 - g); r < r0 + ch + g; r++) {
        for (
          let c = Math.max(0, c0 - g);
          c < Math.min(pageCols, c0 + cw + g);
          c++
        ) {
          occ.add(key(c, r))
        }
      }
    }
    for (const b of boxes) mark(b.c, b.r, b.cw, b.ch, gap)
    for (const a of annexOf.values()) mark(a.c, a.r, a.cw, a.ch, gap)
    return occ
  }

  const freeRect = (
    occ: Set<string>,
    c0: number,
    r0: number,
    cw: number,
    ch: number,
  ) => {
    if (c0 < 0 || r0 < 0 || cw < 1 || ch < 1 || c0 + cw > pageCols) return false
    for (let r = r0; r < r0 + ch; r++) {
      for (let c = c0; c < c0 + cw; c++) {
        if (occ.has(key(c, r))) return false
      }
    }
    return true
  }

  for (const b of [...boxes].sort((a, c) => c.cw * c.ch - a.cw * a.ch)) {
    if (annexOf.has(b.index)) continue
    const occ = buildOcc()
    let best: { c: number; r: number; cw: number; ch: number; area: number } | null =
      null

    // Under-base free foot (classic L): free rect directly below base
    for (let h = 1; h <= 8; h++) {
      for (let w = Math.max(1, Math.floor(b.cw / 2)); w <= b.cw; w++) {
        // foot aligned left or right under base
        for (const c0 of [b.c, b.c + b.cw - w]) {
          const r0 = b.r + b.ch
          if (!freeRect(occ, c0, r0, w, h)) continue
          // Must leave a notch (w < b.cw) to be a true L, not a taller rect
          if (w >= b.cw) continue
          const area = w * h
          if (!best || area > best.area) best = { c: c0, r: r0, cw: w, ch: h, area }
        }
      }
    }

    // Right of base free bar with height < base (side notch L)
    for (let h = Math.max(1, Math.floor(b.ch / 2)); h < b.ch; h++) {
      for (let w = 1; w <= 8; w++) {
        for (const r0 of [b.r, b.r + b.ch - h]) {
          const c0 = b.c + b.cw
          if (c0 + w > pageCols) continue
          if (!freeRect(occ, c0, r0, w, h)) continue
          const area = w * h
          if (!best || area > best.area) best = { c: c0, r: r0, cw: w, ch: h, area }
        }
      }
    }

    // Left side notch L
    for (let h = Math.max(1, Math.floor(b.ch / 2)); h < b.ch; h++) {
      for (let w = 1; w <= 8; w++) {
        for (const r0 of [b.r, b.r + b.ch - h]) {
          const c0 = b.c - w
          if (c0 < 0) continue
          if (!freeRect(occ, c0, r0, w, h)) continue
          const area = w * h
          if (!best || area > best.area) best = { c: c0, r: r0, cw: w, ch: h, area }
        }
      }
    }

    if (best && best.area >= 2) {
      annexOf.set(b.index, {
        c: best.c,
        r: best.r,
        cw: best.cw,
        ch: best.ch,
      })
    }
  }

  for (const b of boxes) {
    const cells: Array<{ c: number; r: number; cw: number; ch: number }> = [
      { c: b.c, r: b.r, cw: b.cw, ch: b.ch },
    ]
    const a = annexOf.get(b.index)
    if (a) cells.push(a)
    out.set(b.index, cells)
  }
  return out
}

/**
 * @deprecated Prefer continuous n-gon packing (dense regions + simple L).
 * Kept for tests / callers that still pass free-grid topics.
 */
export function packTopicsOnFreeGrid(
  topics: Array<{
    index: number
    bodyRects: CellRect[]
    /** @deprecated ignored — title is visual-only */
    titleCh?: number
  }>,
  pageCols: number,
  gapCells = 1,
): {
  /** card id → absolute (c,r) */
  cardPos: Map<string, { c: number; r: number }>
  /** topic index → cells occupied (for L-shaped panel runs) */
  topicCells: Map<
    number,
    Array<{ c: number; r: number; cw: number; ch: number }>
  >
  maxR: number
} {
  // Continuous shelf per topic, then dense region place — not card interleave.
  const cardPos = new Map<string, { c: number; r: number }>()
  const topicCells = new Map<
    number,
    Array<{ c: number; r: number; cw: number; ch: number }>
  >()
  if (pageCols < 1) return { cardPos, topicCells, maxR: 0 }

  const regions: RegionBox[] = []
  const localPos = new Map<
    number,
    { pos: Map<string, { c: number; r: number }>; rects: CellRect[] }
  >()

  for (const topic of topics) {
    const natural = naturalTopicPack(topic.bodyRects, pageCols)
    localPos.set(topic.index, { pos: natural.pos, rects: natural.rects })
    regions.push({
      index: topic.index,
      c: 0,
      r: 0,
      cw: natural.contentCw,
      ch: natural.contentCh,
    })
  }

  const placed = placeTopicRegionsDense(
    regions.map((r) => ({ index: r.index, cw: r.cw, ch: r.ch })),
    pageCols,
    Math.max(0, gapCells),
    { sortByHeight: false },
  )

  let maxR = 0
  for (const reg of regions) {
    const origin = placed.get(reg.index) ?? { c: 0, r: 0 }
    const local = localPos.get(reg.index)!
    for (const rect of local.rects) {
      const p = local.pos.get(rect.id) ?? { c: 0, r: 0 }
      cardPos.set(rect.id, { c: origin.c + p.c, r: origin.r + p.r })
    }
    topicCells.set(reg.index, [
      { c: origin.c, r: origin.r, cw: reg.cw, ch: reg.ch },
    ])
    maxR = Math.max(maxR, origin.r + reg.ch)
  }
  return { cardPos, topicCells, maxR }
}

/** Merge occupied cells into horizontal runs (for L-shaped panel chrome). */
export function cellsToOrthogonalRuns(
  cells: Array<{ c: number; r: number; cw: number; ch: number }>,
  grid: number,
  originX: number,
  originY: number,
  padPx: number,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (cells.length === 0) return []
  // Expand to unit cells
  const unit = new Set<string>()
  for (const cell of cells) {
    for (let r = cell.r; r < cell.r + cell.ch; r++) {
      for (let c = cell.c; c < cell.c + cell.cw; c++) {
        unit.add(`${c},${r}`)
      }
    }
  }
  // Group by row → contiguous c ranges
  const byRow = new Map<number, number[]>()
  for (const k of unit) {
    const [cs, rs] = k.split(',')
    const c = Number(cs)
    const r = Number(rs)
    if (!byRow.has(r)) byRow.set(r, [])
    byRow.get(r)!.push(c)
  }
  const runs: Array<{ x: number; y: number; width: number; height: number }> =
    []
  const pad = Math.max(0, padPx)
  for (const [r, cols] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    cols.sort((a, b) => a - b)
    let start = cols[0]!
    let prev = cols[0]!
    for (let i = 1; i <= cols.length; i++) {
      const cur = cols[i]
      if (cur === prev + 1) {
        prev = cur
        continue
      }
      // emit [start, prev]
      const c0 = start
      const c1 = prev
      runs.push({
        x: Math.round(originX + c0 * grid - pad),
        y: Math.round(originY + r * grid - pad),
        width: Math.round((c1 - c0 + 1) * grid + pad * 2),
        height: Math.round(grid + pad * 2),
      })
      if (cur != null) {
        start = cur
        prev = cur
      }
    }
  }
  // Merge vertically adjacent identical runs (optional tidy)
  return mergeVerticalRuns(runs)
}

function mergeVerticalRuns(
  runs: Array<{ x: number; y: number; width: number; height: number }>,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (runs.length <= 1) return runs
  const sorted = [...runs].sort((a, b) => a.x - b.x || a.y - b.y)
  const out: typeof runs = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (
      last &&
      last.x === r.x &&
      last.width === r.width &&
      last.y + last.height >= r.y - 1 &&
      last.y + last.height <= r.y + 1
    ) {
      last.height = r.y + r.height - last.y
    } else {
      out.push({ ...r })
    }
  }
  return out
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
 * Bottom-left pack on a discrete grid: place each rect at the first free cell
 * that fits (left→right, top→bottom). Preserves **document order** (no
 * largest-first reordering — that stacked small cards under large ones).
 *
 * Overflow rows extend past `rows` without overlapping (each card gets its own
 * band). Callers use multipage when the result exceeds one page.
 */
export function packRectsOnGrid(
  rects: Array<{ id: string; cw: number; ch: number }>,
  cols: number,
  rows: number,
): Map<string, { c: number; r: number }> {
  const pos = new Map<string, { c: number; r: number }>()
  if (cols < 1 || rows < 1) return pos

  // Growable occupancy — multipage packs need rows beyond one page
  const maxRows = Math.max(rows, 1)
  const occ: boolean[][] = []
  const ensureRow = (r: number) => {
    while (occ.length <= r) {
      occ.push(Array.from({ length: cols }, () => false))
    }
  }
  for (let r = 0; r < maxRows; r++) ensureRow(r)

  const fits = (c0: number, r0: number, cw: number, ch: number) => {
    if (c0 + cw > cols) return false
    for (let r = r0; r < r0 + ch; r++) {
      ensureRow(r)
      for (let c = c0; c < c0 + cw; c++) {
        if (occ[r]![c]) return false
      }
    }
    return true
  }

  const mark = (c0: number, r0: number, cw: number, ch: number) => {
    for (let r = r0; r < r0 + ch; r++) {
      ensureRow(r)
      for (let c = c0; c < c0 + cw; c++) {
        occ[r]![c] = true
      }
    }
  }

  let overflowR = 0
  for (const r of rects) {
    const cw = Math.min(r.cw, cols)
    const ch = Math.max(1, r.ch)
    let placed = false
    // Search within a generous vertical band (multi-page tall)
    const searchRows = Math.max(maxRows * 8, rects.length * 4, 64)
    for (let r0 = 0; r0 <= searchRows - ch && !placed; r0++) {
      for (let c0 = 0; c0 <= cols - cw && !placed; c0++) {
        if (fits(c0, r0, cw, ch)) {
          mark(c0, r0, cw, ch)
          pos.set(r.id, { c: c0, r: r0 })
          overflowR = Math.max(overflowR, r0 + ch)
          placed = true
        }
      }
    }
    if (!placed) {
      // Guaranteed non-overlapping fallback: full-width stack below
      const r0 = overflowR
      pos.set(r.id, { c: 0, r: r0 })
      mark(0, r0, cw, ch)
      overflowR = r0 + ch
    }
  }

  return pos
}

/**
 * Reading-order shelf pack on a grid (left→right, wrap). No reordering —
 * preferred for section body cards so formulas stay in catalog order.
 */
export function packRectsShelfOnGrid(
  rects: Array<{ id: string; cw: number; ch: number }>,
  cols: number,
): Map<string, { c: number; r: number }> {
  const pos = new Map<string, { c: number; r: number }>()
  if (cols < 1) return pos
  let c = 0
  let r = 0
  let rowH = 0
  for (const rect of rects) {
    const cw = Math.min(Math.max(1, rect.cw), cols)
    const ch = Math.max(1, rect.ch)
    if (c > 0 && c + cw > cols) {
      r += rowH
      c = 0
      rowH = 0
    }
    pos.set(rect.id, { c, r })
    c += cw
    rowH = Math.max(rowH, ch)
    if (c >= cols) {
      r += rowH
      c = 0
      rowH = 0
    }
  }
  return pos
}

// ─── Area-proportional topic pack (grid cells as unit area) ─────────────────

export type CellRect = { id: string; cw: number; ch: number }

export type TopicSectionPlan = {
  /** Index into section list (document order). */
  index: number
  heading?: CanvasItem
  body: CanvasItem[]
  /**
   * Folder that owns this panel after panelGroupLevel mapping
   * (e.g. top-level id when level=1, even if cards live in 1.1).
   */
  groupFolderId?: string | null
  /** Ideal body area in grid cells (pre-scale). */
  idealCells: number
  /** Share of total ideal body area (0–1). */
  areaShare: number
  /**
   * Outer region size in cells (includes pad + title chrome).
   * Used for non-overlapping region placement = panel size.
   */
  regionCw: number
  regionCh: number
  /** Inner content size (cards only). */
  contentCw: number
  contentCh: number
  /** Pad on each side in cells (panel chrome). */
  padCells: number
  /** Scaled body rects (cw/ch). */
  bodyRects: CellRect[]
  /** Local card positions inside content area (0,0 = after pad+title). */
  bodyPos: Map<string, { c: number; r: number }>
  /** Banner row cells when groupChrome includes labels. */
  headingCh: number
  /** In-panel title strip cells when panels-only (no banner cards). */
  panelTitleCh: number
}

/**
 * Linear size scale so total card area (in cells) fits the multipage budget.
 * Never grows past 1; floors at minScale for readability.
 */
export function computeGridAreaScale(
  totalIdealCells: number,
  pageCells: number,
  pages: number,
  fillTarget = GRID_PACK_FILL_TARGET,
  minScale = 0.55,
): number {
  if (totalIdealCells < 1 || pageCells < 1) return 1
  const budget = Math.max(1, pages * pageCells * fillTarget)
  // Area scales with s² when both dimensions scale by s
  const s = Math.sqrt(budget / totalIdealCells)
  return Math.min(1, Math.max(minScale, s))
}

/**
 * Choose how many letter pages so scale ≥ minScale for the ideal cell total.
 */
export function pagesForIdealCells(
  totalIdealCells: number,
  pageCells: number,
  fillTarget = GRID_PACK_FILL_TARGET,
  minScale = 0.55,
  maxPages = 20,
): number {
  if (totalIdealCells < 1 || pageCells < 1) return 1
  // Need pages such that budget >= totalIdeal * minScale²
  const need = Math.ceil(
    (totalIdealCells * minScale * minScale) / (pageCells * fillTarget),
  )
  return Math.min(maxPages, Math.max(1, need))
}

/** Shelf-pack height (rows) for rects into a given column width. */
export function shelfPackHeight(
  rects: CellRect[],
  cols: number,
): number {
  if (rects.length === 0 || cols < 1) return 0
  const pos = packRectsShelfOnGrid(rects, cols)
  let max = 0
  for (const r of rects) {
    const p = pos.get(r.id)
    if (!p) continue
    max = Math.max(max, p.r + r.ch)
  }
  return max
}

/**
 * @deprecated Prefer naturalTopicPack — half/full page widths left tall empty
 * gutters next to short topics.
 */
export function chooseTopicRegionWidth(
  bodyCells: number,
  pageCols: number,
  pageRows: number,
): number {
  const full = Math.max(1, pageCols)
  if (bodyCells <= 0) return full
  const half = Math.max(2, Math.floor(pageCols / 2))
  const halfH = Math.ceil(bodyCells / half) + 1
  const small =
    bodyCells <= pageCols * pageRows * 0.35 && halfH <= pageRows
  const tiny = bodyCells <= pageCols * 3 && pageCols >= 12
  if ((small || tiny) && half < full) return half
  return full
}

/**
 * Scale cell rects by linear scale s; clamp to mins and max width.
 */
export function scaleCellRects(
  rects: CellRect[],
  s: number,
  maxCw: number,
  minCw = 2,
  minCh = 1,
): CellRect[] {
  return rects.map((r) => ({
    id: r.id,
    cw: Math.max(minCw, Math.min(maxCw, Math.round(r.cw * s))),
    ch: Math.max(minCh, Math.round(r.ch * s)),
  }))
}

/** Measure shelf pack: actual bounding size (not forced full width). */
export function measureShelfPack(
  rects: CellRect[],
  maxCols: number,
): {
  pos: Map<string, { c: number; r: number }>
  usedCw: number
  usedCh: number
} {
  if (rects.length === 0 || maxCols < 1) {
    return { pos: new Map(), usedCw: 1, usedCh: 1 }
  }
  const clamped = rects.map((r) => ({
    ...r,
    cw: Math.min(Math.max(1, r.cw), maxCols),
  }))
  const pos = packRectsShelfOnGrid(clamped, maxCols)
  let usedCw = 0
  let usedCh = 0
  for (const r of clamped) {
    const p = pos.get(r.id)
    if (!p) continue
    usedCw = Math.max(usedCw, p.c + r.cw)
    usedCh = Math.max(usedCh, p.r + r.ch)
  }
  return {
    pos,
    usedCw: Math.max(1, usedCw),
    usedCh: Math.max(1, usedCh),
  }
}

/**
 * Pack a topic's cards into a **natural** tight block (not forced columns).
 * Tries several max widths with **free-flow dense** packing (maxrects-style)
 * and shelf as a fallback, picking the bounding box with least waste so
 * n-gon / rect chrome can fill right-side holes instead of stacking tall
 * full-width shelves.
 */
export function naturalTopicPack(
  bodyRects: CellRect[],
  pageCols: number,
): {
  /** Body rects (cw may be clamped to chosen width). */
  rects: CellRect[]
  /** Local positions inside the block. */
  pos: Map<string, { c: number; r: number }>
  /** Content width/height in cells (no panel pad). */
  contentCw: number
  contentCh: number
} {
  if (bodyRects.length === 0) {
    return {
      rects: [],
      pos: new Map(),
      contentCw: 1,
      contentCh: 1,
    }
  }
  const maxCardW = Math.max(1, ...bodyRects.map((r) => r.cw))
  const candidates = Array.from(
    new Set(
      [
        pageCols,
        Math.ceil((pageCols * 3) / 4),
        Math.ceil((pageCols * 2) / 3),
        Math.ceil(pageCols / 2),
        Math.ceil(pageCols / 3),
        Math.min(pageCols, Math.max(maxCardW, 6)),
        Math.min(pageCols, maxCardW),
        // Extra mid widths so residual page columns get used more often
        Math.min(pageCols, Math.max(maxCardW, Math.ceil(pageCols * 0.4))),
        Math.min(pageCols, Math.max(maxCardW, Math.ceil(pageCols * 0.55))),
      ]
        .map((w) => Math.max(maxCardW, Math.min(pageCols, w)))
        .filter((w) => w >= 1),
    ),
  ).sort((a, b) => a - b)

  let best: {
    rects: CellRect[]
    pos: Map<string, { c: number; r: number }>
    contentCw: number
    contentCh: number
    score: number
  } | null = null

  const scorePack = (
    rects: CellRect[],
    pos: Map<string, { c: number; r: number }>,
    usedCw: number,
    usedCh: number,
  ) => {
    const contentCells = rects.reduce((s, r) => s + r.cw * r.ch, 0)
    const boxCells = usedCw * usedCh
    const waste = boxCells / Math.max(1, contentCells)
    // Primary: minimize height so neighbors can sit side-by-side and fill
    // right-side page columns. Secondary: low waste / compact area.
    return (
      usedCh * 1e6 +
      waste * 800 +
      usedCw * usedCh * 4 +
      // Mild preference for using more of the available width (fewer empty cols)
      (pageCols - usedCw) * 12
    )
  }

  for (const w of candidates) {
    const rects = bodyRects.map((r) => ({
      ...r,
      cw: Math.min(r.cw, w),
    }))
    // Dense free-flow (n-gon strength): hole-fill + gravity, not row shelves
    const densePos = placeTopicRegionsDense(
      rects.map((r, i) => ({ index: i, cw: r.cw, ch: r.ch })),
      w,
      0,
      { sortByHeight: true, readingFlow: false },
    )
    let usedCw = 1
    let usedCh = 1
    const pos = new Map<string, { c: number; r: number }>()
    rects.forEach((r, i) => {
      const p = densePos.get(i) ?? { c: 0, r: 0 }
      pos.set(r.id, p)
      usedCw = Math.max(usedCw, p.c + r.cw)
      usedCh = Math.max(usedCh, p.r + r.ch)
    })
    usedCw = Math.min(w, usedCw)
    const score = scorePack(rects, pos, usedCw, usedCh)
    if (!best || score < best.score) {
      best = { rects, pos, contentCw: usedCw, contentCh: usedCh, score }
    }

    // Shelf alternative (catalog order) — keep if denser for this width
    const shelf = measureShelfPack(rects, w)
    const shelfScore = scorePack(
      rects,
      shelf.pos,
      shelf.usedCw,
      shelf.usedCh,
    )
    if (shelfScore < (best?.score ?? Infinity)) {
      best = {
        rects,
        pos: shelf.pos,
        contentCw: shelf.usedCw,
        contentCh: shelf.usedCh,
        score: shelfScore,
      }
    }
  }

  return {
    rects: best!.rects,
    pos: best!.pos,
    contentCw: best!.contentCw,
    contentCh: best!.contentCh,
  }
}

/**
 * Place topic **outer** regions with free-flow maxrects (never row/column grid).
 *
 * Scoring (in order):
 * 1. Minimize growth of global bottom (fill holes before stacking down)
 * 2. Prefer higher (smaller r) — use upper free space
 * 3. Prefer left (smaller c) — fill the left side first
 *
 * Then a **gravity compaction** pass slides blocks toward free space.
 *
 * @param gapCells empty cells required between region boxes
 * @param opts.sortByHeight place taller first (densest). Default **true**.
 * @param opts.readingFlow when true (name A→Z / Z→A): place in array order with
 *   free-flow hole-fill; soft diagonal bias so earlier items tend top-left and
 *   later bottom-right; gravity slides **left** only so order flow isn’t erased.
 */
export function placeTopicRegionsDense(
  regions: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
  gapCells = 0,
  opts?: { sortByHeight?: boolean; readingFlow?: boolean },
): Map<number, { c: number; r: number }> {
  const pos = new Map<number, { c: number; r: number }>()
  if (pageCols < 1 || regions.length === 0) return pos

  const gap = Math.max(0, gapCells)
  const readingFlow = opts?.readingFlow === true
  // Reading-flow places in given order; height-first densifies when flow is off
  const sortByHeight = !readingFlow && opts?.sortByHeight !== false
  type Placed = {
    index: number
    c: number
    r: number
    cw: number
    ch: number
    /** Stable place-sequence index (0 = first placed for reading flow). */
    seq: number
  }
  const placed: Placed[] = []

  const order = regions.map((reg, i) => ({ r: reg, i }))
  if (sortByHeight) {
    // Taller / larger first fills the skyline better; document order as tie-break
    order.sort(
      (a, b) =>
        b.r.ch - a.r.ch || b.r.cw * b.r.ch - a.r.cw * a.r.ch || a.i - b.i,
    )
  }

  const collides = (
    c: number,
    r: number,
    cw: number,
    ch: number,
    ignoreIndex?: number,
  ) => {
    for (const p of placed) {
      if (ignoreIndex != null && p.index === ignoreIndex) continue
      if (
        c < p.c + p.cw + gap &&
        c + cw + gap > p.c &&
        r < p.r + p.ch + gap &&
        r + ch + gap > p.r
      ) {
        return true
      }
    }
    return false
  }

  /** Count how many sides touch an already-placed block (prefer nestling in holes). */
  const contactScore = (
    c: number,
    r: number,
    cw: number,
    ch: number,
    ignoreIndex?: number,
  ) => {
    if (placed.length === 0) return 0
    let contact = 0
    for (const p of placed) {
      if (ignoreIndex != null && p.index === ignoreIndex) continue
      // Horizontal abut (share vertical edge)
      const yOverlap =
        Math.min(r + ch, p.r + p.ch) - Math.max(r, p.r)
      if (yOverlap > 0) {
        if (c + cw + gap === p.c || p.c + p.cw + gap === c) contact += yOverlap
      }
      // Vertical abut (share horizontal edge)
      const xOverlap =
        Math.min(c + cw, p.c + p.cw) - Math.max(c, p.c)
      if (xOverlap > 0) {
        if (r + ch + gap === p.r || p.r + p.ch + gap === r) contact += xOverlap
      }
    }
    // Also reward sitting on the left wall / top
    if (c === 0) contact += ch * 0.25
    if (r === 0) contact += cw * 0.25
    return contact
  }

  const n = order.length
  let seq = 0
  for (const { r: reg } of order) {
    const cw = Math.min(pageCols, Math.max(1, reg.cw))
    const ch = Math.max(1, reg.ch)
    const currentBottom = placed.reduce((m, p) => Math.max(m, p.r + p.ch), 0)
    const searchR = currentBottom + ch + gap + 2
    // Soft diagonal target for reading flow (not a hard shelf — just a bias)
    const t = n <= 1 ? 0 : seq / (n - 1)
    const diagTarget = t * Math.max(currentBottom, ch)

    let best: { c: number; r: number; score: number } | null = null
    for (let r = 0; r <= searchR; r++) {
      for (let c = 0; c <= pageCols - cw; c++) {
        if (collides(c, r, cw, ch)) continue
        const newBottom = Math.max(currentBottom, r + ch)
        const contact = contactScore(c, r, cw, ch)
        // Primary: compact bottom (hole-fill). Contact fills right-side voids.
        let score =
          newBottom * 1e9 + r * 1e5 + c * 10 - contact * 50
        if (readingFlow) {
          // Weak ascending bias — densification still wins (contact + bottom).
          const diag = r + c * 0.35
          score =
            newBottom * 1e9 +
            Math.abs(diag - diagTarget) * 120 +
            r * 1e4 +
            c * 10 -
            contact * 40
        }
        if (!best || score < best.score) {
          best = { c, r, score }
        }
      }
    }

    if (!best) {
      const r = currentBottom + (placed.length ? gap : 0)
      best = { c: 0, r, score: r }
    }
    placed.push({
      index: reg.index,
      c: best.c,
      r: best.r,
      cw,
      ch,
      seq: seq++,
    })
  }

  // Gravity compaction. Full up+left for densest packs; reading-flow only
  // slides left (and slight up) so A→Z diagonal bias isn’t fully erased.
  for (let sweep = 0; sweep < 12; sweep++) {
    let moved = false
    const sorted = [...placed].sort((a, b) => a.r - b.r || a.c - b.c)
    for (const p of sorted) {
      let bestC = p.c
      let bestR = p.r
      let bestContact = contactScore(p.c, p.r, p.cw, p.ch, p.index)
      const rMax = readingFlow ? p.r : p.r
      const rMin = readingFlow ? Math.max(0, p.r - 2) : 0
      for (let r = rMin; r <= rMax; r++) {
        for (let c = 0; c <= pageCols - p.cw; c++) {
          if (collides(c, r, p.cw, p.ch, p.index)) continue
          const contact = contactScore(c, r, p.cw, p.ch, p.index)
          // Prefer higher, then more contact (fill right holes), then left
          if (
            r < bestR ||
            (r === bestR && contact > bestContact) ||
            (r === bestR && contact === bestContact && c < bestC)
          ) {
            bestR = r
            bestC = c
            bestContact = contact
          }
        }
      }
      if (bestC !== p.c || bestR !== p.r) {
        p.c = bestC
        p.r = bestR
        moved = true
      }
    }
    if (!moved) break
  }

  for (const p of placed) {
    pos.set(p.index, { c: p.c, r: p.r })
  }
  return pos
}

/**
 * @deprecated Use placeTopicRegionsDense — row shelf left large empty gutters.
 */
export function placeTopicRegions(
  regions: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
): Map<number, { c: number; r: number }> {
  return placeTopicRegionsDense(regions, pageCols, 0)
}

/**
 * Pack leaf regions into the tightest free-flow box among candidate widths.
 * Using full pageCols for local pack made every outer parent full-width →
 * vertical stacking and huge empty space lower on the sheet.
 */
export function packClusterTight(
  members: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
  gapCells = 0,
): {
  pos: Map<number, { c: number; r: number }>
  usedCw: number
  usedCh: number
} {
  if (members.length === 0 || pageCols < 1) {
    return { pos: new Map(), usedCw: 1, usedCh: 1 }
  }
  const gap = Math.max(0, gapCells)
  const maxLeafW = Math.max(1, ...members.map((m) => m.cw))
  const area = members.reduce((s, m) => s + m.cw * m.ch, 0)
  const candidates = Array.from(
    new Set(
      [
        pageCols,
        Math.ceil((pageCols * 3) / 4),
        Math.ceil((pageCols * 2) / 3),
        Math.ceil(pageCols / 2),
        Math.ceil(pageCols / 3),
        Math.min(pageCols, Math.max(maxLeafW, Math.ceil(Math.sqrt(area * 1.2)))),
        Math.min(pageCols, maxLeafW),
      ]
        .map((w) => Math.max(maxLeafW, Math.min(pageCols, w)))
        .filter((w) => w >= 1),
    ),
  ).sort((a, b) => a - b)

  let best: {
    pos: Map<number, { c: number; r: number }>
    usedCw: number
    usedCh: number
    score: number
  } | null = null

  for (const cols of candidates) {
    const pos = placeTopicRegionsDense(
      members.map((m) => ({
        index: m.index,
        cw: Math.min(m.cw, cols),
        ch: m.ch,
      })),
      cols,
      gap,
      { sortByHeight: true, readingFlow: false },
    )
    let usedCw = 1
    let usedCh = 1
    for (const m of members) {
      const o = pos.get(m.index) ?? { c: 0, r: 0 }
      const cw = Math.min(m.cw, cols)
      usedCw = Math.max(usedCw, o.c + cw)
      usedCh = Math.max(usedCh, o.r + m.ch)
    }
    usedCw = Math.min(cols, usedCw)
    // Prefer shorter stacks (fill width / right-side holes) over tall slabs
    const score = usedCh * 1e6 + usedCw * usedCh * 8 + usedCw * 0.25
    if (!best || score < best.score) {
      best = { pos, usedCw, usedCh, score }
    }
  }
  return {
    pos: best!.pos,
    usedCw: best!.usedCw,
    usedCh: best!.usedCh,
  }
}

/**
 * Hierarchical free-flow placement for nested panel levels.
 *
 * Strategy (density-first):
 * 1. Pack leaf groups **tightly** inside each L1 parent (prefer short/wide).
 * 2. Free-flow outer L1 boxes on the page with outer gap 0 (touch for merge).
 * 3. **Expand** each outer into residual columns on its row so right-side
 *    page space is used (re-pack leaves into the wider budget).
 *
 * Outer title band is reserved so L1 chips sit above L2 content.
 */
export function placePlansHierarchical(
  plans: Array<{
    index: number
    cw: number
    ch: number
    /** Folder id at deepest pack level (leaf group). */
    leafFolderId: string | null
  }>,
  folders: FolderRef[],
  /** Shallowest selected level (e.g. 1) — outer cluster key. */
  outerLevel: PanelGroupLevel,
  pageCols: number,
  gapCells = 0,
  opts?: {
    sortByHeight?: boolean
    readingFlow?: boolean
    /** Cells reserved at top of each outer cluster for L1 title chip. */
    outerTitleCells?: number
    /**
     * Gap between outer parent boxes (defaults to gapCells).
     * Should be ≥ chrome pad of outer frames so L1 panels never collide.
     */
    outerGapCells?: number
    /**
     * Inset (cells) between L1 outer border and L2 leaf content — prevents
     * stacked double borders (outer+inner lines on top of each other).
     */
    nestInsetCells?: number
  },
): Map<number, { c: number; r: number }> {
  const pos = new Map<number, { c: number; r: number }>()
  if (pageCols < 1 || plans.length === 0) return pos

  // Leaf gap inside L1: keep small so L2 tiles densely (chrome pad is visual)
  const gap = Math.max(0, Math.min(gapCells, 1))
  const outerGap = Math.max(0, opts?.outerGapCells ?? 0)
  const outerTitle = Math.max(0, opts?.outerTitleCells ?? 0)
  const nestInset = Math.max(0, opts?.nestInsetCells ?? 0)
  // Cluster leaf plans by outer ancestor
  type Cluster = {
    key: string
    members: Array<{ index: number; cw: number; ch: number }>
  }
  const orderKeys: string[] = []
  const clusters = new Map<string, Cluster>()
  for (const p of plans) {
    const key =
      folderAtGroupLevel(p.leafFolderId, folders, outerLevel) ??
      p.leafFolderId ??
      `__plan_${p.index}`
    if (!clusters.has(key)) {
      clusters.set(key, { key, members: [] })
      orderKeys.push(key)
    }
    clusters.get(key)!.members.push({
      index: p.index,
      cw: p.cw,
      ch: p.ch,
    })
  }

  type OuterBox = {
    key: string
    cw: number
    ch: number
    members: Array<{ index: number; cw: number; ch: number }>
    local: Map<number, { c: number; r: number }>
  }
  const packOuter = (
    members: Array<{ index: number; cw: number; ch: number }>,
    innerCols: number,
  ): {
    local: Map<number, { c: number; r: number }>
    usedCw: number
    usedCh: number
  } => {
    const tight = packClusterTight(members, innerCols, gap)
    const local = new Map<number, { c: number; r: number }>()
    for (const [idx, p] of tight.pos) {
      local.set(idx, {
        c: p.c + nestInset,
        r: p.r + outerTitle + nestInset,
      })
    }
    return {
      local,
      usedCw: tight.usedCw,
      usedCh: tight.usedCh,
    }
  }

  const outers: OuterBox[] = []
  for (const key of orderKeys) {
    const cl = clusters.get(key)!
    const innerCols = Math.max(1, pageCols - nestInset * 2)
    const packed = packOuter(cl.members, innerCols)
    outers.push({
      key,
      members: cl.members,
      cw: Math.min(
        pageCols,
        Math.max(1, packed.usedCw + nestInset * 2),
      ),
      ch: Math.max(1, packed.usedCh + outerTitle + nestInset * 2),
      local: packed.local,
    })
  }

  // Global free-flow of outer boxes (non-overlapping L1 / shallow frames)
  const outerPlace = placeTopicRegionsDense(
    outers.map((o, i) => ({ index: i, cw: o.cw, ch: o.ch })),
    pageCols,
    outerGap,
    {
      sortByHeight: opts?.sortByHeight,
      readingFlow: opts?.readingFlow,
    },
  )

  // Expand into residual columns only when re-pack actually fills the width
  // and gets shorter — avoids bloated L1 frames full of empty interior.
  for (let i = 0; i < outers.length; i++) {
    const o = outers[i]!
    const origin = outerPlace.get(i) ?? { c: 0, r: 0 }
    let freeRight = pageCols - (origin.c + o.cw)
    for (const [j, other] of outers.entries()) {
      if (j === i) continue
      const oo = outerPlace.get(j) ?? { c: 0, r: 0 }
      const yOverlap =
        Math.min(origin.r + o.ch, oo.r + other.ch) - Math.max(origin.r, oo.r)
      if (yOverlap <= 0) continue
      if (oo.c >= origin.c + o.cw) {
        freeRight = Math.min(freeRight, oo.c - (origin.c + o.cw) - outerGap)
      }
    }
    freeRight = Math.max(0, freeRight)
    if (freeRight >= 2) {
      const widerInner = Math.max(
        1,
        Math.min(pageCols - nestInset * 2, o.cw - nestInset * 2 + freeRight),
      )
      const repacked = packOuter(o.members, widerInner)
      // Content must actually use most of the wider budget (not sparse)
      const fillRatio = repacked.usedCw / Math.max(1, widerInner)
      const newCw = Math.min(
        pageCols - origin.c,
        Math.max(1, repacked.usedCw + nestInset * 2),
      )
      const newCh = Math.max(1, repacked.usedCh + outerTitle + nestInset * 2)
      const shorter = newCh < o.ch
      const meaningfullyWider =
        newCw > o.cw && fillRatio >= 0.82 && newCh <= o.ch
      if (shorter || meaningfullyWider) {
        let ok = true
        for (const [j, other] of outers.entries()) {
          if (j === i) continue
          const oo = outerPlace.get(j) ?? { c: 0, r: 0 }
          if (
            origin.c < oo.c + other.cw + outerGap &&
            origin.c + newCw + outerGap > oo.c &&
            origin.r < oo.r + other.ch + outerGap &&
            origin.r + newCh + outerGap > oo.r
          ) {
            ok = false
            break
          }
        }
        if (ok && origin.c + newCw <= pageCols) {
          o.cw = newCw
          o.ch = newCh
          o.local = repacked.local
        }
      }
    }
  }

  for (let i = 0; i < outers.length; i++) {
    const o = outers[i]!
    const origin = outerPlace.get(i) ?? { c: 0, r: 0 }
    for (const [planIndex, loc] of o.local) {
      pos.set(planIndex, { c: origin.c + loc.c, r: origin.r + loc.r })
    }
  }
  return pos
}

/**
 * Push items that straddle content bands.
 *
 * - `mode: 'continuous'`: bands of height contentHeight stacked from marginTop
 *   with no gutters (pre-gutter packing space).
 * - `mode: 'board'` (default): real print pages — content on page k is
 *   [k×pageHeight+marginTop, k×pageHeight+marginTop+contentHeight).
 */
export function resolveMultipageStraddles(
  items: CanvasItem[],
  opts: {
    pageHeight: number
    marginTop: number
    contentHeight: number
    grid?: number
    mode?: 'continuous' | 'board'
  },
): CanvasItem[] {
  if (items.length === 0) return items
  const pageH = Math.max(1, opts.pageHeight)
  const mTop = Math.max(0, opts.marginTop)
  const contentH = Math.max(1, opts.contentHeight)
  const grid = Math.max(1, opts.grid ?? ORGANIZE_GRID)
  const continuous = opts.mode === 'continuous'
  // Continuous: virtual page step = contentH. Board: real pageHeight.
  const step = continuous ? contentH : pageH

  const rows = items.map((it) => ({ ...it }))
  let guard = 0
  while (guard++ < 120) {
    let moved = false
    const order = [...rows]
      .filter((r) => !r.hidden)
      .sort((a, b) => a.y - b.y || a.x - b.x)

    for (const it of order) {
      const y = it.y
      const h = Math.max(1, it.height)
      const bot = y + h
      const k = Math.max(
        0,
        continuous
          ? Math.floor((y - mTop) / step)
          : Math.floor(y / step),
      )
      const bandStart = continuous ? mTop + k * step : k * step + mTop
      const bandEnd = bandStart + contentH

      if (y + 0.5 < bandStart) {
        const dy = Math.ceil((bandStart - y) / grid) * grid
        if (dy > 0) {
          for (const r of rows) {
            if (!r.hidden && r.y + 0.5 >= y) r.y = Math.round(r.y + dy)
          }
          moved = true
          break
        }
      }

      if (bot > bandEnd + 0.5) {
        if (h > contentH + 0.5) continue
        const nextStart = continuous
          ? bandStart + step
          : (k + 1) * step + mTop
        const dy = Math.ceil((nextStart - y) / grid) * grid
        if (dy > 0) {
          for (const r of rows) {
            if (!r.hidden && r.y + 0.5 >= y) r.y = Math.round(r.y + dy)
          }
          moved = true
          break
        }
      }

      if (y + 0.5 >= bandEnd) {
        const nextStart = continuous
          ? bandStart + step
          : (k + 1) * step + mTop
        const dy = Math.ceil((nextStart - y) / grid) * grid
        if (dy > 0) {
          for (const r of rows) {
            if (!r.hidden && r.y + 0.5 >= y) r.y = Math.round(r.y + dy)
          }
          moved = true
          break
        }
      }
    }
    if (!moved) break
  }
  return rows
}

/**
 * Map continuous content-flow Y (no gutters) onto the real multipage board
 * (pages of `pageHeight` with content bands of `contentHeight` + margins).
 *
 * continuous: y = marginTop + offset
 * board:      y = pageIndex * pageHeight + marginTop + (offset % contentHeight)
 */
export function insertPageGutters(
  items: CanvasItem[],
  opts: {
    pageHeight: number
    marginTop: number
    contentHeight: number
  },
): CanvasItem[] {
  if (items.length === 0) return items
  const pH = Math.max(1, opts.pageHeight)
  const mTop = Math.max(0, opts.marginTop)
  const cH = Math.max(1, opts.contentHeight)
  if (pH <= cH + 0.5) {
    return items
  }
  return items.map((it) => {
    if (it.hidden) return it
    const offset = it.y - mTop
    if (offset < -0.5) return it
    const page = Math.max(0, Math.floor(offset / cH))
    const within = offset - page * cH
    return {
      ...it,
      y: Math.round(page * pH + mTop + within),
    }
  })
}

/**
 * Ensure each leaf (deepest) folder group has a clear title band above its
 * cards so L2 chips never paint over card content or other panels.
 *
 * Processes groups top→bottom; shifts a group down when its title strip
 * collides with any other card.
 */
export function ensureLeafTitleClearance(
  items: CanvasItem[],
  folders: FolderRef[],
  leafLevel: PanelGroupLevel,
  titlePx: number,
  grid = ORGANIZE_GRID,
): CanvasItem[] {
  const band = Math.max(20, titlePx)
  const g = Math.max(1, grid)
  const cards = items.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length === 0) return items

  const map = new Map<string, string[]>()
  for (const c of cards) {
    const key =
      folderAtGroupLevel(c.folderId, folders, leafLevel) ??
      c.folderId ??
      c.id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c.id)
  }

  const byId = new Map(items.map((i) => [i.id, { ...i }]))

  const groupMeta = () => {
    const list: Array<{
      key: string
      ids: string[]
      minY: number
      minX: number
      maxX: number
    }> = []
    for (const [key, ids] of map) {
      const members = ids.map((id) => byId.get(id)!).filter(Boolean)
      if (members.length === 0) continue
      list.push({
        key,
        ids,
        minY: Math.min(...members.map((m) => m.y)),
        minX: Math.min(...members.map((m) => m.x)),
        maxX: Math.max(...members.map((m) => m.x + m.width)),
      })
    }
    list.sort((a, b) => a.minY - b.minY || a.minX - b.minX)
    return list
  }

  // Multiple passes: shifting one group can free/block another strip
  for (let pass = 0; pass < 8; pass++) {
    let moved = false
    for (const gr of groupMeta()) {
      const idSet = new Set(gr.ids)
      const stripTop = gr.minY - band
      const stripBot = gr.minY
      let needMinY = gr.minY

      for (const o of byId.values()) {
        if (o.hidden || isHeadingCard(o) || !o.folderId) continue
        if (idSet.has(o.id)) continue
        // Horizontal overlap with this group's title strip
        if (o.x + o.width <= gr.minX + 1 || o.x >= gr.maxX - 1) continue
        // Foreign card intersects title strip → push our cards below it
        if (o.y < stripBot && o.y + o.height > stripTop) {
          needMinY = Math.max(
            needMinY,
            Math.ceil((o.y + o.height + band) / g) * g,
          )
        }
      }

      const dy = needMinY - gr.minY
      if (dy > 0.5) {
        for (const id of gr.ids) {
          const it = byId.get(id)
          if (it) it.y = Math.round(it.y + dy)
        }
        moved = true
      }
    }
    if (!moved) break
  }

  return items.map((it) => byId.get(it.id) ?? it)
}

/**
 * After packing, densify cards within each folder group (prefer leaf level)
 * so voids close without merging different L2 subsections together.
 */
export function densifyPlacedGroups(
  items: CanvasItem[],
  folders: FolderRef[],
  outerLevel: PanelGroupLevel,
  opts: {
    grid?: number
    contentLeft: number
    contentTop: number
    pageCols: number
    gapCells?: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const gap = Math.max(0, opts.gapCells ?? 0)
  const cards = items.filter((i) => !i.hidden && !isHeadingCard(i) && i.folderId)
  if (cards.length < 2) return items

  const groups = new Map<string, CanvasItem[]>()
  for (const c of cards) {
    const key =
      folderAtGroupLevel(c.folderId, folders, outerLevel) ?? c.folderId ?? c.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  // Peer AABBs (other L1 groups) — densify must not invade them
  const peerBoxes: Array<{
    x0: number
    y0: number
    x1: number
    y1: number
    key: string
  }> = []
  for (const [key, members] of groups) {
    peerBoxes.push({
      key,
      x0: Math.min(...members.map((m) => m.x)),
      y0: Math.min(...members.map((m) => m.y)),
      x1: Math.max(...members.map((m) => m.x + m.width)),
      y1: Math.max(...members.map((m) => m.y + m.height)),
    })
  }

  const moved = new Map<string, { x: number; y: number }>()
  for (const [key, members] of groups) {
    if (members.length < 2) continue
    const minX = Math.min(...members.map((m) => m.x))
    const minY = Math.min(...members.map((m) => m.y))
    const maxX = Math.max(...members.map((m) => m.x + m.width))
    const maxY = Math.max(...members.map((m) => m.y + m.height))
    const spanCw = Math.max(1, Math.ceil((maxX - minX) / grid))
    const spanCh = Math.max(1, Math.ceil((maxY - minY) / grid))
    const oldArea = spanCw * spanCh
    const maxCardW = Math.max(1, ...members.map((m) => Math.round(m.width / grid)))

    // Try several widths: tight, current span, slightly wider (fill residual)
    const candidates = Array.from(
      new Set(
        [
          spanCw,
          Math.min(opts.pageCols, Math.max(maxCardW, Math.ceil(spanCw * 0.85))),
          Math.min(opts.pageCols, spanCw + 2),
          Math.min(
            opts.pageCols,
            Math.max(maxCardW, Math.ceil(Math.sqrt(
              members.reduce(
                (s, m) =>
                  s +
                  Math.max(1, Math.round(m.width / grid)) *
                    Math.max(1, Math.round(m.height / grid)),
                0,
              ) * 1.15,
            ))),
          ),
        ].map((w) => Math.max(maxCardW, Math.min(opts.pageCols, w))),
      ),
    )

    let best: {
      next: Array<{ id: string; x: number; y: number }>
      area: number
      ch: number
    } | null = null

    for (const packCols of candidates) {
      const regions = members.map((m, i) => ({
        index: i,
        cw: Math.min(packCols, Math.max(1, Math.round(m.width / grid))),
        ch: Math.max(1, Math.round(m.height / grid)),
      }))
      const pos = placeTopicRegionsDense(regions, packCols, gap, {
        sortByHeight: true,
        readingFlow: false,
      })
      let usedCh = 0
      let usedCw = 0
      const next: Array<{ id: string; x: number; y: number; w: number; h: number }> =
        []
      for (let i = 0; i < members.length; i++) {
        const m = members[i]!
        const p = pos.get(i) ?? { c: 0, r: 0 }
        const r = regions[i]!
        usedCw = Math.max(usedCw, p.c + r.cw)
        usedCh = Math.max(usedCh, p.r + r.ch)
        next.push({
          id: m.id,
          x: Math.round(minX + p.c * grid),
          y: Math.round(minY + p.r * grid),
          w: m.width,
          h: m.height,
        })
      }
      const area = usedCw * usedCh
      // Reject taller than original unless area much smaller
      if (usedCh > spanCh + 1) continue
      // Peer collision check
      let hitsPeer = false
      for (const n of next) {
        const nx1 = n.x + n.w
        const ny1 = n.y + n.h
        for (const peer of peerBoxes) {
          if (peer.key === key) continue
          if (
            n.x < peer.x1 - 1 &&
            nx1 > peer.x0 + 1 &&
            n.y < peer.y1 - 1 &&
            ny1 > peer.y0 + 1
          ) {
            hitsPeer = true
            break
          }
        }
        if (hitsPeer) break
      }
      if (hitsPeer) continue
      if (
        !best ||
        area < best.area ||
        (area === best.area && usedCh < best.ch)
      ) {
        best = {
          next: next.map(({ id, x, y }) => ({ id, x, y })),
          area,
          ch: usedCh,
        }
      }
    }

    if (best && best.area < oldArea * 0.98) {
      for (const n of best.next) moved.set(n.id, { x: n.x, y: n.y })
    } else if (best && best.ch < spanCh) {
      // Same-ish area but shorter stack (less vertical void)
      for (const n of best.next) moved.set(n.id, { x: n.x, y: n.y })
    }
  }

  if (moved.size === 0) return items
  return items.map((it) => {
    const n = moved.get(it.id)
    return n ? { ...it, x: n.x, y: n.y } : it
  })
}

/**
 * Pack cards for print cheatsheets using a **grid-cell area** model:
 *
 * 1. Group by folder / heading (topics / categories)
 * 2. Ideal size per card → area in grid cells (unit area)
 * 3. Global scale so total area fits multipage budget (readable floor)
 * 4. Each topic packs into a **natural tight block** (not forced columns/rows)
 * 5. Topic outer boxes (pad + title) placed with maxrects — **no panel overlap**
 * 6. Cards sit inside their topic slot; panels = exact outer slots
 */
export function packCheatsheetLayout(
  items: CanvasItem[],
  canvas: SheetCanvas,
  options: CheatsheetLayoutOptions = {},
): {
  items: CanvasItem[]
  printPageCount: number
  /** Group frames when groupChrome includes panels. */
  layoutPanels: LayoutPanel[]
} {
  if (items.length === 0) {
    return {
      items,
      printPageCount: Math.max(1, canvas.printPageCount ?? 1),
      layoutPanels: [],
    }
  }

  const density = options.density ?? 'sm'
  const preset = DENSITY_PRESETS[density]
  // Always readable — density changes *size of cards*, not illegible microtype
  const titleFont = Math.max(9, preset.titleFontSize)
  const bodyFont = Math.max(12, preset.fontSize)
  const grid = Math.max(4, canvas.gridSpacing ?? ORGANIZE_GRID)
  // UI “Gap”: free-flow air between topic groups (and between panel *outers*).
  const gapPx = Math.max(
    0,
    options.gap ??
      (density === 'xs' ? 6 : density === 'sm' ? 8 : density === 'md' ? 12 : 16),
  )
  const fitPrint = options.fitPrint !== false
  const multiPage = options.multiPage !== false
  const groupByFolder = options.groupByFolder !== false
  const groupChrome: GroupChrome = options.groupChrome ?? 'labels'
  const useLabels = groupChrome === 'labels' || groupChrome === 'both'
  const usePanels = groupChrome === 'panels' || groupChrome === 'both'
  // UI “Panel gap”: chrome pad (cards → stroke). Not a second free-flow gap.
  const panelPad = Math.max(0, Math.min(48, options.panelPadding ?? 8))
  const panelShape: PanelShape = options.panelShape ?? 'rect'
  /** N-gon = solid L chrome + exterior outline; rect = AABB frames */
  const usePolyomino = usePanels && panelShape === 'polygon'
  const groupSort: GroupSortOrder = options.groupSort ?? 'none'
  // Multi-select hierarchy: pack at deepest level; draw nested chrome for each
  const panelGroupLevels = normalizePanelGroupLevels(
    options.panelGroupLevels,
    options.panelGroupLevel,
  )
  const panelGroupLevel =
    panelGroupLevels[panelGroupLevels.length - 1] ?? (1 as PanelGroupLevel)
  // Reserve a title band so panel headers are not covered by cards
  const PANEL_TITLE_BAND_PX = usePanels ? 16 : 0
  // Multi-level hierarchy (L1+L2…): leaf title chips + exclusive L1 header
  const multiLevelHierarchy =
    usePanels &&
    panelGroupLevels.length > 1 &&
    (options.folders?.length ?? 0) > 0
  const dissolvePrintArea = options.dissolvePrintArea === true
  // Max pack space: single-page content box, or dissolved continuous multipage band
  const box = getPackContentBox(canvas, { dissolvePrintArea })

  const visible = items.filter((i) => !i.hidden)
  // Min outer card size from fonts (readable KaTeX/title) — density cannot go below this
  const minCard = minCardForFonts(bodyFont, titleFont)
  const minSnap = snapSizeToGrid(minCard.w, minCard.h, grid, box.width, box.height)

  const pageCols = Math.max(1, Math.floor(box.width / grid))
  const pageRows = Math.max(1, Math.floor(box.height / grid))
  const pageCells = pageCols * pageRows

  // Density: xs 0.8 → lg 1.4 on content-native ideals (clear size ladder)
  const dScale = preset.sizeScale

  // ── 1) Ideal pixel sizes → grid cells ───────────────────────────────────
  type IdealRow = {
    id: string
    item: CanvasItem
    cw: number
    ch: number
    minCw: number
    minCh: number
  }
  const ideals: IdealRow[] = visible.map((it) => {
    const ideal = estimateIdealBlockSize(it, box.width, titleFont)
    const proc = isProcessItem(it)
    const scale = proc ? preset.processSizeScale : dScale
    // Grow/shrink from ideal, but never below readable min box for this density
    const w = Math.max(minCard.w, Math.round(ideal.w * scale))
    const h = Math.max(
      isHeadingCard(it) ? Math.max(22, titleBandPx(titleFont) + 4) : minCard.h,
      Math.round(ideal.h * scale),
    )
    const snapped = snapSizeToGrid(
      Math.min(box.width, w),
      Math.min(box.height, h),
      grid,
      box.width,
      box.height,
    )
    const isHead = isHeadingCard(it)
    return {
      id: it.id,
      item: it,
      cw: Math.max(isHead ? 1 : minSnap.cw, snapped.cw),
      ch: Math.max(isHead ? 1 : minSnap.ch, snapped.ch),
      minCw: isHead
        ? Math.min(pageCols, Math.max(3, Math.ceil(100 / grid)))
        : minSnap.cw,
      minCh: isHead ? 1 : minSnap.ch,
    }
  })
  const idealById = new Map(ideals.map((r) => [r.id, r]))

  // Temporary items for section split (need isHeadingCard on CanvasItem shape)
  const forSplit: CanvasItem[] = ideals.map((r) => ({
    ...r.item,
    width: r.cw * grid,
    height: r.ch * grid,
  }))
  const rawSections = splitCheatSections(forSplit, {
    groupByFolder,
    folders: options.folders,
    groupSort,
    panelGroupLevel,
  })

  // ── 2) Per-topic ideal cell areas + shares ──────────────────────────────
  const headingChIdeal = Math.max(1, Math.ceil((titleBandPx(titleFont) + 6) / grid))
  let totalBodyCells = 0
  const sectionMeta: Array<{
    index: number
    heading?: CanvasItem
    body: IdealRow[]
    idealCells: number
    headingCh: number
    groupFolderId: string | null
  }> = []

  rawSections.forEach((sec, index) => {
    const heading = sec.find(isHeadingCard)
    const bodyItems = sec.filter((i) => !isHeadingCard(i))
    const body = bodyItems
      .map((i) => idealById.get(i.id))
      .filter((x): x is IdealRow => Boolean(x))
    const bodyCells = body.reduce((s, b) => s + b.cw * b.ch, 0)
    const hCh = heading ? headingChIdeal : 0
    // Heading costs full-width strip for area budgeting
    const headingCells = heading ? pageCols * hCh : 0
    const idealCells = bodyCells + headingCells
    totalBodyCells += idealCells
    const rawFolder =
      bodyItems.find((b) => b.folderId)?.folderId ??
      heading?.folderId ??
      null
    const groupFolderId = folderAtGroupLevel(
      rawFolder,
      options.folders ?? [],
      panelGroupLevel,
    )
    sectionMeta.push({
      index,
      heading,
      body,
      idealCells: Math.max(1, idealCells),
      headingCh: hCh,
      groupFolderId,
    })
  })
  if (totalBodyCells < 1) totalBodyCells = 1

  // ── 3) Pages + global area scale ────────────────────────────────────────
  // Prefer **more pages** over crushing cards. Old minScale 0.52 made “Small”
  // exports unreadable (KaTeX clipped in micro cards).
  const minScale = multiPage
    ? 0.94 // almost never shrink multipage packs
    : density === 'xs'
      ? 0.82
      : density === 'sm'
        ? 0.88
        : density === 'md'
          ? 0.92
          : 0.95
  let pages = multiPage
    ? pagesForIdealCells(
        totalBodyCells,
        pageCells,
        GRID_PACK_FILL_TARGET,
        minScale,
        20,
      )
    : 1
  if (!multiPage) pages = 1

  let areaScale = computeGridAreaScale(
    totalBodyCells,
    pageCells,
    pages,
    GRID_PACK_FILL_TARGET,
    minScale,
  )
  if (multiPage) {
    while (
      pages < 20 &&
      totalBodyCells * areaScale * areaScale >
        pages * pageCells * GRID_PACK_FILL_TARGET * 1.02
    ) {
      pages++
      areaScale = computeGridAreaScale(
        totalBodyCells,
        pageCells,
        pages,
        GRID_PACK_FILL_TARGET,
        minScale,
      )
    }
    // Hard floor: never squash multipage content below this
    areaScale = Math.max(0.94, areaScale)
  }

  // ── 4) Scale body cells; natural tight topic blocks (no forced columns) ─
  // Placement uses content size only — panel pad is visual, not slot inflation.
  const plans: TopicSectionPlan[] = sectionMeta.map((meta) => {
    const rawRects: CellRect[] = meta.body.map((b) => ({
      id: b.id,
      cw: b.cw,
      ch: b.ch,
    }))
    const scaled = scaleCellRects(
      rawRects,
      areaScale,
      pageCols,
      Math.max(1, minSnap.cw),
      Math.max(1, minSnap.ch),
    )
    const bodyRects = scaled.map((r) => {
      const src = meta.body.find((b) => b.id === r.id)!
      return {
        id: r.id,
        cw: Math.max(src.minCw, Math.min(pageCols, r.cw)),
        ch: Math.max(src.minCh, r.ch),
      }
    })

    const natural = naturalTopicPack(bodyRects, pageCols)
    const placeHeadingCh = useLabels && meta.heading ? meta.headingCh : 0
    // Reserve cells so panel title chips (esp. L2) are not covered by cards.
    // Multi-level needs ~22–24px for an L2 chip above each leaf cluster.
    const leafTitlePx = multiLevelHierarchy
      ? Math.max(PANEL_TITLE_BAND_PX, 22)
      : PANEL_TITLE_BAND_PX
    const panelTitleCh =
      usePanels && (meta.heading || meta.body.length)
        ? Math.max(1, Math.ceil(leafTitlePx / grid))
        : 0

    // Dense natural shelf for all shapes (n-gon chrome fills holes — no donut
    // free-rect packing that left large gutters and hollow interiors).
    const contentCw = Math.max(1, natural.contentCw)
    const contentCh = Math.max(1, natural.contentCh)
    const regionCw = Math.min(pageCols, contentCw)
    const regionCh = Math.max(1, placeHeadingCh + panelTitleCh + contentCh)

    return {
      index: meta.index,
      heading: meta.heading,
      body: meta.body.map((b) => b.item),
      groupFolderId: meta.groupFolderId,
      idealCells: meta.idealCells,
      areaShare: meta.idealCells / totalBodyCells,
      regionCw,
      regionCh,
      contentCw,
      contentCh,
      padCells: 0,
      bodyRects: natural.rects,
      bodyPos: natural.pos,
      headingCh: placeHeadingCh,
      panelTitleCh,
    }
  })

  // ── 5–6) Place cards: continuous topic blocks, free-flow only ──────────
  // Always maxrects + gravity (never row/column shelf). groupSort only
  // reorders the *input list*; height-first densifies when sort is none.
  // panelPad (px) → inter-panel gap in grid cells (0 when pad < half cell).
  const placed: CanvasItem[] = []
  let z = 1
  const styleBase = {
    fontSize: Math.max(12, Math.round(bodyFont * Math.sqrt(Math.max(0.9, areaScale)))),
    titleFontSize: Math.max(
      9,
      Math.round(titleFont * Math.sqrt(Math.max(0.9, areaScale))),
    ),
  }

  const nameOrdered = groupSort === 'name-asc' || groupSort === 'name-desc'
  const shallowLevel = panelGroupLevels[0] ?? 1
  const deepLevel =
    panelGroupLevels[panelGroupLevels.length - 1] ?? shallowLevel
  // Nested levels (e.g. L1+L2): pack leaf groups inside each outer parent
  // first, then free-flow parents — prevents L1 frames stacking across the page.
  const useHierarchicalPlace =
    usePanels && deepLevel > shallowLevel && (options.folders?.length ?? 0) > 0

  // ── Gap + panel pad together (one free-flow clearance formula) ─────────
  // gap          → air between panel *outer* edges (or topic boxes if no panels)
  // panelPadding → chrome pad (card edge → panel stroke) only
  // Content free-flow gap = gap + 2×pad so outer strokes end up ~gap apart.
  //
  // Bug: counting n-gon as a full grid cell (24px) when pad=4 made
  // clearance ~72px while the UI said 4+4. Use real pad px for gap math.
  // Nest inset scales with pad (not a hard 16px floor).
  // Nest inset: air between L1 stroke and content
  const nestInsetPx = useHierarchicalPlace
    ? Math.max(4, Math.min(panelPad, 8))
    : 0
  const leafChromePx = usePanels ? panelPad : 0
  const outerChromePx = usePanels ? panelPad + nestInsetPx : 0
  // Exclusive L1 header + room so L2 chips sit under L1 label (not on it)
  const outerTitleReservePx = useHierarchicalPlace ? 44 : 0

  /** Map px → grid cells; allow 0 when clearance is sub-cell. */
  const pxToCells = (px: number) => {
    if (px <= 0) return 0
    return Math.max(1, Math.ceil(px / grid))
  }

  // Leaf gap: prefer tight tiling so residual columns get filled.
  // Hierarchical: nearly-zero leaf gap (pad is visual chrome, not free-flow air).
  // Single-level: keep gap + 2×pad so stroked frames don't collide.
  const leafGapCells = useHierarchicalPlace
    ? 0
    : usePanels
      ? pxToCells(gapPx + leafChromePx * 2)
      : pxToCells(gapPx)
  // Nested multi-level: L1 outers touch (gap 0) so adjacent L1 frames can
  // merge into one homogeneous exterior outline. Single-level keeps free-flow gap.
  const outerGapCells = useHierarchicalPlace
    ? 0
    : usePanels
      ? pxToCells(gapPx + outerChromePx * 2)
      : pxToCells(gapPx)

  const placeOpts = {
    sortByHeight: !nameOrdered,
    readingFlow: nameOrdered,
  }
  const regionPos = useHierarchicalPlace
    ? placePlansHierarchical(
        plans.map((p) => ({
          index: p.index,
          cw: p.regionCw,
          ch: p.regionCh,
          leafFolderId:
            p.groupFolderId ??
            p.body.find((b) => b.folderId)?.folderId ??
            p.heading?.folderId ??
            null,
        })),
        options.folders ?? [],
        shallowLevel,
        pageCols,
        leafGapCells,
        {
          ...placeOpts,
          // L1 exclusive title row above L2 content / title chips
          outerTitleCells: Math.max(2, Math.ceil(outerTitleReservePx / grid)),
          outerGapCells,
          // Inside outer box: inset leaves so L2 chips sit below L1 stroke
          nestInsetCells: Math.max(1, Math.ceil(nestInsetPx / grid)),
        },
      )
    : placeTopicRegionsDense(
        plans.map((p) => ({
          index: p.index,
          cw: p.regionCw,
          ch: p.regionCh,
        })),
        pageCols,
        outerGapCells,
        placeOpts,
      )

  for (const plan of plans) {
    const origin = regionPos.get(plan.index) ?? { c: 0, r: 0 }
    let localR = 0

    // N-gon / panels-only: hide section banners (panel title chip is enough)
    if (usePolyomino && useLabels && plan.heading) {
      placed.push({
        ...plan.heading,
        hidden: true,
        autoFit: false,
      })
    } else if (useLabels && plan.heading && plan.headingCh > 0) {
      const hCh = Math.max(1, plan.headingCh)
      const isProc = isProcessItem(plan.heading)
      const isFig =
        Boolean(plan.heading.imageUrl) || plan.heading.type === 'figure'
      const bannerW = Math.max(1, plan.contentCw) * grid
      placed.push({
        ...plan.heading,
        hidden: false,
        x: Math.round(box.left + origin.c * grid),
        y: Math.round(box.top + (origin.r + localR) * grid),
        width: Math.round(Math.min(box.width, bannerW)),
        height: Math.round(hCh * grid),
        zIndex: z++,
        style: { ...plan.heading.style, ...styleBase },
        autoFit: false,
        contentFill: isProc || isFig,
      })
      localR += hCh
    }

    if (plan.panelTitleCh > 0) {
      localR += plan.panelTitleCh
    }

    if (plan.bodyRects.length === 0) continue

    for (const it of plan.body) {
      const rect = plan.bodyRects.find((r) => r.id === it.id)
      const p = plan.bodyPos.get(it.id) ?? { c: 0, r: 0 }
      if (!rect) continue
      const isProc = isProcessItem(it)
      const isFig = Boolean(it.imageUrl) || it.type === 'figure'
      // Quieter card chrome when panels are on — outer perimeter carries structure
      const quietBorder = usePanels
        ? { borderEnabled: false as const, borderWidth: 0, border: 'none' }
        : {}
      placed.push({
        ...it,
        hidden: false,
        x: Math.round(box.left + (origin.c + p.c) * grid),
        y: Math.round(box.top + (origin.r + localR + p.r) * grid),
        width: Math.round(rect.cw * grid),
        height: Math.round(rect.ch * grid),
        zIndex: z++,
        style: { ...it.style, ...styleBase, ...quietBorder },
        autoFit: false,
        contentFill: isProc || isFig,
      })
    }
  }

  let result = placed

  // Single-page fit-print: final uniform shrink if still past content box
  const maxBottom = result.reduce(
    (m, it) => Math.max(m, it.y + it.height),
    box.top,
  )
  const contentBottom = box.top + box.height
  if (fitPrint && !multiPage && maxBottom > contentBottom + 4) {
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
          width: Math.max(isHead ? 80 : minSz.w, Math.round(it.width * shrink)),
          height: Math.max(isHead ? 20 : minSz.h, Math.round(it.height * shrink)),
          style: {
            ...it.style,
            fontSize: Math.max(
              MIN_READABLE_BODY_FONT,
              Math.round((it.style?.fontSize ?? bodyFont) * Math.sqrt(shrink)),
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
  }

  const bottomFinal = result.reduce(
    (m, it) => Math.max(m, it.y + it.height),
    box.top,
  )
  const pageStep = Math.max(1, box.pageHeight)
  let pageCount = multiPage
    ? Math.min(20, Math.max(1, Math.ceil(bottomFinal / pageStep)))
    : 1
  // Prefer planned page count when continuous y is a bit short of last page
  if (multiPage) {
    pageCount = Math.min(20, Math.max(pageCount, pages))
  }

  // Snap positions to grid and clamp into the printable content box
  // (dissolve grows height only — never past left/right margins).
  const contentRight = box.left + box.width
  result = result.map((it) => {
    const snapped = snapSizeToGrid(
      it.width,
      it.height,
      grid,
      box.width,
      box.height,
    )
    let w = Math.max(grid, Math.min(box.width, snapped.w))
    let h = Math.max(grid, snapped.h)
    let x = snapToGridValue(it.x, grid, box.left)
    let y = snapToGridValue(it.y, grid, box.top)
    if (x < box.left) x = box.left
    if (x + w > contentRight) {
      x = Math.max(box.left, contentRight - w)
      x = snapToGridValue(x, grid, box.left)
      if (x + w > contentRight) {
        w = Math.max(grid, contentRight - x)
      }
    }
    return {
      ...it,
      x,
      y,
      width: w,
      height: h,
    }
  })

  // Overlap guard: if any two cards share the same origin, nudge (should be rare)
  const seen = new Set<string>()
  result = result.map((it) => {
    let key = `${it.x},${it.y}`
    if (!seen.has(key)) {
      seen.add(key)
      return it
    }
    let y = it.y + grid
    key = `${it.x},${y}`
    let guard = 0
    while (seen.has(key) && guard < 200) {
      y += grid
      key = `${it.x},${y}`
      guard++
    }
    seen.add(key)
    return { ...it, y }
  })

  // Close voids **per leaf group** (not whole L1) so L2 subsections stay
  // separate and keep room for their title chips.
  if (
    usePanels &&
    (options.folders?.length ?? 0) > 0 &&
    panelGroupLevels.length >= 1
  ) {
    result = densifyPlacedGroups(result, options.folders ?? [], deepLevel, {
      grid,
      contentLeft: box.left,
      contentTop: box.top,
      pageCols,
      gapCells: useHierarchicalPlace ? 0 : Math.min(1, leafGapCells),
    })
  }

  // Clear a title band above each leaf group so L2 chips never cover cards
  if (usePanels && multiLevelHierarchy) {
    const leafTitleClearPx = Math.max(PANEL_TITLE_BAND_PX, 22)
    result = ensureLeafTitleClearance(
      result,
      options.folders ?? [],
      deepLevel,
      leafTitleClearPx,
      grid,
    )
  }

  // Multipage seams:
  // - Dissolved: one continuous pack band (no inter-page gutters) — max space.
  // - Normal: continuous bands → insert gutters → board cleanup.
  if (multiPage && box.dissolved) {
    // Content already packs into dissolved height; only keep items in band
    result = resolveMultipageStraddles(result, {
      pageHeight: box.height,
      marginTop: box.top,
      contentHeight: box.height,
      grid,
      mode: 'continuous',
    })
  } else if (multiPage) {
    result = resolveMultipageStraddles(result, {
      pageHeight: box.height,
      marginTop: box.top,
      contentHeight: box.height,
      grid,
      mode: 'continuous',
    })
    result = insertPageGutters(result, {
      pageHeight: box.pageHeight,
      marginTop: box.margins.top,
      contentHeight: box.height,
    })
    result = resolveMultipageStraddles(result, {
      pageHeight: box.pageHeight,
      marginTop: box.margins.top,
      contentHeight: box.height,
      grid,
      mode: 'board',
    })
  }

  const byId = new Map(result.map((p) => [p.id, p]))
  const headingIds = new Set(
    plans.map((p) => p.heading?.id).filter((id): id is string => Boolean(id)),
  )
  const folderName = new Map(
    (options.folders ?? []).map((f) => [f.id, f.name ?? f.id]),
  )

  const merged = items.map((old) => {
    // Panels-only / none: hide heading banner cards (chrome is panels or absent)
    if (
      !useLabels &&
      headingIds.has(old.id) &&
      isHeadingCard(old)
    ) {
      return { ...old, hidden: true, autoFit: false }
    }
    if (old.hidden && !byId.has(old.id)) return old
    const n = byId.get(old.id)
    if (!n) return { ...old, autoFit: false }
    return {
      ...n,
      contentFitKey: old.contentFitKey,
    }
  })

  // ── 7) Layout panels — nested hierarchy + rect AABB or n-gon card runs ─
  let layoutPanels: LayoutPanel[] = []
  if (usePanels) {
    const folders = options.folders ?? []
    // Prefer hierarchy builder (supports multi-select nested L1⊃L2⊃L3)
    layoutPanels = buildNestedHierarchyPanels({
      placed: result,
      folders,
      levels: panelGroupLevels,
      panelPad,
      panelShape: usePolyomino ? 'polygon' : 'rect',
      folderName,
      titleBandPx: PANEL_TITLE_BAND_PX,
      grid,
    })
    // Fallback when no folderIds on cards (heading-only splits)
    if (layoutPanels.length === 0) {
      layoutPanels = buildLayoutPanelsFromMembers({
        plans,
        placed: result,
        panelPad,
        panelShape: usePolyomino ? 'polygon' : 'rect',
        folderName,
        useLabels,
        titleBandPx: PANEL_TITLE_BAND_PX,
        grid,
      })
    }
    // Adjacent outermost (L1) panels merge strokes → one consecutive outline
    if (layoutPanels.length > 1) {
      layoutPanels = mergeAdjacentOutermostPanels(layoutPanels, {
        grid,
        panelPad,
      })
    }
  }

  const bottom2 = merged.reduce(
    (m, it) => (it.hidden ? m : Math.max(m, it.y + it.height)),
    box.top,
  )
  if (multiPage) {
    // Dissolved pack is continuous; page frames still tile by pageHeight
    pageCount = Math.min(
      20,
      Math.max(1, Math.ceil((bottom2 - box.top + box.margins.top) / pageStep)),
    )
  }

  return { items: merged, printPageCount: pageCount, layoutPanels }
}

export type Point2 = { x: number; y: number }

/**
 * Monotone-chain convex hull (CCW). Returns vertices without repeating first.
 */
export function convexHull(points: Point2[]): Point2[] {
  if (points.length <= 1) return points.slice()
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Point2, a: Point2, b: Point2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: Point2[] = []
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: Point2[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** Expand each rect by pad, then take all corners. */
export function expandedRectCorners(
  rects: Array<{ x: number; y: number; width: number; height: number }>,
  pad: number,
): Point2[] {
  const p = Math.max(0, pad)
  const pts: Point2[] = []
  for (const r of rects) {
    const x0 = r.x - p
    const y0 = r.y - p
    const x1 = r.x + r.width + p
    const y1 = r.y + r.height + p
    pts.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 })
  }
  return pts
}

/**
 * Panel chrome from continuous n-gon cells (solid rect ± one simple L-annex).
 * Orthogonal runs follow claimed cells only — never a free-grid interleave AABB.
 */
export function buildLayoutPanelsFromPolyomino(args: {
  plans: TopicSectionPlan[]
  topicCells: Map<
    number,
    Array<{ c: number; r: number; cw: number; ch: number }>
  >
  grid: number
  boxLeft: number
  boxTop: number
  panelPad: number
  folderName: Map<string, string>
  titleBandPx?: number
}): LayoutPanel[] {
  const {
    plans,
    topicCells,
    grid,
    boxLeft,
    boxTop,
    panelPad,
    folderName,
    titleBandPx = 0,
  } = args
  const panels: LayoutPanel[] = []
  // Pixel pad only — free-grid already leaves ≥1 cell between cards so small
  // pad cannot bleed into a neighboring topic’s footprint.
  const pad = Math.min(Math.max(0, panelPad), Math.max(0, Math.floor(grid / 2) - 2))
  const band = Math.max(0, titleBandPx)

  for (const plan of plans) {
    const cells = topicCells.get(plan.index) ?? []
    if (cells.length === 0 && plan.body.length === 0) continue

    const folderId =
      plan.body.find((b) => b.folderId)?.folderId ??
      plan.heading?.folderId ??
      null
    const title =
      (plan.heading?.title && plan.heading.title.trim()) ||
      (folderId ? folderName.get(folderId) : undefined) ||
      plan.body[0]?.title ||
      `Group ${plan.index + 1}`

    const accent = LAYOUT_PANEL_ACCENTS[plan.index % LAYOUT_PANEL_ACCENTS.length]
    const id = `panel-${plan.index}-${folderId ?? plan.heading?.id ?? plan.body[0]?.id ?? plan.index}`

    const rawRuns = cellsToOrthogonalRuns(cells, grid, boxLeft, boxTop, 0)
    if (rawRuns.length === 0) continue

    const memberIds = plan.body.map((b) => b.id)
    if (memberIds.length === 0) continue

    // Pad each run; lift only the topmost run(s) for the title strip so the
    // title chip sits on this topic’s cells, not the empty hole of the AABB.
    let minRunY = Math.min(...rawRuns.map((r) => r.y))
    const runs = rawRuns.map((r) => {
      const isTop = Math.abs(r.y - minRunY) < 0.5
      const y0 = r.y - pad - (isTop ? band : 0)
      return {
        x: Math.round(r.x - pad),
        y: Math.round(y0),
        width: Math.max(8, Math.round(r.width + pad * 2)),
        height: Math.max(8, Math.round(r.height + pad * 2 + (isTop ? band : 0))),
      }
    })

    const minX = Math.min(...runs.map((r) => r.x))
    const minY = Math.min(...runs.map((r) => r.y))
    const maxX = Math.max(...runs.map((r) => r.x + r.width))
    const maxY = Math.max(...runs.map((r) => r.y + r.height))

    panels.push({
      id,
      folderId,
      title,
      showTitle: true,
      contentSort: 'none',
      memberIds,
      // AABB is only for page clip / selection meta — drawn chrome is `runs`
      // (L-shape). Title chips must use topmost-leftmost run in the UI layer.
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.max(8, Math.round(maxX - minX)),
      height: Math.max(8, Math.round(maxY - minY)),
      shape: 'polygon',
      runs,
      accent,
      zIndex: 0,
    })
  }
  return panels
}

/**
 * True if any run of panel A overlaps any run of panel B (strict interior).
 * Prefer this over AABB checks for polygon panels.
 */
export function panelRunsOverlap(
  a: {
    x: number
    y: number
    width: number
    height: number
    runs?: Array<{ x: number; y: number; width: number; height: number }>
  },
  b: {
    x: number
    y: number
    width: number
    height: number
    runs?: Array<{ x: number; y: number; width: number; height: number }>
  },
  eps = 0.5,
): boolean {
  const runsA =
    a.runs && a.runs.length > 0
      ? a.runs
      : [{ x: a.x, y: a.y, width: a.width, height: a.height }]
  const runsB =
    b.runs && b.runs.length > 0
      ? b.runs
      : [{ x: b.x, y: b.y, width: b.width, height: b.height }]
  for (const ra of runsA) {
    for (const rb of runsB) {
      if (rectsOverlap(ra, rb, eps)) return true
    }
  }
  return false
}

/**
 * Build panel chrome from **actual member cards** (tight pad).
 * - rect: full AABB (empty corners included)
 * - polygon (n-gon): orthogonal runs of card footprints only (L when last row short)
 */
export function buildLayoutPanelsFromMembers(args: {
  plans: TopicSectionPlan[]
  placed: CanvasItem[]
  panelPad: number
  panelShape: PanelShape
  folderName: Map<string, string>
  useLabels: boolean
  /** Extra space above cards for the title strip (px). */
  titleBandPx?: number
  grid?: number
}): LayoutPanel[] {
  const {
    plans,
    placed,
    panelPad,
    panelShape,
    folderName,
    useLabels,
    titleBandPx = 0,
    grid = ORGANIZE_GRID,
  } = args
  const byId = new Map(placed.map((p) => [p.id, p]))
  const panels: LayoutPanel[] = []
  const pad = Math.max(0, panelPad)
  const titleBand = Math.max(0, titleBandPx)

  plans.forEach((plan, planIdx) => {
    const memberIds = [
      ...(useLabels && plan.heading ? [plan.heading.id] : []),
      ...plan.body.map((b) => b.id),
    ]
    const members = memberIds
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => Boolean(m) && !m.hidden)
    if (members.length === 0) return

    const folderId =
      plan.groupFolderId ??
      plan.body.find((b) => b.folderId)?.folderId ??
      plan.heading?.folderId ??
      null
    const title =
      (folderId ? folderName.get(folderId) : undefined) ||
      (plan.heading?.title && plan.heading.title.trim()) ||
      plan.body[0]?.title ||
      `Group ${plan.index + 1}`

    const accent =
      LAYOUT_PANEL_ACCENTS[planIdx % LAYOUT_PANEL_ACCENTS.length]
    const id = `panel-${plan.index}-${folderId ?? plan.heading?.id ?? plan.body[0]?.id ?? plan.index}`

    const chrome = chromeFromMembers(members, {
      pad,
      titleBand,
      shape: panelShape,
      grid,
    })
    panels.push({
      id,
      folderId,
      title,
      showTitle: true,
      contentSort: 'none',
      memberIds: members.map((m) => m.id),
      ...chrome,
      shape: panelShape === 'polygon' ? 'polygon' : 'rect',
      accent,
      zIndex: 0,
      hierarchyLevel: undefined,
    })
  })

  return panels
}

/**
 * Nested hierarchy panels for multi-selected levels.
 * Cards are already packed at the deepest level; this only draws chrome.
 *
 * Example levels [1,2]: outer box for folder “1.” wrapping all 1.* cards,
 * plus title chips for “1.1”, “1.2”.
 *
 * Stroke policy (homogeneous perimeter):
 * - **Only outermost** level draws a border — always as an **exterior-only**
 *   outline (n-gon path). Internal edges between sibling groups never paint.
 * - Inner levels: title chip only (no stroke, no fill frame).
 */
export function buildNestedHierarchyPanels(args: {
  placed: CanvasItem[]
  folders: FolderRef[]
  levels: PanelGroupLevel[]
  panelPad: number
  panelShape: PanelShape
  folderName: Map<string, string>
  titleBandPx?: number
  grid?: number
}): LayoutPanel[] {
  const {
    placed,
    folders,
    levels,
    panelPad,
    panelShape,
    folderName,
    titleBandPx = 16,
    grid = ORGANIZE_GRID,
  } = args
  const sorted = normalizePanelGroupLevels(levels)
  if (sorted.length === 0) return []

  const cards = placed.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length === 0) return []

  const minL = sorted[0]!
  const multi = sorted.length > 1
  const panels: LayoutPanel[] = []
  let accentIdx = 0

  for (const level of sorted) {
    const isOutermost = level === minL
    // Only outermost level strokes. Inner = title chips only.
    const showStroke = !multi || isOutermost
    const pad = Math.max(
      0,
      showStroke
        ? panelPad + (multi ? Math.max(4, Math.round(panelPad * 0.5)) : 0)
        : 0,
    )
    // L1 exclusive header (~28px multi). L2 chip band (~20px) below L1 label.
    const titleBand = showStroke
      ? Math.max(20, titleBandPx + (multi ? 12 : 0))
      : Math.max(20, titleBandPx + 4)

    const groups = new Map<string, CanvasItem[]>()
    for (const c of cards) {
      const key = folderAtGroupLevel(c.folderId, folders, level)
      if (!key) continue
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(c)
    }

    for (const [folderId, members] of groups) {
      if (members.length === 0) continue

      const title =
        folderName.get(folderId) ||
        folderHierarchyPath(folderId, folders) ||
        folderId
      const accent =
        LAYOUT_PANEL_ACCENTS[accentIdx++ % LAYOUT_PANEL_ACCENTS.length]

      if (!showStroke) {
        // Title chip only — reserve titleBand fully above cards
        const minX = Math.min(...members.map((m) => m.x))
        const minY = Math.min(...members.map((m) => m.y))
        const maxX = Math.max(...members.map((m) => m.x + m.width))
        const maxY = Math.max(...members.map((m) => m.y + m.height))
        panels.push({
          id: `panel-L${level}-${folderId}`,
          folderId,
          title,
          showTitle: true,
          showStroke: false,
          contentSort: 'none',
          memberIds: members.map((m) => m.id),
          x: Math.round(minX),
          y: Math.round(minY - titleBand),
          width: Math.max(8, Math.round(maxX - minX)),
          height: Math.max(8, Math.round(maxY - minY + titleBand)),
          shape: 'rect',
          runs: undefined,
          outlinePath: undefined,
          accent,
          zIndex: level - 1,
          hierarchyLevel: level,
        })
        continue
      }

      // Rect → solid AABB + perimeter path. N-gon → closed polyomino exterior
      // (merge pass fuses overlaps and keeps a single outer border).
      const chromeShape: PanelShape =
        panelShape === 'rect' ? 'rect' : 'polygon'
      const solidMode: 'solid-aabb' | 'close' | 'silhouette' =
        panelShape === 'rect' ? 'solid-aabb' : 'close'
      const chrome = chromeFromMembers(members, {
        pad,
        titleBand,
        shape: chromeShape,
        grid,
        solidMode,
      })
      // Always produce a stroke path so borders never disappear after merge
      const outline =
        chrome.outlinePath ||
        rectPerimeterPathD(chrome.x, chrome.y, chrome.width, chrome.height)
      panels.push({
        id: `panel-L${level}-${folderId}`,
        folderId,
        title,
        showTitle: true,
        showStroke: true,
        contentSort: 'none',
        memberIds: members.map((m) => m.id),
        ...chrome,
        shape: 'polygon',
        outlinePath: outline,
        accent,
        zIndex: level - 1,
        hierarchyLevel: level,
      })
    }
  }

  // Ensure L2 title origins sit below L1 chip row (never stack labels).
  // Grow height downward so cards stay covered; origin moves down only when
  // there is spare band above the first card.
  if (multi) {
    const L1_CHIP = 22
    const outers = panels.filter((p) => p.showStroke !== false)
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i]!
      if (p.showStroke !== false) continue
      const parent = outers.find(
        (o) =>
          o.memberIds?.length &&
          p.memberIds?.length &&
          p.memberIds.every((id) => o.memberIds!.includes(id)),
      )
      if (!parent) continue
      const l1TitleBottom = parent.y + L1_CHIP
      const minCardY = p.y + (p.height > 40 ? 20 : 0)
      // Ideal L2 origin: just under L1 chip, still above cards
      const idealY = Math.max(p.y, l1TitleBottom + 4)
      const maxY = minCardY - 18 // leave chip height above first card
      if (idealY <= maxY && idealY > p.y) {
        const dy = idealY - p.y
        panels[i] = {
          ...p,
          y: Math.round(idealY),
          height: Math.max(8, p.height - dy),
        }
      } else if (p.y < l1TitleBottom) {
        // Clamp display origin under L1 chip even if band is tight
        panels[i] = {
          ...p,
          y: Math.round(l1TitleBottom + 2),
        }
      }
    }
  }

  return panels
}

/** Closed rectangle perimeter as M/L edge segments (absolute board px). */
export function rectPerimeterPathD(
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  if (w < 1 || h < 1) return ''
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  const x1 = Math.round(x + w)
  const y1 = Math.round(y + h)
  return [
    `M ${x0} ${y0} L ${x1} ${y0}`,
    `M ${x1} ${y0} L ${x1} ${y1}`,
    `M ${x1} ${y1} L ${x0} ${y1}`,
    `M ${x0} ${y1} L ${x0} ${y0}`,
  ].join(' ')
}

/**
 * Merge overlapping / touching panels at the same hierarchy level into one
 * n-gon solid with a **single exterior border**.
 *
 * - Overlap/touch zones: internal edges drop (no double borders).
 * - Exterior perimeter: always stroked (pad-offset outline path).
 * - Each panel keeps its title chip; only the component leader paints stroke.
 */
export function mergeAdjacentOutermostPanels(
  panels: LayoutPanel[],
  opts: { grid?: number; panelPad?: number },
): LayoutPanel[] {
  if (panels.length <= 1) return panels
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const pad = Math.max(0, opts.panelPad ?? 8)

  // Merge per hierarchy level among panels that currently stroke
  const levels = Array.from(
    new Set(
      panels
        .filter((p) => p.showStroke !== false)
        .map((p) => p.hierarchyLevel ?? 1),
    ),
  ).sort((a, b) => a - b)

  let result = panels.slice()
  for (const level of levels) {
    result = mergeStrokedPanelsAtLevel(result, level, grid, pad)
  }
  return result
}

function mergeStrokedPanelsAtLevel(
  panels: LayoutPanel[],
  level: number,
  grid: number,
  pad: number,
): LayoutPanel[] {
  const stroked = panels.filter(
    (p) => (p.hierarchyLevel ?? 1) === level && p.showStroke !== false,
  )
  const rest = panels.filter((p) => !stroked.some((o) => o.id === p.id))
  if (stroked.length <= 1) {
    // Still ensure every stroked panel has a visible exterior outline
    return panels.map((p) => {
      if ((p.hierarchyLevel ?? 1) !== level || p.showStroke === false) return p
      const outline =
        p.outlinePath ||
        rectPerimeterPathD(p.x, p.y, p.width, p.height)
      return {
        ...p,
        showStroke: true,
        shape: 'polygon',
        outlinePath: outline,
      }
    })
  }

  // Connect when frames overlap or nearly touch (≤ pad+2px gap)
  const tol = Math.max(2, pad + 2)
  const parent = stroked.map((_, i) => i)
  const find = (i: number): number => {
    let p = i
    while (parent[p] !== p) p = parent[p]!
    let x = i
    while (parent[x] !== x) {
      const n = parent[x]!
      parent[x] = p
      x = n
    }
    return p
  }
  const unite = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  const near = (a: LayoutPanel, b: LayoutPanel) => {
    // Prefer run-based proximity for n-gon; fall back to AABB
    if (panelRunsOverlap(a, b, -tol)) return true
    const ax1 = a.x - tol
    const ay1 = a.y - tol
    const ax2 = a.x + a.width + tol
    const ay2 = a.y + a.height + tol
    return (
      ax1 < b.x + b.width &&
      ax2 > b.x &&
      ay1 < b.y + b.height &&
      ay2 > b.y
    )
  }
  for (let i = 0; i < stroked.length; i++) {
    for (let j = i + 1; j < stroked.length; j++) {
      if (near(stroked[i]!, stroked[j]!)) unite(i, j)
    }
  }

  const groups = new Map<number, LayoutPanel[]>()
  stroked.forEach((p, i) => {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(p)
  })

  const merged: LayoutPanel[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      const g = group[0]!
      const outline =
        g.outlinePath ||
        rectPerimeterPathD(g.x, g.y, g.width, g.height)
      merged.push({
        ...g,
        showStroke: true,
        shape: 'polygon',
        outlinePath: outline,
      })
      continue
    }

    const leader = [...group].sort(
      (a, b) => a.y - b.y || a.x - b.x,
    )[0]!
    const minX = Math.min(...group.map((g) => g.x))
    const minY = Math.min(...group.map((g) => g.y))
    const maxX = Math.max(...group.map((g) => g.x + g.width))
    const maxY = Math.max(...group.map((g) => g.y + g.height))

    // Union runs → cells → close gaps → exterior outline only (internal joins
    // between overlapping panels are omitted). Pad expands stroke outward.
    const originX = minX
    const originY = minY
    let unit = new Set<string>()
    for (const g of group) {
      const runs =
        g.runs && g.runs.length > 0
          ? g.runs
          : [{ x: g.x, y: g.y, width: g.width, height: g.height }]
      for (const r of runs) {
        const c0 = Math.floor((r.x - originX) / grid)
        const c1 = Math.ceil((r.x + r.width - originX) / grid)
        const r0 = Math.floor((r.y - originY) / grid)
        const r1 = Math.ceil((r.y + r.height - originY) / grid)
        for (let rr = r0; rr < Math.max(r0 + 1, r1); rr++) {
          for (let cc = c0; cc < Math.max(c0 + 1, c1); cc++) {
            unit.add(`${cc},${rr}`)
          }
        }
      }
    }
    unit = fillPolyominoHoles(unit)
    unit = closePolyomino(unit, 1)
    const solidCells: Array<{ c: number; r: number; cw: number; ch: number }> =
      []
    for (const k of unit) {
      const [cs, rs] = k.split(',')
      solidCells.push({ c: Number(cs), r: Number(rs), cw: 1, ch: 1 })
    }
    const runsRaw = cellsToOrthogonalRuns(solidCells, grid, originX, originY, 0)
    // Pad > 0 so the exterior stroke is clearly visible outside the fill
    const outlinePath =
      polyominoExteriorPathD(unit, grid, originX, originY, pad) ||
      rectPerimeterPathD(minX, minY, maxX - minX, maxY - minY)
    const x0 = Math.min(minX, ...runsRaw.map((r) => r.x)) - pad
    const y0 = Math.min(minY, ...runsRaw.map((r) => r.y)) - pad
    const x1 = Math.max(maxX, ...runsRaw.map((r) => r.x + r.width)) + pad
    const y1 = Math.max(maxY, ...runsRaw.map((r) => r.y + r.height)) + pad

    for (const g of group) {
      if (g.id === leader.id) {
        merged.push({
          ...g,
          x: Math.round(x0),
          y: Math.round(y0),
          width: Math.max(8, Math.round(x1 - x0)),
          height: Math.max(8, Math.round(y1 - y0)),
          runs: runsRaw.map((r) => ({
            x: Math.round(r.x - pad),
            y: Math.round(r.y - pad),
            width: Math.max(8, Math.round(r.width + pad * 2)),
            height: Math.max(8, Math.round(r.height + pad * 2)),
          })),
          outlinePath,
          shape: 'polygon',
          showStroke: true,
        })
      } else {
        // Sibling in merged component: title chip only (no second border)
        merged.push({
          ...g,
          showStroke: false,
          outlinePath: undefined,
          runs: undefined,
          shape: 'rect',
        })
      }
    }
  }

  return [...merged, ...rest]
}

/**
 * Move a layout panel and its member cards by (dx, dy). Nested child panels
 * whose members are a subset of the moved set also translate. Chrome is
 * rebuilt from member geometry after the move.
 */
export function translateLayoutPanelCluster(
  items: CanvasItem[],
  panels: LayoutPanel[],
  panelId: string,
  dx: number,
  dy: number,
  opts?: { grid?: number; panelPad?: number },
): { items: CanvasItem[]; panels: LayoutPanel[] } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { items, panels }
  }
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return { items, panels }
  }
  const panel = panels.find((p) => p.id === panelId)
  if (!panel?.memberIds?.length) return { items, panels }

  const rootIds = new Set(panel.memberIds)
  // Nested panels fully contained in this panel's membership also move
  const related = panels.filter(
    (p) =>
      p.id === panelId ||
      (p.memberIds?.length && p.memberIds.every((id) => rootIds.has(id))),
  )
  const moveIds = new Set<string>()
  for (const p of related) {
    for (const id of p.memberIds ?? []) moveIds.add(id)
  }

  const nextItems = items.map((it) => {
    if (!moveIds.has(it.id) || it.locked) return it
    return {
      ...it,
      x: Math.round(it.x + dx),
      y: Math.round(it.y + dy),
    }
  })
  const byId = new Map(nextItems.map((i) => [i.id, i]))
  const grid = opts?.grid ?? ORGANIZE_GRID
  const pad = opts?.panelPad ?? 8

  const nextPanels = panels.map((p) => {
    if (!related.some((r) => r.id === p.id)) return p
    const members = (p.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => Boolean(m) && !m.hidden)
    if (members.length === 0) {
      return {
        ...p,
        x: Math.round(p.x + dx),
        y: Math.round(p.y + dy),
      }
    }
    const level = p.hierarchyLevel ?? 1
    const titleBand =
      p.showTitle === false
        ? 0
        : 16 + (level <= 1 && (p.showStroke !== false) ? 12 : 0)
    const chrome = chromeFromMembers(members, {
      pad: level <= 1 ? pad + 4 : pad,
      titleBand,
      shape: p.shape === 'polygon' ? 'polygon' : 'rect',
      grid,
    })
    return {
      ...p,
      ...chrome,
      shape: p.shape,
      showStroke: p.showStroke,
    }
  })

  return { items: nextItems, panels: nextPanels }
}

/**
 * Exterior edge segments of a unit-cell polyomino (absolute board px).
 * Only edges with no neighboring cell — **no internal joins**.
 * Optional `pad` expands each edge **outward** (away from the polyomino)
 * so the stroke clears cards without a full-grid-cell dilate.
 */
export function polyominoExteriorEdges(
  unit: Set<string>,
  grid: number,
  originX: number,
  originY: number,
  pad = 0,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  if (unit.size === 0 || grid < 1) return []
  const p = Math.max(0, pad)
  const has = (c: number, r: number) => unit.has(`${c},${r}`)
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (const k of unit) {
    const [cs, rs] = k.split(',')
    const c = Number(cs)
    const r = Number(rs)
    const x = originX + c * grid
    const y = originY + r * grid
    // N (outward −y): extend along edge by pad so corners meet
    if (!has(c, r - 1))
      segs.push({
        x1: x - p,
        y1: y - p,
        x2: x + grid + p,
        y2: y - p,
      })
    // S (outward +y)
    if (!has(c, r + 1))
      segs.push({
        x1: x - p,
        y1: y + grid + p,
        x2: x + grid + p,
        y2: y + grid + p,
      })
    // W (outward −x)
    if (!has(c - 1, r))
      segs.push({
        x1: x - p,
        y1: y - p,
        x2: x - p,
        y2: y + grid + p,
      })
    // E (outward +x)
    if (!has(c + 1, r))
      segs.push({
        x1: x + grid + p,
        y1: y - p,
        x2: x + grid + p,
        y2: y + grid + p,
      })
  }
  return segs
}

/**
 * Exterior SVG path for a unit-cell polyomino (absolute board px).
 *
 * Emits one `M…L…` per exterior edge (not a single stitched loop). Stitching
 * used to drop edges at T-junctions / L-corners and produced broken borders.
 * Per-edge segments always cover the full outline; internal edges omitted.
 */
export function polyominoExteriorPathD(
  unit: Set<string>,
  grid: number,
  originX: number,
  originY: number,
  pad = 0,
): string {
  const segs = polyominoExteriorEdges(unit, grid, originX, originY, pad)
  if (segs.length === 0) return ''
  return segs
    .map(
      (s) =>
        `M ${Math.round(s.x1)} ${Math.round(s.y1)} L ${Math.round(s.x2)} ${Math.round(s.y2)}`,
    )
    .join(' ')
}

/**
 * Morphological close: dilate then hole-fill so nearby card clusters fuse into
 * one solid region (no deep notches / “room walls” in the exterior outline).
 */
export function closePolyomino(unit: Set<string>, radius = 2): Set<string> {
  if (unit.size === 0 || radius < 1) return fillPolyominoHoles(unit)
  let u = new Set(unit)
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const
  for (let i = 0; i < radius; i++) {
    const next = new Set(u)
    for (const k of u) {
      const [cs, rs] = k.split(',')
      const c = Number(cs)
      const r = Number(rs)
      for (const [dc, dr] of dirs) next.add(`${c + dc},${r + dr}`)
    }
    u = next
  }
  return fillPolyominoHoles(u)
}

/**
 * Fill every cell in the AABB of the polyomino — solid outer rectangle.
 * Used for outermost multi-level L1 chrome (one clean perimeter).
 */
export function solidifyPolyominoAABB(unit: Set<string>): Set<string> {
  if (unit.size === 0) return unit
  let minC = Infinity
  let maxC = -Infinity
  let minR = Infinity
  let maxR = -Infinity
  for (const k of unit) {
    const [cs, rs] = k.split(',')
    const c = Number(cs)
    const r = Number(rs)
    minC = Math.min(minC, c)
    maxC = Math.max(maxC, c)
    minR = Math.min(minR, r)
    maxR = Math.max(maxR, r)
  }
  const solid = new Set<string>()
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) solid.add(`${c},${r}`)
  }
  return solid
}

/**
 * Fill interior holes in a unit-cell polyomino so n-gon chrome never forms a
 * “donut” (empty island fully enclosed by the group).
 */
export function fillPolyominoHoles(unit: Set<string>): Set<string> {
  if (unit.size === 0) return unit
  let minC = Infinity
  let maxC = -Infinity
  let minR = Infinity
  let maxR = -Infinity
  for (const k of unit) {
    const [cs, rs] = k.split(',')
    const c = Number(cs)
    const r = Number(rs)
    minC = Math.min(minC, c)
    maxC = Math.max(maxC, c)
    minR = Math.min(minR, r)
    maxR = Math.max(maxR, r)
  }
  const exterior = new Set<string>()
  const q: Array<[number, number]> = []
  const key = (c: number, r: number) => `${c},${r}`
  const inB = (c: number, r: number) =>
    c >= minC - 1 && c <= maxC + 1 && r >= minR - 1 && r <= maxR + 1
  for (let c = minC - 1; c <= maxC + 1; c++) {
    q.push([c, minR - 1], [c, maxR + 1])
  }
  for (let r = minR; r <= maxR; r++) {
    q.push([minC - 1, r], [maxC + 1, r])
  }
  while (q.length) {
    const [c, r] = q.pop()!
    const k = key(c, r)
    if (!inB(c, r) || exterior.has(k) || unit.has(k)) continue
    exterior.add(k)
    q.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1])
  }
  const filled = new Set(unit)
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const k = key(c, r)
      if (!unit.has(k) && !exterior.has(k)) filled.add(k)
    }
  }
  return filled
}

/** AABB or n-gon runs from member card geometry. */
function chromeFromMembers(
  members: Array<{ x: number; y: number; width: number; height: number }>,
  opts: {
    pad: number
    titleBand: number
    shape: PanelShape
    grid: number
    /**
     * solid-aabb: fill full bounding box → one clean outer perimeter (no
     * internal “room walls”). Default for outermost multi-level L1.
     * close: morphological close so nearby clusters fuse.
     * silhouette: card cells + hole-fill only (legacy n-gon).
     */
    solidMode?: 'solid-aabb' | 'close' | 'silhouette'
  },
): {
  x: number
  y: number
  width: number
  height: number
  runs?: Array<{ x: number; y: number; width: number; height: number }>
  outlinePath?: string
} {
  const pad = Math.max(0, opts.pad)
  const titleBand = Math.max(0, opts.titleBand)
  const grid = Math.max(4, opts.grid)
  const solidMode = opts.solidMode ?? 'silhouette'

  const minX = Math.min(...members.map((m) => m.x))
  const minY = Math.min(...members.map((m) => m.y))
  const maxX = Math.max(...members.map((m) => m.x + m.width))
  const maxY = Math.max(...members.map((m) => m.y + m.height))

  if (opts.shape !== 'polygon' || solidMode === 'solid-aabb') {
    // Clean outer rectangle perimeter (always exterior-only, no internal edges)
    const x = Math.round(minX - pad)
    const y = Math.round(minY - pad - titleBand)
    const width = Math.max(8, Math.round(maxX - minX + pad * 2))
    const height = Math.max(8, Math.round(maxY - minY + pad * 2 + titleBand))
    if (opts.shape === 'polygon' || solidMode === 'solid-aabb') {
      // Prefer outline path so stroke is one continuous perimeter
      return {
        x,
        y,
        width,
        height,
        runs: [{ x, y, width, height }],
        outlinePath: rectPerimeterPathD(x, y, width, height),
      }
    }
    return { x, y, width, height }
  }

  // N-gon silhouette / closed: cells covering each card
  const originX = minX
  const originY = minY
  let unit = new Set<string>()
  for (const m of members) {
    const left = m.x - originX
    const right = m.x + m.width - originX
    const top = m.y - originY
    const bottom = m.y + m.height - originY
    const c0 = Math.floor(left / grid)
    const c1 = Math.ceil(right / grid)
    const r0 = Math.floor(top / grid)
    const r1 = Math.ceil(bottom / grid)
    for (let r = r0; r < Math.max(r0 + 1, r1); r++) {
      for (let c = c0; c < Math.max(c0 + 1, c1); c++) {
        unit.add(`${c},${r}`)
      }
    }
  }
  unit = fillPolyominoHoles(unit)
  if (solidMode === 'close') {
    unit = closePolyomino(unit, 2)
  }

  const titleRows = Math.max(0, Math.ceil(titleBand / grid))
  if (titleRows > 0 && unit.size > 0) {
    let minR = Infinity
    for (const k of unit) minR = Math.min(minR, Number(k.split(',')[1]))
    // Full-width title band across solid top (not just topmost cols)
    let minC = Infinity
    let maxC = -Infinity
    for (const k of unit) {
      const c = Number(k.split(',')[0])
      minC = Math.min(minC, c)
      maxC = Math.max(maxC, c)
    }
    for (let dr = 1; dr <= titleRows; dr++) {
      for (let c = minC; c <= maxC; c++) unit.add(`${c},${minR - dr}`)
    }
  }

  const solidCells: Array<{ c: number; r: number; cw: number; ch: number }> = []
  for (const k of unit) {
    const [cs, rs] = k.split(',')
    solidCells.push({ c: Number(cs), r: Number(rs), cw: 1, ch: 1 })
  }
  let runsRaw = cellsToOrthogonalRuns(solidCells, grid, originX, originY, 0)
  runsRaw = runsRaw.map((r) => ({
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  }))
  const outlinePath = polyominoExteriorPathD(unit, grid, originX, originY, pad)

  const guardX0 = minX - pad
  const guardY0 = minY - pad - titleBand
  const guardX1 = maxX + pad
  const guardY1 = maxY + pad
  if (runsRaw.length === 0) {
    return {
      x: Math.round(guardX0),
      y: Math.round(guardY0),
      width: Math.max(8, Math.round(guardX1 - guardX0)),
      height: Math.max(8, Math.round(guardY1 - guardY0)),
      outlinePath: rectPerimeterPathD(
        guardX0,
        guardY0,
        guardX1 - guardX0,
        guardY1 - guardY0,
      ),
    }
  }
  const x0 = Math.min(guardX0, ...runsRaw.map((r) => r.x))
  const y0 = Math.min(guardY0, ...runsRaw.map((r) => r.y))
  const x1 = Math.max(guardX1, ...runsRaw.map((r) => r.x + r.width))
  const y1 = Math.max(guardY1, ...runsRaw.map((r) => r.y + r.height))
  return {
    x: Math.round(x0),
    y: Math.round(y0),
    width: Math.max(8, Math.round(x1 - x0)),
    height: Math.max(8, Math.round(y1 - y0)),
    runs: runsRaw.map((r) => ({
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.max(8, Math.round(r.width)),
      height: Math.max(8, Math.round(r.height)),
    })),
    outlinePath: outlinePath || undefined,
  }
}

/**
 * Re-pack cards inside one panel (shelf within panel content box).
 * Used when user sets contentSort or after showTitle changes title band.
 *
 * With `mode: 'dense'` (Panel Properties → Auto-layout): packs for best use of
 * the panel width, scales cards down if needed to fit, then rebuilds chrome
 * (including n-gon outline) so the frame fully encapsulates content.
 */
export function relayoutPanelContents(
  items: CanvasItem[],
  panel: LayoutPanel,
  opts?: {
    grid?: number
    gapPx?: number
    panelPad?: number
    /** shelf = keep sizes; dense = pack + optional scale-to-fit + rebuild chrome */
    mode?: 'shelf' | 'dense'
  },
): { items: CanvasItem[]; panel: LayoutPanel } {
  const ids = new Set(panel.memberIds ?? [])
  if (ids.size === 0) return { items, panel }

  const gap = Math.max(2, opts?.gapPx ?? 6)
  const showTitle = panel.showTitle !== false
  const titleBand = showTitle ? 16 : 0
  const pad = Math.max(2, opts?.panelPad ?? 4)
  const grid = opts?.grid ?? ORGANIZE_GRID
  const dense = opts?.mode === 'dense'

  let members = items.filter((i) => ids.has(i.id) && !i.hidden)
  if ((panel.contentSort ?? 'none') === 'none' && panel.memberIds?.length) {
    const rank = new Map(panel.memberIds.map((id, i) => [id, i]))
    members = [...members].sort(
      (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    )
  }
  const sort = panel.contentSort ?? 'none'
  if (sort === 'name-asc' || sort === 'name-desc') {
    const dir = sort === 'name-desc' ? -1 : 1
    members = [...members].sort((a, b) => {
      const ta = (a.title ?? a.latex ?? a.id).toLocaleLowerCase()
      const tb = (b.title ?? b.latex ?? b.id).toLocaleLowerCase()
      if (ta < tb) return -1 * dir
      if (ta > tb) return 1 * dir
      return a.id.localeCompare(b.id)
    })
  }
  if (members.length === 0) return { items, panel }

  // Target content box from current panel (dense: use panel as budget)
  const contentX = panel.x + pad
  const contentY = panel.y + pad + titleBand
  const contentW = Math.max(
    48,
    panel.width - pad * 2,
    ...members.map((m) => m.width),
  )
  const contentH = Math.max(48, panel.height - pad * 2 - titleBand)

  // Dense: try natural pack widths, pick densest that fits contentW
  type Place = { id: string; x: number; y: number; w: number; h: number }
  let places: Place[] = []

  if (dense) {
    // Shelf pack at current sizes; if overflows height, uniform scale down
    const packShelf = (scale: number) => {
      const out: Place[] = []
      let x = contentX
      let y = contentY
      let rowH = 0
      for (const m of members) {
        const w = Math.max(24, Math.round(m.width * scale))
        const h = Math.max(20, Math.round(m.height * scale))
        if (x > contentX && x + w > contentX + contentW) {
          x = contentX
          y += rowH + gap
          rowH = 0
        }
        // Clamp single card wider than box
        const ww = Math.min(w, contentW)
        out.push({ id: m.id, x: Math.round(x), y: Math.round(y), w: ww, h })
        x += ww + gap
        rowH = Math.max(rowH, h)
      }
      const bottom = out.reduce((b, p) => Math.max(b, p.y + p.h), contentY)
      return { out, height: bottom - contentY }
    }
    let scale = 1
    let best = packShelf(1)
    // Shrink until fits panel height (or scale floor)
    while (best.height > contentH + 2 && scale > 0.55) {
      scale *= 0.9
      best = packShelf(scale)
    }
    places = best.out
  } else {
    // Simple shelf (keep sizes) — contentSort path
    let x = contentX
    let y = contentY
    let rowH = 0
    for (const m of members) {
      const w = m.width
      const h = m.height
      if (x > contentX && x + w > contentX + contentW) {
        x = contentX
        y += rowH + gap
        rowH = 0
      }
      places.push({
        id: m.id,
        x: Math.round(x),
        y: Math.round(y),
        w,
        h,
      })
      x += w + gap
      rowH = Math.max(rowH, h)
    }
  }

  const byPlace = new Map(places.map((p) => [p.id, p]))
  const nextItems = items.map((it) => {
    const p = byPlace.get(it.id)
    if (!p) return it
    return {
      ...it,
      x: p.x,
      y: p.y,
      width: dense ? p.w : it.width,
      height: dense ? p.h : it.height,
    }
  })

  const moved = nextItems.filter((i) => ids.has(i.id) && !i.hidden)
  if (moved.length === 0) return { items: nextItems, panel }

  // Rebuild chrome so n-gon outline fully wraps reflowed cards
  const shape: PanelShape = panel.shape === 'polygon' ? 'polygon' : 'rect'
  const chrome = chromeFromMembers(moved, {
    pad,
    titleBand,
    shape,
    grid,
  })
  const nextPanel: LayoutPanel = {
    ...panel,
    ...chrome,
    shape,
    // Preserve identity / hierarchy
    id: panel.id,
    folderId: panel.folderId,
    title: panel.title,
    showTitle: panel.showTitle,
    contentSort: panel.contentSort,
    memberIds: panel.memberIds,
    accent: panel.accent,
    zIndex: panel.zIndex,
    hierarchyLevel: panel.hierarchyLevel,
  }
  return { items: nextItems, panel: nextPanel }
}

/** @deprecated Use buildLayoutPanelsFromMembers */
export function buildLayoutPanelsFromPlans(args: {
  plans: TopicSectionPlan[]
  placed: CanvasItem[]
  regionPos: Map<number, { c: number; r: number }>
  grid: number
  boxLeft: number
  boxTop: number
  panelPad: number
  panelTitleCh: (plan: TopicSectionPlan) => number
  folderName: Map<string, string>
  useLabels: boolean
}): LayoutPanel[] {
  return buildLayoutPanelsFromMembers({
    plans: args.plans,
    placed: args.placed,
    panelPad: args.panelPad,
    panelShape: 'rect',
    folderName: args.folderName,
    useLabels: args.useLabels,
  })
}

/** True if two axis-aligned rects overlap (strict interior). */
export function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  eps = 0.5,
): boolean {
  return (
    a.x + a.width > b.x + eps &&
    b.x + b.width > a.x + eps &&
    a.y + a.height > b.y + eps &&
    b.y + b.height > a.y + eps
  )
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

