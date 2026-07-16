import type { ReactNode } from 'react'
import type { CanvasItem } from '@/types'
import { FitContent } from '@/components/math/FitContent'
import { FigureView, isSvgFigureSrc } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import { MermaidView } from '@/components/math/MermaidView'
import { ProcessFlowView } from '@/components/math/ProcessFlowView'
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
  CARD_DEFAULTS,
  isFigureLike,
} from '@/lib/cardDefaults'
import {
  isEquationCard,
  isProcessCard,
  isTableCard,
  isVectorTextCard,
} from '@/lib/cardKinds'
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
 * - Equations / matrix / identity / constant → KaTeX
 * - Tables → HTML + em type
 * - Prose (definition/list/callout/code) → em text
 * - Figures / plots → inline SVG
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
    // ── VECTOR FIGURES / PLOTS (SVG) ─────────────────────────────────────
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

  if (isProcessCard(item)) {
    if (isProcessFlowSnapshot(item.processFlow)) {
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

  // ── Tier 1 + Tier 2 structured (vector text) ──────────────────────────
  if (item.type === 'definition') {
    return (
      <ProseFit item={item} showBadge={showBadge} interactiveFast={interactiveFast}>
        <DefinitionView item={item} />
      </ProseFit>
    )
  }
  if (item.type === 'list') {
    return (
      <ProseFit item={item} showBadge={showBadge} interactiveFast={interactiveFast}>
        <ListView item={item} />
      </ProseFit>
    )
  }
  if (item.type === 'callout') {
    return (
      <ProseFit item={item} showBadge={showBadge} interactiveFast={interactiveFast}>
        <CalloutView item={item} />
      </ProseFit>
    )
  }
  if (item.type === 'code') {
    return (
      <ProseFit item={item} showBadge={showBadge} interactiveFast={interactiveFast}>
        <CodeView item={item} />
      </ProseFit>
    )
  }
  if (item.type === 'constant') {
    return (
      <ProseFit item={item} showBadge={showBadge} interactiveFast={interactiveFast}>
        <ConstantView item={item} />
      </ProseFit>
    )
  }
  if (item.type === 'identity-set') {
    return (
      <ProseFit item={item} showBadge={showBadge} interactiveFast={interactiveFast}>
        <IdentitySetView item={item} />
      </ProseFit>
    )
  }
  if (item.type === 'matrix') {
    return (
      <ProseFit item={item} showBadge={showBadge} interactiveFast={interactiveFast}>
        <MatrixView item={item} />
      </ProseFit>
    )
  }

  const isEquation = isEquationCard(item)
  const isVectorText = isVectorTextCard(item)

  // Always fontSize for equations/tables when aspect-locked so resize live
  // paint matches the committed look (no transform→reflow jump / gutters).
  // transform only for stretch free-transform or non-vector content.
  const vectorTextFit =
    isVectorText && keepAspectRatio
      ? CARD_DEFAULTS.equationFitMethod
      : 'transform'

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
      {isTableCard(item) && item.tableMarkdown && (
        <MarkdownTable
          markdown={item.tableMarkdown}
          fitContent
          className="overflow-visible text-inherit"
        />
      )}
    </FitContent>
  )
}

function ProseFit({
  item,
  showBadge,
  interactiveFast,
  children,
}: {
  item: CanvasItem
  showBadge: boolean
  interactiveFast: boolean
  children: ReactNode
}) {
  const style = item.style ?? {}
  const contentFill = item.contentFill !== false
  const keepAspectRatio = item.keepAspectRatio !== false
  const fillMode = keepAspectRatio ? 'contain' : 'stretch'
  const maxScale = contentFill ? CARD_DEFAULTS.maxFillScale : 1
  const minScale = CARD_DEFAULTS.minFitScale
  const showTitle = item.showTitle !== false && Boolean(item.title)
  // Prose wraps to the card width. Without wrapToBox, FitContent measures at
  // max-content (one long line) then shrinks to ~20% — illegible paste.
  const wrapProse =
    item.type === 'definition' ||
    item.type === 'list' ||
    item.type === 'callout'
  // Always fontSize for prose/code (and KaTeX structured cards) when aspect
  // locked — same live/final path while resizing (no transform gutters jump).
  const vectorTextFit =
    keepAspectRatio ? CARD_DEFAULTS.equationFitMethod : 'transform'
  const vectorMaxScale = contentFill === false ? 1 : maxScale
  const payloadKey = [
    item.type,
    item.term,
    item.body,
    item.code,
    item.codeLanguage,
    item.listItems?.join('|'),
    item.listOrdered,
    item.calloutVariant,
    item.symbol,
    item.value,
    item.unit,
    item.identities?.join('|'),
    item.matrixRows?.map((r) => r.join(',')).join(';'),
    item.latex,
  ].join('·')

  return (
    <FitContent
      mode="scale"
      fillMode={fillMode}
      // Wrapping prose: top-align so last lines are never clipped under center gutters
      align={wrapProse ? 'start' : keepAspectRatio ? 'center' : 'start'}
      minScale={minScale}
      maxScale={vectorMaxScale}
      fitMethod={vectorTextFit}
      // Match DEFAULT_ITEM_STYLE / drag-ghost measure (18) so paste ≈ ghost
      baseFontSize={style.fontSize ?? 18}
      wrapToBox={wrapProse}
      showBadge={showBadge && !interactiveFast}
      contentKey={`${item.id}-${payloadKey}-fit${item.contentFitKey ?? 0}-fill${contentFill ? 1 : 0}-ar${keepAspectRatio ? 1 : 0}-t${showTitle ? 1 : 0}-m${vectorTextFit}-w${wrapProse ? 1 : 0}`}
      className="h-full w-full"
    >
      {children}
    </FitContent>
  )
}
