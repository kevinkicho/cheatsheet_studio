/**
 * Edge paths for the free-form flowchart editor.
 *
 *  - Manual port plug: straight between the two ports
 *  - Auto (template / layout): React Flow smooth-step (orthogonal flowchart look)
 *  - Reverse multi-edge (e.g. No loop): both ends on the same side → U-turn
 *  - Waypoints: smooth path through user bends
 */
import { getSmoothStepPath, Position } from '@xyflow/react'
import { line as d3Line, curveCatmullRom } from 'd3-shape'
import type { CurveStyle, FlowNodeData, NodeShape } from './store'
import { intersectNode, type NodeBox, type Pt } from './mermaidEdgeRoute'
import {
  computePortPlacements,
  getPortLayout,
  normalizePortHandleId,
  portFlowPoint,
} from './portLayout'

/** RF face for a port handle (matches blue-dot side). */
function positionFromPortHandle(
  handleId: string | null | undefined,
  data: FlowNodeData | undefined,
  shape: NodeShape | undefined,
): Position | null {
  const id = normalizePortHandleId(handleId)
  if (!id) return null
  const layout = getPortLayout(data)
  const ports = computePortPlacements(layout, shape ?? 'rectangle')
  const p = ports.find((x) => x.id === id)
  if (p) return p.position
  const n = Number(id.replace('port-', ''))
  if (!Number.isFinite(n)) return null
  const map = [Position.Top, Position.Right, Position.Bottom, Position.Left]
  return map[((n % 4) + 4) % 4] ?? null
}

export type EdgeWaypoint = {
  id: string
  x: number
  y: number
}

export function newWaypointId(): string {
  return `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function fmt(n: number) {
  return (Math.round(n * 10) / 10).toString()
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function seatOnBorder(border: Pt, center: Pt, inset = 0.5): Pt {
  const dx = center.x - border.x
  const dy = center.y - border.y
  const len = Math.hypot(dx, dy) || 1
  return {
    x: border.x + (dx / len) * inset,
    y: border.y + (dy / len) * inset,
  }
}

/** Mid-face point on a node, optional slide along the face. */
function pointOnFace(
  box: NodeBox,
  face: Position,
  along = 0,
): Pt {
  const hw = box.width / 2
  const hh = box.height / 2
  // Keep slide on the face (not past corners)
  const ax = clamp(along, -hw * 0.35, hw * 0.35)
  const ay = clamp(along, -hh * 0.35, hh * 0.35)

  let outside: Pt
  switch (face) {
    case Position.Top:
      outside = { x: box.cx + ax, y: box.cy - hh - 8 }
      break
    case Position.Bottom:
      outside = { x: box.cx + ax, y: box.cy + hh + 8 }
      break
    case Position.Left:
      outside = { x: box.cx - hw - 8, y: box.cy + ay }
      break
    case Position.Right:
    default:
      outside = { x: box.cx + hw + 8, y: box.cy + ay }
      break
  }
  return seatOnBorder(intersectNode(box, outside), { x: box.cx, y: box.cy })
}

/** True when this edge is the reverse leg of a multi-edge pair (feedback loop). */
export function isReverseMultiEdge(
  source: NodeBox,
  target: NodeBox,
  isMulti: boolean,
): boolean {
  if (!isMulti) return false
  const dx = target.cx - source.cx
  const dy = target.cy - source.cy
  // Going up, or mostly left on a horizontal pair
  return dy < -2 || (Math.abs(dy) < Math.abs(dx) && dx < -2)
}

/**
 * Choose which faces to connect for flowchart-style routing.
 *
 *  - Normal edges: bottom→top / right→left (centered on face)
 *  - Reverse multi (No-loop): same side on both nodes → smooth-step U-turn
 *  - Forward multi: still centered (only reverse gets the side loop)
 */
export function facePairForEdge(
  source: NodeBox,
  target: NodeBox,
  siblingIndex = 0,
  isMulti = false,
): { sourcePos: Position; targetPos: Position; reverseLoop: boolean } {
  const dx = target.cx - source.cx
  const dy = target.cy - source.cy
  const reverse = isReverseMultiEdge(source, target, isMulti)

  if (reverse) {
    // Feedback loop on the right (left if slot is negative)
    const side = siblingIndex < 0 ? Position.Left : Position.Right
    return { sourcePos: side, targetPos: side, reverseLoop: true }
  }

  if (Math.abs(dy) >= Math.abs(dx)) {
    return {
      sourcePos: dy >= 0 ? Position.Bottom : Position.Top,
      targetPos: dy >= 0 ? Position.Top : Position.Bottom,
      reverseLoop: false,
    }
  }
  return {
    sourcePos: dx >= 0 ? Position.Right : Position.Left,
    targetPos: dx >= 0 ? Position.Left : Position.Right,
    reverseLoop: false,
  }
}

/**
 * Live border endpoints + face directions for smooth-step routing.
 * Forward edges always attach mid-face so the main stack stays centered.
 * `isMulti` must be the true pair count flag — do not use siblingIndex≠0 alone
 * (that re-routed existing edges when a second connection was added).
 */
export function liveEndpoints(
  source: NodeBox,
  target: NodeBox,
  siblingIndex = 0,
  _siblingSpacing = 14,
  isMulti = false,
): { start: Pt; end: Pt; sourcePos: Position; targetPos: Position; reverseLoop: boolean } {
  const { sourcePos, targetPos, reverseLoop } = facePairForEdge(
    source,
    target,
    siblingIndex,
    isMulti,
  )
  // Always mid-face — reverse loop uses same side; forward stays centered under nodes
  const start = pointOnFace(source, sourcePos, 0)
  const end = pointOnFace(target, targetPos, 0)
  return { start, end, sourcePos, targetPos, reverseLoop }
}

/** Single connection: straight. */
export function simpleStraightPath(
  start: Pt,
  end: Pt,
): { path: string; labelX: number; labelY: number } {
  return {
    path: `M${fmt(start.x)},${fmt(start.y)} L${fmt(end.x)},${fmt(end.y)}`,
    labelX: (start.x + end.x) / 2,
    labelY: (start.y + end.y) / 2,
  }
}

/**
 * Orthogonal flowchart path (RF smooth-step).
 * Reverse multi-edges / same-side ports: large offset so the U-turn clears nodes
 * (pipes must not cut through blocks).
 */
export function smoothStepEdgePath(
  start: Pt,
  end: Pt,
  sourcePos: Position,
  targetPos: Position,
  opts?: {
    reverseLoop?: boolean
    spacing?: number
    /** Extra clearance from node boxes (half-width/height of larger node). */
    clearNodesBy?: number
  },
): { path: string; labelX: number; labelY: number } {
  const reverseLoop = opts?.reverseLoop === true
  const spacing = opts?.spacing ?? 14
  const sameSide = sourcePos === targetPos
  const clear = opts?.clearNodesBy ?? 0
  // Need enough offset that the pipe rides outside the node silhouette
  const base = reverseLoop || sameSide
    ? Math.max(72, spacing * 4, clear + 24)
    : Math.max(20, spacing, clear * 0.25)
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: start.x,
    sourceY: start.y,
    targetX: end.x,
    targetY: end.y,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    borderRadius: 12,
    offset: base,
  })
  return { path, labelX, labelY }
}

/** @deprecated kept for tests — mild Q bow perpendicular to chord */
export function oppositeBowArc(
  start: Pt,
  end: Pt,
  side: 1 | -1,
  spacing: number,
): { path: string; labelX: number; labelY: number } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const bowAmt = clamp(Math.max(spacing * 0.55, 10), 8, Math.min(28, len * 0.22))
  const throughX = start.x + dx * 0.5 + side * bowAmt * nx
  const throughY = start.y + dy * 0.5 + side * bowAmt * ny
  const cx = 2 * throughX - 0.5 * (start.x + end.x)
  const cy = 2 * throughY - 0.5 * (start.y + end.y)
  return {
    path: `M${fmt(start.x)},${fmt(start.y)} Q${fmt(cx)},${fmt(cy)} ${fmt(end.x)},${fmt(end.y)}`,
    labelX: throughX + side * nx * 10,
    labelY: throughY + side * ny * 10,
  }
}

export function pathThroughPoints(points: Pt[]): {
  path: string
  labelX: number
  labelY: number
} {
  if (points.length < 2) {
    const p = points[0] ?? { x: 0, y: 0 }
    return { path: `M${fmt(p.x)},${fmt(p.y)}`, labelX: p.x, labelY: p.y }
  }
  if (points.length === 2) {
    return simpleStraightPath(points[0]!, points[1]!)
  }
  const gen = d3Line<Pt>()
    .x((p) => p.x)
    .y((p) => p.y)
    .curve(curveCatmullRom.alpha(0.5))
  const path =
    gen(points) ??
    simpleStraightPath(points[0]!, points[points.length - 1]!).path
  const mid = points[Math.floor(points.length / 2)]!
  return { path, labelX: mid.x, labelY: mid.y }
}

export function samplePathPoints(d: string): Pt[] {
  const nums = [...d.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map((m) =>
    Number(m[0]),
  )
  const pts: Pt[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i]!, y: nums[i + 1]! })
  }
  return pts
}

export type BuildEdgePathOpts = {
  source: NodeBox
  target: NodeBox
  waypoints?: EdgeWaypoint[]
  mermaidPath?: string
  mermaidLabelX?: number
  mermaidLabelY?: number
  siblingIndex?: number
  siblingSpacing?: number
  curveStyle?: CurveStyle
  isMultiEdge?: boolean
  sourceHandle?: string | null
  targetHandle?: string | null
  sourceData?: FlowNodeData
  targetData?: FlowNodeData
  startPt?: Pt | null
  endPt?: Pt | null
  /**
   * User-plugged wire — still uses curved pipe routing; endpoints pin to ports.
   * (Kept for callers / snapshots; does not force a straight line.)
   */
  manualConnect?: boolean
  /** Optional RF handle face directions (from EdgeProps). */
  sourcePosition?: Position
  targetPosition?: Position
  /** @deprecated Mermaid path no longer preferred — smooth-step is default */
  preferMermaidPath?: boolean
}

/**
 * Single routing function for interactive editor + canvas card.
 * Always orthogonal smooth-step ("pipe") curves; pins to ports when known.
 *
 * Stability: user plugs (manualConnect + handles) never re-route when another
 * edge is added to the same pair. Only auto reverse multi (No loop) uses
 * pair multi-edge face logic.
 */
export function buildEdgePath(opts: BuildEdgePathOpts): {
  path: string
  labelX: number
  labelY: number
  start: Pt
  end: Pt
  midPoints: Pt[]
} {
  const idx = opts.siblingIndex ?? 0
  const spacing = opts.siblingSpacing ?? 14
  // True multi-pair only — do NOT treat siblingIndex≠0 as multi (that reshaped
  // existing edges when a second connection was added).
  const multi = opts.isMultiEdge === true
  const manual = opts.manualConnect === true
  const slot = idx

  // Port anchors when handles known (editor + card share this)
  const sPort =
    opts.startPt ??
    portFlowPoint(
      opts.source,
      (opts.source.shape ?? opts.sourceData?.shape) as NodeShape | undefined,
      opts.sourceData,
      opts.sourceHandle,
    )
  const tPort =
    opts.endPt ??
    portFlowPoint(
      opts.target,
      (opts.target.shape ?? opts.targetData?.shape) as NodeShape | undefined,
      opts.targetData,
      opts.targetHandle,
    )

  const hasPorts = Boolean(sPort && tPort)
  // Locked plug: ignore multi-pair face rewrites (other edges won't change this one)
  const lockPorts = manual || hasPorts

  const faces = liveEndpoints(
    opts.source,
    opts.target,
    // Reverse No on right by default; left only when slot negative and not locked
    lockPorts ? 0 : slot,
    spacing,
    lockPorts ? false : multi,
  )
  const start = sPort ?? faces.start
  const end = tPort ?? faces.end

  const wps = opts.waypoints ?? []
  if (wps.length > 0) {
    const points: Pt[] = [
      start,
      ...wps.map((w) => ({ x: w.x, y: w.y })),
      end,
    ]
    const r = pathThroughPoints(points)
    return {
      path: r.path,
      labelX: r.labelX,
      labelY: r.labelY,
      start,
      end,
      midPoints: wps.map((w) => ({ x: w.x, y: w.y })),
    }
  }

  // Face directions for the pipe elbows
  let sourcePos: Position
  let targetPos: Position
  let reverseLoop = false

  if (lockPorts) {
    // Pin elbows to the actual ports — never re-face when other edges appear
    sourcePos =
      opts.sourcePosition ??
      positionFromPortHandle(
        opts.sourceHandle,
        opts.sourceData,
        opts.source.shape ?? opts.sourceData?.shape,
      ) ??
      faces.sourcePos
    targetPos =
      opts.targetPosition ??
      positionFromPortHandle(
        opts.targetHandle,
        opts.targetData,
        opts.target.shape ?? opts.targetData?.shape,
      ) ??
      faces.targetPos
    // Same-side ports (e.g. No right→right) need outside U-turn clearance
    reverseLoop = sourcePos === targetPos
  } else if (faces.reverseLoop) {
    // Auto reverse multi (No without plugs): same-side U-turn outside the stack
    sourcePos = faces.sourcePos
    targetPos = faces.targetPos
    reverseLoop = true
  } else {
    sourcePos = opts.sourcePosition ?? faces.sourcePos
    targetPos = opts.targetPosition ?? faces.targetPos
  }

  const clearNodesBy =
    Math.max(opts.source.width, opts.source.height, opts.target.width, opts.target.height) /
    2

  const r = smoothStepEdgePath(start, end, sourcePos, targetPos, {
    reverseLoop,
    spacing,
    clearNodesBy,
  })
  return {
    path: r.path,
    labelX: r.labelX,
    labelY: r.labelY,
    start,
    end,
    midPoints: [],
  }
}

export function distributeAlongPolyline(pts: Pt[], count: number): Pt[] {
  if (count <= 0 || pts.length < 2) return []
  let total = 0
  const segs: { a: Pt; b: Pt; len: number }[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push({ a, b, len })
    total += len
  }
  if (total < 1e-6) {
    const mid = pts[Math.floor(pts.length / 2)]!
    return Array.from({ length: count }, () => ({ ...mid }))
  }
  const out: Pt[] = []
  for (let i = 0; i < count; i++) {
    let d = ((i + 1) / (count + 1)) * total
    for (const s of segs) {
      if (d <= s.len || s === segs[segs.length - 1]) {
        const u = s.len < 1e-9 ? 0 : Math.min(1, d / s.len)
        out.push({
          x: s.a.x + (s.b.x - s.a.x) * u,
          y: s.a.y + (s.b.y - s.a.y) * u,
        })
        break
      }
      d -= s.len
    }
  }
  return out
}

export function seedWaypointsAlongEdge(
  source: NodeBox,
  target: NodeBox,
  count: number,
  existing?: EdgeWaypoint[],
  _mermaidPath?: string,
  siblingIndex = 0,
  siblingSpacing = 14,
): EdgeWaypoint[] {
  const n = Math.max(0, Math.min(12, Math.round(count)))
  if (n === 0) return []

  const { start, end } = liveEndpoints(
    source,
    target,
    siblingIndex,
    siblingSpacing,
  )
  const poly: Pt[] =
    existing && existing.length > 0
      ? [start, ...existing.map((w) => ({ x: w.x, y: w.y })), end]
      : [start, end]

  return distributeAlongPolyline(poly, n).map((p) => ({
    id: newWaypointId(),
    x: Math.round(p.x),
    y: Math.round(p.y),
  }))
}

export { intersectNode }
