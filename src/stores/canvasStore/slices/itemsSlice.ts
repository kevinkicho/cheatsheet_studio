import {
  getPrintAwareSnapOrigin,
  ORGANIZE_GRID,
  snapToGridValue,
} from '@/lib/autoOrganize'
import {
  estimateLibraryCardSize,
  placeCardInVisibleViewport,
} from '@/lib/canvasDrop'
import {
  newCardBase,
  normalizeCanvasItem,
  withBorderStyle,
} from '@/lib/cardDefaults'
import { libraryPayloadFields } from '@/lib/cardKinds'
import { createId } from '@/lib/ids'

import type { StateCreator } from 'zustand'
import type { CanvasState } from '../types'

export const createItemsSlice: StateCreator<
  CanvasState,
  [],
  [],
  Partial<CanvasState>
> = (set, get) => ({
  addFromLibrary: (lib, x, y, opts) => {
    const id = createId('item')
    const z = get().maxZ + 1
    const estimate = estimateLibraryCardSize(lib)
    const isFigure =
      lib.type === 'figure' || lib.type === 'plot'
    // Prefer live drag-preview size when provided (WYSIWYG with ghost).
    const width =
      opts?.width != null && opts.width > 4
        ? Math.round(opts.width)
        : estimate.width
    const height =
      opts?.height != null && opts.height > 4
        ? Math.round(opts.height)
        : estimate.height
    // When size came from the measured ghost, freeze autoFit so a second
    // measure pass does not jump the card after drop.
    const matchPreview = opts?.matchPreview === true
    // All non-figure library kinds support natural measure + matchPreview
    // (definition, list, callout, code, constant, identity-set, matrix, eq, table).
    const base = newCardBase(lib.type, {
      id,
      libraryItemId: lib.id,
      title: lib.title,
      x,
      y,
      width,
      height,
      zIndex: z,
      ...libraryPayloadFields(lib),
      // Drag-drop with matchPreview: freeze ghost box (no second autoFit jump).
      // Click-add without preview: autoFit snugs via NaturalCardBody (all kinds).
      autoFit: matchPreview ? false : !isFigure,
      // At exact preview size FitContent scale ≈ 1 → paste matches the ghost.
      contentFill: true,
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
    const width = 300
    const height = 120
    const pos = placeCardInVisibleViewport(
      { width, height },
      get().items.length,
    )
    const item = newCardBase('custom-equation', {
      id,
      title,
      x: pos.x,
      y: pos.y,
      width,
      height,
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
    const width = 260
    const height = 200
    const pos = placeCardInVisibleViewport(
      { width, height },
      get().items.length,
    )
    const item = newCardBase('custom-image', {
      id,
      title,
      x: pos.x,
      y: pos.y,
      width,
      height,
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

  addProcessChart: (mermaidSource, opts) => {
    const id = createId('item')
    const z = get().maxZ + 1
    const n = get().items.length
    const width = opts?.width ?? 420
    const height = opts?.height ?? 320
    // Center in the currently visible main-canvas view (not fixed top-left)
    const pos = placeCardInVisibleViewport({ width, height }, n)
    const item = newCardBase('process-chart', {
      id,
      title: opts?.title?.trim() || 'Process chart',
      x: pos.x,
      y: pos.y,
      width,
      height,
      zIndex: z,
      mermaidSource,
      processFlow: opts?.processFlow,
      mermaidTheme: opts?.mermaidTheme ?? 'dark',
      mermaidKind: opts?.mermaidKind ?? 'flowchart',
      mermaidDirection: opts?.mermaidDirection ?? 'TD',
      autoFit: false,
      // Scale diagram SVG to card via FitContent (Properties: “Scale content to fill card”)
      contentFill: true,
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
      if (snap) {
        const { ox, oy } = getPrintAwareSnapOrigin(x, y, s.canvas)
        const nx = snapToGridValue(x, g, ox)
        const ny = snapToGridValue(y, g, oy)
        return {
          items: s.items.map((i) =>
            i.id === id ? { ...i, x: nx, y: ny } : i,
          ),
          dirty: true,
        }
      }
      return {
        items: s.items.map((i) =>
          i.id === id ? { ...i, x: Math.round(x), y: Math.round(y) } : i,
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
            const { ox, oy } = getPrintAwareSnapOrigin(nx, ny, s.canvas)
            nx = snapToGridValue(nx, g, ox)
            ny = snapToGridValue(ny, g, oy)
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
      // Allow snug autoFit cards (equations) smaller than free-transform minimums
      const minW = opts?.manual ? 80 : 40
      const minH = opts?.manual ? 48 : 32
      let w = Math.max(minW, width)
      let h = Math.max(minH, height)
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

  applyItemRects: (rects, opts) => {
    const ids = Object.keys(rects)
    if (ids.length === 0) return
    set((s) => {
      const g = Math.max(4, s.canvas.gridSpacing ?? ORGANIZE_GRID)
      const snap = s.canvas.snapToGrid && opts?.manual
      const idSet = new Set(ids)
      return {
        items: s.items.map((i) => {
          if (!idSet.has(i.id) || i.locked) return i
          const r = rects[i.id]
          if (!r) return i
          let x = r.x
          let y = r.y
          let w = Math.max(80, r.width)
          let h = Math.max(48, r.height)
          if (snap) {
            const { ox, oy } = getPrintAwareSnapOrigin(x, y, s.canvas)
            x = snapToGridValue(x, g, ox)
            y = snapToGridValue(y, g, oy)
            w = Math.max(g, snapToGridValue(w, g))
            h = Math.max(g, snapToGridValue(h, g))
          } else {
            x = Math.round(x)
            y = Math.round(y)
            w = Math.round(w)
            h = Math.round(h)
          }
          if (!Number.isFinite(x) || !Number.isFinite(y)) return i
          return {
            ...i,
            x,
            y,
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
    // Snug card chrome to content: re-enable autoFit and turn OFF fill-scale so
    // letterboxed gutters (contentFill + tall card) collapse. See FitContent docs.
    set((s) => ({
      items: s.items.map((i) =>
        setIds.has(i.id)
          ? {
              ...i,
              autoFit: true,
              contentFill: false,
              contentFitKey: (i.contentFitKey ?? 0) + 1,
            }
          : i,
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
    set((s) => {
      const panels = s.canvas.layoutPanels ?? []
      // Drop deleted cards from panel member lists (keep frames)
      const nextPanels = panels.map((p) =>
        p.memberIds?.some((id) => setIds.has(id))
          ? {
              ...p,
              memberIds: p.memberIds.filter((id) => !setIds.has(id)),
            }
          : p,
      )
      return {
        items: s.items.filter((i) => !setIds.has(i.id)),
        selectedIds: s.selectedIds.filter((x) => !setIds.has(x)),
        dirty: true,
        canvas:
          nextPanels === panels
            ? s.canvas
            : { ...s.canvas, layoutPanels: nextPanels },
      }
    })
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
})
