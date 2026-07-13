/**
 * @cheatsheet-studio/sdk
 *
 * Headless authoring for CheatSheet Studio sheets.
 * Does NOT import React, Vite, or the app UI — safe for agents/CI.
 */

export { SHEET_DOC_VERSION } from './types'
export type {
  SheetDocument,
  SheetCanvas,
  CanvasItem,
  CanvasItemType,
  FirestoreSheetPayload,
  OutlinerFolder,
  ProcessFlowSnapshotLite,
  MermaidDiagramKind,
  MermaidFlowDirection,
  MermaidThemeId,
} from './types'

export { createSheet, SheetBuilder } from './builder'
export type {
  AddEquationInput,
  AddTableInput,
  AddFigureInput,
  AddProcessInput,
} from './builder'

export { composeFromOutline, appendOutlineToSheet } from './compose'
export type { SheetOutline, OutlineBlock } from './outline'

export {
  loadSeedCatalog,
  searchCatalog,
  searchBlocks,
  listBlocks,
  listBlocksByType,
  findCatalogItem,
  getBlock,
  catalogStats,
  clearCatalogCache,
  listProcessBlocks,
  findProcessBlock,
  PROCESS_BLOCKS,
} from './catalog'
export type {
  CatalogItem,
  CatalogBlockType,
  CatalogSearchOpts,
  StudioBlock,
  ProcessBlock,
} from './catalog'

export { validateSheetDocument } from './validate'
export type { ValidateIssue, ValidateResult } from './validate'

export { autoLayoutItems, layoutSheet } from './layout'
export type { LayoutOptions, LayoutResult } from './layout'

export { readSheetFile, writeSheetFile, summarizeSheet } from './io'
export { defaultCanvas, DEFAULT_ITEM_STYLE, LETTER_PX } from './defaults'
export { createId } from './ids'

export { pushSheetToFirestore } from './firebase-push'
export type { PushOptions, PushResult } from './firebase-push'

export { pullSheetFromFirestore } from './firebase-pull'
export type { PullOptions } from './firebase-pull'

export {
  listTopicPacks,
  loadTopicPack,
  composeTopicPack,
} from './topic-packs'
export type { TopicPack, TopicPackMeta } from './topic-packs'

export { resolveCloudAuth, requireOwnerUid } from './auth'
export type { CloudAuthConfig } from './auth'

export { runDoctor } from './doctor'
export type { DoctorCheck, DoctorReport } from './doctor'

export { mergeSheets } from './merge'
export type { MergeOptions } from './merge'

export {
  sheetToPrintHtml,
  writeSheetHtml,
  exportSheetPdf,
} from './export-print'
export type { ExportHtmlOptions, ExportPdfResult } from './export-print'
