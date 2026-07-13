/**
 * Mermaid-style flowchart edge routing for free-form React Flow.
 *
 * Mermaid reverse edges (e.g. Check -->|No| Input) stay in the **same corridor**
 * as the forward edge, offset ~12–24px laterally — not a wide C-shaped detour.
 *
 *  - Clip center (or parallel-shifted aim) to node borders
 *  - Keep waypoints collinear so paths look like Mermaid (clean, not staggered)
 *  - Multi-edge pairs: small lateral offsets so both stay visible
 */
import {
  line as d3Line,
  curveBasis,
  curveLinear,
  curveStep,
  curveStepAfter,
  curveStepBefore,
  curveCardinal,
  curveCatmullRom,
  curveMonotoneX,
  curveMonotoneY,
  curveNatural,
  curveBumpX,
  curveBumpY,
} from 'd3-shape'
import type { CurveStyle, NodeShape } from './store'

export type Pt = { x: number; y: number }

export type NodeBox = {
  cx: number
  cy: number
  width: number
  height: number
  shape?: NodeShape
}

function curveFactory(style: CurveStyle | undefined) {
  switch (style) {
    case 'linear':
      return curveLinear
    case 'step':
      return curveStep
    case 'stepAfter':
      return curveStepAfter
    case 'stepBefore':
      return curveStepBefore
    case 'cardinal':
      return curveCardinal
    case 'catmullRom':
      return curveCatmullRom
    case 'monotoneX':
      return curveMonotoneX
    case 'monotoneY':
      return curveMonotoneY
    case 'natural':
      return curveNatural
    case 'bumpX':
      return curveBumpX
    case 'bumpY':
      return curveBumpY
    case 'basis':
    default:
      return curveBasis
  }
}

export function intersectRect(node: NodeBox, point: Pt): Pt {
  const dx = point.x - node.cx
  const dy = point.y - node.cy
  let w = node.width / 2
  let h = node.height / 2
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { x: node.cx, y: node.cy + h }
  }
  if (Math.abs(dy) * w > Math.abs(dx) * h) {
    if (dy < 0) h = -h
    return {
      x: node.cx + (dy === 0 ? 0 : (h * dx) / dy),
      y: node.cy + h,
    }
  }
  if (dx < 0) w = -w
  return {
    x: node.cx + w,
    y: node.cy + (dx === 0 ? 0 : (w * dy) / dx),
  }
}

export function intersectDiamond(node: NodeBox, point: Pt): Pt {
  const dx = point.x - node.cx
  const dy = point.y - node.cy
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { x: node.cx, y: node.cy + node.height / 2 }
  }
  const hw = node.width / 2
  const hh = node.height / 2
  const t = Math.abs(dx) / hw + Math.abs(dy) / hh
  if (t < 1e-9) return { x: node.cx, y: node.cy + hh }
  return { x: node.cx + dx / t, y: node.cy + dy / t }
}

export function intersectEllipse(node: NodeBox, point: Pt): Pt {
  const dx = point.x - node.cx
  const dy = point.y - node.cy
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { x: node.cx, y: node.cy + node.height / 2 }
  }
  const rx = node.width / 2
  const ry = node.height / 2
  const ux = dx / rx
  const uy = dy / ry
  const len = Math.hypot(ux, uy) || 1
  return { x: node.cx + (ux / len) * rx, y: node.cy + (uy / len) * ry }
}

export function intersectNode(node: NodeBox, point: Pt): Pt {
  const shape = node.shape ?? 'rectangle'
  if (shape === 'diamond') return intersectDiamond(node, point)
  if (shape === 'circle' || shape === 'double-circle') {
    return intersectEllipse(node, point)
  }
  return intersectRect(node, point)
}

export type MermaidRouteOpts = {
  source: NodeBox
  target: NodeBox
  /**
   * Signed lateral slot for multi-edges (Mermaid-like):
   *  0, ±1, ±2… → offset = index * spacing (default spacing ~18px)
   * Forward and reverse share the corridor, slightly apart — no big C-loops.
   */
  siblingIndex?: number
  siblingSpacing?: number
  curveStyle?: CurveStyle
  /** @deprecated */
  siblingOffset?: number
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Point on the top/bottom/left/right face of a node, shifted along the face.
 * Diamonds place the point on the real diamond edges (not the AABB).
 */
export function faceAttach(
  node: NodeBox,
  face: 't' | 'b' | 'l' | 'r',
  along: number,
): Pt {
  const hw = node.width / 2
  const hh = node.height / 2
  const shape = node.shape ?? 'rectangle'
  const faceScale = shape === 'diamond' ? 0.65 : 0.92
  const maxAlongX = hw * faceScale
  const maxAlongY = hh * faceScale
  const ax = clamp(along, -maxAlongX, maxAlongX)
  const ay = clamp(along, -maxAlongY, maxAlongY)

  if (shape === 'diamond') {
    // On diamond outline: tip at ±hh, sides at ±hw
    const tX = Math.abs(ax) / (hw || 1)
    const tY = Math.abs(ay) / (hh || 1)
    switch (face) {
      case 'b':
        return { x: node.cx + ax, y: node.cy + hh * (1 - tX) }
      case 't':
        return { x: node.cx + ax, y: node.cy - hh * (1 - tX) }
      case 'r':
        return { x: node.cx + hw * (1 - tY), y: node.cy + ay }
      case 'l':
        return { x: node.cx - hw * (1 - tY), y: node.cy + ay }
    }
  }

  switch (face) {
    case 'b':
      return { x: node.cx + ax, y: node.cy + hh }
    case 't':
      return { x: node.cx + ax, y: node.cy - hh }
    case 'r':
      return { x: node.cx + hw, y: node.cy + ay }
    case 'l':
      return { x: node.cx - hw, y: node.cy + ay }
  }
}

/**
 * Parallel corridor path (Mermaid-like reverse edges).
 *
 * Offset in **screen space** (X for vertical pairs). Attach to top/bottom
 * faces at cx±offset so forward (−) and reverse (+) sit side-by-side like
 * Mermaid — not a wide C-loop, not stacked on one line.
 */
export function mermaidEdgeWaypoints(opts: MermaidRouteOpts): Pt[] {
  const { source, target } = opts
  // Mermaid reverse pairs sit ~14–18px off center (see dump Input/Check paths)
  const spacing = opts.siblingSpacing ?? 14

  let index = opts.siblingIndex
  if (index === undefined && opts.siblingOffset !== undefined) {
    index =
      Math.abs(opts.siblingOffset) < 1
        ? 0
        : Math.round(opts.siblingOffset / spacing)
  }
  index = index ?? 0

  const offsetPx = index * spacing

  const dx = target.cx - source.cx
  const dy = target.cy - source.cy
  const vertical = Math.abs(dy) >= Math.abs(dx)

  let start: Pt
  let end: Pt

  if (vertical) {
    const goingDown = dy >= 0
    start = faceAttach(source, goingDown ? 'b' : 't', offsetPx)
    end = faceAttach(target, goingDown ? 't' : 'b', offsetPx)
  } else {
    const goingRight = dx >= 0
    start = faceAttach(source, goingRight ? 'r' : 'l', offsetPx)
    end = faceAttach(target, goingRight ? 'l' : 'r', offsetPx)
  }

  const sx = end.x - start.x
  const sy = end.y - start.y

  // Mild bow for reverse multi-edges only (still tight corridor)
  const reverse = dy < -2
  const bow =
    reverse && Math.abs(offsetPx) > 0.5
      ? Math.min(10, 4 + Math.abs(offsetPx) * 0.35)
      : 0
  const bowX = vertical ? Math.sign(offsetPx || 1) * bow : 0
  const bowY = vertical ? 0 : Math.sign(offsetPx || 1) * bow

  const m1: Pt = {
    x: start.x + sx * 0.35 + bowX,
    y: start.y + sy * 0.35 + bowY,
  }
  const m2: Pt = {
    x: start.x + sx * 0.65 + bowX,
    y: start.y + sy * 0.65 + bowY,
  }

  return [start, m1, m2, end]
}

export function mermaidStyleEdgePath(opts: MermaidRouteOpts): {
  path: string
  labelX: number
  labelY: number
  points: Pt[]
  start: Pt
  end: Pt
} {
  const points = mermaidEdgeWaypoints(opts)
  // Nearly collinear → linear is crisp; small bow → basis
  const bow =
    points.length >= 4
      ? Math.hypot(
          points[1]!.x -
            (points[0]!.x + (points[3]!.x - points[0]!.x) * 0.35),
          points[1]!.y -
            (points[0]!.y + (points[3]!.y - points[0]!.y) * 0.35),
        )
      : 0
  const curve =
    bow > 2 ? curveFactory(opts.curveStyle ?? 'basis') : curveLinear

  const gen = d3Line<Pt>()
    .x((p) => p.x)
    .y((p) => p.y)
    .curve(curve)
  const path =
    gen(points) ?? `M${points[0]?.x ?? 0},${points[0]?.y ?? 0}`

  const mid = points[Math.floor(points.length / 2)]!
  // Label slightly outside multi-edge corridor
  const index = opts.siblingIndex ?? 0
  let labelX = mid.x
  let labelY = mid.y
  if (index !== 0) {
    const a = points[0]!
    const b = points[points.length - 1]!
    const vertical = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x)
    // Nudge label in absolute screen space (same as path offset)
    if (vertical) labelX += Math.sign(index) * 12
    else labelY += Math.sign(index) * 12
  }

  return {
    path,
    labelX,
    labelY,
    points,
    start: points[0]!,
    end: points[points.length - 1]!,
  }
}

export type LegacyHandleRouteOpts = {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition?: unknown
  targetPosition?: unknown
  siblingOffset?: number
  siblingIndex?: number
  siblingSpacing?: number
  curveStyle?: CurveStyle
  sourceBox?: NodeBox
  targetBox?: NodeBox
}

export function routeFlowchartEdge(
  opts: MermaidRouteOpts | LegacyHandleRouteOpts,
): {
  path: string
  labelX: number
  labelY: number
  points: Pt[]
  start: Pt
  end: Pt
} {
  if ('source' in opts && opts.source && 'target' in opts && opts.target) {
    return mermaidStyleEdgePath(opts)
  }
  const h = opts as LegacyHandleRouteOpts
  if (h.sourceBox && h.targetBox) {
    return mermaidStyleEdgePath({
      source: h.sourceBox,
      target: h.targetBox,
      siblingIndex: h.siblingIndex,
      siblingOffset: h.siblingOffset,
      siblingSpacing: h.siblingSpacing,
      curveStyle: h.curveStyle,
    })
  }
  return mermaidStyleEdgePath({
    source: {
      cx: h.sourceX,
      cy: h.sourceY,
      width: 4,
      height: 4,
      shape: 'rectangle',
    },
    target: {
      cx: h.targetX,
      cy: h.targetY,
      width: 4,
      height: 4,
      shape: 'rectangle',
    },
    siblingIndex: h.siblingIndex,
    siblingOffset: h.siblingOffset,
    siblingSpacing: h.siblingSpacing,
    curveStyle: h.curveStyle,
  })
}

export type EdgeRef = { id: string; source: string; target: string }

/**
 * Assign lateral slots for edges on the same unordered pair.
 *
 * For 2 edges (forward + reverse): indices -1 and +1 so both offset from
 * center (~±spacing), matching Mermaid's side-by-side reverse look.
 * For 1 edge: 0 (dead center).
 * For 3+: -1, 0, +1, …
 */
export function siblingIndexForEdge(
  edgeId: string,
  source: string,
  target: string,
  all: EdgeRef[],
  nodeCenters?: Map<string, { cx: number; cy: number }>,
): number {
  const pair = all.filter(
    (e) =>
      (e.source === source && e.target === target) ||
      (e.source === target && e.target === source),
  )
  if (pair.length <= 1) return 0

  const rank = (e: EdgeRef): number => {
    const sc = nodeCenters?.get(e.source)
    const tc = nodeCenters?.get(e.target)
    if (sc && tc) {
      const dy = tc.cy - sc.cy
      const dx = tc.cx - sc.cx
      // Forward = down or right (positive)
      return Math.abs(dy) >= Math.abs(dx) ? dy : dx
    }
    return e.source < e.target ? 1 : -1
  }

  // Forward first, then reverse; stable by id
  const sorted = [...pair].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return rb - ra // more positive (forward) first
    return a.id.localeCompare(b.id)
  })

  const idx = sorted.findIndex((e) => e.id === edgeId)
  if (idx < 0) return 0

  const n = sorted.length
  if (n === 2) {
    // Mermaid-like: forward leftish of corridor (-1), reverse rightish (+1)
    // or forward 0 and reverse +1 — use ±1 for clear separation
    return idx === 0 ? -1 : 1
  }

  // Center around 0
  return idx - (n - 1) / 2
}

/** @deprecated */
export function siblingOffsetForEdge(
  edgeId: string,
  source: string,
  target: string,
  all: EdgeRef[],
  spacing = 18,
): number {
  return siblingIndexForEdge(edgeId, source, target, all) * spacing
}

export function nodeBoxFromRf(
  absX: number,
  absY: number,
  width: number,
  height: number,
  shape?: NodeShape,
): NodeBox {
  return {
    cx: absX + width / 2,
    cy: absY + height / 2,
    width: Math.max(8, width),
    height: Math.max(8, height),
    shape,
  }
}
