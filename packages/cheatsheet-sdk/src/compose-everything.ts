/**
 * Kitchen-sink sheet: every Studio catalog block (seed equations/tables/figures
 * + process flowcharts/mind maps), grouped by subject → topic for max auto-layout stress.
 *
 * Layout: uses SDK **dense shelf pack** (`packCheatsheetDocument`), not the
 * simple column waterfall in `layout.ts`. That matches the intent of Studio’s
 * Auto-layout button (variable-size mosaic). Studio’s exact grid packer
 * (`packCheatsheetLayout` in `src/lib/autoOrganize.ts`) still only runs in the
 * browser — after Import, press Auto-layout for pixel-identical Studio packing.
 */
import { createSheet } from './builder'
import { loadSeedCatalog, type CatalogItem } from './catalog'
import {
  packCheatsheetDocument,
  type CheatsheetPackOptions,
  type PackDensity,
} from './cheatsheet-pack'
import type { CanvasItem, SheetDocument } from './types'

export type ComposeEverythingOptions = {
  title?: string
  /** Skip packing (raw cascade positions). Default false. */
  noLayout?: boolean
  /**
   * Dense pack options (shelf mosaic). Prefer over legacy layout.ts columns.
   * Default: density `sm`, multipage letter, fitOnePage false.
   */
  pack?: CheatsheetPackOptions
  /** Pack density shortcut (default `sm`). */
  density?: PackDensity
  /**
   * Limit items (after stable sort) — useful for smoke tests.
   * Default: all catalog items.
   */
  limit?: number
  /** Only these subjects (case-insensitive). Default: all. */
  subjects?: string[]
  /** equation | table | figure | process — default all types present. */
  types?: Array<CatalogItem['type']>
}

/** Export-19 paint: equations/tables natural; process/figures fill the card. */
function applyExportPaintFlags(items: CanvasItem[]): CanvasItem[] {
  return items.map((it) => {
    if (it.hidden) return it
    const isProc = it.type === 'process-chart' || Boolean(it.mermaidSource)
    const isFig =
      it.type === 'figure' ||
      it.type === 'custom-image' ||
      it.type === 'plot' ||
      (Boolean(it.imageUrl) && !it.latex && !it.tableMarkdown)
    return {
      ...it,
      autoFit: false,
      contentFill: isProc || isFig,
    }
  })
}

/**
 * Dense multipage pack used by kitchen-sink (and preferred for large agent sheets).
 * Does **not** use Studio `packCheatsheetLayout` (Vite path aliases); uses SDK
 * shelf pack which places small cards side-by-side like a real cheatsheet.
 */
export function packEverythingSheet(
  sheet: SheetDocument,
  opts: CheatsheetPackOptions & { density?: PackDensity } = {},
): SheetDocument {
  const density = opts.density ?? 'sm'
  const packed = packCheatsheetDocument(sheet, {
    density,
    target: opts.target ?? 'letter',
    // Full catalog must span pages — never squash 200+ cards onto one letter page
    fitOnePage: opts.fitOnePage ?? false,
    gap: opts.gap,
    margins: opts.margins,
    pageWidth: opts.pageWidth,
    pageHeight: opts.pageHeight,
  })

  const items = applyExportPaintFlags(packed.items)
  const margins = {
    top: sheet.canvas.margins?.top ?? 48,
    bottom: sheet.canvas.margins?.bottom ?? 48,
    left: sheet.canvas.margins?.left ?? 48,
    right: sheet.canvas.margins?.right ?? 48,
  }
  // Letter frame size (not the tall packed content height)
  const frameH = opts.pageHeight ?? 1056
  const frameW = opts.pageWidth ?? 816
  const maxBottom = items.reduce(
    (m, it) => (it.hidden ? m : Math.max(m, it.y + it.height)),
    0,
  )
  // Vertical print frames stack every frameH; count from absolute board y
  const printPageCount =
    opts.fitOnePage === true
      ? 1
      : Math.min(20, Math.max(1, Math.ceil(maxBottom / Math.max(1, frameH))))

  // Board tall enough for continuous multipage y (export + freeform scroll)
  const boardH = Math.max(
    sheet.canvas.height ?? 0,
    maxBottom + margins.bottom + 96,
    printPageCount * frameH + 96,
  )
  const boardW = Math.max(sheet.canvas.width ?? 0, frameW + 96)

  return {
    ...sheet,
    items,
    canvas: {
      ...sheet.canvas,
      margins: { ...margins, ...sheet.canvas.margins },
      printSizeId: sheet.canvas.printSizeId ?? 'letter',
      orientation: sheet.canvas.orientation ?? 'portrait',
      printPageLayout: sheet.canvas.printPageLayout ?? 'vertical',
      printPageCount,
      showPrintArea: true,
      width: boardW,
      height: boardH,
    },
  }
}

function subjectKey(s?: string): string {
  const t = (s ?? 'general').trim().toLowerCase()
  return t || 'general'
}

function topicKey(s?: string): string {
  const t = (s ?? 'General').trim()
  return t || 'General'
}

function titleCaseSubject(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function escapeLatexText(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, (c) => `\\${c}`)
    .replace(/[%&#_$]/g, (c) => `\\${c}`)
}

/**
 * Build a sheet containing the full Studio catalog (or a filtered subset),
 * organized into Layers folders: Subject / Topic.
 *
 * Intended to stress Studio Auto-layout and multipage packing.
 */
export async function composeEverything(
  opts: ComposeEverythingOptions = {},
): Promise<SheetDocument> {
  let all = await loadSeedCatalog()

  if (opts.subjects?.length) {
    const want = new Set(opts.subjects.map((s) => s.trim().toLowerCase()))
    all = all.filter((i) => want.has(subjectKey(i.subject)))
  }
  if (opts.types?.length) {
    const want = new Set(opts.types)
    all = all.filter((i) => want.has(i.type))
  }

  // Stable order: subject → topic → type → title → id
  const typeOrder: Record<string, number> = {
    equation: 0,
    table: 1,
    figure: 2,
    process: 3,
  }
  all = [...all].sort((a, b) => {
    const sa = subjectKey(a.subject)
    const sb = subjectKey(b.subject)
    if (sa !== sb) return sa.localeCompare(sb)
    const ta = topicKey(a.topic)
    const tb = topicKey(b.topic)
    if (ta !== tb) return ta.localeCompare(tb)
    const oa = typeOrder[a.type] ?? 9
    const ob = typeOrder[b.type] ?? 9
    if (oa !== ob) return oa - ob
    if (a.title !== b.title) return a.title.localeCompare(b.title)
    return a.id.localeCompare(b.id)
  })

  if (opts.limit != null && opts.limit > 0) {
    all = all.slice(0, opts.limit)
  }

  if (all.length === 0) {
    throw new Error('composeEverything: catalog filter matched zero items')
  }

  const byType = all.reduce(
    (acc, i) => {
      acc[i.type] = (acc[i.type] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const builder = createSheet({
    title: opts.title ?? 'Studio Everything — Full Catalog',
    canvas: {
      printSizeId: 'letter',
      orientation: 'portrait',
      printPageCount: 1,
      showPrintArea: true,
    },
    meta: {
      createdBy: 'cli',
      source: 'composeEverything',
      notes: `Kitchen-sink sheet: ${all.length} blocks (${Object.entries(byType)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}). Stress-test auto-layout.`,
    },
  })

  // subject → topic → items
  const tree = new Map<string, Map<string, CatalogItem[]>>()
  for (const item of all) {
    const sub = subjectKey(item.subject)
    const top = topicKey(item.topic)
    if (!tree.has(sub)) tree.set(sub, new Map())
    const topics = tree.get(sub)!
    if (!topics.has(top)) topics.set(top, [])
    topics.get(top)!.push(item)
  }

  let subjectIndex = 0
  for (const [sub, topics] of tree) {
    subjectIndex++
    const subLabel = `${subjectIndex}. ${titleCaseSubject(sub)}`
    const subFolder = builder.addFolder(subLabel)
    builder.setActiveFolder(subFolder)

    // Subject banner
    builder.addEquation({
      title: subLabel,
      latex: `\\textbf{\\text{${escapeLatexText(subLabel)}}}`,
      height: 28,
      showTitle: false,
      folderId: subFolder,
    })

    let topicIndex = 0
    for (const [top, items] of topics) {
      topicIndex++
      const topLabel = `${subjectIndex}.${topicIndex} ${top}`
      const topFolder = builder.addFolder(topLabel, subFolder)
      builder.setActiveFolder(topFolder)

      builder.addEquation({
        title: topLabel,
        latex: `\\textbf{\\text{${escapeLatexText(topLabel)}}}`,
        height: 24,
        showTitle: false,
        folderId: topFolder,
      })

      for (const item of items) {
        builder.appendCatalogItem(item)
      }
    }

    builder.setActiveFolder(null)
  }

  const raw = builder.build()

  if (opts.noLayout) {
    return raw
  }

  // Dense shelf mosaic (NOT layout.ts column waterfall — that looked like
  // "no auto-layout" for 200+ tiny sections: almost all cards in one column).
  return packEverythingSheet(raw, {
    density: opts.density ?? 'sm',
    ...opts.pack,
  })
}

/** Stats helper for CLI summary without building. */
export async function everythingCatalogStats(
  opts: Pick<ComposeEverythingOptions, 'subjects' | 'types' | 'limit'> = {},
): Promise<{
  total: number
  byType: Record<string, number>
  bySubject: Record<string, number>
}> {
  let all = await loadSeedCatalog()
  if (opts.subjects?.length) {
    const want = new Set(opts.subjects.map((s) => s.trim().toLowerCase()))
    all = all.filter((i) => want.has(subjectKey(i.subject)))
  }
  if (opts.types?.length) {
    const want = new Set(opts.types)
    all = all.filter((i) => want.has(i.type))
  }
  if (opts.limit != null && opts.limit > 0) all = all.slice(0, opts.limit)
  const byType: Record<string, number> = {}
  const bySubject: Record<string, number> = {}
  for (const i of all) {
    byType[i.type] = (byType[i.type] ?? 0) + 1
    const s = subjectKey(i.subject)
    bySubject[s] = (bySubject[s] ?? 0) + 1
  }
  return { total: all.length, byType, bySubject }
}
