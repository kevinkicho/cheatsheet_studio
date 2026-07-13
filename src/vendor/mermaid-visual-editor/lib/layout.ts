import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { Direction, FlowEdgeData, FlowNodeData } from './store'
import { facePairForEdge } from './edgePath'
import { nodeBoxFromRf } from './mermaidEdgeRoute'
import { positionToDefaultPortId } from './portLayout'
import { siblingIndexForEdge } from './mermaidEdgeRoute'

/** Defaults close to studio Mermaid flowchart metrics (mermaidTheme FLOW). */
const NODE_WIDTH = 160
const NODE_HEIGHT = 48
const SUBGRAPH_PADDING = 40
/** Mermaid flowchart nodeSpacing / rankSpacing-ish */
const NODE_SEP = 50
const RANK_SEP = 55

const RANKDIR: Record<Direction, string> = {
  TD: 'TB',
  LR: 'LR',
  BT: 'BT',
  RL: 'RL',
}

export function applyDagreLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  direction: Direction = 'TD'
): Node<FlowNodeData>[] {
  if (nodes.length === 0) return nodes

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: RANKDIR[direction],
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 16,
    marginy: 16,
  })

  // Add all nodes
  for (const node of nodes) {
    if (node.data?.isSubgraph) {
      // Let dagre auto-size subgraphs from children; provide padding
      g.setNode(node.id, {
        width: 0,
        height: 0,
        paddingX: SUBGRAPH_PADDING,
        paddingY: SUBGRAPH_PADDING,
      })
    } else {
      const w = typeof node.style?.width === 'number' ? node.style.width : NODE_WIDTH
      const h = typeof node.style?.height === 'number' ? node.style.height : NODE_HEIGHT
      g.setNode(node.id, { width: w, height: h })
    }
  }

  // Set parent relationships for compound layout
  for (const node of nodes) {
    if (node.parentId) {
      g.setParent(node.id, node.parentId)
    }
  }

  // Add ALL edges — dagre handles cross-boundary edges in compound mode
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const layout = g.node(node.id)
    if (!layout) return node

    if (node.data?.isSubgraph) {
      return {
        ...node,
        position: {
          x: layout.x - layout.width / 2,
          y: layout.y - layout.height / 2,
        },
        style: {
          ...node.style,
          width: layout.width,
          height: layout.height,
        },
      }
    }

    if (node.parentId) {
      // Convert dagre absolute coords to parent-relative for React Flow
      const parentLayout = g.node(node.parentId)
      if (!parentLayout) return node
      const w = typeof node.style?.width === 'number' ? node.style.width : NODE_WIDTH
      const h = typeof node.style?.height === 'number' ? node.style.height : NODE_HEIGHT
      const parentTopLeftX = parentLayout.x - parentLayout.width / 2
      const parentTopLeftY = parentLayout.y - parentLayout.height / 2
      return {
        ...node,
        position: {
          x: layout.x - w / 2 - parentTopLeftX,
          y: layout.y - h / 2 - parentTopLeftY,
        },
      }
    }

    // Top-level non-subgraph node
    const w =
      typeof node.width === 'number'
        ? node.width
        : typeof node.style?.width === 'number'
          ? node.style.width
          : NODE_WIDTH
    const h =
      typeof node.height === 'number'
        ? node.height
        : typeof node.style?.height === 'number'
          ? node.style.height
          : NODE_HEIGHT
    return {
      ...node,
      position: {
        x: layout.x - w / 2,
        y: layout.y - h / 2,
      },
      width: w,
      height: h,
      style: { ...node.style, width: w, height: h },
    }
  })
}

/**
 * Re-route edges for current node positions: clear bend/shaft waypoints and
 * (unless keepManualHandles) assign face ports so smooth-step pipes align/overlap cleanly.
 * Does not move nodes.
 */
export function organizeConnectionRoutes(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
  opts?: { keepManualHandles?: boolean },
): Edge<FlowEdgeData>[] {
  if (nodes.length === 0) return edges
  const keepManual = opts?.keepManualHandles !== false

  const edgeRefs = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }))
  const centers = new Map(
    nodes.map((n) => {
      const w =
        typeof n.width === 'number'
          ? n.width
          : typeof n.style?.width === 'number'
            ? n.style.width
            : NODE_WIDTH
      const h =
        typeof n.height === 'number'
          ? n.height
          : typeof n.style?.height === 'number'
            ? n.style.height
            : NODE_HEIGHT
      return [
        n.id,
        { cx: n.position.x + w / 2, cy: n.position.y + h / 2 },
      ] as const
    }),
  )
  const byId = new Map(nodes.map((n) => [n.id, n]))

  return edges.map((e) => {
    const data = { ...(e.data ?? {}) } as FlowEdgeData
    // Absolute bend/shaft coords go stale — always clear for a clean re-route
    delete data.mermaidPath
    delete data.mermaidLabelX
    delete data.mermaidLabelY
    delete data.waypoints
    // Keep labelOffsetX/Y so Yes/No stays where the user put it

    const manual = data.manualConnect === true
    if (manual && keepManual && e.sourceHandle && e.targetHandle) {
      return {
        ...e,
        type: 'flowEdge' as const,
        reconnectable: true,
        data,
      }
    }

    const sn = byId.get(e.source)
    const tn = byId.get(e.target)
    let sourceHandle = e.sourceHandle
    let targetHandle = e.targetHandle
    if (sn && tn) {
      const sw =
        typeof sn.width === 'number'
          ? sn.width
          : typeof sn.style?.width === 'number'
            ? sn.style.width
            : NODE_WIDTH
      const sh =
        typeof sn.height === 'number'
          ? sn.height
          : typeof sn.style?.height === 'number'
            ? sn.style.height
            : NODE_HEIGHT
      const tw =
        typeof tn.width === 'number'
          ? tn.width
          : typeof tn.style?.width === 'number'
            ? tn.style.width
            : NODE_WIDTH
      const th =
        typeof tn.height === 'number'
          ? tn.height
          : typeof tn.style?.height === 'number'
            ? tn.style.height
            : NODE_HEIGHT
      const sBox = nodeBoxFromRf(
        sn.position.x,
        sn.position.y,
        sw,
        sh,
        sn.data?.shape,
      )
      const tBox = nodeBoxFromRf(
        tn.position.x,
        tn.position.y,
        tw,
        th,
        tn.data?.shape,
      )
      const pairCount = edgeRefs.filter(
        (x) =>
          (x.source === e.source && x.target === e.target) ||
          (x.source === e.target && x.target === e.source),
      ).length
      const idx = siblingIndexForEdge(
        e.id,
        e.source,
        e.target,
        edgeRefs,
        centers,
      )
      const multi = pairCount > 1
      const slot = multi ? (idx === 0 ? -1 : idx) : 0
      const faces = facePairForEdge(sBox, tBox, slot, multi)
      sourceHandle = positionToDefaultPortId(faces.sourcePos)
      targetHandle = positionToDefaultPortId(faces.targetPos)
    }

    return {
      ...e,
      sourceHandle,
      targetHandle,
      type: 'flowEdge' as const,
      reconnectable: true,
      data,
    }
  })
}

/**
 * Clean TD/LR stack: dagre positions + re-route edges (drop stale bend/shaft
 * waypoints). Manual port plugs keep handles; auto edges get face ports.
 */
export function cleanFlowchartLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
  direction: Direction = 'TD',
): { nodes: Node<FlowNodeData>[]; edges: Edge<FlowEdgeData>[] } {
  if (nodes.length === 0) return { nodes, edges }

  const sized = nodes.map((n) => {
    if (n.data?.isSubgraph) return n
    const w =
      typeof n.width === 'number'
        ? n.width
        : typeof n.style?.width === 'number'
          ? n.style.width
          : NODE_WIDTH
    const h =
      typeof n.height === 'number'
        ? n.height
        : typeof n.style?.height === 'number'
          ? n.style.height
          : NODE_HEIGHT
    return {
      ...n,
      width: w,
      height: h,
      style: { ...n.style, width: w, height: h },
    }
  })

  const positioned = applyDagreLayout(sized, edges, direction)
  // Waypoints are absolute — must clear after nodes move
  const cleanedEdges = organizeConnectionRoutes(positioned, edges, {
    keepManualHandles: true,
  })

  return { nodes: positioned, edges: cleanedEdges }
}
