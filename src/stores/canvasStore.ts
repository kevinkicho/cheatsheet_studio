import { create } from 'zustand'
import { createId } from '@/lib/ids'
import { layoutItemsInRows, snapToGridValue, ORGANIZE_GRID } from '@/lib/autoOrganize'
import {
  resolvePagePixels,
  type PageOrientation,
  type PrintSizeId,
} from '@/lib/printSizes'
import {
  DEFAULT_CANVAS,
  DEFAULT_MARGINS,
  FREEFORM_WORKSPACE,
  type CanvasItem,
  type LibraryItem,
  type OutlinerFolder,
  type PrintMargins,
  type SheetCanvas,
  type ItemStyle,
} from '@/types'
import {
  normalizeCanvasItem,
  normalizeCanvasItems,
  newCardBase,
  withBorderStyle,
} from '@/lib/cardDefaults'

/** Workspace never shrinks below freeform or the print page. */
function ensureWorkspaceSize(
  width: number,
  height: number,
  printW: number,
  printH: number,
) {
  return {
    width: Math.max(width, FREEFORM_WORKSPACE.width, printW + 200),
    height: Math.max(height, FREEFORM_WORKSPACE.height, printH + 200),
  }
}

interface CanvasState {
  sheetId: string | null
  title: string
  canvas: SheetCanvas
  items: CanvasItem[]
  /** Outliner folders (collections). */
  folders: OutlinerFolder[]
  /** Multi-select: ordered list (last = primary for focus tools). */
  selectedIds: string[]
  dirty: boolean
  maxZ: number

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
  setMargins: (margins: Partial<PrintMargins>) => void
  setUniformMargin: (px: number) => void
  autoOrganize: () => void
  toggleGrid: () => void
  toggleSnapToGrid: () => void
  markClean: () => void

  /** Select one item (or clear with null). Replaces the selection. */
  select: (id: string | null) => void
  /** Shift+click: add if missing, remove if already selected. */
  toggleSelect: (id: string) => void
  /** Replace selection with explicit ids (marquee). */
  setSelectedIds: (ids: string[]) => void
  addFromLibrary: (
    lib: LibraryItem,
    x: number,
    y: number,
  ) => string
  addCustomEquation: (latex: string, title?: string) => string
  addCustomImage: (imageUrl: string, title?: string, imagePath?: string) => string
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
   */
  resizeItemsBy: (
    origins: Record<string, { width: number; height: number }>,
    dw: number,
    dh: number,
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

function estimateTableSize(markdown?: string): { width: number; height: number } {
  if (!markdown) return { width: 320, height: 200 }
  const lines = markdown
    .trim()
    .split('\n')
    .filter((l) => l.includes('|') && !/^\|?\s*[-:| ]+\s*\|?$/.test(l.trim()))
  const cols = Math.max(
    ...lines.map(
      (l) =>
        l
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|').length,
    ),
    1,
  )
  const rows = Math.max(lines.length, 1)
  return {
    width: Math.min(520, Math.max(220, cols * 88 + 40)),
    height: Math.min(480, Math.max(100, rows * 28 + 48)),
  }
}

const empty = () => ({
  sheetId: null as string | null,
  title: 'Untitled sheet',
  canvas: { ...DEFAULT_CANVAS },
  items: [] as CanvasItem[],
  folders: [] as OutlinerFolder[],
  selectedIds: [] as string[],
  dirty: false,
  maxZ: 1,
})

export const useCanvasStore = create<CanvasState>((set, get) => ({
  ...empty(),

  reset: () => set({ ...empty(), canvas: { ...DEFAULT_CANVAS } }),

  loadSheet: ({ sheetId, title, canvas, items, folders }) => {
    const maxZ = items.reduce((m, i) => Math.max(m, i.zIndex), 1)
    const merged = { ...DEFAULT_CANVAS, ...canvas }
    const printSizeId = merged.printSizeId ?? 'letter'
    const orientation = merged.orientation ?? 'portrait'
    const showPrintArea = merged.showPrintArea !== false
    const showGrid = merged.showGrid !== false
    const snapToGrid = merged.snapToGrid === true
    const gridSpacing = Math.max(
      4,
      Math.min(128, merged.gridSpacing ?? ORGANIZE_GRID),
    )
    const gridOpacity = Math.min(
      1,
      Math.max(0.05, merged.gridOpacity ?? 0.1),
    )
    const margins = {
      ...DEFAULT_MARGINS,
      ...(merged.margins ?? {}),
    }
    const page = resolvePagePixels(printSizeId, orientation)
    // Never shrink workspace to letter-only — that made cards "vanish" when
    // print frame toggled and board size jumped. Keep a large free board.
    const workspace = ensureWorkspaceSize(
      merged.width,
      merged.height,
      page.width,
      page.height,
    )
    set({
      sheetId,
      title,
      canvas: {
        ...merged,
        printSizeId,
        orientation,
        showPrintArea,
        showGrid,
        snapToGrid,
        gridSpacing,
        gridOpacity,
        margins,
        width: workspace.width,
        height: workspace.height,
      },
      // Normalize legacy items → crisp fill + figure defaults for current + saved sheets
      items: Array.isArray(items) ? normalizeCanvasItems(items) : [],
      folders: Array.isArray(folders) ? [...folders] : [],
      selectedIds: [],
      dirty: false,
      maxZ,
    })
  },

  setTitle: (title) => set({ title, dirty: true }),

  setCanvas: (partial) =>
    set((s) => ({ canvas: { ...s.canvas, ...partial }, dirty: true })),

  setPrintSize: (printSizeId, orientation) =>
    set((s) => {
      const ori = orientation ?? s.canvas.orientation ?? 'portrait'
      const page = resolvePagePixels(printSizeId, ori)
      const workspace = ensureWorkspaceSize(
        s.canvas.width,
        s.canvas.height,
        page.width,
        page.height,
      )
      return {
        canvas: {
          ...s.canvas,
          printSizeId,
          orientation: ori,
          showPrintArea: true,
          // Grow workspace if needed; never shrink; never touch items
          width: workspace.width,
          height: workspace.height,
        },
        dirty: true,
      }
    }),

  setOrientation: (orientation) =>
    set((s) => {
      const printSizeId = s.canvas.printSizeId ?? 'letter'
      const page = resolvePagePixels(printSizeId, orientation)
      const workspace = ensureWorkspaceSize(
        s.canvas.width,
        s.canvas.height,
        page.width,
        page.height,
      )
      return {
        canvas: {
          ...s.canvas,
          orientation,
          width: workspace.width,
          height: workspace.height,
        },
        dirty: true,
      }
    }),

  /**
   * Toggle print frame chrome only.
   * Does NOT resize the workspace, change zoom, or modify items.
   */
  setShowPrintArea: (show) =>
    set((s) => {
      const page = resolvePagePixels(
        s.canvas.printSizeId ?? 'letter',
        s.canvas.orientation ?? 'portrait',
      )
      const workspace = ensureWorkspaceSize(
        s.canvas.width,
        s.canvas.height,
        page.width,
        page.height,
      )
      return {
        canvas: {
          ...s.canvas,
          showPrintArea: show,
          width: workspace.width,
          height: workspace.height,
        },
        dirty: true,
        // items intentionally unchanged
      }
    }),

  toggleShowPrintArea: () => {
    const show = get().canvas.showPrintArea !== false
    get().setShowPrintArea(!show)
  },

  setMargins: (partial) =>
    set((s) => {
      const clamp = (n: number) => Math.max(0, Math.min(400, Math.round(n)))
      const prev = { ...DEFAULT_MARGINS, ...s.canvas.margins }
      return {
        canvas: {
          ...s.canvas,
          margins: {
            top: partial.top !== undefined ? clamp(partial.top) : prev.top,
            right:
              partial.right !== undefined ? clamp(partial.right) : prev.right,
            bottom:
              partial.bottom !== undefined
                ? clamp(partial.bottom)
                : prev.bottom,
            left: partial.left !== undefined ? clamp(partial.left) : prev.left,
          },
        },
        dirty: true,
      }
    }),

  setUniformMargin: (px) => {
    const v = Math.max(0, Math.min(400, Math.round(px)))
    get().setMargins({ top: v, right: v, bottom: v, left: v })
  },

  autoOrganize: () =>
    set((s) => {
      if (s.items.length === 0) return s
      // Snapshot page size + margins at click time for grid packing
      const configSnapshot: SheetCanvas = {
        ...s.canvas,
        width: s.canvas.width,
        height: s.canvas.height,
        margins: {
          ...DEFAULT_MARGINS,
          ...(s.canvas.margins ?? {}),
        },
      }
      const next = layoutItemsInRows(s.items, configSnapshot)
      return { items: next, dirty: true }
    }),

  toggleGrid: () =>
    set((s) => ({
      canvas: { ...s.canvas, showGrid: !s.canvas.showGrid },
      dirty: true,
    })),

  toggleSnapToGrid: () =>
    set((s) => ({
      canvas: {
        ...s.canvas,
        snapToGrid: !s.canvas.snapToGrid,
        // Turning snap on usually means you want to see the grid too
        showGrid: !s.canvas.snapToGrid ? true : s.canvas.showGrid,
      },
      dirty: true,
    })),

  markClean: () => set({ dirty: false }),

  select: (id) =>
    set({ selectedIds: id ? [id] : [] }),

  toggleSelect: (id) =>
    set((s) => {
      if (s.selectedIds.includes(id)) {
        return { selectedIds: s.selectedIds.filter((x) => x !== id) }
      }
      return { selectedIds: [...s.selectedIds, id] }
    }),

  setSelectedIds: (ids) =>
    set({ selectedIds: [...new Set(ids)] }),

  addFromLibrary: (lib, x, y) => {
    const id = createId('item')
    const z = get().maxZ + 1
    const tableSize =
      lib.type === 'table' ? estimateTableSize(lib.tableMarkdown) : null
    const base = newCardBase(lib.type, {
      id,
      libraryItemId: lib.id,
      title: lib.title,
      x,
      y,
      width:
        tableSize?.width ??
        (lib.type === 'figure' ? 240 : 280),
      height:
        tableSize?.height ??
        (lib.type === 'figure' ? 220 : 120),
      zIndex: z,
      latex: lib.latex,
      tableMarkdown: lib.tableMarkdown,
      imageUrl: lib.imageUrl,
      imagePath: lib.imagePath,
    })
    set((s) => ({
      items: [...s.items, base],
      selectedIds: [id],
      maxZ: z,
      dirty: true,
    }))
    return id
  },

  addCustomEquation: (latex, title = 'Custom equation') => {
    const id = createId('item')
    const z = get().maxZ + 1
    const item = newCardBase('custom-equation', {
      id,
      title,
      x: 80 + (get().items.length % 5) * 24,
      y: 80 + (get().items.length % 5) * 24,
      width: 300,
      height: 120,
      zIndex: z,
      latex,
    })
    set((s) => ({
      items: [...s.items, item],
      selectedIds: [id],
      maxZ: z,
      dirty: true,
    }))
    return id
  },

  addCustomImage: (imageUrl, title = 'Custom image', imagePath) => {
    const id = createId('item')
    const z = get().maxZ + 1
    const item = newCardBase('custom-image', {
      id,
      title,
      x: 100 + (get().items.length % 5) * 24,
      y: 100 + (get().items.length % 5) * 24,
      width: 260,
      height: 200,
      zIndex: z,
      imageUrl,
      imagePath,
    })
    set((s) => ({
      items: [...s.items, item],
      selectedIds: [id],
      maxZ: z,
      dirty: true,
    }))
    return id
  },

  updateItem: (id, partial) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? normalizeCanvasItem({ ...i, ...partial })
          : i,
      ),
      dirty: true,
    })),

  updateItems: (ids, partial) => {
    if (ids.length === 0) return
    const setIds = new Set(ids)
    set((s) => ({
      items: s.items.map((i) =>
        setIds.has(i.id)
          ? normalizeCanvasItem({ ...i, ...partial })
          : i,
      ),
      dirty: true,
    }))
  },

  updateItemStyle: (id, style) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              style: withBorderStyle(i.style, style),
            }
          : i,
      ),
      dirty: true,
    })),

  updateItemsStyle: (ids, style) => {
    if (ids.length === 0) return
    const setIds = new Set(ids)
    set((s) => ({
      items: s.items.map((i) =>
        setIds.has(i.id)
          ? { ...i, style: withBorderStyle(i.style, style) }
          : i,
      ),
      dirty: true,
    }))
  },

  moveItem: (id, x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    set((s) => {
      const cur = s.items.find((i) => i.id === id)
      if (cur?.locked) return s
      const g = Math.max(4, s.canvas.gridSpacing ?? ORGANIZE_GRID)
      const snap = s.canvas.snapToGrid
      const nx = snap ? snapToGridValue(x, g) : Math.round(x)
      const ny = snap ? snapToGridValue(y, g) : Math.round(y)
      return {
        items: s.items.map((i) =>
          i.id === id ? { ...i, x: nx, y: ny } : i,
        ),
        dirty: true,
      }
    })
  },

  moveItemsBy: (origins, dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    const ids = Object.keys(origins)
    if (ids.length === 0) return
    set((s) => {
      const g = Math.max(4, s.canvas.gridSpacing ?? ORGANIZE_GRID)
      const snap = s.canvas.snapToGrid
      const idSet = new Set(ids)
      return {
        items: s.items.map((i) => {
          if (!idSet.has(i.id) || i.locked) return i
          const o = origins[i.id]
          if (!o) return i
          let nx = o.x + dx
          let ny = o.y + dy
          if (snap) {
            nx = snapToGridValue(nx, g)
            ny = snapToGridValue(ny, g)
          } else {
            nx = Math.round(nx)
            ny = Math.round(ny)
          }
          return { ...i, x: nx, y: ny }
        }),
        dirty: true,
      }
    })
  },

  resizeItem: (id, width, height, opts) => {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    set((s) => {
      const cur = s.items.find((i) => i.id === id)
      if (cur?.locked) return s
      const g = Math.max(4, s.canvas.gridSpacing ?? ORGANIZE_GRID)
      const snap = s.canvas.snapToGrid && opts?.manual
      let w = Math.max(80, width)
      let h = Math.max(48, height)
      if (snap) {
        w = Math.max(g, snapToGridValue(w, g))
        h = Math.max(g, snapToGridValue(h, g))
      } else {
        w = Math.round(w)
        h = Math.round(h)
      }
      return {
        items: s.items.map((i) =>
          i.id === id
            ? {
                ...i,
                width: w,
                height: h,
                autoFit: opts?.manual ? false : i.autoFit,
              }
            : i,
        ),
        dirty: true,
      }
    })
  },

  resizeItemsBy: (origins, dw, dh, opts) => {
    if (!Number.isFinite(dw) || !Number.isFinite(dh)) return
    const ids = Object.keys(origins)
    if (ids.length === 0) return
    set((s) => {
      const g = Math.max(4, s.canvas.gridSpacing ?? ORGANIZE_GRID)
      const snap = s.canvas.snapToGrid && opts?.manual
      const idSet = new Set(ids)
      return {
        items: s.items.map((i) => {
          if (!idSet.has(i.id) || i.locked) return i
          const o = origins[i.id]
          if (!o) return i
          let w = Math.max(80, o.width + dw)
          let h = Math.max(48, o.height + dh)
          if (snap) {
            w = Math.max(g, snapToGridValue(w, g))
            h = Math.max(g, snapToGridValue(h, g))
          } else {
            w = Math.round(w)
            h = Math.round(h)
          }
          return {
            ...i,
            width: w,
            height: h,
            autoFit: opts?.manual ? false : i.autoFit,
          }
        }),
        dirty: true,
      }
    })
  },

  fitItemToContent: (id) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, autoFit: true } : i,
      ),
      dirty: true,
    })),

  fitItemsToContent: (ids) => {
    if (ids.length === 0) return
    const setIds = new Set(ids)
    set((s) => ({
      items: s.items.map((i) =>
        setIds.has(i.id) ? { ...i, autoFit: true } : i,
      ),
      dirty: true,
    }))
  },

  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      selectedIds: s.selectedIds.filter((x) => x !== id),
      dirty: true,
    })),

  removeItems: (ids) => {
    if (ids.length === 0) return
    const setIds = new Set(ids)
    set((s) => ({
      items: s.items.filter((i) => !setIds.has(i.id)),
      selectedIds: s.selectedIds.filter((x) => !setIds.has(x)),
      dirty: true,
    }))
  },

  /** Move one step above the next-higher zIndex neighbor (swap). */
  bringForward: (id) => {
    set((s) => {
      const sorted = [...s.items].sort((a, b) => a.zIndex - b.zIndex)
      const idx = sorted.findIndex((i) => i.id === id)
      if (idx < 0 || idx >= sorted.length - 1) return s
      const cur = sorted[idx]
      const above = sorted[idx + 1]
      // Swap zIndex with the neighbor immediately above
      return {
        items: s.items.map((i) => {
          if (i.id === cur.id) return { ...i, zIndex: above.zIndex }
          if (i.id === above.id) return { ...i, zIndex: cur.zIndex }
          return i
        }),
        dirty: true,
      }
    })
  },

  /** Move one step below the next-lower zIndex neighbor (swap). */
  sendBackward: (id) => {
    set((s) => {
      const sorted = [...s.items].sort((a, b) => a.zIndex - b.zIndex)
      const idx = sorted.findIndex((i) => i.id === id)
      if (idx <= 0) return s
      const cur = sorted[idx]
      const below = sorted[idx - 1]
      return {
        items: s.items.map((i) => {
          if (i.id === cur.id) return { ...i, zIndex: below.zIndex }
          if (i.id === below.id) return { ...i, zIndex: cur.zIndex }
          return i
        }),
        dirty: true,
      }
    })
  },

  bringToFront: (id) => {
    const z = get().maxZ + 1
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, zIndex: z } : i)),
      maxZ: z,
      dirty: true,
    }))
  },

  sendToBack: (id) => {
    set((s) => {
      const minZ = s.items.reduce(
        (m, i) => Math.min(m, i.zIndex),
        Number.POSITIVE_INFINITY,
      )
      return {
        items: s.items.map((i) =>
          i.id === id ? { ...i, zIndex: minZ - 1 } : i,
        ),
        dirty: true,
      }
    })
  },

  toggleItemHidden: (id) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, hidden: !i.hidden } : i,
      ),
      dirty: true,
    })),

  toggleItemLocked: (id) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, locked: !i.locked } : i,
      ),
      dirty: true,
    })),

  setFolderHidden: (folderId, hidden) =>
    set((s) => {
      // Root (null): only direct ungrouped items. Folder: this folder + nested descendants.
      let folderIds: Set<string> | null = null
      if (folderId != null) {
        folderIds = new Set<string>([folderId])
        let grew = true
        while (grew) {
          grew = false
          for (const f of s.folders) {
            if (f.parentId && folderIds.has(f.parentId) && !folderIds.has(f.id)) {
              folderIds.add(f.id)
              grew = true
            }
          }
        }
      }
      return {
        items: s.items.map((i) => {
          const inFolder =
            folderId == null
              ? !i.folderId
              : Boolean(i.folderId && folderIds!.has(i.folderId))
          return inFolder ? { ...i, hidden } : i
        }),
        dirty: true,
      }
    }),

  setFolderLocked: (folderId, locked) =>
    set((s) => {
      let folderIds: Set<string> | null = null
      if (folderId != null) {
        folderIds = new Set<string>([folderId])
        let grew = true
        while (grew) {
          grew = false
          for (const f of s.folders) {
            if (f.parentId && folderIds.has(f.parentId) && !folderIds.has(f.id)) {
              folderIds.add(f.id)
              grew = true
            }
          }
        }
      }
      return {
        items: s.items.map((i) => {
          const inFolder =
            folderId == null
              ? !i.folderId
              : Boolean(i.folderId && folderIds!.has(i.folderId))
          return inFolder ? { ...i, locked } : i
        }),
        dirty: true,
      }
    }),

  addFolder: (name = 'Collection', parentId = null) => {
    const id = createId('folder')
    set((s) => {
      const order =
        s.folders.reduce((m, f) => Math.max(m, f.order ?? 0), 0) + 1
      let finalName = name
      let n = 1
      while (s.folders.some((f) => f.name === finalName)) {
        n += 1
        finalName = `${name} ${n}`
      }
      // Only nest under an existing parent
      const parent =
        parentId && s.folders.some((f) => f.id === parentId) ? parentId : null
      // Ensure parent is open so the new child is visible
      const folders = s.folders.map((f) =>
        parent && f.id === parent ? { ...f, open: true } : f,
      )
      return {
        folders: [
          ...folders,
          { id, name: finalName, open: true, order, parentId: parent },
        ],
        dirty: true,
      }
    })
    return id
  },

  renameFolder: (folderId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === folderId ? { ...f, name: trimmed } : f,
      ),
      dirty: true,
    }))
  },

  toggleFolderOpen: (folderId) =>
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === folderId ? { ...f, open: f.open === false } : f,
      ),
      dirty: true,
    })),

  deleteFolder: (folderId, opts) =>
    set((s) => {
      // Collect this folder + all descendants
      const toRemove = new Set<string>()
      const walk = (id: string) => {
        toRemove.add(id)
        for (const f of s.folders) {
          if (f.parentId === id) walk(f.id)
        }
      }
      walk(folderId)

      if (opts?.deleteItems) {
        return {
          folders: s.folders.filter((f) => !toRemove.has(f.id)),
          items: s.items.filter(
            (i) => !i.folderId || !toRemove.has(i.folderId),
          ),
          selectedIds: s.selectedIds.filter((id) => {
            const it = s.items.find((i) => i.id === id)
            return !it || !it.folderId || !toRemove.has(it.folderId)
          }),
          dirty: true,
        }
      }
      // Keep items & child folders: promote children of deleted root to parent of deleted
      const deleted = s.folders.find((f) => f.id === folderId)
      const promoteTo = deleted?.parentId ?? null
      return {
        folders: s.folders
          .filter((f) => f.id !== folderId)
          .map((f) =>
            f.parentId === folderId ? { ...f, parentId: promoteTo } : f,
          ),
        items: s.items.map((i) =>
          i.folderId === folderId ? { ...i, folderId: promoteTo } : i,
        ),
        dirty: true,
      }
    }),

  moveItemsToFolder: (itemIds, folderId) => {
    if (itemIds.length === 0) return
    const idSet = new Set(itemIds)
    set((s) => ({
      items: s.items.map((i) =>
        idSet.has(i.id) ? { ...i, folderId: folderId } : i,
      ),
      dirty: true,
    }))
  },

  placeItemsAbove: (targetId, draggedIds) => {
    get().placeItemsRelative(draggedIds, targetId, 'before')
  },

  placeItemsRelative: (itemIds, targetItemId, position) => {
    const unique = [...new Set(itemIds)].filter((id) => id !== targetItemId)
    if (unique.length === 0) return
    set((s) => {
      const target = s.items.find((i) => i.id === targetItemId)
      if (!target) return s
      const folderId = target.folderId ?? null
      const idSet = new Set(unique)

      // Sibling items in same folder after move (excluding dragged), high z first
      const siblings = s.items
        .filter(
          (i) =>
            (i.folderId ?? null) === folderId &&
            !idSet.has(i.id) &&
            i.id !== targetItemId,
        )
        .sort((a, b) => b.zIndex - a.zIndex)

      // Outliner list order (top → bottom): higher z first
      // before target → insert immediately above target in list
      // after target → insert immediately below target in list
      const above = siblings.filter((i) => i.zIndex > target.zIndex)
      const below = siblings.filter((i) => i.zIndex < target.zIndex)

      const dragged = unique
        .map((id) => s.items.find((i) => i.id === id))
        .filter(Boolean) as CanvasItem[]
      dragged.sort((a, b) => b.zIndex - a.zIndex)

      const sequence: CanvasItem[] =
        position === 'before'
          ? [...above, ...dragged, target, ...below]
          : [...above, target, ...dragged, ...below]

      // Assign descending z so list order is preserved
      const base = Math.max(s.maxZ, sequence.length) + sequence.length
      const zAssign = new Map<string, number>()
      sequence.forEach((it, idx) => {
        zAssign.set(it.id, base - idx)
      })

      return {
        items: s.items.map((i) => {
          if (i.id === targetItemId) {
            return {
              ...i,
              zIndex: zAssign.get(i.id) ?? i.zIndex,
            }
          }
          if (!idSet.has(i.id)) {
            const z = zAssign.get(i.id)
            return z != null ? { ...i, zIndex: z } : i
          }
          return {
            ...i,
            folderId,
            zIndex: zAssign.get(i.id) ?? i.zIndex,
          }
        }),
        maxZ: Math.max(s.maxZ, base),
        dirty: true,
      }
    })
  },

  placeItemsInFolderAt: (itemIds, folderId, edge) => {
    const unique = [...new Set(itemIds)]
    if (unique.length === 0) return
    set((s) => {
      const idSet = new Set(unique)
      const others = s.items
        .filter(
          (i) =>
            (i.folderId ?? null) === folderId && !idSet.has(i.id),
        )
        .sort((a, b) => b.zIndex - a.zIndex)

      const dragged = unique
        .map((id) => s.items.find((i) => i.id === id))
        .filter(Boolean) as CanvasItem[]
      dragged.sort((a, b) => b.zIndex - a.zIndex)

      const sequence =
        edge === 'front' ? [...dragged, ...others] : [...others, ...dragged]

      const base = Math.max(s.maxZ, sequence.length) + sequence.length
      const zAssign = new Map<string, number>()
      sequence.forEach((it, idx) => {
        zAssign.set(it.id, base - idx)
      })

      return {
        items: s.items.map((i) => {
          if (!idSet.has(i.id) && !zAssign.has(i.id)) return i
          if (idSet.has(i.id)) {
            return {
              ...i,
              folderId,
              zIndex: zAssign.get(i.id) ?? i.zIndex,
            }
          }
          return { ...i, zIndex: zAssign.get(i.id) ?? i.zIndex }
        }),
        maxZ: Math.max(s.maxZ, base),
        dirty: true,
      }
    })
  },

  moveFolder: (folderId, parentId) => {
    // Append at end of new parent's children
    get().placeFolderAmong(folderId, parentId, null)
  },

  placeFolderAmong: (folderId, parentId, beforeFolderId) => {
    if (folderId === parentId) return
    if (beforeFolderId === folderId) return
    set((s) => {
      // Reject cycles
      if (parentId) {
        const descendants = new Set<string>()
        const walk = (id: string) => {
          descendants.add(id)
          for (const f of s.folders) {
            if (f.parentId === id) walk(f.id)
          }
        }
        walk(folderId)
        if (descendants.has(parentId)) return s
        if (!s.folders.some((f) => f.id === parentId)) return s
      }

      // Sibling folders under parentId, excluding the one being moved
      const siblings = s.folders
        .filter(
          (f) =>
            f.id !== folderId && (f.parentId ?? null) === (parentId ?? null),
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

      const next: OutlinerFolder[] = []
      let inserted = false
      for (const sib of siblings) {
        if (beforeFolderId && sib.id === beforeFolderId) {
          next.push({
            id: folderId,
            name: '',
            order: 0,
            parentId: parentId ?? null,
          } as OutlinerFolder)
          inserted = true
        }
        next.push(sib)
      }
      if (!inserted) {
        // Append (or beforeFolderId not found)
        next.push({
          id: folderId,
          name: '',
          order: 0,
          parentId: parentId ?? null,
        } as OutlinerFolder)
      }

      // Build order map for all siblings including moved
      const orderMap = new Map<string, number>()
      next.forEach((f, idx) => {
        orderMap.set(f.id, idx + 1)
      })

      return {
        folders: s.folders.map((f) => {
          if (f.id === folderId) {
            return {
              ...f,
              parentId: parentId ?? null,
              order: orderMap.get(f.id) ?? f.order,
            }
          }
          if (orderMap.has(f.id)) {
            return { ...f, order: orderMap.get(f.id) }
          }
          // Open destination parent
          if (parentId && f.id === parentId) {
            return { ...f, open: true }
          }
          return f
        }),
        dirty: true,
      }
    })
  },
}))
