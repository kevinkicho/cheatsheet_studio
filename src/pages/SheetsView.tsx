import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ArrowDown,
  ArrowUp,
  FilePlus2,
  FileText,
  FolderTree,
  Image as ImageIcon,
  LayoutTemplate,
  Trash2,
  GitBranch,
  Table2,
  FunctionSquare,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import {
  useSheetsStore,
  type SheetPreview,
} from '@/stores/sheetsStore'
import { useUiStore } from '@/stores/uiStore'
import {
  formatPageSizeLabel,
  multiPageLayoutBounds,
  normalizePrintPageLayout,
  resolvePagePixels,
} from '@/lib/printSizes'
import type { CanvasItem } from '@/types'
import { isFigureLike } from '@/lib/cardDefaults'
import { LatexView } from '@/components/math/LatexView'
import { FigureView } from '@/components/math/FigureView'
import { MermaidView } from '@/components/math/MermaidView'
import { ProcessFlowView } from '@/components/math/ProcessFlowView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import { FitContent } from '@/components/math/FitContent'
import { CARD_DEFAULTS } from '@/lib/cardDefaults'

/** Canvas is authored at 96 CSS px / inch (same as printSizes). */
const PX_PER_IN = 96

type SizeUnit = 'px' | 'in' | 'cm' | 'mm'
type CardKind = 'equation' | 'table' | 'figure' | 'process' | 'other'
type SortKey = 'title' | 'type' | 'x' | 'y' | 'w' | 'h' | 'z'

function countByType(items: CanvasItem[]) {
  let equations = 0
  let tables = 0
  let figures = 0
  let process = 0
  let other = 0
  for (const it of items) {
    if (it.hidden) continue
    if (it.type === 'process-chart' || it.mermaidSource || it.processFlow)
      process += 1
    else if (it.type === 'table' || it.tableMarkdown) tables += 1
    else if (isFigureLike(it)) figures += 1
    else if (
      it.type === 'equation' ||
      it.type === 'custom-equation' ||
      it.latex
    )
      equations += 1
    else other += 1
  }
  return {
    equations,
    tables,
    figures,
    process,
    other,
    total: items.filter((i) => !i.hidden).length,
  }
}

function cardKind(it: CanvasItem): CardKind {
  if (it.type === 'process-chart' || it.mermaidSource || it.processFlow)
    return 'process'
  if (it.type === 'table' || it.tableMarkdown) return 'table'
  if (isFigureLike(it)) return 'figure'
  if (it.type === 'equation' || it.type === 'custom-equation' || it.latex)
    return 'equation'
  return 'other'
}

function pxToUnit(px: number, unit: SizeUnit): number {
  const inches = px / PX_PER_IN
  switch (unit) {
    case 'in':
      return inches
    case 'cm':
      return inches * 2.54
    case 'mm':
      return inches * 25.4
    default:
      return px
  }
}

function formatLen(px: number, unit: SizeUnit): string {
  const v = pxToUnit(px, unit)
  if (unit === 'px') return `${Math.round(v)}`
  if (unit === 'mm') return v.toFixed(0)
  if (unit === 'cm') return v.toFixed(1)
  return v.toFixed(2)
}

const UNIT_ORDER: SizeUnit[] = ['px', 'in', 'cm', 'mm']

function nextUnit(u: SizeUnit): SizeUnit {
  const i = UNIT_ORDER.indexOf(u)
  return UNIT_ORDER[(i + 1) % UNIT_ORDER.length]!
}

/** Section label left of a value box (consistent across My Sheets). */
function FieldRow({
  label,
  children,
  className = '',
  /** Narrower label column for 2-up horizontal grids */
  compact = false,
}: {
  label: string
  children: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div className={`flex min-w-0 items-stretch gap-1.5 ${className}`}>
      <div
        className={`flex shrink-0 items-center justify-end pr-0.5 ${
          compact ? 'w-7 sm:w-8' : 'w-14 sm:w-16'
        }`}
      >
        <span className="text-right text-[9px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Shared height for value fields (X/Y/W/H/Z/Id). */
const VALUE_FIELD_H = 'h-11'

function ValueBox({
  children,
  className = '',
  onClick,
  title,
  'data-testid': testId,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  title?: string
  'data-testid'?: string
}) {
  const interactive = Boolean(onClick)
  const Comp = interactive ? 'button' : 'div'
  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      title={title}
      data-testid={testId}
      className={`relative w-full ${VALUE_FIELD_H} rounded-md border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 text-left ${
        interactive
          ? 'cursor-pointer transition hover:border-zinc-700 hover:bg-zinc-900/80'
          : ''
      } ${className}`}
    >
      {children}
    </Comp>
  )
}

/**
 * Numeric/text value with unit badge bottom-right aligned.
 * All measure fields use the same box height.
 */
function MeasureValue({
  value,
  unit,
  mono,
  fit,
}: {
  value: string
  unit?: string
  mono?: boolean
  /** Shrink text to fit long values (e.g. id) */
  fit?: boolean
}) {
  return (
    <div className="flex h-full min-h-0 w-full items-center pr-0.5">
      <span
        className={`min-w-0 flex-1 tabular-nums text-zinc-100 ${
          mono ? 'font-mono text-zinc-500' : 'font-semibold'
        } ${fit ? 'truncate text-[9px] leading-tight' : 'text-sm'}`}
        title={value}
      >
        {value}
      </span>
      {unit != null && unit !== '' && (
        <span className="pointer-events-none absolute bottom-1 right-1.5 text-[9px] font-medium lowercase leading-none text-zinc-600">
          {unit}
        </span>
      )}
    </div>
  )
}

/** Shared height for cards table column + detail panel (homogeneous layout). */
const CARDS_SPLIT_H = 'h-[28rem]'

/**
 * Unit cycle control — labeled "unit"; current unit is shown on value fields.
 * Cycles px → in → cm → mm.
 */
function UnitCycleButton({
  unit,
  onCycle,
}: {
  unit: SizeUnit
  onCycle: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onCycle()
      }}
      title={`Unit: ${unit} — click to change`}
      className="inline-flex items-center gap-1 rounded border border-zinc-800/80 bg-zinc-950/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500 hover:border-zinc-700 hover:bg-zinc-900/60 hover:text-zinc-400"
      data-testid="unit-cycle-btn"
    >
      <span className="text-zinc-600">unit</span>
      <span className="normal-case text-zinc-400">{unit}</span>
    </button>
  )
}

/**
 * Zoom-fit preview of the print layout.
 * Highlights the selected card block when `highlightId` is set.
 */
function SheetBoardThumb({
  preview,
  highlightId,
  highlightKinds,
  maxW = 480,
  maxH = 340,
}: {
  preview: SheetPreview
  highlightId?: string | null
  /** When non-empty, cards of these kinds are emphasized on the board. */
  highlightKinds?: ReadonlySet<CardKind>
  maxW?: number
  maxH?: number
}) {
  const canvas = preview.canvas
  const page = resolvePagePixels(
    canvas.printSizeId ?? 'letter',
    canvas.orientation ?? 'portrait',
  )
  const pageCount = Math.max(1, canvas.printPageCount ?? 1)
  const layout = normalizePrintPageLayout(canvas.printPageLayout)
  const bounds = multiPageLayoutBounds(
    page,
    pageCount,
    layout,
    canvas.printPagePositions,
  )

  const fitW = Math.max(bounds.width, page.width, 1)
  const fitH = Math.max(bounds.height, page.height, 1)
  const originX = Number.isFinite(bounds.minX) ? bounds.minX : 0
  const originY = Number.isFinite(bounds.minY) ? bounds.minY : 0

  const scale = Math.min(maxW / fitW, maxH / fitH)
  const w = Math.max(1, Math.round(fitW * scale))
  const h = Math.max(1, Math.round(fitH * scale))

  const visible = preview.items.filter((it) => !it.hidden).slice(0, 120)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-inner"
        style={{
          width: w,
          height: h,
          background: canvas.background || '#0f1115',
        }}
        data-testid="sheet-board-thumb"
      >
        {bounds.origins.map((o, i) => (
          <div
            key={`pg-${i}`}
            className="absolute box-border border border-dashed border-indigo-400/55 bg-indigo-500/[0.03]"
            style={{
              left: (o.x - originX) * scale,
              top: (o.y - originY) * scale,
              width: page.width * scale,
              height: page.height * scale,
            }}
          >
            <span className="absolute left-0.5 top-0.5 text-[8px] font-medium text-indigo-300/70">
              {i + 1}
            </span>
          </div>
        ))}
        {visible.map((it) => {
          const kind = cardKind(it)
          const fig = kind === 'figure'
          const proc = kind === 'process'
          const table = kind === 'table'
          const selected = highlightId === it.id
          const kindOn =
            highlightKinds != null &&
            highlightKinds.size > 0 &&
            highlightKinds.has(kind)
          const kindFilterActive =
            highlightKinds != null && highlightKinds.size > 0
          const emphasized = selected || kindOn
          const dimmed = kindFilterActive && !emphasized
          const bg = selected
            ? 'rgba(99, 102, 241, 0.85)'
            : kindOn
              ? 'rgba(129, 140, 248, 0.7)'
              : fig
                ? 'rgba(52, 211, 153, 0.3)'
                : proc
                  ? 'rgba(129, 140, 248, 0.4)'
                  : table
                    ? 'rgba(251, 191, 36, 0.3)'
                    : 'rgba(148, 163, 184, 0.4)'
          const ix = (Number.isFinite(it.x) ? it.x : 0) - originX
          const iy = (Number.isFinite(it.y) ? it.y : 0) - originY
          return (
            <div
              key={it.id}
              className={`absolute overflow-hidden rounded-[2px] ${
                selected
                  ? 'z-20 border-2 border-indigo-300 shadow-[0_0_0_1px_rgba(129,140,248,0.8),0_0_12px_rgba(99,102,241,0.55)]'
                  : kindOn
                    ? 'z-10 border-2 border-indigo-400/80 shadow-[0_0_8px_rgba(99,102,241,0.45)]'
                    : 'border border-zinc-500/50'
              }`}
              title={it.title || it.type}
              data-highlighted={emphasized ? 'true' : undefined}
              style={{
                left: ix * scale,
                top: iy * scale,
                width: Math.max(3, (it.width || 40) * scale),
                height: Math.max(2, (it.height || 24) * scale),
                background: bg,
                opacity: dimmed ? 0.22 : 1,
              }}
            />
          )
        })}
        {visible.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600">
            Empty sheet
          </div>
        )}
      </div>
      <p className="text-center text-[9px] text-zinc-600">
        Zoom-fit · print area {Math.round(fitW)}×{Math.round(fitH)} px
        {pageCount > 1 ? ` · ${pageCount} pages` : ''}
      </p>
    </div>
  )
}

function StatChip({
  icon,
  label,
  value,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: number
  active?: boolean
  onClick?: () => void
}) {
  if (value <= 0) return null
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        active
          ? `Hide ${label} highlight`
          : `Highlight ${label} on board & table`
      }
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition ${
        active
          ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-200'
          : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
      }`}
    >
      {icon}
      {value} {label}
    </button>
  )
}

function cardTypeIcon(kind: CardKind, className = 'h-3.5 w-3.5') {
  switch (kind) {
    case 'equation':
      return (
        <FunctionSquare className={`${className} shrink-0 text-sky-400/90`} />
      )
    case 'table':
      return <Table2 className={`${className} shrink-0 text-amber-400/90`} />
    case 'figure':
      return (
        <ImageIcon className={`${className} shrink-0 text-emerald-400/90`} />
      )
    case 'process':
      return (
        <GitBranch className={`${className} shrink-0 text-indigo-400/90`} />
      )
    default:
      return <FileText className={`${className} shrink-0 text-zinc-500`} />
  }
}

type SortLevel = { key: SortKey; dir: 'asc' | 'desc' }

function compareRows(
  a: {
    kind: string
    title: string
    x: number
    y: number
    w: number
    h: number
    z: number
  },
  b: typeof a,
  key: SortKey,
): number {
  switch (key) {
    case 'type':
      return a.kind.localeCompare(b.kind)
    case 'x':
      return a.x - b.x
    case 'y':
      return a.y - b.y
    case 'w':
      return a.w - b.w
    case 'h':
      return a.h - b.h
    case 'z':
      return a.z - b.z
    default:
      return a.title.localeCompare(b.title)
  }
}

function SortHeader({
  label,
  col,
  sortLevels,
  onSort,
  className = '',
}: {
  label: string
  col: SortKey
  sortLevels: SortLevel[]
  onSort: (k: SortKey) => void
  className?: string
}) {
  const levelIdx = sortLevels.findIndex((s) => s.key === col)
  const active = levelIdx >= 0
  const sortDir = active ? sortLevels[levelIdx]!.dir : 'asc'
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      title={
        active
          ? sortDir === 'asc'
            ? 'Sorted ascending — click for descending'
            : 'Sorted descending — click to clear this sort'
          : 'Click to sort (multi-column: add more headers)'
      }
      className={`inline-flex items-center gap-0.5 text-left text-[9px] font-semibold uppercase tracking-wide ${
        active ? 'text-indigo-300' : 'text-zinc-500 hover:text-zinc-300'
      } ${className}`}
    >
      {label}
      {active && (
        <>
          {sortDir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )}
          {sortLevels.length > 1 && (
            <span className="text-[8px] font-normal text-indigo-400/80">
              {levelIdx + 1}
            </span>
          )}
        </>
      )}
    </button>
  )
}

/** Multi-column sortable/filterable card table + ↑/↓ navigation. */
function CardsTable({
  items,
  selectedId,
  onSelect,
  highlightKinds,
}: {
  items: CanvasItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Kinds emphasized from content chips */
  highlightKinds?: ReadonlySet<CardKind>
}) {
  const [filterType, setFilterType] = useState<CardKind | 'all'>('all')
  const [query, setQuery] = useState('')
  /** Empty = original list order. Multi-level sort when several headers active. */
  const [sortLevels, setSortLevels] = useState<SortLevel[]>([])
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

  const onSort = (k: SortKey) => {
    setSortLevels((prev) => {
      const i = prev.findIndex((s) => s.key === k)
      if (i === -1) {
        // Add column as next sort level (asc)
        return [...prev, { key: k, dir: 'asc' }]
      }
      const cur = prev[i]!
      if (cur.dir === 'asc') {
        // Toggle to desc
        return prev.map((s, j) =>
          j === i ? { key: k, dir: 'desc' as const } : s,
        )
      }
      // Was desc → remove this level; empty stack = original order
      return prev.filter((_, j) => j !== i)
    })
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = items.map((it, index) => ({
      it,
      kind: cardKind(it),
      title: (it.title || '(untitled)').toLowerCase(),
      x: Number.isFinite(it.x) ? it.x : 0,
      y: Number.isFinite(it.y) ? it.y : 0,
      w: it.width || 0,
      h: it.height || 0,
      z: it.zIndex ?? 0,
      index,
    }))
    if (filterType !== 'all') {
      list = list.filter((r) => r.kind === filterType)
    }
    if (q) {
      list = list.filter(
        (r) =>
          r.title.includes(q) ||
          r.kind.includes(q) ||
          r.it.type?.toLowerCase().includes(q) ||
          (r.it.latex && r.it.latex.toLowerCase().includes(q)),
      )
    }
    if (sortLevels.length === 0) {
      // Original document order
      list.sort((a, b) => a.index - b.index)
    } else {
      list.sort((a, b) => {
        for (const { key, dir } of sortLevels) {
          const cmp = compareRows(a, b, key)
          if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
        }
        return a.index - b.index
      })
    }
    return list
  }, [items, filterType, query, sortLevels])

  const rowIds = useMemo(() => rows.map((r) => r.it.id), [rows])

  const moveSelection = useCallback(
    (delta: number) => {
      if (rowIds.length === 0) return
      const idx = selectedId ? rowIds.indexOf(selectedId) : -1
      let next = idx + delta
      if (idx < 0) next = delta > 0 ? 0 : rowIds.length - 1
      next = Math.max(0, Math.min(rowIds.length - 1, next))
      const id = rowIds[next]!
      onSelect(id)
      const el = rowRefs.current.get(id)
      el?.scrollIntoView({ block: 'nearest' })
    },
    [rowIds, selectedId, onSelect],
  )

  // ArrowUp / ArrowDown after a row is selected (or table focused)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const t = e.target as HTMLElement | null
      if (!t) return
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      ) {
        return
      }
      // Only navigate when a card is selected or focus is inside the table
      const inTable = tableWrapRef.current?.contains(t)
      if (!selectedId && !inTable) return
      e.preventDefault()
      moveSelection(e.key === 'ArrowDown' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, moveSelection])

  useEffect(() => {
    if (!selectedId) return
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2 outline-none"
      data-testid="sheet-cards-table"
      tabIndex={-1}
      ref={tableWrapRef}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter cards…"
          className="field-input max-w-[12rem] py-1 text-[11px]"
          data-testid="sheet-cards-filter-query"
        />
        <select
          value={filterType}
          onChange={(e) =>
            setFilterType(e.target.value as CardKind | 'all')
          }
          className="field-input w-auto py-1 text-[11px]"
          data-testid="sheet-cards-filter-type"
        >
          <option value="all">All types</option>
          <option value="equation">Equation</option>
          <option value="table">Table</option>
          <option value="figure">Figure</option>
          <option value="process">Process</option>
          <option value="other">Other</option>
        </select>
        <span className="text-[10px] text-zinc-600">
          {rows.length} of {items.length}
          {selectedId ? ' · ↑↓ to move' : ''}
        </span>
        {(sortLevels.length > 0 ||
          filterType !== 'all' ||
          query.trim().length > 0) && (
          <button
            type="button"
            onClick={() => {
              setSortLevels([])
              setFilterType('all')
              setQuery('')
            }}
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            title="Clear search, type filter, and sort"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-zinc-800">
        <table className="w-full min-w-[28rem] border-collapse text-left text-[11px]">
          <thead className="sticky top-0 z-[1] bg-zinc-900">
            <tr className="border-b border-zinc-800">
              <th className="px-2 py-1.5">
                <SortHeader
                  label="Title"
                  col="title"
                  sortLevels={sortLevels}
                  onSort={onSort}
                />
              </th>
              <th className="px-2 py-1.5">
                <SortHeader
                  label="Type"
                  col="type"
                  sortLevels={sortLevels}
                  onSort={onSort}
                />
              </th>
              <th className="px-2 py-1.5">
                <SortHeader
                  label="X"
                  col="x"
                  sortLevels={sortLevels}
                  onSort={onSort}
                />
              </th>
              <th className="px-2 py-1.5">
                <SortHeader
                  label="Y"
                  col="y"
                  sortLevels={sortLevels}
                  onSort={onSort}
                />
              </th>
              <th className="px-2 py-1.5">
                <SortHeader
                  label="W"
                  col="w"
                  sortLevels={sortLevels}
                  onSort={onSort}
                />
              </th>
              <th className="px-2 py-1.5">
                <SortHeader
                  label="H"
                  col="h"
                  sortLevels={sortLevels}
                  onSort={onSort}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-zinc-600"
                >
                  No cards match this filter
                </td>
              </tr>
            )}
            {rows.map(({ it, kind, x, y, w, h }) => {
              const active = it.id === selectedId
              const kindFocus =
                highlightKinds != null &&
                highlightKinds.size > 0 &&
                highlightKinds.has(kind)
              const kindFilterActive =
                highlightKinds != null && highlightKinds.size > 0
              return (
                <tr
                  key={it.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(it.id, el)
                    else rowRefs.current.delete(it.id)
                  }}
                  onClick={() => {
                    onSelect(active ? null : it.id)
                    tableWrapRef.current?.focus({ preventScroll: true })
                  }}
                  className={`cursor-pointer border-b border-zinc-800/80 last:border-0 ${
                    active
                      ? 'bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40'
                      : kindFocus
                        ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/25'
                        : kindFilterActive
                          ? 'opacity-40 hover:bg-zinc-900/80 hover:opacity-70'
                          : 'hover:bg-zinc-900/80'
                  }`}
                  data-testid={`sheet-card-row-${it.id}`}
                  data-kind-highlight={kindFocus ? 'true' : undefined}
                >
                  <td className="max-w-[10rem] truncate px-2 py-1.5 font-medium text-zinc-200">
                    <span className="inline-flex items-center gap-1.5">
                      {cardTypeIcon(kind, 'h-3 w-3')}
                      <span className="truncate">
                        {it.title || '(untitled)'}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 capitalize text-zinc-400">
                    {kind}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-zinc-400">
                    {Math.round(x)}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-zinc-400">
                    {Math.round(y)}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-zinc-400">
                    {Math.round(w)}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-zinc-400">
                    {Math.round(h)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Fixed-height detail for one card (matches cards table column height). */
function CardDetailView({
  item,
  onClose,
}: {
  item: CanvasItem
  onClose: () => void
}) {
  const kind = cardKind(item)
  const w = item.width || 0
  const h = item.height || 0
  const x = Number.isFinite(item.x) ? item.x : 0
  const y = Number.isFinite(item.y) ? item.y : 0
  /** Applies to X, Y, W, H together */
  const [measureUnit, setMeasureUnit] = useState<SizeUnit>('px')
  const cycleUnit = () => setMeasureUnit((u) => nextUnit(u))

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-indigo-500/30 bg-zinc-900/80"
      data-testid="sheet-card-detail"
    >
      <div className="flex shrink-0 items-start gap-2 border-b border-zinc-800/80 px-3 py-2">
        {cardTypeIcon(kind)}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">
            {item.title || '(untitled)'}
          </p>
          <p className="text-[10px] capitalize text-zinc-500">
            {kind}
            {item.locked ? ' · locked' : ''}
            {item.hidden ? ' · hidden' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close card detail"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Unit control: top-right below divider — drives X/Y/W/H */}
      <div className="flex shrink-0 justify-end border-b border-zinc-800/50 px-3 py-1">
        <UnitCycleButton unit={measureUnit} onCycle={cycleUnit} />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {/* Position: X | Y — same unit as size */}
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="X" compact>
            <ValueBox onClick={cycleUnit} title="Click to change unit">
              <MeasureValue
                value={formatLen(x, measureUnit)}
                unit={measureUnit}
              />
            </ValueBox>
          </FieldRow>
          <FieldRow label="Y" compact>
            <ValueBox onClick={cycleUnit} title="Click to change unit">
              <MeasureValue
                value={formatLen(y, measureUnit)}
                unit={measureUnit}
              />
            </ValueBox>
          </FieldRow>
        </div>

        {/* Size: W | H */}
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="W" compact>
            <ValueBox onClick={cycleUnit} title="Click to change unit">
              <MeasureValue
                value={formatLen(w, measureUnit)}
                unit={measureUnit}
              />
            </ValueBox>
          </FieldRow>
          <FieldRow label="H" compact>
            <ValueBox onClick={cycleUnit} title="Click to change unit">
              <MeasureValue
                value={formatLen(h, measureUnit)}
                unit={measureUnit}
              />
            </ValueBox>
          </FieldRow>
        </div>

        {/* Z | Id — same field height; id text sized to fit */}
        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Z" compact>
            <ValueBox>
              <MeasureValue value={String(item.zIndex ?? '—')} />
            </ValueBox>
          </FieldRow>
          <FieldRow label="Id" compact>
            <ValueBox>
              <MeasureValue value={item.id} mono fit />
            </ValueBox>
          </FieldRow>
        </div>

        {/* Content preview — fixed height, zoom-fit + % badge */}
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
          <p className="border-b border-zinc-800 px-2 py-1 text-[9px] uppercase tracking-wide text-zinc-600">
            Content preview
          </p>
          <div className="relative h-36 w-full p-1.5">
            <FitContent
              mode="scale"
              fitMethod={
                kind === 'equation' || item.latex ? 'fontSize' : 'transform'
              }
              minScale={CARD_DEFAULTS.minFitScale}
              maxScale={CARD_DEFAULTS.maxFillScale}
              showBadge
              contentKey={`${item.id}-${item.latex ?? ''}-${item.tableMarkdown ?? ''}-${item.mermaidSource ?? ''}-${item.imageUrl ?? ''}`}
              className="h-full w-full"
            >
              {(kind === 'equation' || item.latex) && item.latex ? (
                <LatexView
                  latex={item.latex}
                  className="text-zinc-100 [&_.katex]:text-[1em]"
                />
              ) : kind === 'table' && item.tableMarkdown ? (
                <MarkdownTable
                  markdown={item.tableMarkdown}
                  className="text-[11px] text-zinc-200"
                />
              ) : kind === 'figure' && item.imageUrl ? (
                <FigureView
                  src={item.imageUrl}
                  alt={item.title ?? 'figure'}
                  className="max-w-none"
                />
              ) : kind === 'process' && item.processFlow ? (
                <ProcessFlowView
                  snapshot={item.processFlow}
                  title={item.title}
                  className="h-full w-full min-h-[80px]"
                />
              ) : kind === 'process' && item.mermaidSource ? (
                <MermaidView
                  source={item.mermaidSource}
                  theme="dark"
                  forceDark
                  scale={1}
                />
              ) : (
                <p className="text-[11px] text-zinc-600">No preview content</p>
              )}
            </FitContent>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Fixed empty placeholder matching detail panel height. */
function CardDetailPlaceholder() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/30 px-3 text-center text-[11px] text-zinc-600">
      Select a table row to highlight it on the board and open detail
      <br />
      <span className="mt-1 block text-[9px] text-zinc-700">
        Use ↑ / ↓ to move between cards
      </span>
    </div>
  )
}

/**
 * Compact single-row sheet meta: preset · pages · print area size + unit toggle.
 * Click size or the unit chip to cycle px → in → cm → mm.
 */
function SheetMetaBar({
  presetLabel,
  pageCount,
  layout,
  pageW,
  pageH,
  totalW,
  totalH,
}: {
  presetLabel: string
  pageCount: number
  layout: string
  pageW: number
  pageH: number
  totalW: number
  totalH: number
}) {
  const [unit, setUnit] = useState<SizeUnit>('px')
  const cycle = () => setUnit((u) => nextUnit(u))

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-zinc-800/80 bg-zinc-950/40 px-2.5 py-1.5 text-[10px] text-zinc-500"
      data-testid="sheet-meta-bar"
    >
      <span className="inline-flex min-w-0 items-baseline gap-1">
        <span className="text-[9px] uppercase tracking-wide text-zinc-600">
          Preset
        </span>
        <span className="truncate font-medium text-zinc-400">{presetLabel}</span>
      </span>

      <span className="hidden h-3 w-px bg-zinc-800 sm:block" aria-hidden />

      <span className="inline-flex items-baseline gap-1">
        <span className="text-[9px] uppercase tracking-wide text-zinc-600">
          Pages
        </span>
        <span className="font-medium capitalize text-zinc-400">
          {pageCount}
          <span className="text-zinc-600"> · {layout}</span>
        </span>
      </span>

      <span className="hidden h-3 w-px bg-zinc-800 sm:block" aria-hidden />

      <button
        type="button"
        onClick={cycle}
        title="Click to change size unit"
        className="inline-flex min-w-0 flex-1 items-baseline gap-1 text-left hover:text-zinc-300"
        data-testid="print-area-size"
      >
        <span className="text-[9px] uppercase tracking-wide text-zinc-600">
          Print area
        </span>
        <span className="font-medium tabular-nums text-zinc-300">
          {formatLen(totalW, unit)} {unit}
          <span className="text-zinc-600"> × </span>
          {formatLen(totalH, unit)} {unit}
        </span>
        <span className="text-[9px] text-zinc-600">
          ({formatLen(pageW, unit)}×{formatLen(pageH, unit)} /page)
        </span>
      </button>

      <UnitCycleButton unit={unit} onCycle={cycle} />
    </div>
  )
}

function DeleteConfirmModal({
  title,
  onCancel,
  onConfirm,
}: {
  title: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      data-testid="sheet-delete-confirm"
    >
      <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <h3
          id="delete-sheet-title"
          className="text-sm font-semibold text-zinc-100"
        >
          Delete sheet?
        </h3>
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
          Delete <span className="font-medium text-zinc-200">“{title}”</span>?
          This permanently removes the sheet and all of its cards from the
          cloud. This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
            data-testid="sheet-delete-confirm-yes"
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  )
}

export function SheetsView() {
  const user = useAuthStore((s) => s.user)
  const sheets = useSheetsStore((s) => s.sheets)
  const loading = useSheetsStore((s) => s.loading)
  const createSheet = useSheetsStore((s) => s.createSheet)
  const openSheet = useSheetsStore((s) => s.openSheet)
  const deleteSheet = useSheetsStore((s) => s.deleteSheet)
  const fetchSheetPreview = useSheetsStore((s) => s.fetchSheetPreview)
  const activeSheetId = useSheetsStore((s) => s.activeSheetId)
  const setView = useUiStore((s) => s.setView)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<SheetPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  /** Content-chip kind focus — highlights board blocks + table rows */
  const [highlightKinds, setHighlightKinds] = useState<Set<CardKind>>(
    () => new Set(),
  )
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const toggleKindHighlight = useCallback((kind: CardKind) => {
    setHighlightKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }, [])

  useEffect(() => {
    if (selectedId) return
    if (sheets.length === 0) return
    const prefer =
      sheets.find((s) => s.id === activeSheetId)?.id ?? sheets[0]!.id
    setSelectedId(prefer)
  }, [sheets, selectedId, activeSheetId])

  useEffect(() => {
    if (!selectedId) {
      setPreview(null)
      setSelectedCardId(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    setSelectedCardId(null)
    setHighlightKinds(new Set())
    void fetchSheetPreview(selectedId).then((p) => {
      if (cancelled) return
      setPreviewLoading(false)
      if (!p) {
        setPreview(null)
        setPreviewError('Could not load sheet details')
        return
      }
      setPreview(p)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId, fetchSheetPreview])

  const counts = useMemo(
    () => (preview ? countByType(preview.items) : null),
    [preview],
  )

  const printMetrics = useMemo(() => {
    if (!preview) return null
    const canvas = preview.canvas
    const page = resolvePagePixels(
      canvas.printSizeId ?? 'letter',
      canvas.orientation ?? 'portrait',
    )
    const pageCount = Math.max(1, canvas.printPageCount ?? 1)
    const layout = normalizePrintPageLayout(canvas.printPageLayout)
    const bounds = multiPageLayoutBounds(
      page,
      pageCount,
      layout,
      canvas.printPagePositions,
    )
    return {
      page,
      pageCount,
      layout,
      bounds,
      totalW: Math.max(bounds.width, page.width),
      totalH: Math.max(bounds.height, page.height),
    }
  }, [preview])

  const visibleCards = useMemo(
    () => (preview ? preview.items.filter((i) => !i.hidden) : []),
    [preview],
  )

  const selectedCard = useMemo(
    () => visibleCards.find((c) => c.id === selectedCardId) ?? null,
    [visibleCards, selectedCardId],
  )

  const openSelected = () => {
    if (!selectedId) return
    void openSheet(selectedId).then(() => setView('workspace'))
  }

  const confirmDelete = () => {
    if (!preview) return
    void deleteSheet(preview.id, { uid: user?.uid }).then(() => {
      setDeleteConfirm(false)
      setSelectedId(null)
      setPreview(null)
      setSelectedCardId(null)
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {deleteConfirm && preview && (
        <DeleteConfirmModal
          title={preview.title}
          onCancel={() => setDeleteConfirm(false)}
          onConfirm={confirmDelete}
        />
      )}

      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h1 className="text-sm font-semibold text-zinc-100">My sheets</h1>
        <button
          type="button"
          onClick={() => {
            if (user)
              void createSheet(user.uid).then(() => setView('workspace'))
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          New sheet
        </button>
        <button
          type="button"
          onClick={() => setView('workspace')}
          className="ml-auto text-xs text-indigo-300 hover:underline"
        >
          Back to workspace
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sheet list */}
        <div className="flex w-full max-w-md shrink-0 flex-col border-r border-zinc-800">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading && (
              <p className="text-sm text-zinc-500">Loading sheets…</p>
            )}
            {!loading && sheets.length === 0 && (
              <p className="text-sm text-zinc-500">
                No sheets yet. Create one to get started.
              </p>
            )}
            <ul className="space-y-1.5" data-testid="sheets-list">
              {sheets.map((s) => {
                const active = s.id === selectedId
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition ${
                        active
                          ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
                      }`}
                      data-testid={`sheet-list-item-${s.id}`}
                    >
                      <FileText
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          active ? 'text-indigo-300' : 'text-zinc-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {s.title}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          Updated {new Date(s.updatedAt).toLocaleString()}
                          {s.localOnly ? ' · offline' : ''}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* Detail / preview */}
        <div
          className="min-w-0 flex-1 overflow-y-auto p-4"
          data-testid="sheet-detail-panel"
        >
          {!selectedId && (
            <div className="flex h-full flex-col items-center justify-center text-sm text-zinc-500">
              <LayoutTemplate className="mb-2 h-8 w-8 text-zinc-700" />
              Select a sheet to preview details
            </div>
          )}
          {selectedId && previewLoading && (
            <p className="text-sm text-zinc-500">Loading preview…</p>
          )}
          {selectedId && previewError && !previewLoading && (
            <p className="text-sm text-rose-400/90">{previewError}</p>
          )}
          {selectedId && preview && !previewLoading && printMetrics && (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-50">
                  {preview.title}
                </h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Updated {new Date(preview.updatedAt).toLocaleString()}
                  {preview.createdAt
                    ? ` · Created ${new Date(preview.createdAt).toLocaleString()}`
                    : ''}
                  {preview.localOnly ? ' · Local only' : ''}
                </p>
              </div>

              <SheetBoardThumb
                preview={preview}
                highlightId={selectedCardId}
                highlightKinds={highlightKinds}
              />

              <SheetMetaBar
                presetLabel={formatPageSizeLabel(
                  preview.canvas.printSizeId ?? 'letter',
                  preview.canvas.orientation ?? 'portrait',
                )}
                pageCount={printMetrics.pageCount}
                layout={printMetrics.layout}
                pageW={printMetrics.page.width}
                pageH={printMetrics.page.height}
                totalW={printMetrics.totalW}
                totalH={printMetrics.totalH}
              />

              {counts && (
                <div>
                  <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                    Contents ({counts.total} cards
                    {preview.folders.length
                      ? ` · ${preview.folders.length} folders`
                      : ''}
                    )
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <StatChip
                      icon={<FunctionSquare className="h-3 w-3" />}
                      label="equations"
                      value={counts.equations}
                      active={highlightKinds.has('equation')}
                      onClick={() => toggleKindHighlight('equation')}
                    />
                    <StatChip
                      icon={<Table2 className="h-3 w-3" />}
                      label="tables"
                      value={counts.tables}
                      active={highlightKinds.has('table')}
                      onClick={() => toggleKindHighlight('table')}
                    />
                    <StatChip
                      icon={<ImageIcon className="h-3 w-3" />}
                      label="figures"
                      value={counts.figures}
                      active={highlightKinds.has('figure')}
                      onClick={() => toggleKindHighlight('figure')}
                    />
                    <StatChip
                      icon={<GitBranch className="h-3 w-3" />}
                      label="process"
                      value={counts.process}
                      active={highlightKinds.has('process')}
                      onClick={() => toggleKindHighlight('process')}
                    />
                    <StatChip
                      icon={<FolderTree className="h-3 w-3" />}
                      label="other"
                      value={counts.other}
                      active={highlightKinds.has('other')}
                      onClick={() => toggleKindHighlight('other')}
                    />
                    {counts.total === 0 && (
                      <span className="text-[10px] text-zinc-600">
                        No cards on this sheet yet
                      </span>
                    )}
                    {highlightKinds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setHighlightKinds(new Set())}
                        className="text-[9px] text-zinc-600 underline-offset-2 hover:text-zinc-400 hover:underline"
                      >
                        Clear highlight
                      </button>
                    )}
                  </div>
                </div>
              )}

              {visibleCards.length > 0 && (
                <div data-testid="sheet-cards-section">
                  <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                    Cards — click a row for detail &amp; preview highlight · ↑↓
                    to move
                  </p>
                  {/* Fixed equal height: table column + detail panel */}
                  <div
                    className={`grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] ${CARDS_SPLIT_H}`}
                  >
                    <div className="min-h-0 min-w-0">
                      <CardsTable
                        items={visibleCards}
                        selectedId={selectedCardId}
                        onSelect={setSelectedCardId}
                        highlightKinds={highlightKinds}
                      />
                    </div>
                    <div className="min-h-0 min-w-0">
                      {selectedCard ? (
                        <CardDetailView
                          item={selectedCard}
                          onClose={() => setSelectedCardId(null)}
                        />
                      ) : (
                        <CardDetailPlaceholder />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  onClick={openSelected}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400"
                  data-testid="sheet-open-workspace"
                >
                  Open in workspace
                </button>
                <button
                  type="button"
                  title="Delete sheet"
                  onClick={() => setDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                  data-testid="sheet-delete-button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
