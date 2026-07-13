/**
 * CAD-style sticky snap points for pipe bend handles.
 * Aligns to node edges / centers / ports and other bend points.
 */
import type { Edge, Node } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from './store'
import {
  computePortPlacements,
  getPortLayout,
  portFlowPoint,
} from './portLayout'
import { nodeBoxFromRf } from './mermaidEdgeRoute'

export type SnapAxis = 'x' | 'y'

export type PipeSnapGuide = {
  axis: SnapAxis
  /** Flow coordinate of the guide line */
  at: number
  /** Span for drawing (flow units) */
  from: number
  to: number
}

export type PipeSnapResult = {
  x: number
  y: number
  snappedX: boolean
  snappedY: boolean
  guides: PipeSnapGuide[]
}

export type PipeSnapTarget = {
  x?: number
  y?: number
  label?: string
}

function nodeSize(n: Node<FlowNodeData>): { w: number; h: number } {
  const w =
    typeof n.width === 'number'
      ? n.width
      : typeof n.style?.width === 'number'
        ? n.style.width
        : 120
  const h =
    typeof n.height === 'number'
      ? n.height
      : typeof n.style?.height === 'number'
        ? n.style.height
        : 48
  return { w: Math.max(8, w), h: Math.max(8, h) }
}

/**
 * Collect sticky coordinates from the diagram (nodes + ports + other bends).
 */
export function collectPipeSnapTargets(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
  opts?: {
    excludeEdgeId?: string
    excludeWaypointId?: string
    /** Include port dots (default true). */
    includePorts?: boolean
  },
): PipeSnapTarget[] {
  const includePorts = opts?.includePorts !== false
  const out: PipeSnapTarget[] = []

  for (const n of nodes) {
    if (n.data?.isSubgraph) continue
    const { w, h } = nodeSize(n)
    const x0 = n.position.x
    const y0 = n.position.y
    const cx = x0 + w / 2
    const cy = y0 + h / 2
    // Box edges + center (CAD sticky lines)
    out.push({ x: x0, label: `${n.id}:L` })
    out.push({ x: cx, label: `${n.id}:CX` })
    out.push({ x: x0 + w, label: `${n.id}:R` })
    out.push({ y: y0, label: `${n.id}:T` })
    out.push({ y: cy, label: `${n.id}:CY` })
    out.push({ y: y0 + h, label: `${n.id}:B` })
    // Full corner points for 2D snap
    out.push({ x: x0, y: y0 })
    out.push({ x: x0 + w, y: y0 })
    out.push({ x: x0, y: y0 + h })
    out.push({ x: x0 + w, y: y0 + h })
    out.push({ x: cx, y: cy })

    if (includePorts) {
      const box = nodeBoxFromRf(x0, y0, w, h, n.data?.shape)
      const ports = computePortPlacements(getPortLayout(n.data), n.data?.shape ?? 'rectangle')
      for (const p of ports) {
        const pt = portFlowPoint(box, n.data?.shape, n.data, p.id)
        if (pt) out.push({ x: pt.x, y: pt.y, label: `${n.id}:${p.id}` })
      }
    }
  }

  for (const e of edges) {
    for (const wp of e.data?.waypoints ?? []) {
      if (
        e.id === opts?.excludeEdgeId &&
        wp.id === opts?.excludeWaypointId
      ) {
        continue
      }
      out.push({ x: wp.x, y: wp.y, label: `wp:${e.id}` })
    }
  }

  return out
}

function nearest(
  value: number,
  candidates: number[],
  threshold: number,
): number | null {
  let best: number | null = null
  let bestD = threshold
  for (const c of candidates) {
    const d = Math.abs(c - value)
    if (d <= bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/**
 * Snap a free point to nearby sticky axes (independent X/Y, CAD-style).
 */
export function snapPipePoint(
  x: number,
  y: number,
  targets: PipeSnapTarget[],
  threshold = 10,
  bounds?: { minX: number; minY: number; maxX: number; maxY: number },
): PipeSnapResult {
  const xs = targets
    .map((t) => t.x)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const ys = targets
    .map((t) => t.y)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

  const sx = nearest(x, xs, threshold)
  const sy = nearest(y, ys, threshold)

  const nx = sx ?? x
  const ny = sy ?? y

  const pad = 40
  const minX = (bounds?.minX ?? nx - 200) - pad
  const maxX = (bounds?.maxX ?? nx + 200) + pad
  const minY = (bounds?.minY ?? ny - 200) - pad
  const maxY = (bounds?.maxY ?? ny + 200) + pad

  const guides: PipeSnapGuide[] = []
  if (sx != null) {
    guides.push({ axis: 'x', at: sx, from: minY, to: maxY })
  }
  if (sy != null) {
    guides.push({ axis: 'y', at: sy, from: minX, to: maxX })
  }

  return {
    x: Math.round(nx),
    y: Math.round(ny),
    snappedX: sx != null,
    snappedY: sy != null,
    guides,
  }
}

/** Diagram bounds for guide span. */
export function diagramBounds(
  nodes: Node<FlowNodeData>[],
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const { w, h } = nodeSize(n)
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + w)
    maxY = Math.max(maxY, n.position.y + h)
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 400 }
  }
  return { minX, minY, maxX, maxY }
}
