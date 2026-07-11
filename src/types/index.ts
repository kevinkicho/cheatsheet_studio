import type { PageOrientation, PrintSizeId } from '@/lib/printSizes'
import {
  DEFAULT_ORIENTATION,
  DEFAULT_PRINT_SIZE_ID,
  resolvePagePixels,
} from '@/lib/printSizes'

export type { PageOrientation, PrintSizeId }

export type Subject =
  | 'mathematics'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'economics'
  | 'finance'

export type LibraryItemType = 'equation' | 'table' | 'figure'
export type CanvasItemType =
  | LibraryItemType
  | 'custom-equation'
  | 'custom-image'

export type TitleAlign = 'left' | 'center' | 'right'

/** CSS border-style values we expose in the UI. */
export type BorderStroke =
  | 'solid'
  | 'dashed'
  | 'dotted'
  | 'double'
  | 'none'

export interface ItemStyle {
  fontSize?: number
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
   * When true, card chrome is fully transparent (no fill/shadow) so figures
   * and equations blend with the dark canvas. Default false; figures often set true.
   */
  transparentBackground?: boolean
  /** When true, card is hidden on the canvas (Outliner eye off). Default false. */
  hidden?: boolean
  /** When true, card cannot be moved/resized (Outliner lock). Default false. */
  locked?: boolean
  /** Outliner folder id; undefined/null = root (ungrouped). */
  folderId?: string | null
  latex?: string
  tableMarkdown?: string
  imageUrl?: string
  imagePath?: string
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
  /** Grid line opacity 0–1 (default 0.10). */
  gridOpacity: number
  /** Print page preset (letter default). */
  printSizeId: PrintSizeId
  orientation: PageOrientation
  /** When true, draw the print page frame + margins. Does not resize workspace. */
  showPrintArea: boolean
  /** Content-safe margins inside the print page. */
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

export const DEFAULT_CANVAS: SheetCanvas = {
  // Workspace is always at least freeform; print frame sits at top-left
  width: Math.max(FREEFORM_WORKSPACE.width, defaultPage.width),
  height: Math.max(FREEFORM_WORKSPACE.height, defaultPage.height),
  background: '#0f1115',
  showGrid: true,
  snapToGrid: false,
  gridSpacing: 24,
  gridOpacity: 0.1,
  printSizeId: DEFAULT_PRINT_SIZE_ID,
  orientation: DEFAULT_ORIENTATION,
  showPrintArea: true,
  margins: { ...DEFAULT_MARGINS },
}

export const DEFAULT_BORDER_COLOR = 'rgba(99, 102, 241, 0.55)'

export const DEFAULT_ITEM_STYLE: ItemStyle = {
  fontSize: 18,
  color: '#e8eaed',
  background: 'rgba(30, 32, 40, 0.92)',
  borderEnabled: true,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: DEFAULT_BORDER_COLOR,
  border: `1px solid ${DEFAULT_BORDER_COLOR}`,
  padding: 12,
}
