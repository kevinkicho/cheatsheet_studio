/**
 * Unfitted card content for drag-ghost measure + canvas autoFit.
 * Must paint every library/canvas kind at the same base font as CanvasCardBody
 * so paste-from-library matches the ghost (WYSIWYG).
 */
import type { CanvasItem } from '@/types'
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
  isEquationCard,
  isProcessCard,
  isTableCard,
} from '@/lib/cardKinds'
import { isProcessFlowSnapshot } from '@/lib/processFlowSnapshot'

/** Match CanvasItemView / CanvasDragPreview autoFit caps. */
export const NATURAL_MAX_W = 520
export const NATURAL_MAX_H = 420
export const NATURAL_SLACK_PX = 2

/**
 * Natural (unscaled) body — no FitContent. Used off-screen for autoFit and
 * inline in the library drag ghost.
 */
export function NaturalCardBody({ item }: { item: CanvasItem }) {
  if (isProcessCard(item)) {
    if (isProcessFlowSnapshot(item.processFlow)) {
      return (
        <ProcessFlowView
          snapshot={item.processFlow}
          title={item.title}
          className="h-full w-full"
        />
      )
    }
    return (
      <MermaidView
        source={item.mermaidSource ?? ''}
        theme={item.mermaidTheme ?? 'dark'}
        forceDark={(item.mermaidTheme ?? 'dark') !== 'forest'}
        className="h-full w-full"
      />
    )
  }

  if (item.type === 'definition') {
    return <DefinitionView item={item} />
  }
  if (item.type === 'list') {
    return <ListView item={item} />
  }
  if (item.type === 'callout') {
    return <CalloutView item={item} />
  }
  if (item.type === 'code') {
    return <CodeView item={item} />
  }
  if (item.type === 'constant') {
    return <ConstantView item={item} />
  }
  if (item.type === 'identity-set') {
    return <IdentitySetView item={item} />
  }
  if (item.type === 'matrix') {
    return <MatrixView item={item} />
  }

  if (isEquationCard(item) && item.latex) {
    return (
      <LatexView
        latex={item.latex}
        className="overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0"
      />
    )
  }

  if (isTableCard(item) && item.tableMarkdown) {
    return (
      <MarkdownTable
        markdown={item.tableMarkdown}
        fitContent
        className="overflow-visible text-inherit"
      />
    )
  }

  // Fallback: title only
  return (
    <span className="text-[0.85em] text-zinc-500">{item.title || '…'}</span>
  )
}

/** True when body should wrap to a max width (prose), not max-content. */
export function naturalBodyWraps(item: Pick<CanvasItem, 'type'>): boolean {
  return (
    item.type === 'definition' ||
    item.type === 'list' ||
    item.type === 'callout'
  )
}
