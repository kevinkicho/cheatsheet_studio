/**
 * Document undo/redo helpers for the canvas store.
 */
import type { CanvasDocSnapshot, CanvasState } from './types'

export const HISTORY_MAX = 50

export function takeDocSnapshot(s: {
  items: CanvasState['items']
  folders: CanvasState['folders']
  maxZ: number
  canvas: CanvasState['canvas']
  title: string
  selectedIds: string[]
}): CanvasDocSnapshot {
  return {
    items: structuredClone(s.items),
    folders: structuredClone(s.folders),
    maxZ: s.maxZ,
    canvas: structuredClone(s.canvas),
    title: s.title,
    selectedIds: [...s.selectedIds],
  }
}

export let applyingHistory = false
export let historyBatchDepth = 0
export let historyBatchPushed = false

export function setApplyingHistory(v: boolean) {
  applyingHistory = v
}

export function beginHistoryBatchFlags() {
  if (historyBatchDepth === 0) historyBatchPushed = false
  historyBatchDepth += 1
}

export function endHistoryBatchFlags() {
  historyBatchDepth = Math.max(0, historyBatchDepth - 1)
  if (historyBatchDepth === 0) historyBatchPushed = false
}

export function markHistoryBatchPushed() {
  historyBatchPushed = true
}
