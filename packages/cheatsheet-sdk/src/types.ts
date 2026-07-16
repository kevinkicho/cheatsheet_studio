/**
 * Sheet document types — compatible with CheatSheet Studio Firestore sheets
 * and canvasStore.loadSheet. Kept standalone so the SDK never imports React.
 *
 * Schema version bumps when the app document shape changes in a breaking way.
 */
export const SHEET_DOC_VERSION = 1 as const

export type PrintSizeId =
  | 'letter'
  | 'legal'
  | 'tabloid'
  | 'a3'
  | 'a4'
  | 'a5'

export type PageOrientation = 'portrait' | 'landscape'
export type PrintPageLayout = 'vertical' | 'horizontal' | 'grid' | 'free'
export type GridExtent = 'board' | 'page' | 'printable'
export type TitleAlign = 'left' | 'center' | 'right'
export type MermaidThemeId =
  | 'dark'
  | 'default'
  | 'forest'
  | 'neutral'
  | 'base'
export type MermaidDiagramKind = 'flowchart' | 'mindmap'
export type MermaidFlowDirection = 'TD' | 'LR' | 'BT' | 'RL'

export type CalloutVariant = 'note' | 'tip' | 'info' | 'warn' | 'danger'

export type CanvasItemType =
  | 'equation'
  | 'table'
  | 'figure'
  | 'definition'
  | 'list'
  | 'callout'
  | 'code'
  | 'constant'
  | 'identity-set'
  | 'plot'
  | 'matrix'
  | 'custom-equation'
  | 'custom-image'
  | 'process-chart'

export interface PrintMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PrintPageOrigin {
  x: number
  y: number
}

export interface ItemStyle {
  fontSize?: number
  titleFontSize?: number
  color?: string
  background?: string
  border?: string
  borderEnabled?: boolean
  borderWidth?: number
  borderStyle?: string
  borderColor?: string
  padding?: number
}

/** Minimal process snapshot — full fidelity lives in the app editor. */
export interface ProcessFlowSnapshotLite {
  v: 1
  direction?: MermaidFlowDirection
  curveStyle?: string
  diagramKind?: MermaidDiagramKind
  nodes: Array<{
    id: string
    x: number
    y: number
    width: number
    height: number
    label: string
    shape?: string
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    label?: string
  }>
  width?: number
  height?: number
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
  autoFit?: boolean
  showTitle?: boolean
  titleAlign?: TitleAlign
  contentFill?: boolean
  keepAspectRatio?: boolean
  transparentBackground?: boolean
  hidden?: boolean
  /** @deprecated Canvas favorites removed; library favorites are separate. */
  starred?: boolean
  locked?: boolean
  folderId?: string | null
  latex?: string
  tableMarkdown?: string
  imageUrl?: string
  imagePath?: string
  // Tier 1 prose
  term?: string
  body?: string
  listItems?: string[]
  listOrdered?: boolean
  calloutVariant?: CalloutVariant
  code?: string
  codeLanguage?: string
  // Tier 2 STEM
  symbol?: string
  value?: string
  unit?: string
  identities?: string[]
  matrixRows?: string[][]
  mermaidSource?: string
  /** Opaque to the SDK when full processFlow is present; app paints it. */
  processFlow?: ProcessFlowSnapshotLite | Record<string, unknown>
  mermaidTheme?: MermaidThemeId
  mermaidKind?: MermaidDiagramKind
  mermaidDirection?: MermaidFlowDirection
  style?: ItemStyle
}

export interface OutlinerFolder {
  id: string
  name: string
  open?: boolean
  order?: number
  parentId?: string | null
}

export interface SheetCanvas {
  width: number
  height: number
  background: string
  showGrid: boolean
  snapToGrid: boolean
  gridSpacing: number
  gridOpacity: number
  gridExtent?: GridExtent
  printSizeId: PrintSizeId
  orientation: PageOrientation
  showPrintArea: boolean
  printPageCount?: number
  printPageLayout?: PrintPageLayout
  printPagePositions?: PrintPageOrigin[]
  margins: PrintMargins
}

/**
 * Portable sheet document agents produce.
 * When pushed to Firestore, maps to { ownerId, title, canvas, items, folders, … }.
 */
export interface SheetDocument {
  /** Schema version for agents / CLI. */
  v: typeof SHEET_DOC_VERSION
  title: string
  canvas: SheetCanvas
  items: CanvasItem[]
  folders: OutlinerFolder[]
  /** Optional metadata for agents (ignored by the app if present). */
  meta?: {
    createdBy?: string
    source?: string
    notes?: string
  }
}

/** Firestore sheet body (matches app buildSheetPayload). */
export interface FirestoreSheetPayload {
  ownerId: string
  title: string
  updatedAt: number
  createdAt?: number
  canvas: SheetCanvas
  items: CanvasItem[]
  folders: OutlinerFolder[]
}
