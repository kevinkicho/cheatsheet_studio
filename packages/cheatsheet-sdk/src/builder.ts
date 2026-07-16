import { findCatalogItem, type CatalogItem } from './catalog'
import { DEFAULT_ITEM_STYLE, defaultCanvas } from './defaults'
import { createId } from './ids'
import { layoutSheet, type LayoutOptions } from './layout'
import {
  SHEET_DOC_VERSION,
  type CanvasItem,
  type FirestoreSheetPayload,
  type MermaidDiagramKind,
  type MermaidFlowDirection,
  type MermaidThemeId,
  type OutlinerFolder,
  type SheetCanvas,
  type SheetDocument,
} from './types'
import { validateSheetDocument } from './validate'

export type AddEquationInput = {
  title?: string
  latex: string
  x?: number
  y?: number
  width?: number
  height?: number
  libraryItemId?: string
  /** Section banners set false so title text is not duplicated in the body. */
  showTitle?: boolean
  /** Layers folder id (defaults to active folder from setActiveFolder). */
  folderId?: string | null
}

export type AddTableInput = {
  title?: string
  tableMarkdown: string
  x?: number
  y?: number
  width?: number
  height?: number
  folderId?: string | null
}

export type AddFigureInput = {
  title?: string
  imageUrl: string
  imagePath?: string
  libraryItemId?: string
  x?: number
  y?: number
  width?: number
  height?: number
  folderId?: string | null
}

export type AddProcessInput = {
  title?: string
  mermaidSource: string
  mermaidKind?: MermaidDiagramKind
  mermaidDirection?: MermaidFlowDirection
  mermaidTheme?: MermaidThemeId
  /** Optional free-form snapshot (from app export); otherwise Mermaid re-layout on open. */
  processFlow?: CanvasItem['processFlow']
  x?: number
  y?: number
  width?: number
  height?: number
  folderId?: string | null
}

type PlaceOpts = {
  title?: string
  x?: number
  y?: number
  width?: number
  height?: number
  folderId?: string | null
  libraryItemId?: string
}

export type AddDefinitionInput = PlaceOpts & {
  term: string
  body: string
}
export type AddListInput = PlaceOpts & {
  listItems: string[]
  listOrdered?: boolean
}
export type AddCalloutInput = PlaceOpts & {
  body: string
  calloutVariant?: CanvasItem['calloutVariant']
}
export type AddCodeInput = PlaceOpts & {
  code: string
  codeLanguage?: string
}
export type AddConstantInput = PlaceOpts & {
  symbol: string
  value?: string
  unit?: string
  latex?: string
  body?: string
}
export type AddIdentitySetInput = PlaceOpts & {
  identities: string[]
}
export type AddPlotInput = PlaceOpts & {
  imageUrl: string
  imagePath?: string
}
export type AddMatrixInput = PlaceOpts & {
  matrixRows?: string[][]
  latex?: string
}

/**
 * Fluent sheet builder for agents and scripts.
 * Output is a portable SheetDocument the Studio app can open (after push or import).
 */
export class SheetBuilder {
  private title: string
  private canvas: SheetCanvas
  private items: CanvasItem[] = []
  private folders: OutlinerFolder[] = []
  private meta: SheetDocument['meta']
  private nextZ = 1
  private cursorY = 48
  private cursorX = 48
  /** New cards join this folder when folderId is omitted (agent layers). */
  private activeFolderId: string | null = null

  constructor(opts?: {
    title?: string
    canvas?: Partial<SheetCanvas>
    meta?: SheetDocument['meta']
  }) {
    this.title = opts?.title?.trim() || 'Untitled sheet'
    this.canvas = defaultCanvas(opts?.canvas)
    this.meta = opts?.meta
    const m = this.canvas.margins
    this.cursorX = m.left
    this.cursorY = m.top
  }

  static fromDocument(doc: SheetDocument): SheetBuilder {
    const b = new SheetBuilder({
      title: doc.title,
      canvas: doc.canvas,
      meta: doc.meta,
    })
    b.items = [...doc.items]
    b.folders = [...(doc.folders ?? [])]
    b.nextZ =
      doc.items.reduce((m, it) => Math.max(m, it.zIndex ?? 0), 0) + 1
    return b
  }

  setTitle(title: string): this {
    this.title = title.trim() || this.title
    return this
  }

  setCanvas(partial: Partial<SheetCanvas>): this {
    this.canvas = { ...this.canvas, ...partial }
    return this
  }

  setMeta(meta: NonNullable<SheetDocument['meta']>): this {
    this.meta = { ...this.meta, ...meta }
    return this
  }

  addEquation(input: AddEquationInput): this {
    // Compact defaults for multi-column cheatsheets
    const width = input.width ?? 300
    const height = input.height ?? 72
    const folderId = this.resolveFolderId(input.folderId)
    const item: CanvasItem = {
      id: createId('eq'),
      type: 'equation',
      title: input.title ?? 'Equation',
      x: input.x ?? this.cursorX,
      y: input.y ?? this.cursorY,
      width,
      height,
      zIndex: this.nextZ++,
      latex: input.latex,
      libraryItemId: input.libraryItemId,
      autoFit: true,
      contentFill: true,
      keepAspectRatio: true,
      showTitle: input.showTitle !== false,
      folderId: folderId ?? undefined,
      style: { ...DEFAULT_ITEM_STYLE, fontSize: 14, titleFontSize: 9 },
    }
    this.items.push(item)
    this.advanceCursor(height)
    return this
  }

  addTable(input: AddTableInput): this {
    const width = input.width ?? 340
    const height = input.height ?? 140
    const folderId = this.resolveFolderId(input.folderId)
    const item: CanvasItem = {
      id: createId('tbl'),
      type: 'table',
      title: input.title ?? 'Table',
      x: input.x ?? this.cursorX,
      y: input.y ?? this.cursorY,
      width,
      height,
      zIndex: this.nextZ++,
      tableMarkdown: input.tableMarkdown,
      autoFit: true,
      contentFill: true,
      keepAspectRatio: true,
      showTitle: true,
      folderId: folderId ?? undefined,
      style: { ...DEFAULT_ITEM_STYLE },
    }
    this.items.push(item)
    this.advanceCursor(height)
    return this
  }

  addFigure(input: AddFigureInput): this {
    const width = input.width ?? 240
    const height = input.height ?? 220
    const folderId = this.resolveFolderId(input.folderId)
    const item: CanvasItem = {
      id: createId('fig'),
      type: 'figure',
      title: input.title ?? 'Figure',
      x: input.x ?? this.cursorX,
      y: input.y ?? this.cursorY,
      width,
      height,
      zIndex: this.nextZ++,
      imageUrl: input.imageUrl,
      imagePath: input.imagePath,
      libraryItemId: input.libraryItemId,
      autoFit: false,
      contentFill: true,
      keepAspectRatio: true,
      showTitle: true,
      folderId: folderId ?? undefined,
      style: { ...DEFAULT_ITEM_STYLE },
    }
    this.items.push(item)
    this.advanceCursor(height)
    return this
  }

  addProcess(input: AddProcessInput & { libraryItemId?: string }): this {
    // Room for Mermaid — too-small boxes clip diagrams in export
    const kind = input.mermaidKind ?? 'flowchart'
    const width = input.width ?? (kind === 'mindmap' ? 340 : 300)
    const height = input.height ?? (kind === 'mindmap' ? 260 : 220)
    const folderId = this.resolveFolderId(input.folderId)
    const item: CanvasItem = {
      id: createId('proc'),
      type: 'process-chart',
      title: input.title ?? (kind === 'mindmap' ? 'Mind map' : 'Process chart'),
      x: input.x ?? this.cursorX,
      y: input.y ?? this.cursorY,
      width,
      height,
      zIndex: this.nextZ++,
      mermaidSource: input.mermaidSource,
      processFlow: input.processFlow,
      mermaidKind: kind,
      mermaidDirection: input.mermaidDirection ?? 'TD',
      mermaidTheme: input.mermaidTheme ?? 'dark',
      libraryItemId: input.libraryItemId,
      autoFit: false,
      contentFill: true,
      keepAspectRatio: true,
      showTitle: true,
      folderId: folderId ?? undefined,
      style: { ...DEFAULT_ITEM_STYLE },
    }
    this.items.push(item)
    this.advanceCursor(height)
    return this
  }

  private pushCard(
    type: CanvasItem['type'],
    idPrefix: string,
    defaults: { width: number; height: number; title: string; autoFit?: boolean },
    input: PlaceOpts,
    payload: Partial<CanvasItem>,
  ): this {
    const width = input.width ?? defaults.width
    const height = input.height ?? defaults.height
    const folderId = this.resolveFolderId(input.folderId)
    const item: CanvasItem = {
      id: createId(idPrefix),
      type,
      title: input.title ?? defaults.title,
      x: input.x ?? this.cursorX,
      y: input.y ?? this.cursorY,
      width,
      height,
      zIndex: this.nextZ++,
      libraryItemId: input.libraryItemId,
      autoFit: defaults.autoFit !== false,
      contentFill: true,
      keepAspectRatio: true,
      showTitle: true,
      folderId: folderId ?? undefined,
      style: { ...DEFAULT_ITEM_STYLE },
      ...payload,
    }
    this.items.push(item)
    this.advanceCursor(height)
    return this
  }

  addDefinition(input: AddDefinitionInput): this {
    return this.pushCard(
      'definition',
      'def',
      { width: 280, height: 110, title: 'Definition' },
      input,
      { term: input.term, body: input.body },
    )
  }

  addList(input: AddListInput): this {
    const n = Math.max(input.listItems.length, 1)
    return this.pushCard(
      'list',
      'list',
      { width: 260, height: Math.min(320, 48 + n * 28), title: 'List' },
      input,
      { listItems: input.listItems, listOrdered: input.listOrdered },
    )
  }

  addCallout(input: AddCalloutInput): this {
    return this.pushCard(
      'callout',
      'note',
      { width: 280, height: 100, title: 'Callout' },
      input,
      { body: input.body, calloutVariant: input.calloutVariant ?? 'note' },
    )
  }

  addCode(input: AddCodeInput): this {
    const lines = Math.max(input.code.split('\n').length, 1)
    return this.pushCard(
      'code',
      'code',
      { width: 320, height: Math.min(360, 40 + lines * 18), title: 'Code' },
      input,
      { code: input.code, codeLanguage: input.codeLanguage },
    )
  }

  addConstant(input: AddConstantInput): this {
    return this.pushCard(
      'constant',
      'const',
      { width: 260, height: 80, title: 'Constant' },
      input,
      {
        symbol: input.symbol,
        value: input.value,
        unit: input.unit,
        latex: input.latex,
        body: input.body,
      },
    )
  }

  addIdentitySet(input: AddIdentitySetInput): this {
    const n = Math.max(input.identities.length, 1)
    return this.pushCard(
      'identity-set',
      'idset',
      { width: 300, height: Math.min(280, 40 + n * 36), title: 'Identities' },
      input,
      { identities: input.identities },
    )
  }

  addPlot(input: AddPlotInput): this {
    return this.pushCard(
      'plot',
      'plot',
      { width: 240, height: 220, title: 'Plot', autoFit: false },
      input,
      { imageUrl: input.imageUrl, imagePath: input.imagePath },
    )
  }

  addMatrix(input: AddMatrixInput): this {
    const rows = input.matrixRows?.length ?? 2
    const cols = input.matrixRows?.[0]?.length ?? 2
    return this.pushCard(
      'matrix',
      'mat',
      {
        width: Math.min(360, Math.max(160, cols * 48 + 48)),
        height: Math.min(280, Math.max(80, rows * 36 + 40)),
        title: 'Matrix',
      },
      input,
      { matrixRows: input.matrixRows, latex: input.latex },
    )
  }

  addFolder(name: string, parentId?: string | null): string {
    const id = createId('folder')
    this.folders.push({
      id,
      name,
      open: true,
      order: this.folders.length,
      parentId: parentId ?? null,
    })
    return id
  }

  /**
   * Cards added after this (without explicit folderId) join the folder.
   * Pass null to return to root (ungrouped).
   */
  setActiveFolder(folderId: string | null): this {
    this.activeFolderId = folderId
    return this
  }

  getActiveFolder(): string | null {
    return this.activeFolderId
  }

  private resolveFolderId(explicit?: string | null): string | null | undefined {
    if (explicit !== undefined) return explicit
    return this.activeFolderId
  }

  /**
   * Append a card from the Studio seed catalog (by id or exact/partial title).
   * Async because the catalog is loaded from monorepo seedLibrary.
   */
  async addFromCatalog(idOrTitle: string): Promise<this> {
    const item = await findCatalogItem(idOrTitle)
    if (!item) {
      throw new Error(
        `Block/catalog item not found: "${idOrTitle}". Try: cheatsheet blocks --type equation|process|figure`,
      )
    }
    this.appendCatalogItem(item)
    return this
  }

  /** Append many Studio blocks by id/title (equations, figures, process charts, …). */
  async addBlocks(idsOrTitles: string[]): Promise<this> {
    for (const id of idsOrTitles) {
      await this.addFromCatalog(id)
    }
    return this
  }

  /** Alias for addFromCatalog — agent-facing “use our blocks”. */
  async addBlock(idOrTitle: string): Promise<this> {
    return this.addFromCatalog(idOrTitle)
  }

  /** Sync append when you already have a CatalogItem / StudioBlock. */
  appendCatalogItem(item: CatalogItem): this {
    if (item.type === 'equation' && item.latex) {
      return this.addEquation({
        title: item.title,
        latex: item.latex,
        libraryItemId: item.id,
      })
    }
    if (item.type === 'table' && item.tableMarkdown) {
      return this.addTable({
        title: item.title,
        tableMarkdown: item.tableMarkdown,
      })
    }
    if (item.type === 'figure' && item.imageUrl) {
      return this.addFigure({
        title: item.title,
        imageUrl: item.imageUrl,
        libraryItemId: item.id,
      })
    }
    if (item.type === 'definition' && (item.term || item.body)) {
      return this.addDefinition({
        title: item.title,
        term: item.term ?? item.title,
        body: item.body ?? '',
        libraryItemId: item.id,
      })
    }
    if (item.type === 'list' && item.listItems?.length) {
      return this.addList({
        title: item.title,
        listItems: item.listItems,
        listOrdered: item.listOrdered,
        libraryItemId: item.id,
      })
    }
    if (item.type === 'callout' && item.body) {
      return this.addCallout({
        title: item.title,
        body: item.body,
        calloutVariant: item.calloutVariant,
        libraryItemId: item.id,
      })
    }
    if (item.type === 'code' && item.code) {
      return this.addCode({
        title: item.title,
        code: item.code,
        codeLanguage: item.codeLanguage,
        libraryItemId: item.id,
      })
    }
    if (item.type === 'constant' && (item.symbol || item.latex)) {
      return this.addConstant({
        title: item.title,
        symbol: item.symbol ?? '?',
        value: item.value,
        unit: item.unit,
        latex: item.latex,
        body: item.body,
        libraryItemId: item.id,
      })
    }
    if (item.type === 'identity-set' && item.identities?.length) {
      return this.addIdentitySet({
        title: item.title,
        identities: item.identities,
        libraryItemId: item.id,
      })
    }
    if (item.type === 'plot' && item.imageUrl) {
      return this.addPlot({
        title: item.title,
        imageUrl: item.imageUrl,
        libraryItemId: item.id,
      })
    }
    if (item.type === 'matrix' && (item.matrixRows?.length || item.latex)) {
      return this.addMatrix({
        title: item.title,
        matrixRows: item.matrixRows,
        latex: item.latex,
        libraryItemId: item.id,
      })
    }
    if (
      (item.type === 'process' || item.mermaidSource) &&
      item.mermaidSource
    ) {
      return this.addProcess({
        title: item.title,
        mermaidSource: item.mermaidSource,
        mermaidKind: item.mermaidKind ?? 'flowchart',
        mermaidDirection: item.mermaidDirection ?? 'TD',
        libraryItemId: item.id,
      })
    }
    throw new Error(
      `Block "${item.id}" (${item.type}) is missing content fields`,
    )
  }

  /**
   * Pack all items into the printable area (dense multi-column / sections when tall).
   * May raise canvas.printPageCount when content overflows one page.
   * Defaults favor tight midterm cheatsheets (dense sections).
   */
  autoLayout(opts?: LayoutOptions): this {
    const result = layoutSheet(this.items, this.canvas, {
      dense: true,
      mode: 'sections',
      ...opts,
    })
    this.items = result.items
    if (result.printPageCount > (this.canvas.printPageCount ?? 1)) {
      this.canvas = {
        ...this.canvas,
        printPageCount: result.printPageCount,
        showPrintArea: this.canvas.showPrintArea !== false,
      }
    }
    if (this.items.length > 0) {
      const last = this.items[this.items.length - 1]!
      this.cursorX = last.x
      this.cursorY = last.y + last.height + 16
      this.nextZ = last.zIndex + 1
    }
    return this
  }

  private advanceCursor(height: number) {
    this.cursorY += height + 16
  }

  toDocument(): SheetDocument {
    return {
      v: SHEET_DOC_VERSION,
      title: this.title,
      canvas: this.canvas,
      items: this.items.map((it) => ({ ...it })),
      folders: this.folders.map((f) => ({ ...f })),
      meta: this.meta,
    }
  }

  /** Validate and return document (throws on failure). */
  build(): SheetDocument {
    const doc = this.toDocument()
    const result = validateSheetDocument(doc)
    if (!result.ok) {
      const msg = result.issues.map((i) => `${i.path}: ${i.message}`).join('; ')
      throw new Error(`Invalid sheet document: ${msg}`)
    }
    return result.sheet
  }

  /** Firestore body compatible with the app’s sheets collection. */
  toFirestorePayload(ownerId: string, opts?: { createdAt?: boolean }): FirestoreSheetPayload {
    const doc = this.build()
    const now = Date.now()
    return {
      ownerId,
      title: doc.title,
      updatedAt: now,
      ...(opts?.createdAt !== false ? { createdAt: now } : {}),
      canvas: doc.canvas,
      items: doc.items,
      folders: doc.folders,
    }
  }
}

export function createSheet(opts?: {
  title?: string
  canvas?: Partial<SheetCanvas>
  meta?: SheetDocument['meta']
}): SheetBuilder {
  return new SheetBuilder(opts)
}
