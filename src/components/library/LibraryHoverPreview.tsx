import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { LibraryItem } from '@/types'
import { FitContent } from '@/components/math/FitContent'
import { FigureView } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'

const PREVIEW_W = 380
const PREVIEW_H = 260
const PAD = 12
const SHOW_DELAY_MS = 250
const HIDE_DELAY_MS = 150

interface LibraryHoverPreviewProps {
  item: LibraryItem
  anchorEl: HTMLElement | null
  open: boolean
  onRequestClose: () => void
  onRequestKeepOpen: () => void
}

/**
 * Floating scale-to-fit preview of a library item.
 * Portaled to body so overflow:hidden library panels never clip it.
 */
export function LibraryHoverPreview({
  item,
  anchorEl,
  open,
  onRequestClose,
  onRequestKeepOpen,
}: LibraryHoverPreviewProps) {
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !anchorEl) return

    const place = () => {
      const rect = anchorEl.getBoundingClientRect()
      let left = rect.left + rect.width / 2 - PREVIEW_W / 2
      let top = rect.top - PREVIEW_H - PAD - 36 // header ~36px

      if (top < PAD) {
        top = rect.bottom + PAD
      }
      left = Math.max(
        PAD,
        Math.min(left, window.innerWidth - PREVIEW_W - PAD),
      )
      if (top + PREVIEW_H + 48 > window.innerHeight - PAD) {
        top = Math.max(PAD, window.innerHeight - PREVIEW_H - 56)
      }

      setPos({ top, left })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorEl, item.id])

  if (!open) return null

  return createPortal(
    <div
      role="tooltip"
      onMouseEnter={onRequestKeepOpen}
      onMouseLeave={onRequestClose}
      className="pointer-events-auto fixed z-[10000] overflow-hidden rounded-xl border border-indigo-500/40 bg-zinc-950 shadow-2xl shadow-black/60 ring-1 ring-white/5"
      style={{
        top: pos.top,
        left: pos.left,
        width: PREVIEW_W,
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-zinc-50">
          {item.title}
        </p>
        {item.topic ? (
          <span className="max-w-[42%] shrink-0 truncate rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-zinc-700/80">
            {item.topic}
          </span>
        ) : null}
      </div>

      {item.description && (
        <p className="border-b border-zinc-800/80 px-3 py-1.5 text-[11px] leading-snug text-zinc-400">
          {item.description}
        </p>
      )}
      {item.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-zinc-800/80 px-3 py-1.5">
          {item.tags.slice(0, 6).map((t) => (
            <span
              key={t}
              className="rounded bg-zinc-900 px-1.5 py-px text-[9px] text-zinc-500 ring-1 ring-zinc-800"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div
        style={{ height: PREVIEW_H }}
        className="w-full bg-zinc-900/40 p-3"
        // Keep tooltip layout self-contained so library tiles never reflow
        data-library-hover-preview
      >
        {item.type === 'figure' && item.imageUrl ? (
          <FitContent
            mode="scale"
            fitMethod="transform"
            align="center"
            minScale={0.05}
            maxScale={32}
            showBadge
            contentKey={`hover-fig-${item.id}-${item.imageUrl}`}
            className="h-full w-full"
          >
            <FigureView
              src={item.imageUrl}
              alt={item.title}
              fillContainer={false}
            />
          </FitContent>
        ) : (
          <FitContent
            mode="scale"
            minScale={0.12}
            maxScale={16}
            fitMethod="transform"
            align="center"
            baseFontSize={16}
            showBadge
            contentKey={`hover-body-${item.id}-${item.latex ?? ''}-${item.tableMarkdown ?? ''}`}
            className="h-full w-full"
          >
            {(item.type === 'equation' || item.latex) && item.latex && (
              <LatexView
                latex={item.latex}
                className="overflow-visible text-zinc-100 [&_.katex]:text-[1.1em] [&_.katex-display]:m-0"
              />
            )}
            {item.type === 'table' && item.tableMarkdown && (
              <MarkdownTable
                markdown={item.tableMarkdown}
                fitContent
                className="overflow-visible text-sm"
              />
            )}
            {!item.latex && !item.tableMarkdown && !item.imageUrl && (
              <p className="text-xs text-zinc-500">No preview content</p>
            )}
          </FitContent>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Hook: delayed hover open/close for library card previews. */
export function useLibraryHoverPreview() {
  const [state, setState] = useState<{
    item: LibraryItem | null
    anchor: HTMLElement | null
  }>({ item: null, anchor: null })
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep latest item id for stable enter comparison without stale closures
  const openIdRef = useRef<string | null>(null)

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    showTimer.current = null
    hideTimer.current = null
  }

  useEffect(() => () => clearTimers(), [])

  const onEnter = useCallback((item: LibraryItem, el: HTMLElement) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    if (openIdRef.current === item.id) {
      setState({ item, anchor: el })
      return
    }
    if (showTimer.current) clearTimeout(showTimer.current)
    showTimer.current = setTimeout(() => {
      openIdRef.current = item.id
      setState({ item, anchor: el })
    }, SHOW_DELAY_MS)
  }, [])

  const onLeave = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
    hideTimer.current = setTimeout(() => {
      openIdRef.current = null
      setState({ item: null, anchor: null })
    }, HIDE_DELAY_MS)
  }, [])

  const keepOpen = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const close = useCallback(() => {
    clearTimers()
    openIdRef.current = null
    setState({ item: null, anchor: null })
  }, [])

  return {
    previewItem: state.item,
    previewAnchor: state.anchor,
    onEnter,
    onLeave,
    keepOpen,
    close,
  }
}
