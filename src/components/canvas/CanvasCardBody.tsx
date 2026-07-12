import type { CanvasItem } from '@/types'
import { FitContent } from '@/components/math/FitContent'
import { FigureView } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import { MermaidView } from '@/components/math/MermaidView'
import {
  CARD_DEFAULTS,
  isFigureLike,
} from '@/lib/cardDefaults'

type Props = {
  item: CanvasItem
  /** Show FitContent % badge (canvas selection only). */
  showBadge?: boolean
  /** Bump when async Mermaid finishes (canvas only). */
  mermaidReadyKey?: number
  onMermaidRendered?: () => void
  /**
   * Board zoom for vector paint (equations). Multiplies KaTeX font-size and
   * counter-scales so glyphs stay sharp under CSS board zoom.
   */
  paintZoom?: number
}

/**
 * Shared card content for MainCanvas and export — same FitContent / themes /
 * markup so preview and PDF match the viewport.
 *
 * Vector paths (docs/vector-graphics.md):
 * - Equations → KaTeX + fontSize fit (+ paintZoom on canvas)
 * - Figures → inline SVG at display size
 * - Process → Mermaid SVG fillContainer
 */
export function CanvasCardBody({
  item,
  showBadge = false,
  mermaidReadyKey = 0,
  onMermaidRendered,
  paintZoom = 1,
}: Props) {
  const style = item.style ?? {}
  const asFigure = isFigureLike(item)
  const contentFill = item.contentFill !== false
  const keepAspectRatio = item.keepAspectRatio !== false
  const fillMode = keepAspectRatio ? 'contain' : 'stretch'
  const maxScale = contentFill ? CARD_DEFAULTS.maxFillScale : 1
  const minScale = CARD_DEFAULTS.minFitScale
  const showTitle = item.showTitle !== false && Boolean(item.title)
  const mermaidTheme = item.mermaidTheme ?? 'dark'

  if (asFigure && item.imageUrl) {
    // SVG figures fill the card; FigureView paints at display resolution.
    return (
      <FigureView
        src={item.imageUrl}
        alt={item.title ?? 'figure'}
        fillContainer
      />
    )
  }

  if (item.type === 'process-chart' || item.mermaidSource) {
    // Mermaid SVG fills the card at display size (vector) — no CSS scale.
    return (
      <MermaidView
        source={item.mermaidSource ?? ''}
        theme={mermaidTheme}
        forceDark={mermaidTheme !== 'forest'}
        fillContainer
        preserveAspect={keepAspectRatio ? 'meet' : 'none'}
        onRendered={onMermaidRendered}
        className="h-full w-full"
        // mermaidReadyKey kept in tree identity via key so parent can remount if needed
        key={`${item.id}-mmd-${mermaidReadyKey}-${keepAspectRatio ? 1 : 0}`}
      />
    )
  }

  const isEquation =
    item.type === 'equation' ||
    item.type === 'custom-equation' ||
    Boolean(item.latex)
  // Equations: fontSize fit so KaTeX reflows as vector type when the card grows.
  // Stretch (independent X/Y) uses transform for non-uniform scale.
  const equationFit =
    isEquation && keepAspectRatio
      ? CARD_DEFAULTS.equationFitMethod
      : 'transform'

  return (
    <FitContent
      mode="scale"
      fillMode={fillMode}
      minScale={minScale}
      maxScale={maxScale}
      fitMethod={equationFit}
      baseFontSize={style.fontSize ?? 18}
      paintZoom={isEquation && equationFit === 'fontSize' ? paintZoom : 1}
      showBadge={showBadge}
      contentKey={`${item.id}-${item.latex ?? ''}-${item.tableMarkdown ?? ''}-${style.fontSize ?? ''}-fit${item.contentFitKey ?? 0}-fill${contentFill ? 1 : 0}-ar${keepAspectRatio ? 1 : 0}-t${showTitle ? 1 : 0}-m${equationFit}-z${paintZoom}`}
      className="h-full w-full"
    >
      {isEquation && item.latex && (
        <LatexView
          latex={item.latex}
          className="overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0"
        />
      )}
      {(item.type === 'table' || item.tableMarkdown) && item.tableMarkdown && (
        <MarkdownTable
          markdown={item.tableMarkdown}
          fitContent
          className="overflow-visible text-inherit"
        />
      )}
    </FitContent>
  )
}
