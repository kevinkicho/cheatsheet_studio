import { useLayoutEffect, useRef, useState } from 'react'
import type { LibraryItem } from '@/types'
import {
  DEFAULT_ITEM_STYLE,
  DEFAULT_TITLE_FONT_SIZE,
  titleBandPx,
} from '@/types'
import {
  NATURAL_MAX_H,
  NATURAL_MAX_W,
  NATURAL_SLACK_PX,
  NaturalCardBody,
  naturalBodyWraps,
} from '@/components/canvas/NaturalCardBody'
import { LibraryItemPreviewBody, libraryItemAsCanvasPreview } from '@/components/library/LibraryItemPreviewBody'
import { estimateLibraryCardSize } from '@/lib/canvasDrop'
import { composeBorderCss } from '@/lib/cardDefaults'

/**
 * Ghost preview while dragging from the library.
 *
 * WYSIWYG contract (all kinds — equations, prose, constants, matrices, …):
 * - Paint unfitted content at the same base font as canvas cards (DEFAULT 18px).
 * - Box = content + title band + slack (same formula as canvas autoFit).
 * - Drop uses data-preview-width/height + matchPreview so the pasted card
 *   freezes at this box (no second autoFit jump).
 */
export function CanvasDragPreview({ item }: { item: LibraryItem }) {
  const isImage =
    (item.type === 'figure' || item.type === 'plot') && Boolean(item.imageUrl)
  const style = DEFAULT_ITEM_STYLE
  /** Canvas card body base font — not library tile 12px. */
  const baseFont = style.fontSize ?? 18
  const titleFs = style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE
  const titleBand = titleBandPx(titleFs)
  const estimate = estimateLibraryCardSize(item)
  const [box, setBox] = useState(estimate)
  const measureRef = useRef<HTMLDivElement>(null)
  const canvasItem = libraryItemAsCanvasPreview(item, { fontSize: baseFont })
  const wraps = naturalBodyWraps(canvasItem)

  useLayoutEffect(() => {
    if (isImage) {
      setBox(estimate)
      return
    }
    const el = measureRef.current
    if (!el) return

    const apply = () => {
      const w = Math.ceil(Math.max(el.scrollWidth, el.offsetWidth, 1))
      const h = Math.ceil(Math.max(el.scrollHeight, el.offsetHeight, 1))
      if (w < 4 || h < 4) return
      // Title may be wider than a short formula / term — same floor as autoFit
      const titleW = Math.ceil((item.title ?? '').length * titleFs * 0.58) + 12
      setBox({
        width: Math.min(
          NATURAL_MAX_W,
          Math.max(80, Math.max(w, titleW) + NATURAL_SLACK_PX),
        ),
        height: Math.min(
          NATURAL_MAX_H,
          Math.max(40, h + titleBand + NATURAL_SLACK_PX),
        ),
      })
    }

    apply()
    const t1 = window.setTimeout(apply, 40)
    const t2 = window.setTimeout(apply, 120)
    const t3 = window.setTimeout(apply, 280)
    if (document.fonts?.ready) {
      void document.fonts.ready.then(apply)
    }
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [
    item.id,
    item.type,
    item.title,
    item.latex,
    item.tableMarkdown,
    item.body,
    item.code,
    item.term,
    item.listItems?.join('|'),
    item.identities?.join('|'),
    item.symbol,
    item.value,
    item.unit,
    item.matrixRows?.map((r) => r.join(',')).join(';'),
    item.calloutVariant,
    isImage,
    estimate.width,
    estimate.height,
    titleBand,
    titleFs,
    baseFont,
  ])

  return (
    <div
      data-canvas-drag-preview
      data-preview-scale="100"
      data-preview-width={box.width}
      data-preview-height={box.height}
      data-preview-kind={item.type}
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
        {isImage ? (
          <LibraryItemPreviewBody
            item={item}
            stageW={Math.max(48, box.width - 4)}
            stageH={Math.max(48, box.height - titleBand - 4)}
          />
        ) : (
          <div
            ref={measureRef}
            className={wraps ? 'box-border min-w-0' : 'inline-block'}
            style={{
              fontSize: baseFont,
              // Prose: wrap like canvas ProseFit wrapToBox (cap = autoFit max)
              ...(wraps
                ? {
                    width: 'max-content',
                    maxWidth: NATURAL_MAX_W - NATURAL_SLACK_PX,
                  }
                : undefined),
            }}
          >
            <NaturalCardBody item={canvasItem} />
          </div>
        )}
      </div>
    </div>
  )
}
