import { useMemo } from 'react'
import {
  FolderTree,
  LayoutGrid,
  List,
  MessageSquareText,
} from 'lucide-react'
import { SUBJECTS } from '@/types'
import { useLibraryStore } from '@/stores/libraryStore'
import { useUiStore } from '@/stores/uiStore'
import {
  LibraryHoverPreviewHost,
  LibraryItemCard,
} from '@/components/library/LibraryItemCard'
import { useLibraryHoverPreview } from '@/components/library/LibraryHoverPreview'
import { filterLibraryItems } from '@/lib/libraryFilter'

function cardGridClass(labelsOnly: boolean) {
  // items-start: fixed library tiles (zoom-fit inside; card size does not grow)
  return labelsOnly
    ? 'grid grid-cols-1 items-start gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
    : 'grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
}

export function FullLibraryView() {
  const items = useLibraryStore((s) => s.items)
  const librarySubject = useUiStore((s) => s.librarySubject)
  const setLibrarySubject = useUiStore((s) => s.setLibrarySubject)
  const librarySearch = useUiStore((s) => s.librarySearch)
  const setLibrarySearch = useUiStore((s) => s.setLibrarySearch)
  const libraryTopic = useUiStore((s) => s.libraryTopic)
  const libraryTypeFilter = useUiStore((s) => s.libraryTypeFilter)
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
  const setView = useUiStore((s) => s.setView)
  const hover = useLibraryHoverPreview()

  const filtered = filterLibraryItems(items, {
    subject: librarySubject,
    topic: libraryTopic,
    type: libraryTypeFilter,
    search: librarySearch,
  })

  const topics = Array.from(new Set(filtered.map((i) => i.topic))).sort()

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
      labelsOnly={labelsOnly}
      {...hoverHandlers}
    />
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {hoverPreview && <LibraryHoverPreviewHost hover={hover} />}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <h1 className="text-sm font-semibold text-zinc-100">Full library</h1>
        <input
          value={librarySearch}
          onChange={(e) => setLibrarySearch(e.target.value)}
          placeholder="Search…"
          className="field-input max-w-xs"
        />
        <button
          type="button"
          onClick={toggleLibraryLabelsOnly}
          title={
            labelsOnly
              ? 'Show equation / figure previews'
              : 'Collapse to labels only'
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
        <button
          type="button"
          onClick={() => setView('workspace')}
          className="ml-auto text-xs text-indigo-300 hover:underline"
        >
          Back to workspace
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-3 py-2">
        <button
          type="button"
          onClick={() => setLibrarySubject('all')}
          className={`shrink-0 rounded-full px-3 py-1 text-xs ${
            librarySubject === 'all'
              ? 'bg-indigo-500/20 text-indigo-200'
              : 'text-zinc-400 hover:bg-zinc-900'
          }`}
        >
          All
        </button>
        {SUBJECTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setLibrarySubject(s.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs ${
              librarySubject === s.id
                ? 'bg-indigo-500/20 text-indigo-200'
                : 'text-zinc-400 hover:bg-zinc-900'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-zinc-500">No items match.</p>
        ) : groupByTopic ? (
          <div className="space-y-6">
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
