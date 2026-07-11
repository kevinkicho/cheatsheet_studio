import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppView = 'workspace' | 'library' | 'sheets'
export type RightTool = 'layers' | 'equation' | 'image'

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
  rightTool: RightTool
  librarySubject: string
  librarySearch: string
  /** Hide equation/table/figure previews; show title labels only. */
  libraryLabelsOnly: boolean
  /** Hover full-preview tooltip for library cards. */
  libraryHoverPreview: boolean
  /** Group library cards under topic headings (Algebra, Calculus, …). */
  libraryGroupByTopic: boolean
  /** Canvas viewport zoom (1 = 100%). */
  canvasZoom: number
  setView: (view: AppView) => void
  setLeftOpen: (open: boolean) => void
  setRightOpen: (open: boolean) => void
  setBottomOpen: (open: boolean) => void
  toggleBottom: () => void
  setRightTool: (tool: RightTool) => void
  setLibrarySubject: (subject: string) => void
  setLibrarySearch: (q: string) => void
  setLibraryLabelsOnly: (labelsOnly: boolean) => void
  toggleLibraryLabelsOnly: () => void
  setLibraryHoverPreview: (enabled: boolean) => void
  toggleLibraryHoverPreview: () => void
  setLibraryGroupByTopic: (group: boolean) => void
  toggleLibraryGroupByTopic: () => void
  setCanvasZoom: (zoom: number) => void
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
      rightTool: 'layers',
      librarySubject: 'mathematics',
      librarySearch: '',
      libraryLabelsOnly: false,
      libraryHoverPreview: true,
      libraryGroupByTopic: true,
      canvasZoom: 1,
      setView: (view) => set({ view }),
      setLeftOpen: (leftOpen) => set({ leftOpen }),
      setRightOpen: (rightOpen) => set({ rightOpen }),
      setBottomOpen: (bottomOpen) => set({ bottomOpen }),
      toggleBottom: () => set({ bottomOpen: !get().bottomOpen }),
      setRightTool: (rightTool) => set({ rightTool, rightOpen: true }),
      setLibrarySubject: (librarySubject) => set({ librarySubject }),
      setLibrarySearch: (librarySearch) => set({ librarySearch }),
      setLibraryLabelsOnly: (libraryLabelsOnly) => set({ libraryLabelsOnly }),
      toggleLibraryLabelsOnly: () =>
        set({ libraryLabelsOnly: !get().libraryLabelsOnly }),
      setLibraryHoverPreview: (libraryHoverPreview) =>
        set({ libraryHoverPreview }),
      toggleLibraryHoverPreview: () =>
        set({ libraryHoverPreview: !get().libraryHoverPreview }),
      setLibraryGroupByTopic: (libraryGroupByTopic) =>
        set({ libraryGroupByTopic }),
      toggleLibraryGroupByTopic: () =>
        set({ libraryGroupByTopic: !get().libraryGroupByTopic }),
      setCanvasZoom: (zoom) => set({ canvasZoom: clampZoom(zoom) }),
      zoomIn: () => set({ canvasZoom: clampZoom(get().canvasZoom + ZOOM_STEP) }),
      zoomOut: () => set({ canvasZoom: clampZoom(get().canvasZoom - ZOOM_STEP) }),
      zoomReset: () => set({ canvasZoom: 1 }),
    }),
    {
      name: 'cheatsheet-ui',
      version: 2,
      // v2: do not persist zoom (old sessions stuck at ~40% after fit-to-letter)
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Record<string, unknown>
        // Drop canvasZoom so we always start sessions at 100%
        const { canvasZoom: _drop, ...rest } = p
        return rest
      },
      partialize: (s) => ({
        leftOpen: s.leftOpen,
        rightOpen: s.rightOpen,
        bottomOpen: s.bottomOpen,
        librarySubject: s.librarySubject,
        libraryLabelsOnly: s.libraryLabelsOnly,
        libraryHoverPreview: s.libraryHoverPreview,
        libraryGroupByTopic: s.libraryGroupByTopic,
        // canvasZoom intentionally not persisted — default 100% each load
      }),
    },
  ),
)

export { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP }
