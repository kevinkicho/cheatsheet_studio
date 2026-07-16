import {
  HISTORY_MAX,
  beginHistoryBatchFlags,
  endHistoryBatchFlags,
  setApplyingHistory,
  takeDocSnapshot,
} from '../history'

import type { StateCreator } from 'zustand'
import type { CanvasState } from '../types'

export const createHistorySlice: StateCreator<
  CanvasState,
  [],
  [],
  Partial<CanvasState>
> = (set, get) => ({
  beginHistoryBatch: () => {
    beginHistoryBatchFlags()
  },

  endHistoryBatch: () => {
    endHistoryBatchFlags()
  },

  undo: () => {
    const s = get()
    if (s.past.length === 0) return
    const prev = s.past[s.past.length - 1]!
    const current = takeDocSnapshot(s)
    setApplyingHistory(true)
    set({
      items: prev.items,
      folders: prev.folders,
      maxZ: prev.maxZ,
      canvas: prev.canvas,
      title: prev.title,
      selectedIds: prev.selectedIds,
      past: s.past.slice(0, -1),
      future: [current, ...s.future].slice(0, HISTORY_MAX),
      dirty: true,
    })
    setApplyingHistory(false)
  },

  redo: () => {
    const s = get()
    if (s.future.length === 0) return
    const next = s.future[0]!
    const current = takeDocSnapshot(s)
    setApplyingHistory(true)
    set({
      items: next.items,
      folders: next.folders,
      maxZ: next.maxZ,
      canvas: next.canvas,
      title: next.title,
      selectedIds: next.selectedIds,
      past: [...s.past, current].slice(-HISTORY_MAX),
      future: s.future.slice(1),
      dirty: true,
    })
    setApplyingHistory(false)
  },

})
