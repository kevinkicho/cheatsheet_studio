/**
 * Canvas document store — composed from domain slices.
 * Prefer importing from `@/stores/canvasStore` (stable public path).
 */
import { create } from 'zustand'
import {
  applyingHistory,
  HISTORY_MAX,
  historyBatchDepth,
  historyBatchPushed,
  markHistoryBatchPushed,
  setApplyingHistory,
  takeDocSnapshot,
} from './history'
import { createFoldersSlice } from './slices/foldersSlice'
import { createHistorySlice } from './slices/historySlice'
import { createItemsSlice } from './slices/itemsSlice'
import { createLayoutSlice } from './slices/layoutSlice'
import { createPanelsSlice } from './slices/panelsSlice'
import { createSelectionSlice } from './slices/selectionSlice'
import { createSheetSlice } from './slices/sheetSlice'
import { emptyCanvasState, type CanvasState } from './types'

export type { CanvasDocSnapshot, CanvasState } from './types'

export const useCanvasStore = create<CanvasState>()((...a) => ({
  ...emptyCanvasState(),
  ...createHistorySlice(...a),
  ...createSheetSlice(...a),
  ...createLayoutSlice(...a),
  ...createSelectionSlice(...a),
  ...createPanelsSlice(...a),
  ...createItemsSlice(...a),
  ...createFoldersSlice(...a),
}))

useCanvasStore.subscribe((state, prev) => {
  if (applyingHistory) return
  if (
    state.items === prev.items &&
    state.folders === prev.folders &&
    state.canvas === prev.canvas &&
    state.title === prev.title &&
    state.maxZ === prev.maxZ
  ) {
    return
  }

  if (historyBatchDepth > 0) {
    if (historyBatchPushed) return
    markHistoryBatchPushed()
  }

  const snap = takeDocSnapshot(prev)
  setApplyingHistory(true)
  useCanvasStore.setState((s) => ({
    past: [...s.past.slice(-(HISTORY_MAX - 1)), snap],
    future: [],
  }))
  setApplyingHistory(false)
})
