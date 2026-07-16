import { ORGANIZE_GRID } from '@/lib/autoOrganize'
import { normalizeCanvasItems } from '@/lib/cardDefaults'
import {
  autoPrintPageOrigins,
  clampPrintPageCount,
  multiPageLayoutBounds,
  normalizePrintPageLayout,
  resizeFreePagePositions,
  resolvePagePixels,
} from '@/lib/printSizes'
import {
  DEFAULT_CANVAS,
  DEFAULT_MARGINS,
  clampGridOpacity,
  normalizeGridExtent,
} from '@/types'
import { setApplyingHistory } from '../history'
import { emptyCanvasState, type CanvasState } from '../types'
import { workspaceForPages } from '../workspace'

import type { StateCreator } from 'zustand'

export const createSheetSlice: StateCreator<
  CanvasState,
  [],
  [],
  Partial<CanvasState>
> = (set, get) => ({
  reset: () => {
    setApplyingHistory(true)
    set({ ...emptyCanvasState(), canvas: { ...DEFAULT_CANVAS } })
    setApplyingHistory(false)
  },

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
    const gridOpacity = clampGridOpacity(merged.gridOpacity)
    const gridExtent = normalizeGridExtent(merged.gridExtent)
    const margins = {
      ...DEFAULT_MARGINS,
      ...(merged.margins ?? {}),
    }
    const pageCount = clampPrintPageCount(merged.printPageCount ?? 1)
    const printPageLayout = normalizePrintPageLayout(merged.printPageLayout)
    const page = resolvePagePixels(printSizeId, orientation)
    const printPagePositions =
      printPageLayout === 'free'
        ? resizeFreePagePositions(merged.printPagePositions, page, pageCount)
        : Array.isArray(merged.printPagePositions)
          ? merged.printPagePositions.map((p) => ({
              x: Number(p?.x) || 0,
              y: Number(p?.y) || 0,
            }))
          : []
    // Print frame on → scroll limited to page layout; off → freeform board.
    const workspace = workspaceForPages(
      { ...merged, printPagePositions, printPageLayout, printPageCount: pageCount },
      printSizeId,
      orientation,
      pageCount,
      printPageLayout,
      printPagePositions,
      showPrintArea,
    )
    setApplyingHistory(true)
    set({
      sheetId,
      title,
      canvas: {
        ...merged,
        printSizeId,
        orientation,
        showPrintArea,
        printPageCount: pageCount,
        printPageLayout,
        printPagePositions,
        showGrid,
        snapToGrid,
        gridSpacing,
        gridOpacity,
        gridExtent,
        margins,
        width: workspace.width,
        height: workspace.height,
      },
      // Normalize legacy items → crisp fill + figure defaults for current + saved sheets
      items: Array.isArray(items) ? normalizeCanvasItems(items) : [],
      folders: Array.isArray(folders) ? [...folders] : [],
      selectedIds: [],
      selectedPanelId: null,
      selectedPanelIds: [],
      dirty: false,
      maxZ,
      past: [],
      future: [],
    })
    setApplyingHistory(false)
  },

  setTitle: (title) => set({ title, dirty: true }),

  setCanvas: (partial) =>
    set((s) => {
      const next = { ...s.canvas, ...partial }
      if (partial.gridOpacity !== undefined) {
        next.gridOpacity = clampGridOpacity(partial.gridOpacity)
      }
      if (partial.gridExtent !== undefined) {
        next.gridExtent = normalizeGridExtent(partial.gridExtent)
      }
      if (partial.gridSpacing !== undefined) {
        next.gridSpacing = Math.max(
          4,
          Math.min(128, Math.round(partial.gridSpacing)),
        )
      }
      if (partial.printPageCount !== undefined) {
        next.printPageCount = clampPrintPageCount(partial.printPageCount)
      }
      return { canvas: next, dirty: true }
    }),

  setPrintSize: (printSizeId, orientation) =>
    set((s) => {
      const ori = orientation ?? s.canvas.orientation ?? 'portrait'
      const pageCount = clampPrintPageCount(s.canvas.printPageCount ?? 1)
      const layout = normalizePrintPageLayout(s.canvas.printPageLayout)
      const workspace = workspaceForPages(
        s.canvas,
        printSizeId,
        ori,
        pageCount,
        layout,
        s.canvas.printPagePositions,
        true,
      )
      return {
        canvas: {
          ...s.canvas,
          printSizeId,
          orientation: ori,
          showPrintArea: true,
          printPageCount: pageCount,
          printPageLayout: layout,
          width: workspace.width,
          height: workspace.height,
        },
        dirty: true,
      }
    }),

  setOrientation: (orientation) =>
    set((s) => {
      const printSizeId = s.canvas.printSizeId ?? 'letter'
      const pageCount = clampPrintPageCount(s.canvas.printPageCount ?? 1)
      const layout = normalizePrintPageLayout(s.canvas.printPageLayout)
      const printOn = s.canvas.showPrintArea !== false
      const workspace = workspaceForPages(
        s.canvas,
        printSizeId,
        orientation,
        pageCount,
        layout,
        s.canvas.printPagePositions,
        printOn,
      )
      return {
        canvas: {
          ...s.canvas,
          orientation,
          printPageCount: pageCount,
          printPageLayout: layout,
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
      const pageCount = clampPrintPageCount(s.canvas.printPageCount ?? 1)
      const layout = normalizePrintPageLayout(s.canvas.printPageLayout)
      const workspace = workspaceForPages(
        s.canvas,
        s.canvas.printSizeId ?? 'letter',
        s.canvas.orientation ?? 'portrait',
        pageCount,
        layout,
        s.canvas.printPagePositions,
        show,
      )
      return {
        canvas: {
          ...s.canvas,
          showPrintArea: show,
          printPageCount: pageCount,
          printPageLayout: layout,
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

  setPrintPageCount: (count) =>
    set((s) => {
      const pageCount = clampPrintPageCount(count)
      const printSizeId = s.canvas.printSizeId ?? 'letter'
      const orientation = s.canvas.orientation ?? 'portrait'
      const layout = normalizePrintPageLayout(s.canvas.printPageLayout)
      const page = resolvePagePixels(printSizeId, orientation)
      const printPagePositions =
        layout === 'free'
          ? resizeFreePagePositions(
              s.canvas.printPagePositions,
              page,
              pageCount,
            )
          : s.canvas.printPagePositions ?? []
      const workspace = workspaceForPages(
        s.canvas,
        printSizeId,
        orientation,
        pageCount,
        layout,
        printPagePositions,
        true,
      )
      return {
        canvas: {
          ...s.canvas,
          printPageCount: pageCount,
          printPageLayout: layout,
          printPagePositions,
          showPrintArea: true,
          width: workspace.width,
          height: workspace.height,
        },
        dirty: true,
      }
    }),

  setPrintPageLayout: (layout) =>
    set((s) => {
      const mode = normalizePrintPageLayout(layout)
      const pageCount = clampPrintPageCount(s.canvas.printPageCount ?? 1)
      const printSizeId = s.canvas.printSizeId ?? 'letter'
      const orientation = s.canvas.orientation ?? 'portrait'
      const page = resolvePagePixels(printSizeId, orientation)
      const prevMode = normalizePrintPageLayout(s.canvas.printPageLayout)

      // Seed free positions from the previous auto layout (or keep free coords).
      let printPagePositions = s.canvas.printPagePositions ?? []
      if (mode === 'free') {
        if (
          prevMode === 'free' &&
          printPagePositions.length === pageCount
        ) {
          // keep
        } else {
          const seedFrom =
            prevMode === 'free' ? 'vertical' : (prevMode as Exclude<
              PrintPageLayout,
              'free'
            >)
          printPagePositions = autoPrintPageOrigins(
            page,
            pageCount,
            seedFrom,
          )
        }
        printPagePositions = resizeFreePagePositions(
          printPagePositions,
          page,
          pageCount,
        )
      }

      const workspace = workspaceForPages(
        s.canvas,
        printSizeId,
        orientation,
        pageCount,
        mode,
        printPagePositions,
        true,
      )
      return {
        canvas: {
          ...s.canvas,
          printPageLayout: mode,
          printPagePositions,
          printPageCount: pageCount,
          showPrintArea: true,
          width: workspace.width,
          height: workspace.height,
        },
        dirty: true,
      }
    }),

  setPrintPagePosition: (pageIndex, pos) =>
    set((s) => {
      const pageCount = clampPrintPageCount(s.canvas.printPageCount ?? 1)
      if (pageIndex < 0 || pageIndex >= pageCount) return s
      const printSizeId = s.canvas.printSizeId ?? 'letter'
      const orientation = s.canvas.orientation ?? 'portrait'
      const page = resolvePagePixels(printSizeId, orientation)
      const positions = resizeFreePagePositions(
        s.canvas.printPagePositions,
        page,
        pageCount,
      )
      positions[pageIndex] = {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
      }
      const workspace = workspaceForPages(
        s.canvas,
        printSizeId,
        orientation,
        pageCount,
        'free',
        positions,
        s.canvas.showPrintArea !== false,
      )
      return {
        canvas: {
          ...s.canvas,
          printPageLayout: 'free',
          printPagePositions: positions,
          printPageCount: pageCount,
          width: workspace.width,
          height: workspace.height,
        },
        dirty: true,
      }
    }),

  setPrintPagePositions: (positions) =>
    set((s) => {
      const pageCount = clampPrintPageCount(s.canvas.printPageCount ?? 1)
      const printSizeId = s.canvas.printSizeId ?? 'letter'
      const orientation = s.canvas.orientation ?? 'portrait'
      const page = resolvePagePixels(printSizeId, orientation)
      const next = resizeFreePagePositions(positions, page, pageCount)
      const workspace = workspaceForPages(
        s.canvas,
        printSizeId,
        orientation,
        pageCount,
        'free',
        next,
        s.canvas.showPrintArea !== false,
      )
      return {
        canvas: {
          ...s.canvas,
          printPageLayout: 'free',
          printPagePositions: next,
          printPageCount: pageCount,
          width: workspace.width,
          height: workspace.height,
        },
        dirty: true,
      }
    }),

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
})
