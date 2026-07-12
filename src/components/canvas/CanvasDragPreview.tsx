import { useLayoutEffect, useRef, useState } from 'react'
import type { LibraryItem } from '@/types'
import { DEFAULT_ITEM_STYLE } from '@/types'
import { FigureView } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import { estimateLibraryCardSize } from '@/lib/canvasDrop'

const TITLE_BAND = 18
const SLACK = 4

/**
 * Ghost preview while dragging from the library.
 * Sized to natural content at 100% (base font) so the drop matches what you drag.
 */
export function CanvasDragPreview({ item }: { item: LibraryItem }) {
  const isFigure = item.type === 'figure' && Boolean(item.imageUrl)
  const style = DEFAULT_ITEM_STYLE
  const baseFont = style.fontSize ?? 18
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
      setBox({
        width: Math.min(520, Math.max(80, w + SLACK)),
        height: Math.min(480, Math.max(40, h + TITLE_BAND + SLACK)),
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
  }, [item.id, item.latex, item.tableMarkdown, isFigure, estimate.width, estimate.height])

  return (
    <div
      data-canvas-drag-preview
      data-preview-scale="100"
      className="pointer-events-none select-none shadow-2xl ring-2 ring-indigo-400/80"
      style={{
        width: box.width,
        height: box.height,
        background: style.background ?? 'rgba(30,32,40,0.95)',
        border: style.border,
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
      <div className="h-[18px] shrink-0 truncate px-1 text-[10px] font-medium uppercase leading-[18px] tracking-wide text-zinc-500">
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
            className="inline-block px-0.5"
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
                className="overflow-visible"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
