import {
  layoutItemsInRows,
  packCheatsheetLayout,
  resolveCardOverlaps,
  snapshotAutoLayoutOptions,
  type CheatsheetLayoutOptions,
} from '@/lib/autoOrganize'
import { ORGANIZE_GRID } from '@/lib/autoOrganize/constants'
import {
  clampPrintPageCount,
  normalizePrintPageLayout,
} from '@/lib/printSizes'
import { DEFAULT_MARGINS, type SheetCanvas } from '@/types'
import type { StateCreator } from 'zustand'
import type { CanvasState } from '../types'

export const createLayoutSlice: StateCreator<
  CanvasState,
  [],
  [],
  Partial<CanvasState>
> = (set, get) => ({
  autoOrganize: (opts) => {
    const s = get()
    if (s.items.length === 0) return
    const configSnapshot: SheetCanvas = {
      ...s.canvas,
      width: s.canvas.width,
      height: s.canvas.height,
      margins: {
        ...DEFAULT_MARGINS,
        ...(s.canvas.margins ?? {}),
      },
    }
    const packOpts = {
      density: opts?.density ?? 'sm',
      gap: opts?.gap,
      l1PanelGap: opts?.l1PanelGap ?? opts?.gap,
      l2PanelGap: opts?.l2PanelGap,
      blockGap: opts?.blockGap,
      columns: opts?.columns ?? 'auto',
      // Free-flow mosaic (packCheatsheet ignores column shelves)
      mode: opts?.mode ?? 'flow',
      // Default panels so every group gets encapsulating frames
      groupChrome: opts?.groupChrome ?? 'panels',
      panelShape: opts?.panelShape ?? 'rect',
      // A→Z within sections so stack order is predictable
      groupSort: opts?.groupSort ?? 'name-asc',
      panelGroupLevel: opts?.panelGroupLevel ?? 1,
      // Default L1+L2+L3 so nested folder trees get stacked panels
      panelGroupLevels: opts?.panelGroupLevels ?? [1, 2, 3],
      // Per-level border + n-gon (UI multi-select) — must pass through or
      // pack always uses outermost-only stroke / default n-gon mapping.
      panelBorderLevels: opts?.panelBorderLevels ?? [1, 2, 3],
      panelNgonLevels: opts?.panelNgonLevels,
      fitPrint: opts?.fitPrint !== false,
      // Default multipage so large imports do not keep empty frames
      multiPage: opts?.multiPage !== false,
      dissolvePrintArea:
        opts?.dissolvePrintArea === true ||
        s.canvas.dissolvePrintArea === true,
      groupByFolder: opts?.groupByFolder !== false,
      panelPadding: opts?.panelPadding ?? 4,
      folders: s.folders?.map((f) => ({
        id: f.id,
        order: f.order,
        name: f.name,
        parentId: f.parentId,
      })),
    } satisfies CheatsheetLayoutOptions

    try {
      const packed = packCheatsheetLayout(s.items, configSnapshot, packOpts)
      // Pack may grow frames if content overflows; never drop below the
      // user’s multipage setup for grid/horizontal dissolve (right columns).
      const userPages = clampPrintPageCount(s.canvas.printPageCount ?? 1)
      const layout = normalizePrintPageLayout(s.canvas.printPageLayout)
      const dissolve = packOpts.dissolvePrintArea === true
      const packedPages = clampPrintPageCount(packed.printPageCount)
      const pageCount =
        dissolve && (layout === 'grid' || layout === 'horizontal')
          ? Math.max(packedPages, userPages)
          : packedPages
      // Belt-and-suspenders: never leave paint-stacked cards on the sheet
      // even if a pack sub-pass reintroduced overlaps after densify.
      const m = {
        ...DEFAULT_MARGINS,
        ...(configSnapshot.margins ?? {}),
      }
      const contentRight =
        (configSnapshot.width ?? 816) - (m.right ?? 48)
      // Prefer pack content right when we know print size from packed geometry
      const maxPackedRight = packed.items.reduce(
        (acc, it) =>
          it.hidden ? acc : Math.max(acc, it.x + it.width),
        0,
      )
      const deOverlapped = resolveCardOverlaps(packed.items, {
        grid: configSnapshot.gridSpacing ?? ORGANIZE_GRID,
        contentRight: Math.max(contentRight, maxPackedRight + 48),
      })
      // Export-19 paint: equations natural (no fill zoom); process/figures fill.
      // Preserve explicit hidden (e.g. heading banners when panels-only).
      const items = deOverlapped.map((it) => {
        if (it.hidden) return it
        const isProc =
          it.type === 'process-chart' || Boolean(it.mermaidSource)
        const isFig =
          it.type === 'figure' ||
          it.type === 'custom-image' ||
          it.type === 'plot' ||
          (Boolean(it.imageUrl) && !it.latex && !it.tableMarkdown)
        return {
          ...it,
          autoFit: false,
          contentFill: isProc || isFig,
          contentFitKey: (it.contentFitKey ?? 0) + 1,
        }
      })
      if (typeof console !== 'undefined') {
        console.info(
          '[autoOrganize] packed',
          items.filter((i) => !i.hidden).length,
          'cards',
          packOpts.density,
          packOpts.groupChrome,
          packOpts.panelShape ?? '—',
          'borders',
          packOpts.panelBorderLevels ?? 'default',
          'ngon',
          packOpts.panelNgonLevels ?? 'default',
          packed.layoutPanels.length,
          'panels',
        )
      }
      // Panel frames are fully rebuilt — drop stale selection (old ids).
      set({
        items,
        dirty: true,
        selectedIds: [],
        selectedPanelId: null,
        selectedPanelIds: [],
        lastAutoLayout: snapshotAutoLayoutOptions(packOpts),
        canvas: {
          ...get().canvas,
          printPageCount: pageCount,
          layoutPanels: packed.layoutPanels,
        },
      })
    } catch (err) {
      console.error('[autoOrganize] pack failed, falling back to row layout', err)
      const next = layoutItemsInRows(get().items, configSnapshot, {
        gap: opts?.gap,
      })
      set({ items: next, dirty: true })
      // Re-throw so Apply auto-layout UI can show a real error (not false success).
      throw err instanceof Error
        ? err
        : new Error('Auto-layout pack failed')
    }
  },

  applyItemLayout: (placements) =>
    set((s) => {
      if (placements.length === 0) return s
      const byId = new Map(placements.map((p) => [p.id, p]))
      const items = s.items.map((it) => {
        const p = byId.get(it.id)
        if (!p) return it
        return {
          ...it,
          x: Math.round(p.x),
          y: Math.round(p.y),
          width:
            typeof p.width === 'number' && p.width > 0
              ? Math.round(p.width)
              : it.width,
          height:
            typeof p.height === 'number' && p.height > 0
              ? Math.round(p.height)
              : it.height,
          autoFit: false,
          style: {
            ...it.style,
            ...(typeof p.fontSize === 'number'
              ? { fontSize: p.fontSize }
              : {}),
            ...(typeof p.titleFontSize === 'number'
              ? { titleFontSize: p.titleFontSize }
              : {}),
          },
        }
      })
      return { items, dirty: true }
    }),
})
