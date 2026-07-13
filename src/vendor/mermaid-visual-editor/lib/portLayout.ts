/**
 * Connection-port layout for flowchart shapes.
 *
 * - onPerimeter: ports spaced evenly by arc length along the shape outline
 *   (perimeter ÷ count), with rotation as an offset along that path.
 * - !onPerimeter: free radial placement; `radius` moves ports from center
 *   (1 ≈ bounding-box edge).
 *
 * Handle ids: `port-0` … `port-N` (ConnectionMode.Loose).
 */
import { Position, type Node } from '@xyflow/react'
import type { FlowNodeData, NodeShape } from './store'

export const PORT_COUNT_MIN = 1
export const PORT_COUNT_MAX = 16
export const PORT_RADIUS_MIN = 0.15
export const PORT_RADIUS_MAX = 1.5

export const DEFAULT_PORT_LAYOUT = {
  count: 4,
  radius: 1,
  rotation: 0,
  onPerimeter: true,
} as const

export type PortLayout = {
  count: number
  /** Free-radial only: distance from center (1 ≈ box edge). Ignored on perimeter. */
  radius: number
  /**
   * Degrees of offset:
   * - perimeter: offset along outline as fraction of 360° → full loop
   * - free radial: first-port compass angle (0 = east, −90 = north)
   */
  rotation: number
  onPerimeter: boolean
}

export function clampPortCount(n: number): number {
  if (!Number.isFinite(n)) return 4
  return Math.min(PORT_COUNT_MAX, Math.max(PORT_COUNT_MIN, Math.round(n)))
}

export function clampPortRadius(r: number): number {
  if (!Number.isFinite(r)) return 1
  return Math.min(PORT_RADIUS_MAX, Math.max(PORT_RADIUS_MIN, r))
}

export function getPortLayout(data: FlowNodeData | undefined): PortLayout {
  return {
    count: clampPortCount(data?.portCount ?? DEFAULT_PORT_LAYOUT.count),
    radius: clampPortRadius(data?.portRadius ?? DEFAULT_PORT_LAYOUT.radius),
    rotation: Number.isFinite(data?.portRotation)
      ? (data!.portRotation as number)
      : DEFAULT_PORT_LAYOUT.rotation,
    onPerimeter: data?.portOnPerimeter !== false,
  }
}

/** Map compass angle (0 = east, CW+, y-down) to RF handle side. */
export function angleToPosition(deg: number): Position {
  let d = ((deg % 360) + 360) % 360
  if (d > 180) d -= 360
  if (d >= -45 && d < 45) return Position.Right
  if (d >= 45 && d < 135) return Position.Bottom
  if (d >= -135 && d < -45) return Position.Top
  return Position.Left
}

/**
 * Default 4-port layout (rotation 0): port-0 top, 1 right, 2 bottom, 3 left.
 * Used so auto-routed edges keep a stable handle id matching the face they use.
 */
export function positionToDefaultPortId(pos: Position): string {
  switch (pos) {
    case Position.Top:
      return 'port-0'
    case Position.Right:
      return 'port-1'
    case Position.Bottom:
      return 'port-2'
    case Position.Left:
    default:
      return 'port-3'
  }
}

export type PortPlacement = {
  index: number
  id: string
  px: number
  py: number
  left: string
  top: string
  position: Position
  /** Compass degrees from center (for facing / RF side). */
  deg: number
}

type Pt = { x: number; y: number }

function clamp01(v: number) {
  return Math.min(0.98, Math.max(0.02, v))
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Closed polyline perimeter samples → point at arc length fraction t∈[0,1). */
function pointOnPolyline(points: Pt[], t: number): Pt {
  if (points.length === 0) return { x: 0.5, y: 0.5 }
  if (points.length === 1) return points[0]!
  const segs: { a: Pt; b: Pt; len: number }[] = []
  let peri = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const len = dist(a, b)
    segs.push({ a, b, len })
    peri += len
  }
  if (peri < 1e-9) return points[0]!
  let d = (((t % 1) + 1) % 1) * peri
  for (const s of segs) {
    if (d <= s.len || s.len < 1e-12) {
      const u = s.len < 1e-12 ? 0 : d / s.len
      return {
        x: s.a.x + (s.b.x - s.a.x) * u,
        y: s.a.y + (s.b.y - s.a.y) * u,
      }
    }
    d -= s.len
  }
  return points[0]!
}

/** Unit-box outline for each mermaid-ish shape (0–1 coords). */
function shapePerimeterPolyline(shape: NodeShape): Pt[] {
  switch (shape) {
    case 'circle':
    case 'double-circle': {
      // Dense circle approx
      const n = 48
      const out: Pt[] = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2 // start at top
        out.push({ x: 0.5 + 0.5 * Math.cos(a), y: 0.5 + 0.5 * Math.sin(a) })
      }
      return out
    }
    case 'stadium':
      // CSS stadium = border-radius:9999 pill. Connection ports must sit on
      // mid-sides (N/E/S/W), not equal-arc along a bad capsule polyline
      // (that produced a "tornado" spiral of 4 blue dots on Start/Done).
      // Same outline as rectangle → port-0 top center, 1 right, 2 bottom, 3 left.
      return [
        { x: 0.5, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0 },
      ]
    case 'diamond':
      return [
        { x: 0.5, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
      ]
    case 'hexagon':
      return [
        { x: 0.25, y: 0 },
        { x: 0.75, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.75, y: 1 },
        { x: 0.25, y: 1 },
        { x: 0, y: 0.5 },
      ]
    case 'parallelogram':
      return [
        { x: 0.15, y: 0 },
        { x: 1, y: 0 },
        { x: 0.85, y: 1 },
        { x: 0, y: 1 },
      ]
    case 'parallelogram-alt':
      return [
        { x: 0, y: 0 },
        { x: 0.85, y: 0 },
        { x: 1, y: 1 },
        { x: 0.15, y: 1 },
      ]
    case 'trapezoid':
      return [
        { x: 0.2, y: 0 },
        { x: 0.8, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]
    case 'trapezoid-alt':
      return [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.8, y: 1 },
        { x: 0.2, y: 1 },
      ]
    case 'asymmetric':
      return [
        { x: 0, y: 0 },
        { x: 0.85, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.85, y: 1 },
        { x: 0, y: 1 },
      ]
    case 'cylinder':
      // Side rectangle approx (top/bottom ellipses simplified to box)
      return [
        { x: 0, y: 0.12 },
        { x: 1, y: 0.12 },
        { x: 1, y: 0.88 },
        { x: 0, y: 0.88 },
      ]
    case 'rounded':
    case 'subroutine':
    case 'rectangle':
    default:
      // Axis-aligned box — start mid-top so rotation 0 ≈ top center
      return [
        { x: 0.5, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0 },
      ]
  }
}

function placementFromPoint(index: number, pt: Pt): PortPlacement {
  const px = clamp01(pt.x)
  const py = clamp01(pt.y)
  const deg = (Math.atan2(py - 0.5, px - 0.5) * 180) / Math.PI
  return {
    index,
    id: `port-${index}`,
    px,
    py,
    left: `${px * 100}%`,
    top: `${py * 100}%`,
    position: angleToPosition(deg),
    deg,
  }
}

/**
 * Evenly spaced ports.
 * Perimeter mode: equal arc-length along shape outline (perimeter ÷ count).
 * Free mode: equal angles from center, scaled by radius.
 */
export function computePortPlacements(
  layout: PortLayout,
  shape: NodeShape,
): PortPlacement[] {
  const { count, radius, rotation, onPerimeter } = layout
  const out: PortPlacement[] = []

  if (onPerimeter) {
    const poly = shapePerimeterPolyline(shape)
    // rotation degrees → offset along perimeter [0,1)
    const rotT = ((rotation % 360) + 360) % 360 / 360
    for (let i = 0; i < count; i++) {
      // Equal division of perimeter; rotT shifts the whole set
      const t = (i / count + rotT) % 1
      out.push(placementFromPoint(i, pointOnPolyline(poly, t)))
    }
    return out
  }

  // Free radial (circle around center) — radius scales from center
  for (let i = 0; i < count; i++) {
    // Default start at top (−90°) so first port is north when rotation=0
    const deg = -90 + rotation + (360 / count) * i
    const rad = (deg * Math.PI) / 180
    const ux = Math.cos(rad)
    const uy = Math.sin(rad)
    const px = clamp01(0.5 + ux * 0.5 * radius)
    const py = clamp01(0.5 + uy * 0.5 * radius)
    out.push({
      index: i,
      id: `port-${i}`,
      px,
      py,
      left: `${px * 100}%`,
      top: `${py * 100}%`,
      position: angleToPosition(deg),
      deg,
    })
  }
  return out
}

/** Normalize any handle id to `port-N` when possible. */
export function normalizePortHandleId(
  handleId: string | null | undefined,
): string | null {
  if (!handleId) return null
  const port = handleId.match(/^port-(\d+)(?:-s|-t)?$/)
  if (port) return `port-${port[1]}`
  const legacy: Record<string, string> = {
    'top-target': 'port-0',
    'top-source': 'port-0',
    'right-source': 'port-1',
    'right-target': 'port-1',
    'bottom-source': 'port-2',
    'bottom-target': 'port-2',
    'left-target': 'port-3',
    'left-source': 'port-3',
  }
  return legacy[handleId] ?? null
}

/**
 * Absolute flow-space position of a port handle on a node box.
 * Returns null if handle is missing / not a port.
 */
export function portFlowPoint(
  box: { cx: number; cy: number; width: number; height: number },
  shape: NodeShape | undefined,
  data: FlowNodeData | undefined,
  handleId: string | null | undefined,
): { x: number; y: number } | null {
  const id = normalizePortHandleId(handleId)
  if (!id) return null
  const layout = getPortLayout(data)
  const ports = computePortPlacements(layout, shape ?? 'rectangle')
  const p = ports.find((x) => x.id === id)
  if (!p) return null
  const left = box.cx - box.width / 2
  const top = box.cy - box.height / 2
  return {
    x: left + p.px * box.width,
    y: top + p.py * box.height,
  }
}

function nodeCenter(n: Node<FlowNodeData>): { x: number; y: number } {
  const w =
    typeof n.width === 'number'
      ? n.width
      : typeof n.style?.width === 'number'
        ? n.style.width
        : 150
  const h =
    typeof n.height === 'number'
      ? n.height
      : typeof n.style?.height === 'number'
        ? n.style.height
        : 60
  return { x: n.position.x + w / 2, y: n.position.y + h / 2 }
}

export function pickFacingPortId(
  node: Node<FlowNodeData>,
  other: Node<FlowNodeData>,
): string {
  const shape = (node.data?.shape ?? 'rectangle') as NodeShape
  const layout = getPortLayout(node.data)
  const ports = computePortPlacements(layout, shape)
  if (ports.length === 0) return 'port-0'

  const a = nodeCenter(node)
  const b = nodeCenter(other)
  const facing = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

  let best = ports[0]!
  let bestDiff = Infinity
  for (const p of ports) {
    let diff = Math.abs(p.deg - facing)
    const d2 = Math.min(diff % 360, 360 - (diff % 360))
    if (d2 < bestDiff) {
      bestDiff = d2
      best = p
    }
  }
  return best.id
}

/**
 * Ensure every edge ends on a valid `port-N` on its own source/target nodes.
 * Never reassigns edge.source / edge.target.
 *
 * When port layout changes (rotate/count), keep the same port index if still
 * valid so endpoints move with the dots; re-pick only if missing/out of range.
 * Manual (user-plugged) edges keep their handles whenever still in range.
 *
 * @param opts.forceFacing — always re-pick mid-side ports facing the other node
 *   (Mermaid-style after free-form moves). Default keeps stable port indices.
 */
export function reconcileEdgeHandles<
  E extends {
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
    data?: { manualConnect?: boolean }
  },
>(
  nodes: Node<FlowNodeData>[],
  edges: E[],
  opts?: { forceFacing?: boolean },
): E[] {
  const forceFacing = opts?.forceFacing === true
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges.map((e) => {
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) return e
    if (
      e.sourceHandle === 'center' ||
      e.targetHandle === 'center-target' ||
      src.type === 'mindmapNode'
    ) {
      return e
    }

    const manual = e.data?.manualConnect === true
    // Never force-facing on user plugs — they chose the ports
    const mayForce = forceFacing && !manual

    const srcLayout = getPortLayout(src.data)
    const tgtLayout = getPortLayout(tgt.data)

    let sh = normalizePortHandleId(e.sourceHandle)
    let th = normalizePortHandleId(e.targetHandle)

    const srcIdx = sh ? Number(sh.replace('port-', '')) : NaN
    const tgtIdx = th ? Number(th.replace('port-', '')) : NaN

    if (
      mayForce ||
      !Number.isFinite(srcIdx) ||
      srcIdx < 0 ||
      srcIdx >= srcLayout.count
    ) {
      sh = pickFacingPortId(src, tgt)
    } else {
      sh = `port-${srcIdx}`
    }
    if (
      mayForce ||
      !Number.isFinite(tgtIdx) ||
      tgtIdx < 0 ||
      tgtIdx >= tgtLayout.count
    ) {
      th = pickFacingPortId(tgt, src)
    } else {
      th = `port-${tgtIdx}`
    }

    if (sh === e.sourceHandle && th === e.targetHandle) return e
    return { ...e, sourceHandle: sh, targetHandle: th }
  })
}
