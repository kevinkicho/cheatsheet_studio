import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { SUBJECTS, type LibraryItem, type Subject } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { useLibraryStore } from '@/stores/libraryStore'
import { FitContent } from '@/components/math/FitContent'
import { LatexView } from '@/components/math/LatexView'
import { filterLibraryItems } from '@/lib/libraryFilter'
import {
  cycleSortLevel,
  multiSortStable,
  sortLevelIndex,
  type SortLevel,
} from '@/lib/multiSort'

type SortKey = 'title' | 'topic' | 'subject'

const SORT_LABELS: Record<SortKey, string> = {
  title: 'Name',
  topic: 'Topic',
  subject: 'Subject',
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

function compareCatalog(
  a: LibraryItem,
  b: LibraryItem,
  key: string,
): number {
  if (key === 'topic') return cmpStr(a.topic ?? '', b.topic ?? '')
  if (key === 'subject') {
    const la =
      SUBJECTS.find((s) => s.id === a.subject)?.label ?? a.subject ?? ''
    const lb =
      SUBJECTS.find((s) => s.id === b.subject)?.label ?? b.subject ?? ''
    return cmpStr(la, lb)
  }
  return cmpStr(a.title ?? '', b.title ?? '')
}

function isEquationItem(i: LibraryItem): boolean {
  const hasLatex = Boolean(i.latex && String(i.latex).trim())
  if (!hasLatex) return false
  if (i.type === 'equation') return true
  if (!i.tableMarkdown && !i.imageUrl) return true
  return false
}

/**
 * Create a custom equation card.
 * Catalog is equations-only (for Append to LaTeX field) with the same
 * search ranking rules as the bottom library.
 */
export function CreateEquationPanel() {
  const addCustomEquation = useCanvasStore((s) => s.addCustomEquation)
  const libraryItems = useLibraryStore((s) => s.items)

  const [latex, setLatex] = useState('E = mc^2')
  const [title, setTitle] = useState('Custom equation')
  const [catalogOpen, setCatalogOpen] = useState(true)

  const [catSubject, setCatSubject] = useState<Subject | 'all'>('all')
  const [catTopic, setCatTopic] = useState<string>('all')
  const [catSearch, setCatSearch] = useState('')
  /** Empty = relevance / original catalog order */
  const [sortLevels, setSortLevels] = useState<SortLevel<SortKey>[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [appendFlash, setAppendFlash] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)

  const catalogPool = useMemo(
    () => libraryItems.filter(isEquationItem),
    [libraryItems],
  )

  const topicOptions = useMemo(() => {
    const pool =
      catSubject === 'all'
        ? catalogPool
        : catalogPool.filter(
            (i) => (i.subject ?? '').toLowerCase() === catSubject.toLowerCase(),
          )
    const topics = new Set<string>()
    for (const i of pool) {
      const t = (i.topic ?? '').trim()
      if (t) topics.add(t)
    }
    return Array.from(topics).sort(cmpStr)
  }, [catalogPool, catSubject])

  const catalogItems = useMemo(() => {
    const filtered = filterLibraryItems(catalogPool, {
      subject: catSubject,
      topic: catTopic,
      search: catSearch,
    })

    // No explicit sort levels → keep filter ranking (search relevance)
    if (sortLevels.length === 0) return filtered

    return multiSortStable(filtered, sortLevels, compareCatalog)
  }, [catalogPool, catSubject, catTopic, catSearch, sortLevels])

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [catSubject, catTopic, catSearch, sortLevels])

  useEffect(() => {
    if (catTopic !== 'all' && !topicOptions.includes(catTopic)) {
      setCatTopic('all')
    }
  }, [catTopic, topicOptions])

  const selected: LibraryItem | null = useMemo(() => {
    if (!selectedId) return null
    return (
      catalogItems.find((e) => e.id === selectedId) ??
      catalogPool.find((e) => e.id === selectedId) ??
      null
    )
  }, [catalogItems, catalogPool, selectedId])

  useEffect(() => {
    if (catalogItems.length === 0) {
      setSelectedId(null)
      return
    }
    setSelectedId(catalogItems[0]!.id)
  }, [catalogItems])

  const appendSelected = () => {
    if (!selected?.latex) return
    const piece = selected.latex.trim()
    setLatex((prev) => {
      const cur = prev.trimEnd()
      if (!cur) return piece
      return `${cur}\n${piece}`
    })
    setTitle((t) =>
      t === 'Custom equation' || t === 'E = mc^2' || !t.trim()
        ? selected.title
        : t,
    )
    setAppendFlash(true)
    window.setTimeout(() => setAppendFlash(false), 1400)
  }

  const subjectLabel = (id: string) =>
    SUBJECTS.find((s) => s.id === id)?.label ?? id

  const setSort = (key: SortKey) => {
    setSortLevels((prev) => cycleSortLevel(prev, key))
  }

  const clearFilters = () => {
    setCatSubject('all')
    setCatTopic('all')
    setCatSearch('')
    setSortLevels([])
  }

  const hasActiveFilters =
    catSubject !== 'all' ||
    catTopic !== 'all' ||
    catSearch.trim().length > 0 ||
    sortLevels.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Editor strip — keep compact so catalog has room */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-zinc-800 p-2.5">
        <p className="text-[10px] leading-snug text-zinc-500">
          Edit LaTeX or pick a formula from the catalog (Append adds below
          existing text).
        </p>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-medium uppercase text-zinc-500">
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field-input py-1 text-[11px]"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-medium uppercase text-zinc-500">
            LaTeX
          </span>
          <textarea
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            rows={2}
            className="field-input font-mono text-[11px]"
            spellCheck={false}
            placeholder="e.g. \int_a^b f(x)\,dx"
          />
        </label>
        <div
          className="grid h-16 w-full shrink-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950"
          data-card-preview-viewport
          style={{ gridTemplate: '1fr / 1fr' }}
        >
          <div
            className="min-h-0 min-w-0 overflow-hidden p-1.5"
            style={{ gridArea: '1 / 1' }}
          >
            <FitContent
              mode="scale"
              // Vector type: KaTeX reflows with font-size (docs/vector-graphics.md)
              fitMethod="fontSize"
              align="center"
              minScale={0.1}
              maxScale={8}
              baseFontSize={15}
              contentKey={latex}
              className="h-full w-full"
            >
              <LatexView
                latex={latex}
                className="text-zinc-100 [&_.katex-display]:m-0"
              />
            </FitContent>
          </div>
          <div
            className="pointer-events-none select-none self-start justify-self-start px-1.5 pt-1 text-[9px] font-medium uppercase tracking-wide text-zinc-200"
            style={{ gridArea: '1 / 1', opacity: 0.5, zIndex: 2 }}
            aria-hidden
          >
            Card preview
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!latex.trim()) return
            addCustomEquation(latex.trim(), title.trim() || 'Custom equation')
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
        >
          <Plus className="h-3.5 w-3.5" />
          Add to canvas
        </button>
      </div>

      {/* Catalog */}
      <div className="flex min-h-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setCatalogOpen((o) => !o)}
          className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-900"
        >
          {catalogOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
          )}
          Insert from catalog
          <span className="ml-auto font-normal normal-case tracking-normal text-zinc-600">
            {catalogPool.length} formulas
          </span>
        </button>

        {catalogOpen && (
          <PanelGroup
            direction="vertical"
            autoSaveId="eq-catalog-preview-v"
            className="min-h-0 flex-1"
          >
            {/* Top: filters + list */}
            <Panel defaultSize={58} minSize={28} order={1}>
              <div className="flex h-full min-h-0 flex-col">
                {/* Toolbar: search + filters + sort */}
                <div className="flex shrink-0 flex-col gap-1.5 border-b border-zinc-800 bg-[#1a1a1a] px-2 py-2">
                  <div
                    className="relative z-10 flex items-center gap-1.5"
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Search className="h-3 w-3 shrink-0 text-zinc-600" />
                    <input
                      type="search"
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                      onInput={(e) =>
                        setCatSearch((e.target as HTMLInputElement).value)
                      }
                      placeholder="Filter by name, topic, tag…"
                      className="min-w-0 flex-1 bg-transparent text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600"
                      autoComplete="off"
                      spellCheck={false}
                      data-testid="catalog-search"
                    />
                    {catSearch && (
                      <button
                        type="button"
                        title="Clear search"
                        onClick={() => setCatSearch('')}
                        className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    <span className="shrink-0 tabular-nums text-[10px] text-zinc-500">
                      {catalogItems.length}/{catalogPool.length}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={catSubject}
                      onChange={(e) => {
                        const v = e.target.value as Subject | 'all'
                        setCatSubject(v)
                        setCatTopic('all')
                      }}
                      className="max-w-[40%] cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-indigo-500/50"
                      title="Filter by subject"
                    >
                      <option value="all">All subjects</option>
                      {SUBJECTS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={catTopic}
                      onChange={(e) => setCatTopic(e.target.value)}
                      className="min-w-0 flex-1 cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-indigo-500/50"
                      title="Filter by topic"
                    >
                      <option value="all">All topics</option>
                      {topicOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>

                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="shrink-0 rounded border border-zinc-700 px-1.5 py-1 text-[9px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <ArrowDownAZ className="h-3 w-3 text-zinc-600" />
                    <span className="text-[9px] uppercase text-zinc-600">
                      Sort
                    </span>
                    {(['title', 'topic', 'subject'] as SortKey[]).map((key) => {
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
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="ml-auto rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                        title="Clear search, filters, and sort"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>

                {/* Column headers (also multi-sort) */}
                <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#222] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
                  {(
                    [
                      ['title', 'Name', 'min-w-0 flex-[1.4]'],
                      ['topic', 'Topic', 'w-[28%] shrink-0'],
                      ['subject', 'Subject', 'w-[22%] shrink-0'],
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

                {/* Rows */}
                <div
                  ref={listRef}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                >
                  {catalogItems.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[11px] text-zinc-600">
                      No items match
                      {hasActiveFilters ? ' these filters' : ''}.
                      {hasActiveFilters && (
                        <>
                          {' '}
                          <button
                            type="button"
                            onClick={clearFilters}
                            className="text-indigo-400 underline hover:text-indigo-300"
                          >
                            Clear filters
                          </button>
                        </>
                      )}
                    </p>
                  ) : (
                    <ul
                      key={`list-${sortLevels.map((s) => `${s.key}${s.dir}`).join('-')}-${catSubject}-${catTopic}-${catSearch}`}
                      className="divide-y divide-zinc-800/80"
                    >
                      {catalogItems.map((item, index) => {
                        const active = item.id === selectedId
                        return (
                          <li key={`${item.id}-${index}`}>
                            <button
                              type="button"
                              onClick={() => setSelectedId(item.id)}
                              className={`flex w-full items-start gap-2 px-2 py-1.5 text-left transition ${
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
                              <span className="w-[22%] shrink-0 truncate text-[10px] text-zinc-600">
                                {subjectLabel(item.subject)}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle
              className="group relative h-1.5 shrink-0 bg-zinc-900 transition hover:bg-indigo-500/50 data-[resize-handle-active]:bg-indigo-500/60"
              title="Drag to resize preview"
            >
              <span
                className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-700 group-hover:bg-indigo-400/80 group-data-[resize-handle-active]:bg-indigo-400"
                aria-hidden
              />
            </PanelResizeHandle>

            {/* Bottom preview + append — height grows with drag */}
            <Panel defaultSize={42} minSize={18} maxSize={70} order={2}>
              <div className="flex h-full min-h-0 flex-col border-t border-zinc-700 bg-[#161616]">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-2 py-1">
                  <span className="truncate text-[10px] font-medium text-zinc-400">
                    {selected ? selected.title : 'Select a formula'}
                  </span>
                  {selected && (
                    <span className="shrink-0 text-[9px] text-zinc-600">
                      {selected.topic}
                    </span>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                  {selected?.latex ? (
                    <div className="space-y-1">
                      <LatexView
                        latex={selected.latex}
                        className="text-sm text-zinc-100 [&_.katex-display]:m-0"
                      />
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
                    <p className="py-2 text-center text-[11px] text-zinc-600">
                      Choose a row above to preview KaTeX here.
                    </p>
                  )}
                </div>
                <div className="shrink-0 border-t border-zinc-800 px-2 py-2">
                  <button
                    type="button"
                    disabled={!selected?.latex}
                    onClick={appendSelected}
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      appendFlash
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-500 text-white hover:bg-indigo-400'
                    }`}
                  >
                    {appendFlash ? 'Appended' : 'Append to field'}
                  </button>
                </div>
              </div>
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  )
}
