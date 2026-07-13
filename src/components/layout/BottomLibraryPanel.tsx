import { useEffect, useMemo } from 'react'
import {
  FolderTree,
  Heart,
  LayoutGrid,
  List,
  MessageSquareText,
  Rows3,
  Search,
  X,
} from 'lucide-react'
import { SUBJECTS } from '@/types'
import { useLibraryStore } from '@/stores/libraryStore'
import {
  useUiStore,
  type LibraryLayout,
  type LibraryTypeFilter,
} from '@/stores/uiStore'
import {
  LibraryHoverPreviewHost,
  LibraryItemCard,
} from '@/components/library/LibraryItemCard'
import { LibraryCatalogList } from '@/components/library/LibraryCatalogList'
import { useLibraryHoverPreview } from '@/components/library/LibraryHoverPreview'
import { filterLibraryItems } from '@/lib/libraryFilter'

function cardGridClass(labelsOnly: boolean) {
  // items-start: keep fixed tile heights (do not stretch cards to the tallest row)
  return labelsOnly
    ? 'grid grid-cols-1 items-start gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
    : 'grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

export function BottomLibraryPanel() {
  const items = useLibraryStore((s) => s.items)
  const source = useLibraryStore((s) => s.source)
  const librarySubject = useUiStore((s) => s.librarySubject)
  const setLibrarySubject = useUiStore((s) => s.setLibrarySubject)
  const librarySearch = useUiStore((s) => s.librarySearch)
  const setLibrarySearch = useUiStore((s) => s.setLibrarySearch)
  const libraryTopic = useUiStore((s) => s.libraryTopic)
  const setLibraryTopic = useUiStore((s) => s.setLibraryTopic)
  const libraryTypeFilter = useUiStore((s) => s.libraryTypeFilter)
  const setLibraryTypeFilter = useUiStore((s) => s.setLibraryTypeFilter)
  const clearLibraryFilters = useUiStore((s) => s.clearLibraryFilters)
  const libraryFavoriteIds = useUiStore((s) => s.libraryFavoriteIds)
  const libraryFavoritesOnly = useUiStore((s) => s.libraryFavoritesOnly)
  const toggleLibraryFavoritesOnly = useUiStore(
    (s) => s.toggleLibraryFavoritesOnly,
  )
  const labelsOnly = useUiStore((s) => s.libraryLabelsOnly)
  const toggleLibraryLabelsOnly = useUiStore((s) => s.toggleLibraryLabelsOnly)
  const libraryLayout = useUiStore((s) => s.libraryLayout)
  const setLibraryLayout = useUiStore((s) => s.setLibraryLayout)
  const hoverPreview = useUiStore((s) => s.libraryHoverPreview)
  const toggleLibraryHoverPreview = useUiStore(
    (s) => s.toggleLibraryHoverPreview,
  )
  const groupByTopic = useUiStore((s) => s.libraryGroupByTopic)
  const toggleLibraryGroupByTopic = useUiStore(
    (s) => s.toggleLibraryGroupByTopic,
  )
  const hover = useLibraryHoverPreview()

  const isList = libraryLayout === 'list'

  /** Topics available for current subject (before topic/type/search filters). */
  const topicOptions = useMemo(() => {
    const subj =
      librarySubject === 'all' ? null : librarySubject.toLowerCase()
    const pool = items.filter((i) => {
      if (subj && (i.subject ?? '').toLowerCase() !== subj) return false
      return true
    })
    const topics = new Set<string>()
    for (const i of pool) {
      const t = (i.topic ?? '').trim()
      if (t) topics.add(t)
    }
    return Array.from(topics).sort(cmpStr)
  }, [items, librarySubject])

  // Don't keep a topic that is not in the current subject (stale filter → empty list)
  useEffect(() => {
    if (libraryTopic !== 'all' && !topicOptions.includes(libraryTopic)) {
      setLibraryTopic('all')
    }
  }, [libraryTopic, topicOptions, setLibraryTopic])

  const effectiveTopic =
    libraryTopic !== 'all' && topicOptions.includes(libraryTopic)
      ? libraryTopic
      : 'all'

  const filtered = useMemo(() => {
    let list = filterLibraryItems(items, {
      subject: librarySubject,
      topic: effectiveTopic,
      type: libraryTypeFilter,
      search: librarySearch,
    })
    if (libraryFavoritesOnly) {
      const fav = new Set(libraryFavoriteIds)
      list = list.filter((i) => fav.has(i.id))
    }
    return list
  }, [
    items,
    librarySearch,
    librarySubject,
    effectiveTopic,
    libraryTypeFilter,
    libraryFavoritesOnly,
    libraryFavoriteIds,
  ])

  const topics = useMemo(
    () => Array.from(new Set(filtered.map((i) => i.topic))).sort(cmpStr),
    [filtered],
  )

  const hasActiveFilters =
    librarySubject !== 'all' ||
    effectiveTopic !== 'all' ||
    libraryTypeFilter !== 'all' ||
    librarySearch.trim().length > 0 ||
    libraryFavoritesOnly

  // Stable hover handlers so memoized LibraryItemCard does not re-render on tooltip open
  const hoverHandlers = useMemo(
    () =>
      hoverPreview
        ? {
            hoverPreviewEnabled: true as const,
            hover: {
              onEnter: hover.onEnter,
              onLeave: hover.onLeave,
            },
          }
        : { hoverPreviewEnabled: false as const },
    [hoverPreview, hover.onEnter, hover.onLeave],
  )

  const renderCard = (item: (typeof filtered)[0]) => (
    <LibraryItemCard
      key={item.id}
      item={item}
      compact
      labelsOnly={labelsOnly}
      {...hoverHandlers}
    />
  )

  const layoutBtn = (
    id: LibraryLayout,
    label: string,
    Icon: typeof LayoutGrid,
  ) => {
    const active = libraryLayout === id
    return (
      <button
        type="button"
        data-testid={`library-layout-${id}`}
        onClick={() => setLibraryLayout(id)}
        title={
          id === 'cards'
            ? 'Card grid with equation previews'
            : 'Detailed list: Name · Topic · Type + preview'
        }
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
          active
            ? 'bg-indigo-500/20 text-indigo-100'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{label}</span>
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {hoverPreview && !isList && <LibraryHoverPreviewHost hover={hover} />}

      {/* Top: title + layout / view options */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Library
        </span>
        <span className="text-[10px] text-zinc-600">
          {source === 'seed' ? 'local catalog' : 'cloud'}
        </span>

        <div
          className="inline-flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5"
          role="group"
          aria-label="Library layout"
        >
          {layoutBtn('cards', 'Cards', LayoutGrid)}
          {layoutBtn('list', 'List', Rows3)}
        </div>

        {!isList && (
          <button
            type="button"
            onClick={toggleLibraryLabelsOnly}
            title={
              labelsOnly
                ? 'Show equation / figure previews on cards'
                : 'Collapse cards to labels only'
            }
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              labelsOnly
                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            {labelsOnly ? (
              <>
                <List className="h-3.5 w-3.5" />
                Labels
              </>
            ) : (
              <>
                <LayoutGrid className="h-3.5 w-3.5" />
                Previews
              </>
            )}
          </button>
        )}

        {!isList && (
          <button
            type="button"
            onClick={toggleLibraryGroupByTopic}
            title={
              groupByTopic
                ? 'Turn off grouping by topic'
                : 'Group cards by topic'
            }
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              groupByTopic
                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <FolderTree className="h-3.5 w-3.5" />
            Topics
          </button>
        )}

        {!isList && (
          <button
            type="button"
            onClick={toggleLibraryHoverPreview}
            title={
              hoverPreview
                ? 'Disable full-preview tooltip on hover'
                : 'Enable full-preview tooltip on hover'
            }
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              hoverPreview
                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            Tooltip
          </button>
        )}
      </div>

      {/* Catalog-style filter / search toolbar */}
      <div
        className="flex shrink-0 flex-col gap-1.5 border-b border-zinc-800 bg-[#1a1a1a] px-2 py-2"
        data-testid="library-filter-toolbar"
      >
        <div
          className="relative z-10 flex items-center gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
          <input
            type="search"
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            onInput={(e) =>
              setLibrarySearch((e.target as HTMLInputElement).value)
            }
            placeholder="Filter by name, topic, tag, LaTeX…"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600"
            autoComplete="off"
            spellCheck={false}
            data-testid="library-search"
          />
          {librarySearch && (
            <button
              type="button"
              title="Clear search"
              onClick={() => setLibrarySearch('')}
              className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <span className="shrink-0 tabular-nums text-[10px] text-zinc-500">
            {filtered.length}/{items.length}
          </span>
        </div>

        <div
          className="relative z-10 flex flex-wrap items-center gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <select
            value={librarySubject}
            onChange={(e) => setLibrarySubject(e.target.value)}
            className="max-w-[38%] cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-indigo-500/50"
            title="Filter by subject"
            data-testid="library-filter-subject"
          >
            <option value="all">All subjects</option>
            {SUBJECTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={effectiveTopic}
            onChange={(e) => setLibraryTopic(e.target.value)}
            className="min-w-0 flex-1 cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-indigo-500/50"
            title="Filter by topic"
            data-testid="library-filter-topic"
          >
            <option value="all">All topics</option>
            {topicOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={libraryTypeFilter}
            onChange={(e) =>
              setLibraryTypeFilter(e.target.value as LibraryTypeFilter)
            }
            className="cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-indigo-500/50"
            title="Filter by type"
            data-testid="library-filter-type"
          >
            <option value="all">All types</option>
            <option value="equation">Equations</option>
            <option value="table">Tables</option>
            <option value="figure">Figures</option>
          </select>

          <button
            type="button"
            onClick={() => toggleLibraryFavoritesOnly()}
            title={
              libraryFavoritesOnly
                ? 'Show all catalog items'
                : 'Show only favorited items'
            }
            data-testid="library-filter-favorites"
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] font-medium transition ${
              libraryFavoritesOnly
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
            }`}
          >
            <Heart
              className={`h-3 w-3 ${
                libraryFavoritesOnly ? 'fill-rose-400 text-rose-300' : ''
              }`}
            />
            Favorites
          </button>
        </div>
      </div>

      {isList ? (
        <div className="min-h-0 flex-1">
          <LibraryCatalogList items={filtered} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              No items match
              {hasActiveFilters ? ' these filters' : ''}.
              {hasActiveFilters && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => clearLibraryFilters()}
                    className="text-indigo-400 underline hover:text-indigo-300"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </p>
          ) : groupByTopic ? (
            <div className="space-y-4">
              {topics.map((topic) => (
                <section key={topic}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {topic}
                  </h3>
                  <div className={cardGridClass(labelsOnly)}>
                    {filtered.filter((i) => i.topic === topic).map(renderCard)}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={cardGridClass(labelsOnly)}>
              {[...filtered]
                .sort((a, b) => a.title.localeCompare(b.title))
                .map(renderCard)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
