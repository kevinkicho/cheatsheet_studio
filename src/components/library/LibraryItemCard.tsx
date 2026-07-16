import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Check, Copy, Heart } from 'lucide-react'
import type { LibraryItem } from '@/types'
import { useUiStore } from '@/stores/uiStore'
import { LibraryItemPreviewBody, libraryPaintKind } from './LibraryItemPreviewBody'
import {
  LibraryHoverPreview,
  useLibraryHoverPreview,
} from './LibraryHoverPreview'
import {
  LIBRARY_ZOOM_MAX,
  LIBRARY_ZOOM_MIN,
  LIBRARY_ZOOM_STEP,
  clampLibraryZoom,
  libraryStageSize,
  scrollAfterZoomAtPoint,
} from './libraryPreviewModel'

interface LibraryItemCardProps {
  item: LibraryItem
  compact?: boolean
  /** Hide equation/table/figure preview; label row only. */
  labelsOnly?: boolean
  /** When false, no hover tooltip is shown. */
  hoverPreviewEnabled?: boolean
  /**
   * Static tile for modals / review — no drag listeners (exact library look).
   */
  previewOnly?: boolean
  /** Shared hover-preview controller from parent (preferred — one tooltip at a time). */
  hover?: {
    onEnter: (item: LibraryItem, el: HTMLElement) => void
    onLeave: () => void
  }
}

/**
 * Fixed-size library tile with a taller zoom-fit preview.
 * Outer padding is uniform (L/R/B equal) so the content fill sits evenly.
 */
function LibraryItemCardInner({
  item,
  compact = false,
  labelsOnly = false,
  hoverPreviewEnabled = true,
  previewOnly = false,
  hover,
}: LibraryItemCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const contentWellRef = useRef<HTMLDivElement | null>(null)
  const localHover = useLibraryHoverPreview()
  const useLocal = hoverPreviewEnabled && !hover && !previewOnly
  const [copied, setCopied] = useState(false)
  /** Hover/focus on tile — enables wheel zoom of content */
  const [highlighted, setHighlighted] = useState(false)
  /** Content zoom (1 = default). Wheel while highlighted. */
  const [contentZoom, setContentZoom] = useState(1)
  /** Measured viewport of the content well (not % of overflow parent). */
  const [wellSize, setWellSize] = useState({ w: 160, h: 120 })
  const isFavorite = useUiStore((s) => s.libraryFavoriteIds.includes(item.id))
  const toggleLibraryFavorite = useUiStore((s) => s.toggleLibraryFavorite)
  const paintKind = libraryPaintKind(item)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib-preview-${item.id}`,
    data: {
      from: 'library',
      libraryItem: item,
    },
    disabled: previewOnly,
  })

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node
      setNodeRef(node)
    },
    [setNodeRef],
  )

  // Taller fixed tiles + equal outer pad (L/R/B match — no extra left gutter)
  // compact (bottom panel): ~11rem total · full library: ~13rem
  const tileClass = labelsOnly
    ? 'px-2.5 py-1.5'
    : compact
      ? 'h-[11rem] p-2.5'
      : 'h-[13rem] p-3'

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
    setHighlighted(true)
    if (!hoverPreviewEnabled || isDragging) return
    const el = cardRef.current
    if (!el) return
    if (hover) hover.onEnter(item, el)
    else localHover.onEnter(item, el)
  }

  const handleLeave = () => {
    setHighlighted(false)
    setContentZoom(1)
    if (!hoverPreviewEnabled) return
    if (hover) hover.onLeave()
    else localHover.onLeave()
  }

  const toggleFavorite = (e: MouseEvent | PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    toggleLibraryFavorite(item.id)
  }

  // Measure well in pixels — % heights inside overflow:auto are unreliable
  useEffect(() => {
    const el = contentWellRef.current
    if (!el || labelsOnly) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      const w = Math.max(48, Math.round(cr.width))
      const h = Math.max(48, Math.round(cr.height))
      setWellSize((prev) =>
        prev.w === w && prev.h === h ? prev : { w, h },
      )
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [labelsOnly])

  // Non-passive wheel: zoom toward the cursor (content under mouse stays put)
  useEffect(() => {
    const el = contentWellRef.current
    if (!el || labelsOnly) return
    const onWheel = (e: WheelEvent) => {
      if (!highlighted && !previewOnly) return
      e.preventDefault()
      e.stopPropagation()
      const dir = e.deltaY > 0 ? -1 : 1
      const step =
        e.ctrlKey || e.metaKey ? LIBRARY_ZOOM_STEP * 1.4 : LIBRARY_ZOOM_STEP
      setContentZoom((z) => {
        const next = clampLibraryZoom(z + dir * step)
        if (next === z) return z
        scrollAfterZoomAtPoint(el, z, next, e.clientX, e.clientY)
        return next
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [highlighted, labelsOnly, previewOnly])

  const stage = libraryStageSize(wellSize.w, wellSize.h, contentZoom)
  // Prose: always paint into the well viewport (wrap + auto-fit at zoom=1).
  // Math/figure: stage grows with zoom so FitContent/SVG can paint larger.
  const stageW = paintKind === 'prose' ? wellSize.w : stage.w
  const stageH = paintKind === 'prose' ? wellSize.h : stage.h

  return (
    <>
      <div
        ref={setRefs}
        {...listeners}
        {...attributes}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={() => setHighlighted(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setHighlighted(false)
            setContentZoom(1)
          }
        }}
        title={
          previewOnly
            ? item.description
              ? `${item.title} — ${item.description}`
              : item.title
            : item.description
              ? `${item.title} — ${item.description} (drag onto canvas · scroll to zoom content)`
              : 'Drag onto canvas · hover + scroll wheel to zoom content'
        }
        className={`group relative flex touch-none flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/80 transition ${
          previewOnly
            ? 'cursor-default'
            : 'cursor-grab active:cursor-grabbing'
        } ${isDragging ? 'opacity-40' : 'hover:border-indigo-500/50'} ${
          highlighted && !isDragging ? 'ring-1 ring-indigo-500/40' : ''
        } ${tileClass}`}
      >
        {/* Header: heart (favorites) top-left · title · topic */}
        <div className="flex h-5 shrink-0 items-center gap-1">
          <button
            type="button"
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={
              isFavorite ? 'Remove from favorites' : 'Add to favorites'
            }
            aria-pressed={isFavorite}
            data-testid="library-card-favorite"
            className={`pointer-events-auto flex h-5 w-5 shrink-0 items-center justify-center rounded transition ${
              isFavorite
                ? 'text-rose-400 hover:bg-rose-500/15'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-rose-300'
            }`}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onClick={toggleFavorite}
          >
            <Heart
              className={`h-3.5 w-3.5 ${
                isFavorite ? 'fill-rose-500 text-rose-400' : ''
              }`}
            />
          </button>
          <h4 className="pointer-events-none min-w-0 flex-1 truncate text-xs font-medium leading-5 text-zinc-100">
            {item.title}
          </h4>
          <span className="pointer-events-none max-w-[40%] shrink-0 truncate text-right text-[10px] leading-5 text-zinc-400/50">
            {item.topic}
          </span>
        </div>

        {!labelsOnly && (
          /*
           * Viewport (measured px) → centered stage (well × zoom).
           * See libraryPreviewModel.ts — no CSS-scale vs FitContent fights.
           */
          <div
            ref={contentWellRef}
            className={`library-card-content-well relative mt-2 min-h-0 flex-1 overflow-auto rounded-md bg-zinc-950/70 p-1.5 ${
              highlighted ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            data-content-zoom={contentZoom.toFixed(2)}
            data-paint-kind={paintKind}
            data-testid="library-card-zoom-well"
          >
            <div
              className="flex items-center justify-center"
              style={{
                minWidth: '100%',
                minHeight: '100%',
                // Scrollport grows with stage for math/figures when zoomed.
                width: Math.max(wellSize.w, stageW),
                height: Math.max(wellSize.h, stageH),
              }}
            >
              <LibraryItemPreviewBody
                item={item}
                contentZoom={contentZoom}
                stageW={stageW}
                stageH={stageH}
              />
            </div>
            {contentZoom !== 1 ? (
              <span className="pointer-events-none absolute bottom-1 left-1 z-10 rounded bg-zinc-950/90 px-1 py-0.5 text-[9px] tabular-nums text-zinc-400">
                {Math.round(contentZoom * 100)}%
              </span>
            ) : null}
          </div>
        )}

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
            className={`absolute bottom-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-950/90 text-zinc-400 opacity-0 shadow transition hover:border-indigo-500/50 hover:text-indigo-200 group-hover:opacity-100 ${
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

export const LibraryItemCard = memo(LibraryItemCardInner)

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
