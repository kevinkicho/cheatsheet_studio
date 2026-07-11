import {
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Check, Copy, ImageIcon, Sigma, Table2 } from 'lucide-react'
import type { LibraryItem } from '@/types'
import { FitContent } from '@/components/math/FitContent'
import { FigureView } from '@/components/math/FigureView'
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
  const [copied, setCopied] = useState(false)

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
  const canCopyLatex = Boolean(item.latex)

  const copyLatex = async (e: MouseEvent | PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!item.latex) return
    try {
      await navigator.clipboard.writeText(item.latex)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard may be blocked */
    }
  }

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
        title={
          item.description
            ? `${item.title} — ${item.description} (drag onto canvas)`
            : 'Drag onto the canvas'
        }
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
            <span className="max-w-[36%] shrink-0 truncate text-right text-[10px] leading-4 text-zinc-400/50">
              {item.topic}
            </span>
          </div>

          {!labelsOnly &&
            (item.type === 'figure' && item.imageUrl ? (
              <div
                className={`w-full rounded-md bg-transparent p-1 ${previewH}`}
              >
                <FigureView src={item.imageUrl} alt={item.title} />
              </div>
            ) : (
              <FitContent
                mode="scale"
                minScale={0.22}
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
              </FitContent>
            ))}
        </div>

        {/* Copy KaTeX — interactive island (does not start drag) */}
        {canCopyLatex && (
          <button
            type="button"
            title="Copy KaTeX to clipboard"
            onPointerDown={(e) => {
              e.stopPropagation()
            }}
            onClick={(e) => {
              void copyLatex(e)
            }}
            className={`absolute bottom-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-950/90 text-zinc-400 opacity-0 shadow transition hover:border-indigo-500/50 hover:text-indigo-200 group-hover:opacity-100 ${
              copied ? 'opacity-100 border-emerald-500/40 text-emerald-300' : ''
            }`}
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        )}
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
