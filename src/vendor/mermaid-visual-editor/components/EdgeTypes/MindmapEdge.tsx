/**
 * Radial mindmap connector: straight line of centers, clipped to each node’s
 * radius so children leave the hub at different angles.
 *
 * Uses RF handle coords as a reliable fallback when internals are not ready.
 * Stroke uses non-scaling-stroke so spokes stay visible at low zoom.
 */
import {
  BaseEdge,
  useInternalNode,
  type EdgeProps,
} from '@xyflow/react'
import { useEffect, useMemo } from 'react'
import type { FlowEdgeData } from '../../lib/store'
import {
  clearLiveEdgePaint,
  setLiveEdgePaint,
} from '../../lib/liveEdgePaint'
import { straightMindmapPath } from '../../lib/mindmap'

function nodeBox(node: {
  internals?: { positionAbsolute?: { x: number; y: number } }
  measured?: { width?: number; height?: number }
  position: { x: number; y: number }
  width?: number
  height?: number
}): { x: number; y: number; width: number; height: number } {
  const w =
    node.measured?.width ??
    (typeof node.width === 'number' ? node.width : undefined) ??
    96
  const h =
    node.measured?.height ??
    (typeof node.height === 'number' ? node.height : undefined) ??
    96
  const pos = node.internals?.positionAbsolute ?? node.position
  return { x: pos.x, y: pos.y, width: Math.max(8, w), height: Math.max(8, h) }
}

function fmt(n: number) {
  return (Math.round(n * 10) / 10).toString()
}

export function MindmapEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
  selected,
}: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const edgeData = data as FlowEdgeData | undefined
  // Prefer explicit hex so SVG always paints (CSS vars can fail on path stroke)
  const strokeColor =
    (typeof edgeData?.strokeColor === 'string' && edgeData.strokeColor) ||
    '#a1a1aa'
  const edgeStyle = edgeData?.edgeStyle ?? 'solid'

  const routed = useMemo(() => {
    if (sourceNode && targetNode) {
      return straightMindmapPath(nodeBox(sourceNode), nodeBox(targetNode))
    }
    // Fallback: RF handle positions (center handles → near node centers)
    if (
      Number.isFinite(sourceX) &&
      Number.isFinite(sourceY) &&
      Number.isFinite(targetX) &&
      Number.isFinite(targetY)
    ) {
      return {
        path: `M${fmt(sourceX)},${fmt(sourceY)} L${fmt(targetX)},${fmt(targetY)}`,
        labelX: (sourceX + targetX) / 2,
        labelY: (sourceY + targetY) / 2,
      }
    }
    return null
  }, [sourceNode, targetNode, sourceX, sourceY, targetX, targetY])

  // Publish exact paint so processFlow cards match the editor
  useEffect(() => {
    if (!routed?.path) {
      clearLiveEdgePaint(id)
      return
    }
    setLiveEdgePaint(id, {
      path: routed.path,
      labelX: routed.labelX,
      labelY: routed.labelY,
    })
    return () => clearLiveEdgePaint(id)
  }, [id, routed?.path, routed?.labelX, routed?.labelY])

  if (!routed?.path) return null

  let strokeDasharray: string | undefined
  // Slightly thicker base; non-scaling-stroke keeps screen weight at low zoom
  let strokeWidth = selected ? 2.75 : 2.25
  if (edgeStyle === 'dashed') strokeDasharray = '6 4'
  if (edgeStyle === 'thick') strokeWidth = 3.5

  return (
    <BaseEdge
      id={id}
      path={routed.path}
      markerEnd={undefined}
      markerStart={undefined}
      interactionWidth={20}
      style={{
        ...style,
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray,
        strokeLinecap: 'round',
        // Keep spokes readable when the viewport is zoomed far out
        vectorEffect: 'non-scaling-stroke',
        fill: 'none',
        opacity: 1,
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
