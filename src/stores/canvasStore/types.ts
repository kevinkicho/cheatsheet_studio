/**
 * Canvas Zustand store types + empty state.
 */
import type { AutoLayoutExportSnapshot, CheatsheetLayoutOptions } from '@/lib/autoOrganize'
import type { AddFromLibraryOptions } from '@/lib/canvasDrop'
import type {
  PageOrientation,
  PrintPageLayout,
  PrintPageOrigin,
  PrintSizeId,
} from '@/lib/printSizes'
import type {
  CanvasItem,
  ItemStyle,
  LibraryItem,
  OutlinerFolder,
  PrintMargins,
  SheetCanvas,
} from '@/types'
import { DEFAULT_CANVAS } from '@/types'

export interface CanvasState {
  sheetId: string | null
  title: string
  canvas: SheetCanvas
  items: CanvasItem[]
  /** Outliner folders (collections). */
  folders: OutlinerFolder[]
  /** Multi-select: ordered list (last = primary for focus tools). */
  selectedIds: string[]
  /**
   * Selected layout panel id (primary — last multi-selected panel).
   * Fine-tune title / content sort in left sidebar.
   */
  selectedPanelId: string | null
  /** Multi-select layout panels (marquee). Primary = last entry. */
  selectedPanelIds: string[]
  /**
   * Last successful Auto-layout options — used to tag export filenames so
   * shared files encode density / chrome / n-gon / levels / sort / gap.
   */
  lastAutoLayout: AutoLayoutExportSnapshot | null
  dirty: boolean
  maxZ: number
  /** Undo stack (document snapshots before edits). */
  past: CanvasDocSnapshot[]
  /** Redo stack. */
  future: CanvasDocSnapshot[]

  reset: () => void
  loadSheet: (payload: {
    sheetId: string
    title: string
    canvas: SheetCanvas
    items: CanvasItem[]
    folders?: OutlinerFolder[]
  }) => void
  setTitle: (title: string) => void
  setCanvas: (partial: Partial<SheetCanvas>) => void
  setPrintSize: (
    printSizeId: PrintSizeId,
    orientation?: PageOrientation,
  ) => void
  setOrientation: (orientation: PageOrientation) => void
  setShowPrintArea: (show: boolean) => void
  toggleShowPrintArea: () => void
  /** Set how many print page frames to show (1–20). Grows workspace if needed. */
  setPrintPageCount: (count: number) => void
  /** Arrange page frames: vertical | horizontal | grid | free. */
  setPrintPageLayout: (layout: PrintPageLayout) => void
  /** Set absolute board position of a free-layout page (0-based index). */
  setPrintPagePosition: (
    pageIndex: number,
    pos: PrintPageOrigin,
  ) => void
  /** Replace all free-layout page positions. */
  setPrintPagePositions: (positions: PrintPageOrigin[]) => void
  setMargins: (margins: Partial<PrintMargins>) => void
  setUniformMargin: (px: number) => void
  autoOrganize: (opts?: CheatsheetLayoutOptions) => void
  /** Apply absolute positions from AI / external packer (ids must match). */
  applyItemLayout: (
    placements: Array<{
      id: string
      x: number
      y: number
      width?: number
      height?: number
      fontSize?: number
      titleFontSize?: number
    }>,
  ) => void
  toggleGrid: () => void
  toggleSnapToGrid: () => void
  markClean: () => void
  /** Undo last document edit. */
  undo: () => void
  /** Redo last undone edit. */
  redo: () => void
  /**
   * Coalesce continuous edits (drag/resize): first mutation in the batch
   * records one history entry; further mutations until endHistoryBatch do not.
   */
  beginHistoryBatch: () => void
  endHistoryBatch: () => void

  /** Select one item (or clear with null). Replaces the selection. */
  select: (id: string | null) => void
  /** Select a layout panel (clears card selection). */
  selectPanel: (id: string | null) => void
  /**
   * Layers collection click: select all cards in the folder tree + the
   * layout panel for that collection (create a frame if missing) so the
   * left sidebar shows Panel properties / in-panel auto-layout.
   */
  selectCollectionWithPanel: (folderId: string) => void
  /**
   * Remove layout panel chrome only (cards stay on the sheet).
   * Nested child panels whose members are all inside removed panels are
   * left as-is unless their id is also listed.
   */
  removeLayoutPanels: (ids: string[]) => void
  /** Patch fields on one layout panel. */
  updateLayoutPanel: (
    id: string,
    partial: Partial<import('@/types').LayoutPanel>,
  ) => void
  /** Re-shelf cards inside a panel (after contentSort / showTitle). */
  relayoutSelectedPanel: () => void
  /**
   * Dense pack + resize cards inside the selected panel, then rebuild chrome
   * (n-gon outline included) to fully wrap content.
   */
  /**
   * Dense free-flow re-pack inside the selected panel.
   * @param shape rectangle vs n-gon chrome for this panel + nested children
   * @param gaps optional L1 / L2 / block gap overrides (px); defaults from lastAutoLayout
   * @returns status for UI toast (moved count / failure reason)
   */
  autoLayoutSelectedPanel: (
    shape?: import('@/types').PanelShape,
    gaps?: {
      l1PanelGap?: number
      l2PanelGap?: number
      blockGap?: number
    },
  ) => {
    ok: boolean
    moved: number
    total: number
    reason?: string
  }
  /**
   * Move a layout panel and its member cards by (dx, dy). Nested child panels
   * whose members are all inside this panel move with it.
   */
  moveLayoutPanelBy: (panelId: string, dx: number, dy: number) => void
  /**
   * Free-transform a layout panel (corners / edges). Member cards scale with
   * the panel box; nested child panels in the cluster rebuild chrome.
   */
  resizeLayoutPanelTo: (
    panelId: string,
    geom: { x: number; y: number; width: number; height: number },
  ) => void
  /** Shift+click: add if missing, remove if already selected. */
  toggleSelect: (id: string) => void
  /** Replace selection with explicit ids (marquee). */
  setSelectedIds: (ids: string[]) => void
  /**
   * Marquee / multi-select: cards and panels together (panels like objects).
   * Empty arrays clear that side of the selection.
   */
  setMarqueeSelection: (cardIds: string[], panelIds: string[]) => void
  addFromLibrary: (
    lib: LibraryItem,
    x: number,
    y: number,
    opts?: AddFromLibraryOptions,
  ) => string
  addCustomEquation: (latex: string, title?: string) => string
  addCustomImage: (
    imageUrl: string,
    title?: string,
    imagePath?: string,
  ) => string
  /** Insert a Mermaid process-chart card. */
  addProcessChart: (
    mermaidSource: string,
    opts?: {
      title?: string
      mermaidTheme?: import('@/types').MermaidThemeId
      mermaidKind?: import('@/types').MermaidDiagramKind
      mermaidDirection?: import('@/types').MermaidFlowDirection
      /** Free-form editor snapshot — canvas paints this (matches interactive editor). */
      processFlow?: import('@/lib/processFlowSnapshot').ProcessFlowSnapshot
      width?: number
      height?: number
    },
  ) => string
  updateItem: (id: string, partial: Partial<CanvasItem>) => void
  /** Apply the same partial to every selected id (or explicit ids). */
  updateItems: (ids: string[], partial: Partial<CanvasItem>) => void
  updateItemStyle: (id: string, style: Partial<ItemStyle>) => void
  updateItemsStyle: (ids: string[], style: Partial<ItemStyle>) => void
  moveItem: (id: string, x: number, y: number) => void
  /** Move several items by the same delta (multi-drag). */
  moveItemsBy: (
    origins: Record<string, { x: number; y: number }>,
    dx: number,
    dy: number,
  ) => void
  resizeItem: (id: string, width: number, height: number, opts?: { manual?: boolean }) => void
  /**
   * Multi-resize: apply the same width/height delta to every item in
   * `origins` (start sizes), relative to the handle card's drag.
   * @deprecated Prefer transform via handle + applyItemRects for free-transform.
   */
  resizeItemsBy: (
    origins: Record<string, { width: number; height: number }>,
    dw: number,
    dh: number,
    opts?: { manual?: boolean },
  ) => void
  /**
   * Batch-set x/y/width/height for free-transform (8 handles).
   * Keys are item ids; locked items are skipped.
   */
  applyItemRects: (
    rects: Record<
      string,
      { x: number; y: number; width: number; height: number }
    >,
    opts?: { manual?: boolean },
  ) => void
  fitItemToContent: (id: string) => void
  fitItemsToContent: (ids: string[]) => void
  removeItem: (id: string) => void
  removeItems: (ids: string[]) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  toggleItemHidden: (id: string) => void
  toggleItemLocked: (id: string) => void
  /** Mass-set hidden for all items in a folder (null = root / ungrouped). */
  setFolderHidden: (folderId: string | null, hidden: boolean) => void
  /** Mass-set locked for all items in a folder (null = root / ungrouped). */
  setFolderLocked: (folderId: string | null, locked: boolean) => void
  /** Create a folder; optional parentId nests under another collection. */
  addFolder: (name?: string, parentId?: string | null) => string
  renameFolder: (folderId: string, name: string) => void
  toggleFolderOpen: (folderId: string) => void
  deleteFolder: (folderId: string, opts?: { deleteItems?: boolean }) => void
  moveItemsToFolder: (itemIds: string[], folderId: string | null) => void
  /**
   * Move dragged items into the target item's folder and stack them
   * just above the target in z-order (outliner: appear above target).
   */
  placeItemsAbove: (targetId: string, draggedIds: string[]) => void
  /**
   * Place items relative to a target in the outliner list.
   * `before` = higher in list (higher z); `after` = lower in list (lower z).
   * Also adopts the target's folder.
   */
  placeItemsRelative: (
    itemIds: string[],
    targetItemId: string,
    position: 'before' | 'after',
  ) => void
  /**
   * Move items into a folder at the front (top of outliner / high z)
   * or back (bottom / low z) of that folder's items.
   */
  placeItemsInFolderAt: (
    itemIds: string[],
    folderId: string | null,
    edge: 'front' | 'back',
  ) => void
  /** Reparent a folder (null = top-level). Rejects cycles. */
  moveFolder: (folderId: string, parentId: string | null) => void
  /**
   * Reparent a folder and place it among siblings under `parentId`.
   * `beforeFolderId`: insert immediately before that sibling; null = append at end.
   * Rejects cycles. Reindexes sibling `order` values.
   */
  placeFolderAmong: (
    folderId: string,
    parentId: string | null,
    beforeFolderId: string | null,
  ) => void
}

/** Snapshot of undoable document fields (not sheetId / dirty alone). */
export type CanvasDocSnapshot = {
  items: CanvasItem[]
  folders: OutlinerFolder[]
  maxZ: number
  canvas: SheetCanvas
  title: string
  selectedIds: string[]
}

/** Initial document fields (no actions). */
export function emptyCanvasState() {
  return {
    sheetId: null as string | null,
    title: 'Untitled sheet',
    canvas: { ...DEFAULT_CANVAS },
    items: [] as CanvasItem[],
    folders: [] as OutlinerFolder[],
    selectedIds: [] as string[],
    selectedPanelId: null as string | null,
    selectedPanelIds: [] as string[],
    lastAutoLayout: null as AutoLayoutExportSnapshot | null,
    dirty: false,
    maxZ: 1,
    past: [] as CanvasDocSnapshot[],
    future: [] as CanvasDocSnapshot[],
  }
}
