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
  /**
   * While free-transform / drag is active, use CSS transform fit only
   * (no KaTeX reflow) to avoid lag and scale “twitch”.
   */
  interactiveFast?: boolean
}

/**
 * Shared card content for MainCanvas and export — same FitContent / themes /
 * markup so preview and PDF match the viewport.
 */
export function CanvasCardBody({
  item,
  showBadge = false,
  interactiveFast = false,
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
    return (
      <FitContent
        mode="scale"
        fitMethod="transform"
        fillMode={fillMode}
        align={keepAspectRatio ? 'center' : 'start'}
        minScale={minScale}
        maxScale={maxScale}
        showBadge={showBadge && !interactiveFast}
        contentKey={`${item.id}-fig-${item.imageUrl}-fit${item.contentFitKey ?? 0}-ar${keepAspectRatio ? 1 : 0}`}
        className="h-full w-full"
      >
        <FigureView
          src={item.imageUrl}
          alt={item.title ?? 'figure'}
          fillContainer={false}
        />
      </FitContent>
    )
  }

  if (item.type === 'process-chart' || item.mermaidSource) {
    return (
      <MermaidView
        key={`${item.id}-mmd-${keepAspectRatio ? 'meet' : 'none'}-${mermaidTheme}`}
        source={item.mermaidSource ?? ''}
        theme={mermaidTheme}
        forceDark={mermaidTheme !== 'forest'}
        fillContainer
        preserveAspect={keepAspectRatio ? 'meet' : 'none'}
        className="h-full w-full"
      />
    )
  }

  const isEquation =
    item.type === 'equation' ||
    item.type === 'custom-equation' ||
    Boolean(item.latex)

  // During drag/resize: always transform (cheap). Idle: fontSize for crisp type.
  const equationFit =
    interactiveFast || !isEquation || !keepAspectRatio
      ? 'transform'
      : CARD_DEFAULTS.equationFitMethod

  const atNaturalSize = item.autoFit === true || contentFill === false
  const equationMaxScale = atNaturalSize ? 1 : maxScale

  return (
    <FitContent
      mode="scale"
      fillMode={fillMode}
      align={keepAspectRatio ? 'center' : 'start'}
      minScale={minScale}
      maxScale={isEquation || item.type === 'table' ? equationMaxScale : maxScale}
      fitMethod={equationFit}
      baseFontSize={style.fontSize ?? 18}
      showBadge={showBadge && !interactiveFast}
      // Do not put board zoom or transient flags in contentKey (avoids remeasure storms)
      contentKey={`${item.id}-${item.latex ?? ''}-${item.tableMarkdown ?? ''}-${style.fontSize ?? ''}-fit${item.contentFitKey ?? 0}-fill${contentFill ? 1 : 0}-ar${keepAspectRatio ? 1 : 0}-t${showTitle ? 1 : 0}-m${equationFit}-af${item.autoFit ? 1 : 0}`}
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
