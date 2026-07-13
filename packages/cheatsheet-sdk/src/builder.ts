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
}

export type AddTableInput = {
  title?: string
  tableMarkdown: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export type AddFigureInput = {
  title?: string
  imageUrl: string
  imagePath?: string
  x?: number
  y?: number
  width?: number
  height?: number
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
    const width = input.width ?? 360
    const height = input.height ?? 88
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
      showTitle: true,
      style: { ...DEFAULT_ITEM_STYLE },
    }
    this.items.push(item)
    this.advanceCursor(height)
    return this
  }

  addTable(input: AddTableInput): this {
    const width = input.width ?? 420
    const height = input.height ?? 160
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
      style: { ...DEFAULT_ITEM_STYLE },
    }
    this.items.push(item)
    this.advanceCursor(height)
    return this
  }

  addFigure(input: AddFigureInput): this {
    const width = input.width ?? 240
    const height = input.height ?? 220
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
      autoFit: false,
      contentFill: true,
      keepAspectRatio: true,
      showTitle: true,
      style: { ...DEFAULT_ITEM_STYLE },
    }
    this.items.push(item)
    this.advanceCursor(height)
    return this
  }

  addProcess(input: AddProcessInput): this {
    const width = input.width ?? 480
    const height = input.height ?? 360
    const kind = input.mermaidKind ?? 'flowchart'
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
      autoFit: false,
      contentFill: true,
      keepAspectRatio: true,
      showTitle: true,
      style: { ...DEFAULT_ITEM_STYLE },
    }
    this.items.push(item)
    this.advanceCursor(height)
    return this
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
   * Append a card from the Studio seed catalog (by id or exact/partial title).
   * Async because the catalog is loaded from monorepo seedLibrary.
   */
  async addFromCatalog(idOrTitle: string): Promise<this> {
    const item = await findCatalogItem(idOrTitle)
    if (!item) {
      throw new Error(`Catalog item not found: "${idOrTitle}"`)
    }
    this.appendCatalogItem(item)
    return this
  }

  /** Sync append when you already have a CatalogItem. */
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
      })
    }
    throw new Error(
      `Catalog item "${item.id}" (${item.type}) is missing content fields`,
    )
  }

  /**
   * Pack all items into the printable area (dense multi-column / sections when tall).
   * May raise canvas.printPageCount when content overflows one page.
   */
  autoLayout(opts?: LayoutOptions): this {
    const result = layoutSheet(this.items, this.canvas, opts)
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
