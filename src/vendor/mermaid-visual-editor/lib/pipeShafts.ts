/**
 * Orthogonal pipe shafts — draggable mid-segments (CAD-style).
 * Interior runs can slide on their free axis (vertical shaft → X, horizontal → Y).
 */
import type { Pt } from './mermaidEdgeRoute'
import type { EdgeWaypoint } from './edgePath'

const EPS = 1.5

function newWaypointId(): string {
  return `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function simplifyOrthogonalCorners(pts: Pt[], eps = EPS): Pt[] {
  if (pts.length <= 2) return pts.map((p) => ({ ...p }))
  const out: Pt[] = [{ ...pts[0]! }]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!
    const b = pts[i]!
    const c = pts[i + 1]!
    const abH = Math.abs(a.y - b.y) < eps
    const abV = Math.abs(a.x - b.x) < eps
    const bcH = Math.abs(b.y - c.y) < eps
    const bcV = Math.abs(b.x - c.x) < eps
    // Keep direction-change elbows
    if ((abH && bcV) || (abV && bcH)) {
      out.push({ ...b })
    } else if (!abH && !abV) {
      out.push({ ...b })
    }
  }
  out.push({ ...pts[pts.length - 1]! })
  // Drop zero-length steps
  const clean: Pt[] = [out[0]!]
  for (let i = 1; i < out.length; i++) {
    const p = out[i]!
    const q = clean[clean.length - 1]!
    if (Math.hypot(p.x - q.x, p.y - q.y) > eps) clean.push(p)
  }
  return clean.length >= 2 ? clean : pts.map((p) => ({ ...p }))
}

/** Sample numeric pairs from an SVG path `d` (same idea as edgePath.samplePathPoints). */
export function samplePathPointsLocal(d: string): Pt[] {
  const nums = [...d.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map((m) =>
    Number(m[0]),
  )
  const pts: Pt[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i]!, y: nums[i + 1]! })
  }
  return pts
}

export function extractElbowsFromPath(d: string): Pt[] {
  if (!d) return []
  return simplifyOrthogonalCorners(samplePathPointsLocal(d))
}

export type PipeShaft = {
  /** Index of segment start in corners[] */
  index: number
  midX: number
  midY: number
  /** v = vertical run (drag left/right on X); h = horizontal run (drag up/down on Y) */
  axis: 'h' | 'v'
  length: number
}

/** Interior shafts only — endpoints stay pinned to ports. */
export function shaftsFromCorners(
  corners: Pt[],
  minLen = 14,
): PipeShaft[] {
  const shafts: PipeShaft[] = []
  if (corners.length < 4) return shafts // need at least start, a, b, end
  // Segments fully between intermediate corners: indices 1..(n-3)
  for (let i = 1; i < corners.length - 2; i++) {
    const a = corners[i]!
    const b = corners[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < minLen) continue
    if (Math.abs(dx) < EPS && Math.abs(dy) >= minLen) {
      shafts.push({
        index: i,
        midX: a.x,
        midY: (a.y + b.y) / 2,
        axis: 'v',
        length: len,
      })
    } else if (Math.abs(dy) < EPS && Math.abs(dx) >= minLen) {
      shafts.push({
        index: i,
        midX: (a.x + b.x) / 2,
        midY: a.y,
        axis: 'h',
        length: len,
      })
    }
  }
  return shafts
}

/** Slide a shaft on its free axis; keeps orthogonality. */
export function moveShaft(
  corners: Pt[],
  shaftIndex: number,
  axis: 'h' | 'v',
  value: number,
): Pt[] {
  const next = corners.map((p) => ({ ...p }))
  const last = next.length - 1
  if (shaftIndex < 1 || shaftIndex >= last - 1) return next
  const a = next[shaftIndex]!
  const b = next[shaftIndex + 1]!
  if (axis === 'v') {
    a.x = value
    b.x = value
  } else {
    a.y = value
    b.y = value
  }
  return next
}

/** Full polyline → edge waypoints (drop fixed start/end). Preserve ids when possible. */
export function cornersToWaypoints(
  corners: Pt[],
  prev?: EdgeWaypoint[],
): EdgeWaypoint[] {
  const mid = corners.slice(1, -1)
  return mid.map((p, i) => ({
    id: prev?.[i]?.id ?? newWaypointId(),
    x: Math.round(p.x),
    y: Math.round(p.y),
  }))
}

export function polylineFromEdge(
  start: Pt,
  end: Pt,
  waypoints: EdgeWaypoint[],
): Pt[] {
  return [
    { x: start.x, y: start.y },
    ...waypoints.map((w) => ({ x: w.x, y: w.y })),
    { x: end.x, y: end.y },
  ]
}

/**
 * Place edge labels (Yes/No) at the midpoint of the longest orthogonal shaft.
 * RF / vertex-index midpoints often land on a short stub (e.g. top horizontal of a
 * reverse U-turn) instead of the long exterior run the user sees as "the shaft".
 *
 * When several segments are within 15% of the max length, prefer vertical —
 * reverse No loops and typical TB flowcharts look best with labels on the tall side.
 */
export function longestSegmentMidpoint(corners: Pt[]): Pt {
  if (corners.length === 0) return { x: 0, y: 0 }
  if (corners.length === 1) return { ...corners[0]! }
  if (corners.length === 2) {
    const a = corners[0]!
    const b = corners[1]!
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  type Seg = { midX: number; midY: number; length: number; axis: 'h' | 'v' | 'd' }
  const segs: Seg[] = []
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i]!
    const b = corners[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length < EPS) continue
    let axis: Seg['axis'] = 'd'
    if (Math.abs(dx) < EPS) axis = 'v'
    else if (Math.abs(dy) < EPS) axis = 'h'
    segs.push({
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      length,
      axis,
    })
  }
  if (segs.length === 0) {
    const a = corners[0]!
    const b = corners[corners.length - 1]!
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  const maxLen = Math.max(...segs.map((s) => s.length))
  const near = segs.filter((s) => s.length >= maxLen * 0.85)
  const pick =
    near.find((s) => s.axis === 'v') ??
    near.find((s) => s.axis === 'h') ??
    near[0]!
  return { x: pick.midX, y: pick.midY }
}

/** Label anchor from an SVG path `d` (smooth-step or orthogonal L). */
export function labelAnchorFromPath(
  d: string,
  fallback: Pt = { x: 0, y: 0 },
): Pt {
  if (!d) return { ...fallback }
  const elbows = extractElbowsFromPath(d)
  if (elbows.length < 2) return { ...fallback }
  return longestSegmentMidpoint(elbows)
}

/** Orthogonal SVG path through elbows (pipe shafts stay axis-aligned). */
export function orthogonalPipePath(points: Pt[]): {
  path: string
  labelX: number
  labelY: number
} {
  if (points.length === 0) {
    return { path: '', labelX: 0, labelY: 0 }
  }
  if (points.length === 1) {
    const p = points[0]!
    return { path: `M${p.x},${p.y}`, labelX: p.x, labelY: p.y }
  }
  // Ensure manhattan: insert corner if diagonal step
  const poly: Pt[] = [{ ...points[0]! }]
  for (let i = 1; i < points.length; i++) {
    const a = poly[poly.length - 1]!
    const b = points[i]!
    if (Math.abs(a.x - b.x) > EPS && Math.abs(a.y - b.y) > EPS) {
      // Prefer horizontal then vertical
      poly.push({ x: b.x, y: a.y })
    }
    poly.push({ ...b })
  }
  const clean = simplifyOrthogonalCorners(poly)
  let d = `M${fmt(clean[0]!.x)},${fmt(clean[0]!.y)}`
  for (let i = 1; i < clean.length; i++) {
    d += ` L${fmt(clean[i]!.x)},${fmt(clean[i]!.y)}`
  }
  const mid = longestSegmentMidpoint(clean)
  return { path: d, labelX: mid.x, labelY: mid.y }
}

function fmt(n: number) {
  return (Math.round(n * 10) / 10).toString()
}
