import {
  FolderTree,
  LayoutGrid,
  List,
  MessageSquareText,
  Search,
  Sigma,
} from 'lucide-react'
import { SUBJECTS, type Subject } from '@/types'
import { useLibraryStore } from '@/stores/libraryStore'
import { useUiStore } from '@/stores/uiStore'
import {
  LibraryHoverPreviewHost,
  LibraryItemCard,
} from '@/components/library/LibraryItemCard'
import { useLibraryHoverPreview } from '@/components/library/LibraryHoverPreview'

function cardGridClass(labelsOnly: boolean) {
  return labelsOnly
    ? 'grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
    : 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
}

export function BottomLibraryPanel() {
  const items = useLibraryStore((s) => s.items)
  const source = useLibraryStore((s) => s.source)
  const librarySubject = useUiStore((s) => s.librarySubject) as Subject
  const setLibrarySubject = useUiStore((s) => s.setLibrarySubject)
  const librarySearch = useUiStore((s) => s.librarySearch)
  const setLibrarySearch = useUiStore((s) => s.setLibrarySearch)
  const labelsOnly = useUiStore((s) => s.libraryLabelsOnly)
  const toggleLibraryLabelsOnly = useUiStore((s) => s.toggleLibraryLabelsOnly)
  const hoverPreview = useUiStore((s) => s.libraryHoverPreview)
  const toggleLibraryHoverPreview = useUiStore(
    (s) => s.toggleLibraryHoverPreview,
  )
  const groupByTopic = useUiStore((s) => s.libraryGroupByTopic)
  const toggleLibraryGroupByTopic = useUiStore(
    (s) => s.toggleLibraryGroupByTopic,
  )
  const equationsOnly = useUiStore((s) => s.libraryEquationsOnly)
  const toggleLibraryEquationsOnly = useUiStore(
    (s) => s.toggleLibraryEquationsOnly,
  )
  const hover = useLibraryHoverPreview()

  const filtered = items.filter((item) => {
    if (item.subject !== librarySubject) return false
    if (equationsOnly && item.type !== 'equation') return false
    if (!librarySearch.trim()) return true
    const q = librarySearch.toLowerCase()
    return (
      item.title.toLowerCase().includes(q) ||
      item.topic.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q)) ||
      (item.latex?.toLowerCase().includes(q) ?? false)
    )
  })

  const topics = Array.from(new Set(filtered.map((i) => i.topic))).sort()

  const hoverProps = hoverPreview
    ? {
        hoverPreviewEnabled: true as const,
        hover: {
          onEnter: hover.onEnter,
          onLeave: hover.onLeave,
        },
      }
    : { hoverPreviewEnabled: false as const }

  const renderCard = (item: (typeof filtered)[0]) => (
    <LibraryItemCard
      key={item.id}
      item={item}
      compact
      labelsOnly={labelsOnly}
      {...hoverProps}
    />
  )

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {hoverPreview && <LibraryHoverPreviewHost hover={hover} />}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Library
        </span>
        <span className="text-[10px] text-zinc-600">
          {source === 'seed' ? 'local catalog' : 'cloud'} · {filtered.length}{' '}
          items
        </span>

        <button
          type="button"
          onClick={toggleLibraryLabelsOnly}
          title={
            labelsOnly
              ? 'Show equation / figure previews'
              : 'Collapse to labels only (easier navigation)'
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

        <button
          type="button"
          onClick={toggleLibraryGroupByTopic}
          title={
            groupByTopic
              ? 'Turn off grouping by topic (flat list)'
              : 'Group cards by topic (Algebra, Calculus, …)'
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

        <button
          type="button"
          onClick={toggleLibraryEquationsOnly}
          title={
            equationsOnly
              ? 'Show all library items (equations, tables, figures)'
              : 'Show equations only — browse named formulas'
          }
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
            equationsOnly
              ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
              : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200'
          }`}
        >
          <Sigma className="h-3.5 w-3.5" />
          Equations
        </button>

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

        <div className="ml-auto flex min-w-[160px] max-w-xs flex-1 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1">
          <Search className="h-3.5 w-3.5 text-zinc-500" />
          <input
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            placeholder="Search formula name, topic…"
            className="w-full bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </div>
      </div>

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-800 px-2 py-1.5">
        {SUBJECTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setLibrarySubject(s.id)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              librarySubject === s.id
                ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/40'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-zinc-500">
            No items match. Browse subjects above, search a formula name, or
            turn off “Equations” filter.
          </p>
        ) : groupByTopic ? (
          <div className="space-y-4">
            {topics.map((topic) => (
              <section key={topic}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {topic}
                </h3>
                <div className={cardGridClass(labelsOnly)}>
                  {filtered
                    .filter((i) => i.topic === topic)
                    .map(renderCard)}
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
    </div>
  )
}
