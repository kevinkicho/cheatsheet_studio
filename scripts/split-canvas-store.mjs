import fs from 'fs'
import path from 'path'

const root = 'src/stores/canvasStore'
fs.mkdirSync(path.join(root, 'slices'), { recursive: true })

const lines = fs.readFileSync('src/stores/canvasStore.ts', 'utf8').split(/\r?\n/)
const extract = (a, b) => lines.slice(a - 1, b).join('\n')

// types: keep interface from original (lines 158-438) + re-export empty
const typesFromFile = extract(158, 438)
  .replace(/^interface CanvasState/, 'export interface CanvasState')
  .replace(/^export type CanvasDocSnapshot/, 'export type CanvasDocSnapshot')

// Fix the duplicate - original has interface then export type CanvasDocSnapshot
// Build types.ts manually from extract

const emptyBlock = extract(466, 479).replace('const empty = () =>', 'export const emptyCanvasState = () =>')

const typesHeader = `/**
 * Canvas Zustand store types + empty state.
 */
import type { AutoLayoutExportSnapshot, CheatsheetLayoutOptions } from '@/lib/autoOrganize'
import type { AddFromLibraryOptions } from '@/lib/canvasDrop'
import type {
  PageOrientation,
  PrintPageLayout,
  PrintPageOrigin,
  PrintSizeId,
} from '@/lib/printSizes'
import type {
  CanvasItem,
  ItemStyle,
  LibraryItem,
  OutlinerFolder,
  PrintMargins,
  SheetCanvas,
} from '@/types'
import { DEFAULT_CANVAS } from '@/types'

`

// Use original interface block but ensure exports
let typesBody = extract(158, 438)
if (!typesBody.startsWith('export ')) {
  typesBody = typesBody.replace(/^interface CanvasState/, 'export interface CanvasState')
}
// CanvasDocSnapshot already export type

fs.writeFileSync(
  path.join(root, 'types.ts'),
  typesHeader + typesBody + '\n\n' + emptyBlock + '\n',
)

// workspace
const ws = extract(59, 156)
  .replace(/^\/\*\* Padding/, '/** Padding')
fs.writeFileSync(
  path.join(root, 'workspace.ts'),
  `/**
 * Board / print-frame workspace sizing helpers for the canvas store.
 */
import {
  multiPageLayoutBounds,
  normalizePrintPageLayout,
  resolvePagePixels,
  type PageOrientation,
  type PrintPageLayout,
  type PrintPageOrigin,
  type PrintSizeId,
} from '@/lib/printSizes'
import { FREEFORM_WORKSPACE, type SheetCanvas } from '@/types'

` +
    ws
      .replace(/function freeformWorkspaceSize/, 'export function freeformWorkspaceSize')
      .replace(/function printFrameWorkspaceSize/, 'export function printFrameWorkspaceSize')
      .replace(/function workspaceForPages/, 'export function workspaceForPages') +
    '\n',
)

// history helpers
fs.writeFileSync(
  path.join(root, 'history.ts'),
  `/**
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
`,
)

function wrap(name, imports, body) {
  // body already has 2-space indent method fields
  return `${imports}
import type { StateCreator } from 'zustand'
import type { CanvasState } from '../types'

export const create${name}Slice: StateCreator<
  CanvasState,
  [],
  [],
  Partial<CanvasState>
> = (set, get) => ({
${body}
})
`
}

function fixHistoryFlags(s) {
  return s
    .replace(/applyingHistory = true/g, 'setApplyingHistory(true)')
    .replace(/applyingHistory = false/g, 'setApplyingHistory(false)')
}

// Sheet: reset, loadSheet, setTitle..setUniformMargin, toggleGrid, toggleSnap, markClean
const sheetBody = fixHistoryFlags(
  [extract(484, 563), extract(615, 920), extract(1070, 1087)].join('\n\n'),
)

fs.writeFileSync(
  path.join(root, 'slices/sheetSlice.ts'),
  wrap(
    'Sheet',
    `import { ORGANIZE_GRID } from '@/lib/autoOrganize'
import { normalizeCanvasItems } from '@/lib/cardDefaults'
import {
  clampPrintPageCount,
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
import { workspaceForPages } from '../workspace'
`,
    sheetBody,
  ),
)

const historyBody = `  beginHistoryBatch: () => {
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
`

fs.writeFileSync(
  path.join(root, 'slices/historySlice.ts'),
  wrap(
    'History',
    `import {
  HISTORY_MAX,
  beginHistoryBatchFlags,
  endHistoryBatchFlags,
  setApplyingHistory,
  takeDocSnapshot,
} from '../history'
`,
    historyBody,
  ),
)

fs.writeFileSync(
  path.join(root, 'slices/layoutSlice.ts'),
  wrap(
    'Layout',
    `import {
  layoutItemsInRows,
  packCheatsheetLayout,
  snapshotAutoLayoutOptions,
} from '@/lib/autoOrganize'
`,
    extract(922, 1068),
  ),
)

// selection: select, selectPanel, toggleSelect, setSelectedIds, setMarquee
fs.writeFileSync(
  path.join(root, 'slices/selectionSlice.ts'),
  wrap(
    'Selection',
    ``,
    [extract(1089, 1102), extract(1556, 1590)].join('\n\n'),
  ),
)

fs.writeFileSync(
  path.join(root, 'slices/panelsSlice.ts'),
  wrap(
    'Panels',
    `import {
  ORGANIZE_GRID,
  relayoutPanelContents,
  resizeLayoutPanelCluster,
  translateLayoutPanelCluster,
} from '@/lib/autoOrganize'
import { LAYOUT_PANEL_ACCENTS } from '@/lib/autoOrganize/constants'
import { resolvePanelMemberIds } from '@/lib/autoOrganize/panels/resolveMembers'
import { createId } from '@/lib/ids'
`,
    extract(1104, 1554),
  ),
)

fs.writeFileSync(
  path.join(root, 'slices/itemsSlice.ts'),
  wrap(
    'Items',
    `import {
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
  withBorderStyle,
} from '@/lib/cardDefaults'
import { libraryPayloadFields } from '@/lib/cardKinds'
import { createId } from '@/lib/ids'
`,
    extract(1592, 2084),
  ),
)

fs.writeFileSync(
  path.join(root, 'slices/foldersSlice.ts'),
  wrap(
    'Folders',
    `import { resyncLayoutPanelMembersFromFolders } from '@/lib/autoOrganize/panels/resolveMembers'
import { createId } from '@/lib/ids'
import type { CanvasItem } from '@/types'
`,
    extract(2086, 2568),
  ),
)

fs.writeFileSync(
  path.join(root, 'index.ts'),
  `/**
 * Canvas document store — composed from domain slices.
 * Prefer importing from \`@/stores/canvasStore\` (stable public path).
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
`,
)

fs.writeFileSync(
  'src/stores/canvasStore.ts',
  `/**
 * Canvas document store (Zustand).
 * Implementation: \`./canvasStore/\` (sliced by domain).
 */
export {
  useCanvasStore,
  type CanvasDocSnapshot,
  type CanvasState,
} from './canvasStore/index'
`,
)

console.log('OK', fs.readdirSync(root), fs.readdirSync(path.join(root, 'slices')))
