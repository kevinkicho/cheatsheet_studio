import type {
  PageOrientation,
  PrintPageLayout,
  PrintPageOrigin,
  PrintSizeId,
} from '@/lib/printSizes'
import {
  DEFAULT_ORIENTATION,
  DEFAULT_PRINT_PAGE_LAYOUT,
  DEFAULT_PRINT_SIZE_ID,
  resolvePagePixels,
} from '@/lib/printSizes'

export type { PageOrientation, PrintPageLayout, PrintPageOrigin, PrintSizeId }

export type Subject =
  | 'mathematics'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'economics'
  | 'finance'

/**
 * Library / canvas content kinds.
 * VECTOR-FIRST: equations (LaTeX), tables (markdown), figures (SVG diagrams).
 * Do not store diagram screenshots as PNG — use SVG. Photos may be raster.
 * See docs/vector-graphics.md
 */
export type LibraryItemType = 'equation' | 'table' | 'figure'
export type CanvasItemType =
  | LibraryItemType
  | 'custom-equation'
  | 'custom-image'
  /** Mermaid process / flowchart card (source in mermaidSource). */
  | 'process-chart'

/** Mermaid diagram family used for templates + config UI. */
export type MermaidDiagramKind =
  | 'flowchart'
  | 'sequence'
  | 'state'
  | 'class'
  | 'er'
  | 'pie'
  | 'mindmap'

export type MermaidThemeId =
  | 'dark'
  | 'default'
  | 'forest'
  | 'neutral'
  | 'base'

/** Flowchart / graph direction. */
export type MermaidFlowDirection = 'TD' | 'LR' | 'BT' | 'RL'

export type TitleAlign = 'left' | 'center' | 'right'

/** CSS border-style values we expose in the UI. */
export type BorderStroke =
  | 'solid'
  | 'dashed'
  | 'dotted'
  | 'double'
  | 'none'

export interface ItemStyle {
  /** Body / content font size (px). Default 18. */
  fontSize?: number
  /** Card title bar font size (px). Default 10. */
  titleFontSize?: number
  color?: string
  background?: string
  /**
   * Composed CSS border shorthand (kept in sync from border* fields).
   * Prefer borderEnabled / borderWidth / borderStyle / borderColor for edits.
   */
  border?: string
  /** When false, no border is drawn. Default true. */
  borderEnabled?: boolean
  /** Stroke thickness in CSS px. Default 1. */
  borderWidth?: number
  /** solid | dashed | dotted | double | none. Default solid. */
  borderStyle?: BorderStroke
  /** Stroke color (hex or rgba). */
  borderColor?: string
  padding?: number
}

export interface LibraryItem {
  id: string
  type: LibraryItemType
  title: string
  subject: Subject
  topic: string
  tags: string[]
  latex?: string
  tableMarkdown?: string
  imageUrl?: string
  imagePath?: string
  description?: string
  source?: string
  isSystem: boolean
  createdBy?: string
  createdAt?: number
}

export interface CanvasItem {
  id: string
  libraryItemId?: string
  type: CanvasItemType
  title?: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  rotation?: number
  /** When true (default), card grows/shrinks to fit content. Manual resize turns this off. */
  autoFit?: boolean
  /** When false, hide the title bar on the card. Default true. */
  showTitle?: boolean
  /** Title text alignment on the card. Default left. */
  titleAlign?: TitleAlign
  /** Bumped to force content re-scale inside the card viewport. */
  contentFitKey?: number
  /**
   * When true, content may scale above 100% to fill the card body
   * (set by double-click fit).
   */
  contentFill?: boolean
  /**
   * When true (default), content uses uniform scale so aspect ratio is preserved.
   * When false, free-transform stretch scales X and Y independently.
   */
  keepAspectRatio?: boolean
  /**
   * When true, card chrome is fully transparent (no fill/shadow) so figures
   * and equations blend with the dark canvas. Default false; figures often set true.
   */
  transparentBackground?: boolean
  /** When true, card is hidden on the canvas (Outliner eye off). Default false. */
  hidden?: boolean
  /**
   * When true, card is starred/favorited (Layers + library favorites filter).
   * Default false. Sheet-persisted with the item.
   */
  starred?: boolean
  /** When true, card cannot be moved/resized (Outliner lock). Default false. */
  locked?: boolean
  /** Outliner folder id; undefined/null = root (ungrouped). */
  folderId?: string | null
  latex?: string
  tableMarkdown?: string
  imageUrl?: string
  imagePath?: string
  /**
   * Mermaid diagram source (process-chart cards).
   * Kept for re-open / library; free-form cards prefer `processFlow` for paint.
   */
  mermaidSource?: string
  /**
   * Free-form editor snapshot (nodes/edges/positions). When present, canvas and
   * export render this (matches interactive editor) instead of re-laying out Mermaid.
   */
  processFlow?: import('@/lib/processFlowSnapshot').ProcessFlowSnapshot
  /** Mermaid theme id for this card (default dark). */
  mermaidTheme?: MermaidThemeId
  /** Last diagram kind used in the editor (templates). */
  mermaidKind?: MermaidDiagramKind
  /** Flowchart direction when kind is flowchart. */
  mermaidDirection?: MermaidFlowDirection
  style?: ItemStyle
}

/** Outliner collection / folder (Blender-style). Supports nesting. */
export interface OutlinerFolder {
  id: string
  name: string
  /** Collapsed in Outliner when false. Default true (open). */
  open?: boolean
  order?: number
  /** Parent folder id; null/undefined = top-level under sheet root. */
  parentId?: string | null
}

/** Print margins in CSS px @ 96 dpi (0.5 in = 48 px). */
export interface PrintMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export const DEFAULT_MARGINS: PrintMargins = {
  top: 48,
  right: 48,
  bottom: 48,
  left: 48,
}

/**
 * Where the canvas grid is drawn / snapped.
 * - board: one continuous grid over the free workspace
 * - page: independent grid inside each full print page frame
 * - printable: independent grid inside each page’s margin box only
 */
export type GridExtent = 'board' | 'page' | 'printable'

export const DEFAULT_GRID_EXTENT: GridExtent = 'page'

export function normalizeGridExtent(v: unknown): GridExtent {
  if (v === 'board' || v === 'page' || v === 'printable') return v
  return DEFAULT_GRID_EXTENT
}

/**
 * Max grid line alpha (Canvas2D).
 * Full slider travel 0–100% maps onto 0…this value (not 0…1).
 * So the bar is not “used up” by ~25%.
 */
export const GRID_OPACITY_CSS_MAX = 0.3

/** Slider is always 0–100 (percent of the soft grid range). */
export const GRID_OPACITY_PERCENT_MAX = 100

/** Default: mid-low on the soft scale (α 0.09 ≈ 30% of bar). */
export const DEFAULT_GRID_OPACITY = 0.09

/** Clamp stored grid opacity to the 0…GRID_OPACITY_CSS_MAX range. */
export function clampGridOpacity(
  n: unknown,
  fallback = DEFAULT_GRID_OPACITY,
): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.min(GRID_OPACITY_CSS_MAX, Math.max(0, v))
}

/**
 * Stored alpha → slider position (0–100).
 * α 0 → 0%, α 0.15 → 50%, α 0.30 → 100%.
 */
export function gridOpacityToPercent(cssOpacity: number): number {
  const a = clampGridOpacity(cssOpacity)
  if (GRID_OPACITY_CSS_MAX <= 0) return 0
  return Math.round((a / GRID_OPACITY_CSS_MAX) * 100)
}

/**
 * Slider position (0–100) → stored alpha (0…0.3).
 * 0% → 0, 50% → 0.15, 100% → 0.30.
 * (Not 1:1 with CSS 0–1 — that crushed the useful range into ~0–30% of the bar.)
 */
export function percentToGridOpacity(pct: number): number {
  if (!Number.isFinite(pct)) return DEFAULT_GRID_OPACITY
  const t = Math.min(100, Math.max(0, pct)) / 100
  return clampGridOpacity(t * GRID_OPACITY_CSS_MAX)
}

export interface SheetCanvas {
  /**
   * Full workspace board size (always large enough for free placement).
   * Print page is a frame *inside* this board — toggling print never shrinks this.
   */
  width: number
  height: number
  background: string
  showGrid: boolean
  /** Snap card move/resize to the grid. */
  snapToGrid: boolean
  /** Grid cell size in px (default 24 — aligns with 0.5″ / 48px margins). */
  gridSpacing: number
  /**
   * Grid line alpha 0–0.3.
   * UI slider 0–100% spans this full range (100% → 0.3, not 1.0).
   */
  gridOpacity: number
  /**
   * Grid coverage: continuous board vs per-page full page vs per-page printable.
   * Default `page` — each print frame has its own grid starting at (0,0) of that page.
   */
  gridExtent?: GridExtent
  /** Print page preset (letter default). */
  printSizeId: PrintSizeId
  orientation: PageOrientation
  /** When true, draw the print page frame + margins. Does not resize workspace. */
  showPrintArea: boolean
  /**
   * Number of print page frames to show. Default 1.
   * Clamped 1–20. Lets you lay out multi-page cheat sheets on one board.
   */
  printPageCount?: number
  /**
   * How page frames are arranged on the free board.
   * vertical | horizontal | grid | free (drag-and-place).
   */
  printPageLayout?: PrintPageLayout
  /**
   * Absolute board positions for each page when layout is `free`.
   * Length should match printPageCount; missing entries fall back to vertical.
   */
  printPagePositions?: PrintPageOrigin[]
  /** Content-safe margins inside each print page. */
  margins: PrintMargins
}

/** Minimum free-board workspace when print frame is off / for general editing. */
export const FREEFORM_WORKSPACE = { width: 3200, height: 2400 } as const


export interface Sheet {
  id: string
  ownerId: string
  title: string
  createdAt: number
  updatedAt: number
  canvas: SheetCanvas
  items: CanvasItem[]
}

export interface UserProfile {
  uid: string
  displayName: string
  email: string
  photoURL: string | null
  createdAt: number
  lastLoginAt: number
}

export const SUBJECTS: { id: Subject; label: string }[] = [
  { id: 'mathematics', label: 'Mathematics' },
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'biology', label: 'Biology' },
  { id: 'economics', label: 'Economics' },
  { id: 'finance', label: 'Finance' },
]

const defaultPage = resolvePagePixels(
  DEFAULT_PRINT_SIZE_ID,
  DEFAULT_ORIENTATION,
)

/** Default: print frame on → scroll area ≈ one page + pad (not full freeform). */
const DEFAULT_PRINT_SCROLL_PAD = 96

export const DEFAULT_CANVAS: SheetCanvas = {
  // Print frame on by default — tight board around the page
  width: defaultPage.width + DEFAULT_PRINT_SCROLL_PAD,
  height: defaultPage.height + DEFAULT_PRINT_SCROLL_PAD,
  background: '#0f1115',
  showGrid: true,
  snapToGrid: false,
  gridSpacing: 24,
  gridOpacity: DEFAULT_GRID_OPACITY,
  gridExtent: DEFAULT_GRID_EXTENT,
  printSizeId: DEFAULT_PRINT_SIZE_ID,
  orientation: DEFAULT_ORIENTATION,
  showPrintArea: true,
  printPageCount: 1,
  printPageLayout: DEFAULT_PRINT_PAGE_LAYOUT,
  printPagePositions: [],
  margins: { ...DEFAULT_MARGINS },
}

export const DEFAULT_BORDER_COLOR = 'rgba(99, 102, 241, 0.55)'

export const DEFAULT_ITEM_STYLE: ItemStyle = {
  fontSize: 18,
  titleFontSize: 10,
  color: '#e8eaed',
  background: 'rgba(30, 32, 40, 0.92)',
  borderEnabled: true,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: DEFAULT_BORDER_COLOR,
  border: `1px solid ${DEFAULT_BORDER_COLOR}`,
  /**
   * No inner padding — content uses the full card; FitContent stretch-fills.
   * Legacy sheets with 4–12px padding are normalized down to 0 on load.
   */
  padding: 0,
}

/** Default title bar size (matches legacy text-[10px] cards). */
export const DEFAULT_TITLE_FONT_SIZE = 10

/** Approximate title row height for a given title font size (line-height + margin). */
export function titleBandPx(titleFontSize?: number): number {
  const fs = titleFontSize ?? DEFAULT_TITLE_FONT_SIZE
  return Math.round(fs * 1.6) + 2
}
