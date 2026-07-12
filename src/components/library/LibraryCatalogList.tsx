import { useEffect, useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'
import { ArrowDownAZ, Check, Copy, Plus } from 'lucide-react'
import { SUBJECTS, type LibraryItem } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { FitContent } from '@/components/math/FitContent'
import { FigureView } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import {
  cycleSortLevel,
  multiSortStable,
  sortLevelIndex,
  type SortLevel,
} from '@/lib/multiSort'

type SortKey = 'title' | 'topic' | 'type'

const SORT_LABELS: Record<SortKey, string> = {
  title: 'Name',
  topic: 'Topic',
  type: 'Type',
}

const TYPE_LABEL: Record<LibraryItem['type'], string> = {
  equation: 'Equation',
  table: 'Table',
  figure: 'Figure',
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

function subjectLabel(id: string | undefined): string {
  if (!id) return '—'
  return SUBJECTS.find((s) => s.id === id)?.label ?? id
}

function compareLib(a: LibraryItem, b: LibraryItem, key: string): number {
  if (key === 'topic') return cmpStr(a.topic ?? '', b.topic ?? '')
  if (key === 'type') {
    return cmpStr(TYPE_LABEL[a.type] ?? a.type, TYPE_LABEL[b.type] ?? b.type)
  }
  return cmpStr(a.title ?? '', b.title ?? '')
}

/**
 * Catalog-style detailed list for the bottom library:
 * left = sortable Name / Topic / Type rows (scrollable),
 * right = preview + Add to canvas.
 * Rows are also draggable onto the canvas.
 */
export function LibraryCatalogList({ items }: { items: LibraryItem[] }) {
  const addFromLibrary = useCanvasStore((s) => s.addFromLibrary)
  /** Empty = keep parent order (search relevance). */
  const [sortLevels, setSortLevels] = useState<SortLevel<SortKey>[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addFlash, setAddFlash] = useState(false)
  const [copied, setCopied] = useState(false)

  const sorted = useMemo(() => {
    if (sortLevels.length === 0) return items
    return multiSortStable(items, sortLevels, compareLib)
  }, [items, sortLevels])

  // Always select the top result when the list identity changes so search
  // jumps to the best match (e.g. Gauss for "g"), not a stale selection.
  useEffect(() => {
    if (sorted.length === 0) {
      setSelectedId(null)
      return
    }
    setSelectedId(sorted[0]!.id)
  }, [sorted])

  const selected = sorted.find((i) => i.id === selectedId) ?? null

  const setSort = (key: SortKey) => {
    setSortLevels((prev) => cycleSortLevel(prev, key))
  }

  const clearSort = () => setSortLevels([])

  const addSelected = () => {
    if (!selected) return
    addFromLibrary(selected, 120, 120)
    setAddFlash(true)
    window.setTimeout(() => setAddFlash(false), 1200)
  }

  const copyLatex = async () => {
    if (!selected?.latex) return
    try {
      await navigator.clipboard.writeText(selected.latex)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="h-full min-h-0" data-testid="library-catalog-list">
      <PanelGroup
        direction="horizontal"
        autoSaveId="library-catalog-h"
        className="h-full"
      >
        {/* ── Left: detailed list ── */}
        <Panel defaultSize={62} minSize={35} order={1}>
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            {/* Sort toolbar */}
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 bg-[#1a1a1a] px-2 py-1.5">
              <ArrowDownAZ className="h-3 w-3 text-zinc-600" />
              <span className="text-[9px] uppercase text-zinc-600">Sort</span>
              {(['title', 'topic', 'type'] as SortKey[]).map((key) => {
                const idx = sortLevelIndex(sortLevels, key)
                const active = idx >= 0
                const dir = active ? sortLevels[idx]!.dir : 'asc'
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    title={
                      active
                        ? dir === 'asc'
                          ? 'Ascending — click for descending'
                          : 'Descending — click to clear this sort'
                        : 'Add multi-column sort'
                    }
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                      active
                        ? 'bg-indigo-500/30 text-indigo-100 ring-1 ring-indigo-400/40'
                        : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    {SORT_LABELS[key]}
                    {active
                      ? `${dir === 'asc' ? ' ↑' : ' ↓'}${
                          sortLevels.length > 1 ? ` ${idx + 1}` : ''
                        }`
                      : ''}
                  </button>
                )
              })}
              {sortLevels.length > 0 && (
                <button
                  type="button"
                  onClick={clearSort}
                  className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  title="Clear all sorts (original order)"
                >
                  Clear sort
                </button>
              )}
              <span className="ml-auto tabular-nums text-[10px] text-zinc-600">
                {sorted.length}
              </span>
            </div>

            {/* Column headers */}
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#222] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
              {(
                [
                  ['title', 'Name', 'min-w-0 flex-[1.4]'],
                  ['topic', 'Topic', 'w-[28%] shrink-0'],
                  ['type', 'Type', 'w-[18%] shrink-0'],
                ] as const
              ).map(([key, label, cls]) => {
                const idx = sortLevelIndex(sortLevels, key)
                const active = idx >= 0
                const dir = active ? sortLevels[idx]!.dir : 'asc'
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${cls} text-left transition hover:text-zinc-300 ${
                      active ? 'text-indigo-300' : ''
                    }`}
                    onClick={() => setSort(key)}
                  >
                    {label}
                    {active
                      ? `${dir === 'asc' ? ' ↑' : ' ↓'}${
                          sortLevels.length > 1 ? ` ${idx + 1}` : ''
                        }`
                      : ''}
                  </button>
                )
              })}
            </div>

            {/* Scrollable rows */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {sorted.length === 0 ? (
                <p className="px-3 py-6 text-center text-[11px] text-zinc-600">
                  No formulas match.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-800/80">
                  {sorted.map((item, index) => (
                    <CatalogRow
                      key={`${item.id}-${index}`}
                      item={item}
                      active={item.id === selectedId}
                      onSelect={() => setSelectedId(item.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle
          className="group relative w-1.5 shrink-0 bg-zinc-900 transition hover:bg-indigo-500/50 data-[resize-handle-active]:bg-indigo-500/60"
          title="Drag to resize preview"
        >
          <span
            className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-700 group-hover:bg-indigo-400/80 group-data-[resize-handle-active]:bg-indigo-400"
            aria-hidden
          />
        </PanelResizeHandle>

        {/* ── Right: preview + add ── */}
        <Panel defaultSize={38} minSize={22} maxSize={65} order={2}>
          <div
            className="flex h-full min-h-0 flex-col bg-[#161616]"
            data-testid="library-catalog-preview"
          >
            <div className="flex shrink-0 flex-col gap-0.5 border-b border-zinc-800 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Preview
              </span>
              <span className="truncate text-xs font-medium text-zinc-200">
                {selected ? selected.title : 'Select a row'}
              </span>
              {selected && (
                <span className="truncate text-[10px] text-zinc-600">
                  {selected.topic}
                  {selected.subject
                    ? ` · ${subjectLabel(selected.subject)}`
                    : ''}
                  {' · '}
                  {TYPE_LABEL[selected.type]}
                </span>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              {!selected ? (
                <p className="py-6 text-center text-[11px] leading-relaxed text-zinc-600">
                  Choose a row on the left to preview.
                  <br />
                  Drag a row onto the canvas, or use Add to canvas.
                </p>
              ) : selected.type === 'figure' && selected.imageUrl ? (
                <div className="space-y-2">
                  <div className="mx-auto h-28 max-w-full overflow-hidden rounded-md bg-zinc-950/40 p-1">
                    <FitContent
                      mode="scale"
                      fitMethod="transform"
                      align="center"
                      minScale={0.05}
                      maxScale={32}
                      showBadge
                      contentKey={`cat-fig-${selected.id}`}
                      className="h-full w-full"
                    >
                      <FigureView
                        src={selected.imageUrl}
                        alt={selected.title}
                        fillContainer={false}
                      />
                    </FitContent>
                  </div>
                  {selected.description && (
                    <p className="text-[10px] leading-snug text-zinc-500">
                      {selected.description}
                    </p>
                  )}
                </div>
              ) : selected.type === 'table' && selected.tableMarkdown ? (
                <div className="space-y-2">
                  <MarkdownTable
                    markdown={selected.tableMarkdown}
                    fitContent
                    className="overflow-auto text-[11px] text-zinc-200"
                  />
                  {selected.description && (
                    <p className="text-[10px] leading-snug text-zinc-500">
                      {selected.description}
                    </p>
                  )}
                </div>
              ) : selected.latex ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-3">
                    <LatexView
                      latex={selected.latex}
                      className="text-sm text-zinc-100 [&_.katex-display]:m-0"
                    />
                  </div>
                  {selected.description && (
                    <p className="text-[10px] leading-snug text-zinc-500">
                      {selected.description}
                    </p>
                  )}
                  <p className="break-all font-mono text-[9px] leading-snug text-zinc-600">
                    {selected.latex}
                  </p>
                </div>
              ) : (
                <p className="py-6 text-center text-[11px] text-zinc-600">
                  No preview content for this item.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-zinc-800 px-3 py-2.5">
              {selected?.latex && (
                <button
                  type="button"
                  title="Copy KaTeX"
                  onClick={() => {
                    void copyLatex()
                  }}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:border-indigo-500/40 hover:text-indigo-200 ${
                    copied ? 'border-emerald-500/40 text-emerald-300' : ''
                  }`}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              <button
                type="button"
                disabled={!selected}
                onClick={addSelected}
                data-testid="library-list-add-to-canvas"
                className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  addFlash
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-500 text-white hover:bg-indigo-400'
                }`}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                {addFlash ? 'Added' : 'Add to canvas'}
              </button>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

function CatalogRow({
  item,
  active,
  onSelect,
}: {
  item: LibraryItem
  active: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib-${item.id}`,
    data: {
      from: 'library',
      libraryItem: item,
    },
  })

  return (
    <li>
      <button
        type="button"
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={onSelect}
        data-testid="library-list-row"
        title="Click to preview · drag onto canvas"
        className={`flex w-full touch-none cursor-grab items-start gap-2 px-2 py-1.5 text-left transition active:cursor-grabbing ${
          isDragging ? 'opacity-40' : ''
        } ${
          active
            ? 'bg-indigo-500/20 ring-1 ring-inset ring-indigo-500/35'
            : 'hover:bg-zinc-900/80'
        }`}
      >
        <span
          className={`min-w-0 flex-[1.4] truncate text-[11px] font-medium ${
            active ? 'text-white' : 'text-zinc-200'
          }`}
        >
          {item.title}
        </span>
        <span className="w-[28%] shrink-0 truncate text-[10px] text-zinc-500">
          {item.topic}
        </span>
        <span className="w-[18%] shrink-0 truncate text-[10px] text-zinc-600">
          {TYPE_LABEL[item.type]}
        </span>
      </button>
    </li>
  )
}
