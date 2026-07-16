
import type { StateCreator } from 'zustand'
import type { CanvasState } from '../types'

export const createSelectionSlice: StateCreator<
  CanvasState,
  [],
  [],
  Partial<CanvasState>
> = (set, get) => ({
  select: (id) =>
    set({
      selectedIds: id ? [id] : [],
      // Selecting a card clears panels; clearing cards also clears panels
      selectedPanelId: null,
      selectedPanelIds: [],
    }),

  selectPanel: (id) =>
    set({
      selectedPanelId: id,
      selectedPanelIds: id ? [id] : [],
      selectedIds: [],
    }),

  toggleSelect: (id) =>
    set((s) => {
      if (s.selectedIds.includes(id)) {
        return {
          selectedIds: s.selectedIds.filter((x) => x !== id),
          selectedPanelId: null,
          selectedPanelIds: [],
        }
      }
      return {
        selectedIds: [...s.selectedIds, id],
        selectedPanelId: null,
        selectedPanelIds: [],
      }
    }),

  setSelectedIds: (ids) =>
    set({
      selectedIds: [...new Set(ids)],
      // Pure card selection clears panels (legacy callers)
      selectedPanelId: null,
      selectedPanelIds: [],
    }),

  setMarqueeSelection: (cardIds, panelIds) =>
    set(() => {
      const cards = [...new Set(cardIds)]
      const panels = [...new Set(panelIds)]
      return {
        selectedIds: cards,
        selectedPanelIds: panels,
        selectedPanelId:
          panels.length > 0 ? panels[panels.length - 1]! : null,
      }
    }),
})
