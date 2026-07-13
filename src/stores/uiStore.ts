import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppView = 'workspace' | 'library' | 'sheets'
export type RightTool = 'layers' | 'equation' | 'image' | 'process'
/** Canvas pointer tool — exclusive (only one active). */
export type CanvasTool = 'select' | 'pan'
/** Bottom / full library presentation. */
export type LibraryLayout = 'cards' | 'list'
/** Type filter for library panels (`all` = no type restriction). */
export type LibraryTypeFilter = 'all' | 'equation' | 'table' | 'figure'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.1

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
}

interface UiState {
  view: AppView
  leftOpen: boolean
  rightOpen: boolean
  bottomOpen: boolean
  /** Main canvas minimap (bottom-right overview). */
  minimapOpen: boolean
  rightTool: RightTool
  /** Subject id or `'all'`. */
  librarySubject: string
  librarySearch: string
  /** Topic name or `'all'`. */
  libraryTopic: string
  /** Item type filter (replaces equations-only when not `all`). */
  libraryTypeFilter: LibraryTypeFilter
  /** Hide equation/table/figure previews; show title labels only (cards layout). */
  libraryLabelsOnly: boolean
  /** Cards grid vs detailed list in library panels. */
  libraryLayout: LibraryLayout
  /** Hover full-preview tooltip for library cards. */
  libraryHoverPreview: boolean
  /** Group library cards under topic headings (Algebra, Calculus, …). */
  libraryGroupByTopic: boolean
  /**
   * @deprecated Prefer libraryTypeFilter === 'equation'.
   * Kept for older UI toggles / persisted state.
   */
  libraryEquationsOnly: boolean
  /**
   * Library item ids the user starred (persisted). Filter "Favorites" uses this.
   * Separate from canvas-card `starred` (sheet-local).
   */
  libraryFavoriteIds: string[]
  /** When true, library list shows only favorited catalog items. */
  libraryFavoritesOnly: boolean
  /**
   * When true, hidden canvas cards still render (dimmed) so you can find them.
   * Default false — Layers eye-off items stay off the board.
   */
  canvasShowHiddenItems: boolean
  /** Canvas viewport zoom (1 = 100%). */
  canvasZoom: number
  /** Active canvas tool: select (marquee / cards) or pan (hand). */
  canvasTool: CanvasTool
  /**
   * Canvas process-chart item id open in the Process interactive editor.
   * While set, canvas selection is cleared so Delete only hits the editor.
   * Not persisted — session-only edit mode.
   */
  editingProcessChartId: string | null
  /**
   * Request MainCanvas to zoom/scroll so a card is in view (e.g. Layers click).
   * Bump `token` so the same id can be requested again.
   */
  focusCanvasItemRequest: { id: string; token: number } | null
  setView: (view: AppView) => void
  setLeftOpen: (open: boolean) => void
  setRightOpen: (open: boolean) => void
  setBottomOpen: (open: boolean) => void
  setMinimapOpen: (open: boolean) => void
  toggleLeft: () => void
  toggleRight: () => void
  toggleBottom: () => void
  toggleMinimap: () => void
  setRightTool: (tool: RightTool) => void
  setEditingProcessChartId: (id: string | null) => void
  /** Open Process panel and bind the interactive editor to this canvas card. */
  beginEditProcessChart: (id: string) => void
  endEditProcessChart: () => void
  /** Zoom/scroll the main canvas to center on a card. */
  requestFocusCanvasItem: (id: string) => void
  setLibrarySubject: (subject: string) => void
  setLibrarySearch: (q: string) => void
  setLibraryTopic: (topic: string) => void
  setLibraryTypeFilter: (type: LibraryTypeFilter) => void
  setLibraryLabelsOnly: (labelsOnly: boolean) => void
  toggleLibraryLabelsOnly: () => void
  setLibraryLayout: (layout: LibraryLayout) => void
  setLibraryHoverPreview: (enabled: boolean) => void
  toggleLibraryHoverPreview: () => void
  setLibraryGroupByTopic: (group: boolean) => void
  toggleLibraryGroupByTopic: () => void
  setLibraryEquationsOnly: (only: boolean) => void
  toggleLibraryEquationsOnly: () => void
  clearLibraryFilters: () => void
  toggleLibraryFavorite: (libraryItemId: string) => void
  setLibraryFavoritesOnly: (on: boolean) => void
  toggleLibraryFavoritesOnly: () => void
  setCanvasShowHiddenItems: (on: boolean) => void
  toggleCanvasShowHiddenItems: () => void
  setCanvasZoom: (zoom: number) => void
  setCanvasTool: (tool: CanvasTool) => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      view: 'workspace',
      leftOpen: true,
      rightOpen: true,
      bottomOpen: true,
      minimapOpen: true,
      rightTool: 'layers',
      librarySubject: 'all',
      librarySearch: '',
      libraryTopic: 'all',
      libraryTypeFilter: 'all',
      libraryLabelsOnly: false,
      libraryLayout: 'cards',
      libraryHoverPreview: true,
      libraryGroupByTopic: true,
      libraryEquationsOnly: false,
      libraryFavoriteIds: [],
      libraryFavoritesOnly: false,
      canvasShowHiddenItems: false,
      canvasZoom: 1,
      canvasTool: 'select',
      editingProcessChartId: null,
      focusCanvasItemRequest: null,
      setView: (view) => set({ view }),
      setLeftOpen: (leftOpen) => set({ leftOpen }),
      setRightOpen: (rightOpen) => set({ rightOpen }),
      setBottomOpen: (bottomOpen) => set({ bottomOpen }),
      setMinimapOpen: (minimapOpen) => set({ minimapOpen }),
      toggleLeft: () => set({ leftOpen: !get().leftOpen }),
      toggleRight: () => set({ rightOpen: !get().rightOpen }),
      toggleBottom: () => set({ bottomOpen: !get().bottomOpen }),
      toggleMinimap: () => set({ minimapOpen: !get().minimapOpen }),
      setRightTool: (rightTool) =>
        set({
          rightTool,
          rightOpen: true,
          // Edit mode exit is handled by CreateProcessChartPanel unmount when
          // leaving Process (flush + endEdit). Clearing here raced with Strict
          // Mode remounts and with Edit-from-other-tool panel mounts.
        }),
      setEditingProcessChartId: (editingProcessChartId) =>
        set({ editingProcessChartId }),
      beginEditProcessChart: (id) =>
        set({
          editingProcessChartId: id,
          rightTool: 'process',
          rightOpen: true,
        }),
      endEditProcessChart: () => set({ editingProcessChartId: null }),
      requestFocusCanvasItem: (id) =>
        set((s) => ({
          focusCanvasItemRequest: {
            id,
            token: (s.focusCanvasItemRequest?.token ?? 0) + 1,
          },
        })),
      setLibrarySubject: (librarySubject) =>
        set({ librarySubject, libraryTopic: 'all' }),
      setLibrarySearch: (librarySearch) => set({ librarySearch }),
      setLibraryTopic: (libraryTopic) =>
        set({ libraryTopic: libraryTopic || 'all' }),
      setLibraryTypeFilter: (libraryTypeFilter) =>
        set({
          libraryTypeFilter,
          libraryEquationsOnly: libraryTypeFilter === 'equation',
        }),
      setLibraryLabelsOnly: (libraryLabelsOnly) => set({ libraryLabelsOnly }),
      toggleLibraryLabelsOnly: () =>
        set({ libraryLabelsOnly: !get().libraryLabelsOnly }),
      setLibraryLayout: (libraryLayout) =>
        set({
          libraryLayout: libraryLayout === 'list' ? 'list' : 'cards',
        }),
      setLibraryHoverPreview: (libraryHoverPreview) =>
        set({ libraryHoverPreview }),
      toggleLibraryHoverPreview: () =>
        set({ libraryHoverPreview: !get().libraryHoverPreview }),
      setLibraryGroupByTopic: (libraryGroupByTopic) =>
        set({ libraryGroupByTopic }),
      toggleLibraryGroupByTopic: () =>
        set({ libraryGroupByTopic: !get().libraryGroupByTopic }),
      setLibraryEquationsOnly: (libraryEquationsOnly) =>
        set({
          libraryEquationsOnly,
          libraryTypeFilter: libraryEquationsOnly ? 'equation' : 'all',
        }),
      toggleLibraryEquationsOnly: () => {
        const next = !get().libraryEquationsOnly
        set({
          libraryEquationsOnly: next,
          libraryTypeFilter: next ? 'equation' : 'all',
        })
      },
      clearLibraryFilters: () =>
        set({
          librarySubject: 'all',
          librarySearch: '',
          libraryTopic: 'all',
          libraryTypeFilter: 'all',
          libraryEquationsOnly: false,
          libraryFavoritesOnly: false,
        }),
      toggleLibraryFavorite: (libraryItemId) =>
        set((s) => {
          const setIds = new Set(s.libraryFavoriteIds)
          if (setIds.has(libraryItemId)) setIds.delete(libraryItemId)
          else setIds.add(libraryItemId)
          return { libraryFavoriteIds: [...setIds] }
        }),
      setLibraryFavoritesOnly: (libraryFavoritesOnly) =>
        set({ libraryFavoritesOnly }),
      toggleLibraryFavoritesOnly: () =>
        set({ libraryFavoritesOnly: !get().libraryFavoritesOnly }),
      setCanvasShowHiddenItems: (canvasShowHiddenItems) =>
        set({ canvasShowHiddenItems }),
      toggleCanvasShowHiddenItems: () =>
        set({ canvasShowHiddenItems: !get().canvasShowHiddenItems }),
      setCanvasZoom: (zoom) => set({ canvasZoom: clampZoom(zoom) }),
      setCanvasTool: (canvasTool) => set({ canvasTool }),
      zoomIn: () => set({ canvasZoom: clampZoom(get().canvasZoom + ZOOM_STEP) }),
      zoomOut: () => set({ canvasZoom: clampZoom(get().canvasZoom - ZOOM_STEP) }),
      zoomReset: () => set({ canvasZoom: 1 }),
    }),
    {
      name: 'cheatsheet-ui',
      version: 7,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Record<string, unknown>
        const { canvasZoom: _drop, ...rest } = p
        const equationsOnly = Boolean(p.libraryEquationsOnly)
        const rawType = String(p.libraryTypeFilter ?? '')
        const typeFilter: LibraryTypeFilter =
          rawType === 'equation' ||
          rawType === 'table' ||
          rawType === 'figure' ||
          rawType === 'all'
            ? rawType
            : equationsOnly
              ? 'equation'
              : 'all'
        const favs = Array.isArray(p.libraryFavoriteIds)
          ? (p.libraryFavoriteIds as string[]).filter(
              (x) => typeof x === 'string',
            )
          : []
        return {
          ...rest,
          canvasTool: (p.canvasTool as string) === 'pan' ? 'pan' : 'select',
          libraryEquationsOnly: typeFilter === 'equation',
          libraryLayout:
            (p.libraryLayout as string) === 'list' ? 'list' : 'cards',
          libraryTopic:
            typeof p.libraryTopic === 'string' && p.libraryTopic
              ? p.libraryTopic
              : 'all',
          libraryTypeFilter: typeFilter,
          librarySubject:
            typeof p.librarySubject === 'string' && p.librarySubject
              ? p.librarySubject
              : 'all',
          libraryFavoriteIds: favs,
          libraryFavoritesOnly: Boolean(p.libraryFavoritesOnly),
          canvasShowHiddenItems: Boolean(p.canvasShowHiddenItems),
        }
      },
      partialize: (s) => ({
        leftOpen: s.leftOpen,
        rightOpen: s.rightOpen,
        bottomOpen: s.bottomOpen,
        minimapOpen: s.minimapOpen,
        librarySubject: s.librarySubject,
        librarySearch: s.librarySearch,
        libraryTopic: s.libraryTopic,
        libraryTypeFilter: s.libraryTypeFilter,
        libraryLabelsOnly: s.libraryLabelsOnly,
        libraryLayout: s.libraryLayout,
        libraryHoverPreview: s.libraryHoverPreview,
        libraryGroupByTopic: s.libraryGroupByTopic,
        libraryEquationsOnly: s.libraryEquationsOnly,
        libraryFavoriteIds: s.libraryFavoriteIds,
        libraryFavoritesOnly: s.libraryFavoritesOnly,
        canvasShowHiddenItems: s.canvasShowHiddenItems,
        canvasTool: s.canvasTool,
      }),
    },
  ),
)

export { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP }
