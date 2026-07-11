import { useCallback, useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { ImageIcon, Sigma, Table2 } from 'lucide-react'
import type { LibraryItem } from '@/types'
import { FitContent } from '@/components/math/FitContent'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import {
  LibraryHoverPreview,
  useLibraryHoverPreview,
} from './LibraryHoverPreview'

interface LibraryItemCardProps {
  item: LibraryItem
  compact?: boolean
  /** Hide equation/table/figure preview; label row only. */
  labelsOnly?: boolean
  /** When false, no hover tooltip is shown. */
  hoverPreviewEnabled?: boolean
  /** Shared hover-preview controller from parent (preferred — one tooltip at a time). */
  hover?: {
    onEnter: (item: LibraryItem, el: HTMLElement) => void
    onLeave: () => void
  }
}

export function LibraryItemCard({
  item,
  compact = false,
  labelsOnly = false,
  hoverPreviewEnabled = true,
  hover,
}: LibraryItemCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const localHover = useLibraryHoverPreview()
  const useLocal = hoverPreviewEnabled && !hover

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib-${item.id}`,
    data: {
      from: 'library',
      libraryItem: item,
    },
  })

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node
      setNodeRef(node)
    },
    [setNodeRef],
  )

  const TypeIcon =
    item.type === 'table' ? Table2 : item.type === 'figure' ? ImageIcon : Sigma

  const previewH = compact ? 'h-[4.5rem]' : 'h-24'

  const handleEnter = () => {
    if (!hoverPreviewEnabled || isDragging) return
    const el = cardRef.current
    if (!el) return
    if (hover) hover.onEnter(item, el)
    else localHover.onEnter(item, el)
  }

  const handleLeave = () => {
    if (!hoverPreviewEnabled) return
    if (hover) hover.onLeave()
    else localHover.onLeave()
  }

  return (
    <>
      <div
        ref={setRefs}
        {...listeners}
        {...attributes}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        title="Drag onto the canvas"
        className={`group relative flex touch-none cursor-grab flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/80 transition active:cursor-grabbing ${
          isDragging ? 'opacity-40' : 'hover:border-indigo-500/50'
        } ${labelsOnly ? 'px-2 py-1.5' : compact ? 'p-2' : 'p-3'}`}
      >
        {/* Content non-interactive so empty padding + formula area all start a drag */}
        <div className="pointer-events-none flex min-h-0 flex-1 flex-col">
          <div
            className={`flex shrink-0 items-start gap-1.5 ${labelsOnly ? '' : 'mb-1.5'}`}
          >
            <TypeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
            <h4 className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-100">
              {item.title}
            </h4>
            {/* Topic in top-right (was under the title) */}
            <span className="max-w-[40%] shrink-0 truncate text-right text-[10px] leading-4 text-zinc-400/50">
              {item.topic}
            </span>
          </div>

          {!labelsOnly && (
            <FitContent
              mode="scale"
              minScale={0.22}
              fitMethod={
                item.type === 'figure' || item.imageUrl ? 'transform' : 'fontSize'
              }
              baseFontSize={14}
              showBadge
              contentKey={`${item.id}-${item.latex ?? ''}-${item.tableMarkdown ?? ''}`}
              className={`w-full rounded-md bg-zinc-950/60 p-1.5 ${previewH}`}
            >
              {(item.type === 'equation' || item.latex) && item.latex && (
                <LatexView
                  latex={item.latex}
                  className="overflow-visible text-xs text-zinc-100 [&_.katex]:text-[0.9em] [&_.katex-display]:m-0"
                />
              )}
              {item.type === 'table' && item.tableMarkdown && (
                <MarkdownTable
                  markdown={item.tableMarkdown}
                  fitContent
                  className="overflow-visible [&_td]:py-0.5 [&_th]:py-0.5"
                />
              )}
              {item.type === 'figure' && item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="block max-h-20 object-contain"
                  draggable={false}
                />
              )}
            </FitContent>
          )}
        </div>
      </div>

      {useLocal &&
        hoverPreviewEnabled &&
        localHover.previewItem?.id === item.id && (
          <LibraryHoverPreview
            item={item}
            anchorEl={localHover.previewAnchor}
            open
            onRequestClose={localHover.close}
            onRequestKeepOpen={localHover.keepOpen}
          />
        )}
    </>
  )
}

/** Host one shared hover preview for a whole library list (avoids N timers). */
export function LibraryHoverPreviewHost({
  hover,
}: {
  hover: ReturnType<typeof useLibraryHoverPreview>
}) {
  if (!hover.previewItem) return null
  return (
    <LibraryHoverPreview
      item={hover.previewItem}
      anchorEl={hover.previewAnchor}
      open
      onRequestClose={hover.close}
      onRequestKeepOpen={hover.keepOpen}
    />
  )
}
