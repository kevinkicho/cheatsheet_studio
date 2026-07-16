/**
 * Library tile painters. Layout/zoom owned by LibraryItemCard + libraryPreviewModel.
 *
 * Root-cause notes (do not regress):
 * - FigureView fillContainer needs a non-zero px host. `Math.max(48, undefined)` is
 *   NaN → empty figures when callers omit stageW/stageH.
 * - Math must use maxScale=1 (shrink-only). maxScale=64 always “fit to view”
 *   and cancels wheel zoom (font up → FitContent shrinks harder).
 * - Zoom for math/figures: parent grows stage (well × zoom); font scales with
 *   zoom; FitContent only prevents overflow.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { CanvasItem, LibraryItem } from '@/types'
import { DEFAULT_ITEM_STYLE } from '@/types'
import { CanvasCardBody } from '@/components/canvas/CanvasCardBody'
import {
  NATURAL_MAX_W,
  NaturalCardBody,
  naturalBodyWraps,
} from '@/components/canvas/NaturalCardBody'
import { FigureView, isSvgFigureSrc } from '@/components/math/FigureView'
import { FitContent } from '@/components/math/FitContent'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import {
  CalloutView,
  CodeView,
  ConstantView,
  DefinitionView,
  IdentitySetView,
  ListView,
  MatrixView,
} from '@/components/math/TextCardViews'
import {
  isEquationCard,
  isTableCard,
  libraryPayloadFields,
} from '@/lib/cardKinds'
import { isFigureLike } from '@/lib/cardDefaults'
import {
  LIBRARY_PROSE_MIN_FIT,
  libraryFontSize,
  type LibraryPaintKind,
} from './libraryPreviewModel'

export function libraryPaintKind(item: LibraryItem): LibraryPaintKind {
  const partial = {
    type: item.type,
    imageUrl: item.imageUrl,
    latex: item.latex,
    tableMarkdown: item.tableMarkdown,
    mermaidSource: undefined as string | undefined,
  }
  if (isFigureLike(partial) && item.imageUrl) return 'figure'
  if (
    item.type === 'definition' ||
    item.type === 'list' ||
    item.type === 'callout' ||
    item.type === 'code'
  ) {
    return 'prose'
  }
  if (
    isEquationCard(partial) ||
    isTableCard(partial) ||
    item.type === 'constant' ||
    item.type === 'identity-set' ||
    item.type === 'matrix'
  ) {
    return 'math'
  }
  return 'other'
}

export function libraryItemAsCanvasPreview(
  item: LibraryItem,
  opts?: { contentZoom?: number; fontSize?: number },
): CanvasItem {
  const fontSize =
    opts?.fontSize ?? libraryFontSize(opts?.contentZoom ?? 1)
  return {
    id: `lib-preview-${item.id}`,
    type: item.type,
    title: item.title,
    x: 0,
    y: 0,
    width: 200,
    height: 120,
    zIndex: 0,
    contentFill: true,
    keepAspectRatio: true,
    showTitle: false,
    contentFitKey: fontSize,
    style: {
      fontSize,
      titleFontSize: Math.max(10, Math.round(fontSize * 0.55)),
    },
    ...libraryPayloadFields(item),
  }
}

export type LibraryItemPreviewBodyProps = {
  item: LibraryItem
  contentZoom?: number
  /**
   * Measured well width (px). Optional — when omitted, measures parent box
   * so hover/catalog/drag callers never paint empty figures (NaN host).
   */
  stageW?: number
  /** Measured well height (px). Optional — see stageW. */
  stageH?: number
  /**
   * tile (default): fit into stage (library cards / hover).
   * natural: unfitted content at base font — for drag-ghost measure so
   * paste size matches KaTeX/table intrinsic size (not a 160×120 tile).
   */
  layout?: 'tile' | 'natural'
}

function safeStagePx(n: number | undefined, fallback: number): number {
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    return Math.max(48, Math.round(n))
  }
  return Math.max(48, Math.round(fallback))
}

/**
 * Prose: at zoom=1, auto-fit font so the whole block fits the well (no
 * accidental “zoomed in” clip). At zoom>1, use base×zoom and allow scroll.
 */
function ProsePreview({
  item,
  contentZoom,
  stageW,
  stageH,
}: {
  item: LibraryItem
  contentZoom: number
  stageW: number
  stageH: number
}) {
  const measureRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)
  const w = stageW
  const h = stageH

  // Measure unfitted prose at base×zoom, then scale down only at rest zoom.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    if (contentZoom > 1.001) {
      setFitScale(1)
      return
    }
    // Natural size at font without fit
    const naturalFs = libraryFontSize(contentZoom, 1)
    el.style.fontSize = `${naturalFs}px`
    el.style.width = `${w}px`
    void el.offsetHeight
    const ch = el.scrollHeight
    const cw = el.scrollWidth
    if (ch <= 1 || cw <= 1) {
      setFitScale(1)
      return
    }
    const sx = w / cw
    const sy = h / ch
    const s = Math.min(1, sx, sy)
    setFitScale(Math.max(LIBRARY_PROSE_MIN_FIT, Math.min(1, s)))
  }, [
    item.id,
    item.type,
    item.body,
    item.term,
    item.listItems,
    item.code,
    contentZoom,
    w,
    h,
  ])

  const fontSize = libraryFontSize(contentZoom, fitScale)
  const canvas = libraryItemAsCanvasPreview(item, { fontSize })

  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ width: w, height: h }}
      data-library-preview="prose"
      data-library-zoom={contentZoom.toFixed(2)}
      data-library-fit={fitScale.toFixed(2)}
    >
      <div
        ref={measureRef}
        className="library-card-content-text box-border max-w-full min-w-0 break-words text-inherit"
        style={{
          width: w,
          maxWidth: w,
          fontSize,
          // When zoomed past 1, allow height to grow (parent well scrolls)
          ...(contentZoom > 1.001
            ? { height: 'auto' }
            : { maxHeight: h, overflow: 'hidden' }),
        }}
      >
        {item.type === 'definition' && <DefinitionView item={canvas} />}
        {item.type === 'list' && <ListView item={canvas} />}
        {item.type === 'callout' && <CalloutView item={canvas} />}
        {item.type === 'code' && <CodeView item={canvas} />}
      </div>
    </div>
  )
}

function PreviewPaint({
  item,
  contentZoom,
  w,
  h,
}: {
  item: LibraryItem
  contentZoom: number
  w: number
  h: number
}) {
  const kind = libraryPaintKind(item)
  const canvas = libraryItemAsCanvasPreview(item, { contentZoom })

  // ── Figures: absolute fill of an explicit px host (never % of 0) ─────
  if (kind === 'figure' && canvas.imageUrl) {
    const src = canvas.imageUrl
    const vector = isSvgFigureSrc(src)
    return (
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ width: w, height: h, minWidth: w, minHeight: h }}
        data-library-preview="figure"
        data-library-zoom={contentZoom.toFixed(2)}
        data-stage={`${w}x${h}`}
      >
        {vector ? (
          // Absolute inset host so SVG 100%×100% always has a laid-out box
          <div className="absolute inset-0 min-h-0 min-w-0">
            <FigureView
              src={src}
              alt={item.title ?? 'figure'}
              fillContainer
              className="h-full w-full"
            />
          </div>
        ) : (
          <FitContent
            mode="scale"
            fitMethod="transform"
            fillMode="contain"
            align="center"
            minScale={0.12}
            maxScale={64}
            contentKey={`${item.id}-fig-${src}-s${w}x${h}`}
            className="h-full w-full"
          >
            <FigureView
              src={src}
              alt={item.title ?? 'figure'}
              fillContainer={false}
            />
          </FitContent>
        )}
      </div>
    )
  }

  if (kind === 'prose') {
    return (
      <ProsePreview
        item={item}
        contentZoom={contentZoom}
        stageW={w}
        stageH={h}
      />
    )
  }

  // ── Math: fit-to-view in the stage (contain, grow or shrink).
  // Zoom enlarges via parent stage×zoom; base font stays stable so FitContent
  // scales into the larger box (avoids font↑ / fit↓ cancel). ──────────────
  if (kind === 'math') {
    // Fixed natural measure font — stage growth is the zoom lever.
    const mathBaseFs = libraryFontSize(1)
    return (
      <div
        className="relative shrink-0"
        style={{ width: w, height: h, minWidth: w, minHeight: h }}
        data-library-preview="math"
        data-library-zoom={contentZoom.toFixed(2)}
        data-stage={`${w}x${h}`}
      >
        <FitContent
          mode="scale"
          fitMethod="fontSize"
          fillMode="contain"
          align="center"
          minScale={0.12}
          maxScale={64}
          baseFontSize={mathBaseFs}
          contentKey={`${item.id}-math-${canvas.latex ?? ''}-${canvas.tableMarkdown ?? ''}-fs${mathBaseFs}-s${w}x${h}`}
          className="h-full w-full"
        >
          {item.type === 'constant' ? (
            <ConstantView item={canvas} />
          ) : item.type === 'identity-set' ? (
            <IdentitySetView item={canvas} />
          ) : item.type === 'matrix' ? (
            <MatrixView item={canvas} />
          ) : isTableCard(canvas) && canvas.tableMarkdown ? (
            <MarkdownTable
              markdown={canvas.tableMarkdown}
              fitContent
              className="overflow-visible text-inherit"
            />
          ) : canvas.latex ? (
            <LatexView
              latex={canvas.latex}
              className="overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0"
            />
          ) : (
            <span className="text-zinc-500">{item.title}</span>
          )}
        </FitContent>
      </div>
    )
  }

  return (
    <div
      className="relative shrink-0"
      style={{ width: w, height: h, minWidth: w, minHeight: h }}
      data-library-preview="other"
    >
      <CanvasCardBody item={canvas} showBadge={false} />
    </div>
  )
}

/**
 * Unfitted paint for drag/hover measure — canvas base font + NaturalCardBody
 * so size matches paste (not library tile 12px).
 */
function NaturalPaint({
  item,
  contentZoom,
}: {
  item: LibraryItem
  contentZoom: number
}) {
  void contentZoom
  const fontSize = DEFAULT_ITEM_STYLE.fontSize ?? 18
  const canvas = libraryItemAsCanvasPreview(item, { fontSize })
  const wraps = naturalBodyWraps(canvas)

  if (libraryPaintKind(item) === 'figure' && canvas.imageUrl) {
    return (
      <FigureView
        src={canvas.imageUrl}
        alt={item.title ?? 'figure'}
        fillContainer={false}
      />
    )
  }

  return (
    <div
      className={
        wraps
          ? 'library-card-content-text box-border min-w-0 break-words'
          : 'inline-block'
      }
      style={{
        fontSize,
        ...(wraps ? { maxWidth: NATURAL_MAX_W } : undefined),
      }}
      data-library-preview="natural"
    >
      <NaturalCardBody item={canvas} />
    </div>
  )
}

export function LibraryItemPreviewBody({
  item,
  contentZoom = 1,
  stageW,
  stageH,
  layout = 'tile',
}: LibraryItemPreviewBodyProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [fallback, setFallback] = useState({ w: 160, h: 120 })
  const hasExplicit =
    typeof stageW === 'number' &&
    Number.isFinite(stageW) &&
    stageW > 0 &&
    typeof stageH === 'number' &&
    Number.isFinite(stageH) &&
    stageH > 0

  // Callers that omit stage (hover, catalog) measure the parent box.
  useLayoutEffect(() => {
    if (layout === 'natural' || hasExplicit) return
    const el = hostRef.current
    if (!el) return
    const measure = () => {
      const pw = el.clientWidth
      const ph = el.clientHeight
      const parent = el.parentElement
      const w = Math.max(pw, parent?.clientWidth ?? 0)
      const h = Math.max(ph, parent?.clientHeight ?? 0)
      if (w < 8 || h < 8) return
      setFallback((prev) =>
        prev.w === Math.round(w) && prev.h === Math.round(h)
          ? prev
          : { w: Math.round(w), h: Math.round(h) },
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [hasExplicit, item.id, layout])

  if (layout === 'natural') {
    return <NaturalPaint item={item} contentZoom={contentZoom} />
  }

  const w = safeStagePx(hasExplicit ? stageW : undefined, fallback.w)
  const h = safeStagePx(hasExplicit ? stageH : undefined, fallback.h)

  // Explicit stage: paint at exact px (library tiles).
  if (hasExplicit) {
    return (
      <PreviewPaint item={item} contentZoom={contentZoom} w={w} h={h} />
    )
  }

  // Implicit stage: fill parent, then paint into measured px box.
  return (
    <div
      ref={hostRef}
      className="relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden"
      data-library-preview-host="auto"
    >
      <PreviewPaint item={item} contentZoom={contentZoom} w={w} h={h} />
    </div>
  )
}
