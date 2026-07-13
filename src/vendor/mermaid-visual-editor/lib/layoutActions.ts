/**
 * Shared Auto Layout / Organize Connections actions (toolbar + command palette).
 */
import { useFlowStore } from './store'
import { serialize } from './serializer'
import { cleanFlowchartLayout, organizeConnectionRoutes } from './layout'
import { layoutWithMermaid } from './layoutFromMermaid'
import { asMindmapEdges } from './mindmap'

/** Rearrange nodes (dagre / Mermaid sizes) and re-route pipes. */
export function runAutoLayout(syntaxHint?: string): void {
  const {
    nodes,
    edges,
    direction,
    diagramKind,
    layoutMindmap,
    theme,
    look,
    curveStyle,
    autoConnectEdges,
  } = useFlowStore.getState()
  if (nodes.length === 0) return

  if (diagramKind === 'mindmap' || /^\s*mindmap\b/im.test(syntaxHint ?? '')) {
    layoutMindmap({ fit: true })
    return
  }

  const mermaidSrc =
    (syntaxHint ?? '').trim() ||
    serialize(nodes, edges, { direction, theme, look, curveStyle })

  const applyClean = (
    n = nodes,
    e = edges,
  ) => {
    const cleaned = cleanFlowchartLayout(n, e, direction)
    useFlowStore.getState().importDiagram(cleaned.nodes, cleaned.edges, {
      direction,
      theme,
      look,
      curveStyle,
      diagramKind: 'flowchart',
      // Fresh face ports — do not re-pick over clean assignment
      skipHandleReconcile: true,
    })
    useFlowStore.setState((s) => ({ layoutEpoch: s.layoutEpoch + 1 }))
  }

  void layoutWithMermaid(mermaidSrc, nodes, edges)
    .then((laid) => {
      const n = laid.nodes.length ? laid.nodes : nodes
      // Keep existing links unless auto-connect rewire is on
      const e = autoConnectEdges && laid.edges.length ? laid.edges : edges
      applyClean(n, e)
    })
    .catch(() => {
      applyClean()
    })
}

/**
 * Keep node positions; clear bend/shaft waypoints and re-assign face ports
 * so pipes re-route cleanly (overlap/align encouraged).
 * Mindmap: re-stamp straight spokes (no pipe geometry).
 */
export function runOrganizeConnections(): void {
  const { nodes, edges, diagramKind, pushHistory } = useFlowStore.getState()
  if (nodes.length === 0) return

  if (diagramKind === 'mindmap') {
    // Ensure edges are straight mindmap spokes after free-form edits
    pushHistory()
    useFlowStore.setState({ edges: asMindmapEdges(edges) })
    return
  }

  pushHistory()
  const next = organizeConnectionRoutes(nodes, edges, {
    keepManualHandles: true,
  })
  useFlowStore.setState({ edges: next })
}
