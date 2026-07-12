/**
 * Radial mindmap connector: shortest path between two circular nodes.
 * Path runs along the line of centers, clipped to each circle's perimeter
 * so multiple children leave the hub at different angles (not one stacked handle).
 */
import {
  BaseEdge,
  getStraightPath,
  useInternalNode,
  type EdgeProps,
} from '@xyflow/react'
import type { FlowEdgeData } from '../../lib/store'

/** Point on circle edge along the ray from center toward (tx, ty). */
function pointOnCircle(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  radius: number,
): { x: number; y: number } {
  const dx = tx - cx
  const dy = ty - cy
  const len = Math.hypot(dx, dy) || 1
  return {
    x: cx + (dx / len) * radius,
    y: cy + (dy / len) * radius,
  }
}

function nodeCenterAndRadius(node: {
  internals: { positionAbsolute: { x: number; y: number } }
  measured?: { width?: number; height?: number }
  position: { x: number; y: number }
}): { cx: number; cy: number; r: number } {
  const w = node.measured?.width ?? 96
  const h = node.measured?.height ?? 96
  const pos = node.internals.positionAbsolute ?? node.position
  return {
    cx: pos.x + w / 2,
    cy: pos.y + h / 2,
    // inset slightly so stroke sits on the border ring
    r: Math.min(w, h) / 2 - 1,
  }
}

export function MindmapEdge({
  id,
  source,
  target,
  style,
  data,
  selected,
}: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const edgeData = data as FlowEdgeData | undefined
  const strokeColor =
    edgeData?.strokeColor ?? 'var(--edge-stroke, #a1a1aa)'
  const edgeStyle = edgeData?.edgeStyle ?? 'solid'

  if (!sourceNode || !targetNode) return null

  const s = nodeCenterAndRadius(sourceNode)
  const t = nodeCenterAndRadius(targetNode)

  // Shortest path = line of centers, attach at each circle perimeter
  const start = pointOnCircle(s.cx, s.cy, t.cx, t.cy, s.r)
  const end = pointOnCircle(t.cx, t.cy, s.cx, s.cy, t.r)

  const [path] = getStraightPath({
    sourceX: start.x,
    sourceY: start.y,
    targetX: end.x,
    targetY: end.y,
  })

  let strokeDasharray: string | undefined
  let strokeWidth = selected ? 2.5 : 1.75
  if (edgeStyle === 'dashed') strokeDasharray = '6 4'
  if (edgeStyle === 'thick') strokeWidth = 3.5

  return (
    <BaseEdge
      id={id}
      path={path}
      // No arrow heads — mindmap branches are undirected lines
      markerEnd={undefined}
      markerStart={undefined}
      style={{
        ...style,
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray,
        strokeLinecap: 'round',
      }}
    />
  )
}

/** Re-layout helper: assign source/target handles to center for mindmap edges. */
export function stampMindmapEdgeHandles<
  T extends { sourceHandle?: string | null; targetHandle?: string | null },
>(edge: T): T {
  return {
    ...edge,
    sourceHandle: 'center',
    targetHandle: 'center-target',
    type: 'mindmapEdge' as never,
  }
}
