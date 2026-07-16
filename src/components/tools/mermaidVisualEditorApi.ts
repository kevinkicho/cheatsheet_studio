/**
 * Thin accessors for the process editor store — no React Flow UI imports.
 * Keeps CreateProcessChartPanel able to code-split MermaidVisualEditor.
 */
import { captureProcessFlow } from '@/lib/processFlowSnapshot'
import type { ProcessFlowSnapshot } from '@/lib/processFlowSnapshot'
import { serialize } from '@/vendor/mermaid-visual-editor/lib/serializer'
import {
  serializeMindmap,
} from '@/vendor/mermaid-visual-editor/lib/mindmap'
import { useFlowStore } from '@/vendor/mermaid-visual-editor/lib/store'

function serializeCanvas(): string {
  const { nodes, edges, direction, theme, look, curveStyle, diagramKind } =
    useFlowStore.getState()
  if (nodes.length === 0) return ''
  // Snapshot plain arrays so serializers never see live RF proxies
  const plainNodes = nodes.map((n) => ({
    ...n,
    data: n.data ? { ...n.data } : n.data,
    position: n.position ? { ...n.position } : n.position,
    style: n.style ? { ...n.style } : n.style,
  }))
  const plainEdges = edges.map((e) => ({
    ...e,
    data: e.data ? { ...e.data } : e.data,
  }))
  if (diagramKind === 'mindmap') {
    return serializeMindmap(plainNodes as typeof nodes, plainEdges as typeof edges)
  }
  return serialize(plainNodes as typeof nodes, plainEdges as typeof edges, {
    direction,
    theme,
    look,
    curveStyle,
  })
}

/** Snapshot current visual canvas as Mermaid (for Add/Update card). */
export function getVisualEditorMermaidSource(): string {
  try {
    return serializeCanvas()
  } catch (e) {
    console.error('[process] getVisualEditorMermaidSource failed', e)
    throw e
  }
}

/**
 * Free-form graph snapshot for sheet cards / print — matches what the
 * interactive editor shows (positions + edge routing), not a Mermaid re-layout.
 */
export function getVisualEditorProcessFlow(): ProcessFlowSnapshot | null {
  try {
    const {
      nodes,
      edges,
      direction,
      curveStyle,
      multiEdgeSpacing,
      diagramKind,
    } = useFlowStore.getState()
    if (nodes.length === 0) return null
    return captureProcessFlow(nodes, edges, {
      direction,
      curveStyle,
      multiEdgeSpacing,
      diagramKind:
        diagramKind === 'mindmap' || diagramKind === 'flowchart'
          ? diagramKind
          : 'flowchart',
    })
  } catch (e) {
    console.error('[process] getVisualEditorProcessFlow failed', e)
    return null
  }
}
