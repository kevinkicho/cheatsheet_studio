import type { CanvasItem } from '@/types'
import { FitContent } from '@/components/math/FitContent'
import { FigureView, isSvgFigureSrc } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import { MermaidView } from '@/components/math/MermaidView'
import { ProcessFlowView } from '@/components/math/ProcessFlowView'
import {
  CARD_DEFAULTS,
  isFigureLike,
} from '@/lib/cardDefaults'
import { isProcessFlowSnapshot } from '@/lib/processFlowSnapshot'

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
 *
 * VECTOR GRAPHICS POLICY (see docs/vector-graphics.md):
 * Block items are authored as vectors so resize stays sharp:
 * - Equations → KaTeX (vector type) + fontSize fit
 * - Tables → HTML + em type + fontSize fit
 * - Figures → inline SVG at display size (not bitmap scale)
 * - Process → processFlow / Mermaid SVG
 * Photos may still use raster via Import Image.
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
    // ── VECTOR FIGURES (SVG) ─────────────────────────────────────────────
    // Never CSS-transform a fixed-pixel SVG — that soft-rasterizes (PPF looked
    // pixelated). fillContainer + viewBox re-paints paths at card size → sharp.
    // Raster photos only: FitContent transform (unavoidable soft scale).
    // Policy: docs/vector-graphics.md — new diagrams MUST be SVG, not PNG.
    const vectorSvg = isSvgFigureSrc(item.imageUrl)
    if (vectorSvg) {
      return (
        <div
          className="relative h-full w-full min-h-0 min-w-0"
          data-card-vector="svg-figure"
          data-testid="canvas-vector-figure"
        >
          <FigureView
            src={item.imageUrl}
            alt={item.title ?? 'figure'}
            fillContainer
            stretch={!keepAspectRatio}
          />
        </div>
      )
    }
    // Raster (photo) path — soft when enlarged; prefer SVG for diagrams
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

  if (item.type === 'process-chart' || item.mermaidSource || item.processFlow) {
    // Vector paint: processFlow SVG or Mermaid SVG (never a static bitmap)
    // Free-form snapshot: fill card via SVG viewBox (like Mermaid fillContainer).
    // Avoid FitContent+meet double letterbox — that made horizontal resize look uneven.
    if (isProcessFlowSnapshot(item.processFlow)) {
      // Fingerprint geometry so any path/node move re-paints the card
      const pf = item.processFlow
      const pathSig = pf.edges
        .map(
          (e) =>
            `${e.path?.length ?? 0}:${e.labelX ?? 0}:${e.labelY ?? 0}:${e.waypoints?.length ?? 0}`,
        )
        .join('|')
      const nodeSig = pf.nodes
        .map((n) => `${n.x},${n.y},${n.width}x${n.height}`)
        .join('|')
      return (
        <ProcessFlowView
          key={`${item.id}-pf-${pathSig}-${nodeSig}-ar${keepAspectRatio ? 1 : 0}`}
          snapshot={item.processFlow}
          title={item.title}
          preserveAspect={keepAspectRatio ? 'meet' : 'none'}
          className="h-full w-full"
        />
      )
    }
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
  // Equations + markdown tables are vector type (KaTeX / HTML em fonts)
  const isVectorText =
    isEquation || item.type === 'table' || Boolean(item.tableMarkdown)

  // During drag/resize: transform (cheap). Idle + aspect locked: fontSize for
  // crisp vector type (equations AND tables — tables used to always transform).
  const vectorTextFit =
    interactiveFast || !isVectorText || !keepAspectRatio
      ? 'transform'
      : CARD_DEFAULTS.equationFitMethod

  // contentFill false → maxScale 1 (natural KaTeX; export-19 equation look).
  // contentFill true → may grow into card (process/figures).
  // Do not special-case autoFit here (offscreen measure is separate).
  const vectorMaxScale = contentFill === false ? 1 : maxScale

  return (
    <FitContent
      mode="scale"
      fillMode={fillMode}
      align={keepAspectRatio ? 'center' : 'start'}
      minScale={minScale}
      maxScale={isVectorText ? vectorMaxScale : maxScale}
      fitMethod={vectorTextFit}
      baseFontSize={style.fontSize ?? 18}
      showBadge={showBadge && !interactiveFast}
      contentKey={`${item.id}-${item.latex ?? ''}-${item.tableMarkdown ?? ''}-${style.fontSize ?? ''}-fit${item.contentFitKey ?? 0}-fill${contentFill ? 1 : 0}-ar${keepAspectRatio ? 1 : 0}-t${showTitle ? 1 : 0}-m${vectorTextFit}-ms${vectorMaxScale}`}
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
