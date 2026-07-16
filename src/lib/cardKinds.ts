/**
 * Card-kind helpers: labels, type guards, payload detection for all tiers.
 * Keep UI / pack / export kind logic here so new types don't scatter.
 */
import type {
  CalloutVariant,
  CanvasItem,
  CanvasItemType,
  LibraryItem,
  LibraryItemType,
} from '@/types'
import { LIBRARY_ITEM_TYPES } from '@/types'

export type CardKind =
  | LibraryItemType
  | 'process-chart'
  | 'custom-equation'
  | 'custom-image'

export const CARD_KIND_LABELS: Record<CardKind, string> = {
  equation: 'Equation',
  table: 'Table',
  figure: 'Figure',
  definition: 'Definition',
  list: 'List',
  callout: 'Callout',
  code: 'Code',
  constant: 'Constant',
  'identity-set': 'Identity set',
  plot: 'Plot',
  matrix: 'Matrix',
  'process-chart': 'Process',
  'custom-equation': 'Custom equation',
  'custom-image': 'Custom image',
}

/** Short filter labels for library type dropdowns. */
export const LIBRARY_TYPE_FILTER_OPTIONS: {
  id: LibraryItemType | 'all'
  label: string
}[] = [
  { id: 'all', label: 'All types' },
  ...LIBRARY_ITEM_TYPES.map((id) => ({
    id,
    label: CARD_KIND_LABELS[id],
  })),
]

export function isLibraryItemType(t: string): t is LibraryItemType {
  return (LIBRARY_ITEM_TYPES as string[]).includes(t)
}

export function cardKindLabel(type: string): string {
  return CARD_KIND_LABELS[type as CardKind] ?? type
}

/** Figure-like visual (SVG/raster image body). Includes plot. */
export function isImageCard(
  item: Pick<CanvasItem, 'type' | 'imageUrl' | 'latex' | 'tableMarkdown' | 'mermaidSource'>,
): boolean {
  if (item.type === 'process-chart' || item.mermaidSource) return false
  if (item.type === 'figure' || item.type === 'custom-image' || item.type === 'plot') {
    return true
  }
  return Boolean(item.imageUrl) && !item.latex && !item.tableMarkdown
}

export function isProcessCard(
  item: Pick<CanvasItem, 'type' | 'mermaidSource' | 'processFlow'>,
): boolean {
  return (
    item.type === 'process-chart' ||
    Boolean(item.mermaidSource) ||
    Boolean(item.processFlow)
  )
}

export function isEquationCard(
  item: Pick<CanvasItem, 'type' | 'latex'>,
): boolean {
  return (
    item.type === 'equation' ||
    item.type === 'custom-equation' ||
    (Boolean(item.latex) &&
      item.type !== 'matrix' &&
      item.type !== 'constant' &&
      item.type !== 'identity-set')
  )
}

export function isTableCard(
  item: Pick<CanvasItem, 'type' | 'tableMarkdown'>,
): boolean {
  return item.type === 'table' || Boolean(item.tableMarkdown)
}

export function isProseCard(type: CanvasItemType | string): boolean {
  return (
    type === 'definition' ||
    type === 'list' ||
    type === 'callout' ||
    type === 'code'
  )
}

export function isStemStructuredCard(type: CanvasItemType | string): boolean {
  return (
    type === 'constant' ||
    type === 'identity-set' ||
    type === 'matrix' ||
    type === 'plot'
  )
}

/** Text/vector-type cards that use fontSize fit (not image scale). */
export function isVectorTextCard(item: Pick<CanvasItem, 'type' | 'latex' | 'tableMarkdown'>): boolean {
  if (isEquationCard(item) || isTableCard(item)) return true
  return (
    item.type === 'definition' ||
    item.type === 'list' ||
    item.type === 'callout' ||
    item.type === 'code' ||
    item.type === 'constant' ||
    item.type === 'identity-set' ||
    item.type === 'matrix'
  )
}

export function calloutVariantOf(
  item: Pick<CanvasItem, 'calloutVariant'>,
): CalloutVariant {
  const v = item.calloutVariant
  if (v === 'tip' || v === 'info' || v === 'warn' || v === 'danger') return v
  return 'note'
}

export const CALLOUT_STYLES: Record<
  CalloutVariant,
  { border: string; bg: string; label: string; accent: string }
> = {
  note: {
    border: 'rgba(148, 163, 184, 0.55)',
    bg: 'rgba(51, 65, 85, 0.35)',
    label: 'Note',
    accent: '#94a3b8',
  },
  tip: {
    border: 'rgba(52, 211, 153, 0.55)',
    bg: 'rgba(6, 78, 59, 0.35)',
    label: 'Tip',
    accent: '#34d399',
  },
  info: {
    border: 'rgba(96, 165, 250, 0.55)',
    bg: 'rgba(30, 58, 138, 0.35)',
    label: 'Info',
    accent: '#60a5fa',
  },
  warn: {
    border: 'rgba(251, 191, 36, 0.55)',
    bg: 'rgba(120, 53, 15, 0.35)',
    label: 'Warn',
    accent: '#fbbf24',
  },
  danger: {
    border: 'rgba(248, 113, 113, 0.55)',
    bg: 'rgba(127, 29, 29, 0.35)',
    label: 'Danger',
    accent: '#f87171',
  },
}

/** Build KaTeX for a constant card when latex is missing. */
export function constantToLatex(
  item: Pick<CanvasItem, 'symbol' | 'value' | 'unit' | 'latex'>,
): string {
  if (item.latex?.trim()) return item.latex.trim()
  const sym = (item.symbol ?? '').trim() || '?'
  const val = (item.value ?? '').trim()
  const unit = (item.unit ?? '').trim()
  if (!val && !unit) return sym
  const unitPart = unit
    ? `\\,\\mathrm{${unit.replace(/([a-zA-Z]+)/g, '$1')}}`
    : ''
  // value may already include ×10^n; keep as \text if not pure math
  const isPlainMath = /^[0-9.+\-eE×x\^\{\}\\,\s]+$/.test(val)
  const valPart = isPlainMath
    ? val.replace(/×/g, '\\times ').replace(/x10/gi, '\\times 10')
    : `\\text{${val}}`
  return `${sym} = ${valPart}${unitPart}`
}

/** Build KaTeX pmatrix from matrixRows. */
export function matrixRowsToLatex(rows: string[][] | undefined): string {
  if (!rows?.length) return ''
  const body = rows
    .map((r) => r.map((c) => (c ?? '').trim() || '0').join(' & '))
    .join(' \\\\ ')
  return `\\begin{pmatrix} ${body} \\end{pmatrix}`
}

export function matrixToLatex(
  item: Pick<CanvasItem, 'latex' | 'matrixRows'>,
): string {
  if (item.latex?.trim()) return item.latex.trim()
  return matrixRowsToLatex(item.matrixRows)
}

/** Fields to copy from library → canvas when placing a card. */
export function libraryPayloadFields(lib: LibraryItem): Partial<CanvasItem> {
  return {
    latex: lib.latex,
    tableMarkdown: lib.tableMarkdown,
    imageUrl: lib.imageUrl,
    imagePath: lib.imagePath,
    term: lib.term,
    body: lib.body,
    listItems: lib.listItems ? [...lib.listItems] : undefined,
    listOrdered: lib.listOrdered,
    calloutVariant: lib.calloutVariant,
    code: lib.code,
    codeLanguage: lib.codeLanguage,
    symbol: lib.symbol,
    value: lib.value,
    unit: lib.unit,
    identities: lib.identities ? [...lib.identities] : undefined,
    matrixRows: lib.matrixRows
      ? lib.matrixRows.map((r) => [...r])
      : undefined,
  }
}

/** Infer library type from payload when cloud docs omit type. */
export function inferLibraryType(
  data: Partial<LibraryItem> & Record<string, unknown>,
): LibraryItemType {
  const t = data.type
  if (typeof t === 'string' && isLibraryItemType(t)) return t
  if (data.matrixRows || (data.latex && String(data.title ?? '').toLowerCase().includes('matrix')))
    return data.matrixRows ? 'matrix' : 'equation'
  if (Array.isArray(data.identities) && data.identities.length) return 'identity-set'
  if (data.symbol && (data.value || data.unit)) return 'constant'
  if (data.code) return 'code'
  if (data.calloutVariant || (data.body && !data.term)) return 'callout'
  if (data.term || (data.body && data.term !== undefined)) return 'definition'
  if (Array.isArray(data.listItems) && data.listItems.length) return 'list'
  if (data.latex) return 'equation'
  if (data.tableMarkdown) return 'table'
  if (data.imageUrl) {
    // Prefer plot when tagged; else figure
    const tags = Array.isArray(data.tags) ? data.tags.map(String) : []
    if (tags.some((x) => /plot|graph|chart/i.test(x))) return 'plot'
    return 'figure'
  }
  return 'equation'
}
