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
  DEFAULT_ITEM_STYLE,
  DEFAULT_MARGINS,
  FREEFORM_WORKSPACE,
  type CanvasItem,
  type LibraryItem,
  type PrintMargins,
  type SheetCanvas,
  type ItemStyle,
} from '@/types'

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
  selectedId: string | null
  dirty: boolean
  maxZ: number

  reset: () => void
  loadSheet: (payload: {
    sheetId: string
    title: string
    canvas: SheetCanvas
    items: CanvasItem[]
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

  select: (id: string | null) => void
  addFromLibrary: (
    lib: LibraryItem,
    x: number,
    y: number,
  ) => string
  addCustomEquation: (latex: string, title?: string) => string
  addCustomImage: (imageUrl: string, title?: string, imagePath?: string) => string
  updateItem: (id: string, partial: Partial<CanvasItem>) => void
  updateItemStyle: (id: string, style: Partial<ItemStyle>) => void
  moveItem: (id: string, x: number, y: number) => void
  resizeItem: (id: string, width: number, height: number, opts?: { manual?: boolean }) => void
  fitItemToContent: (id: string) => void
  removeItem: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
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
  selectedId: null as string | null,
  dirty: false,
  maxZ: 1,
})

export const useCanvasStore = create<CanvasState>((set, get) => ({
  ...empty(),

  reset: () => set({ ...empty(), canvas: { ...DEFAULT_CANVAS } }),

  loadSheet: ({ sheetId, title, canvas, items }) => {
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
      // Always keep items — print toggle must never clear them
      items: Array.isArray(items) ? [...items] : [],
      selectedId: null,
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

  select: (id) => set({ selectedId: id }),

  addFromLibrary: (lib, x, y) => {
    const id = createId('item')
    const z = get().maxZ + 1
    const tableSize =
      lib.type === 'table' ? estimateTableSize(lib.tableMarkdown) : null
    const base: CanvasItem = {
      id,
      libraryItemId: lib.id,
      type: lib.type,
      title: lib.title,
      x,
      y,
      width:
        tableSize?.width ??
        (lib.type === 'figure' ? 240 : 280),
      height:
        tableSize?.height ??
        (lib.type === 'figure' ? 220 : 120),
      autoFit: true, // measure once on drop; organize later freezes size
      // Fill available body so title band doesn't leave tiny unused math
      contentFill: true,
      showTitle: true,
      zIndex: z,
      latex: lib.latex,
      tableMarkdown: lib.tableMarkdown,
      imageUrl: lib.imageUrl,
      imagePath: lib.imagePath,
      style: { ...DEFAULT_ITEM_STYLE },
    }
    set((s) => ({
      items: [...s.items, base],
      selectedId: id,
      maxZ: z,
      dirty: true,
    }))
    return id
  },

  addCustomEquation: (latex, title = 'Custom equation') => {
    const id = createId('item')
    const z = get().maxZ + 1
    const item: CanvasItem = {
      id,
      type: 'custom-equation',
      title,
      x: 80 + (get().items.length % 5) * 24,
      y: 80 + (get().items.length % 5) * 24,
      width: 300,
      height: 120,
      autoFit: true,
      contentFill: true,
      showTitle: true,
      zIndex: z,
      latex,
      style: { ...DEFAULT_ITEM_STYLE },
    }
    set((s) => ({
      items: [...s.items, item],
      selectedId: id,
      maxZ: z,
      dirty: true,
    }))
    return id
  },

  addCustomImage: (imageUrl, title = 'Custom image', imagePath) => {
    const id = createId('item')
    const z = get().maxZ + 1
    const item: CanvasItem = {
      id,
      type: 'custom-image',
      title,
      x: 100 + (get().items.length % 5) * 24,
      y: 100 + (get().items.length % 5) * 24,
      width: 260,
      height: 200,
      autoFit: true,
      contentFill: true,
      showTitle: true,
      zIndex: z,
      imageUrl,
      imagePath,
      style: { ...DEFAULT_ITEM_STYLE },
    }
    set((s) => ({
      items: [...s.items, item],
      selectedId: id,
      maxZ: z,
      dirty: true,
    }))
    return id
  },

  updateItem: (id, partial) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...partial } : i)),
      dirty: true,
    })),

  updateItemStyle: (id, style) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, style: { ...i.style, ...style } } : i,
      ),
      dirty: true,
    })),

  moveItem: (id, x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    set((s) => {
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

  resizeItem: (id, width, height, opts) => {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    set((s) => {
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

  fitItemToContent: (id) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, autoFit: true } : i,
      ),
      dirty: true,
    })),

  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      dirty: true,
    })),

  bringForward: (id) => {
    const z = get().maxZ + 1
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, zIndex: z } : i)),
      maxZ: z,
      dirty: true,
    }))
  },

  sendBackward: (id) => {
    set((s) => {
      const minZ = s.items.reduce((m, i) => Math.min(m, i.zIndex), Infinity)
      return {
        items: s.items.map((i) =>
          i.id === id ? { ...i, zIndex: minZ - 1 } : i,
        ),
        dirty: true,
      }
    })
  },

  bringToFront: (id) => get().bringForward(id),

  sendToBack: (id) => get().sendBackward(id),
}))
