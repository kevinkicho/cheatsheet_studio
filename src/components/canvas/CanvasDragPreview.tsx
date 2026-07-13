import { useLayoutEffect, useRef, useState } from 'react'
import type { LibraryItem } from '@/types'
import {
  DEFAULT_ITEM_STYLE,
  DEFAULT_TITLE_FONT_SIZE,
  titleBandPx,
} from '@/types'
import { FigureView } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import { estimateLibraryCardSize } from '@/lib/canvasDrop'
import { composeBorderCss } from '@/lib/cardDefaults'

/** Match CanvasItemView autoFit slack so ghost size ≈ final card chrome. */
const PREVIEW_SLACK_PX = 2
const MAX_PREVIEW_W = 520
const MAX_PREVIEW_H = 420

/**
 * Ghost preview while dragging from the library.
 * Sized to natural content at 100% (base font) — same chrome + measure math as
 * canvas autoFit so drop can paste at this exact box.
 */
export function CanvasDragPreview({ item }: { item: LibraryItem }) {
  const isFigure = item.type === 'figure' && Boolean(item.imageUrl)
  const style = DEFAULT_ITEM_STYLE
  const baseFont = style.fontSize ?? 18
  const titleFs = style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE
  const titleBand = titleBandPx(titleFs)
  const estimate = estimateLibraryCardSize(item)
  const [box, setBox] = useState(estimate)
  const measureRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (isFigure) {
      setBox(estimate)
      return
    }
    const el = measureRef.current
    if (!el) return

    const apply = () => {
      const w = Math.ceil(Math.max(el.scrollWidth, el.offsetWidth, 1))
      const h = Math.ceil(Math.max(el.scrollHeight, el.offsetHeight, 1))
      if (w < 4 || h < 4) return
      // Same formula as CanvasItemView autoFit (content + title band + slack)
      setBox({
        width: Math.min(MAX_PREVIEW_W, Math.max(80, w + PREVIEW_SLACK_PX)),
        height: Math.min(
          MAX_PREVIEW_H,
          Math.max(40, h + titleBand + PREVIEW_SLACK_PX),
        ),
      })
    }

    apply()
    const t1 = window.setTimeout(apply, 40)
    const t2 = window.setTimeout(apply, 120)
    if (document.fonts?.ready) {
      void document.fonts.ready.then(apply)
    }
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [
    item.id,
    item.latex,
    item.tableMarkdown,
    isFigure,
    estimate.width,
    estimate.height,
    titleBand,
  ])

  return (
    <div
      data-canvas-drag-preview
      data-preview-scale="100"
      data-preview-width={box.width}
      data-preview-height={box.height}
      className="pointer-events-none select-none shadow-2xl ring-2 ring-indigo-400/80"
      style={{
        width: box.width,
        height: box.height,
        background: style.background ?? 'rgba(30,32,40,0.95)',
        border: composeBorderCss(style),
        borderRadius: 8,
        color: style.color ?? '#e8eaed',
        fontSize: baseFont,
        padding: 0,
        boxSizing: 'border-box',
        boxShadow:
          '0 0 0 1px rgba(129,140,248,0.45), 0 16px 40px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Title band matches CanvasItemView (font + line-height + margin) */}
      <div
        className="shrink-0 truncate px-0.5 font-medium uppercase tracking-wide text-zinc-500"
        style={{
          fontSize: titleFs,
          lineHeight: 1.6,
          marginBottom: 2,
          height: Math.round(titleFs * 1.6),
        }}
      >
        {item.title}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isFigure && item.imageUrl ? (
          <FigureView
            src={item.imageUrl}
            alt={item.title}
            fillContainer
            className="h-full w-full"
          />
        ) : (
          // Natural size at base font — no FitContent scale (stays 100%)
          <div
            ref={measureRef}
            className="inline-block"
            style={{ fontSize: baseFont }}
          >
            {(item.type === 'equation' || item.latex) && item.latex && (
              <LatexView
                latex={item.latex}
                className="overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0"
              />
            )}
            {item.type === 'table' && item.tableMarkdown && (
              <MarkdownTable
                markdown={item.tableMarkdown}
                fitContent
                className="overflow-visible text-inherit"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
