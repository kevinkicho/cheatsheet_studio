import type { PanelShape } from '@/types'
import { ORGANIZE_GRID } from './constants'
import { rectPerimeterPathD } from './geometry'
import { cellsToOrthogonalRuns } from './freeGrid'

export function polyominoExteriorEdges(
  unit: Set<string>,
  grid: number,
  originX: number,
  originY: number,
  pad = 0,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  if (unit.size === 0 || grid < 1) return []
  const p = Math.max(0, pad)
  const has = (c: number, r: number) => unit.has(`${c},${r}`)
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (const k of unit) {
    const [cs, rs] = k.split(',')
    const c = Number(cs)
    const r = Number(rs)
    const x = originX + c * grid
    const y = originY + r * grid
    // N (outward −y): extend along edge by pad so corners meet
    if (!has(c, r - 1))
      segs.push({
        x1: x - p,
        y1: y - p,
        x2: x + grid + p,
        y2: y - p,
      })
    // S (outward +y)
    if (!has(c, r + 1))
      segs.push({
        x1: x - p,
        y1: y + grid + p,
        x2: x + grid + p,
        y2: y + grid + p,
      })
    // W (outward −x)
    if (!has(c - 1, r))
      segs.push({
        x1: x - p,
        y1: y - p,
        x2: x - p,
        y2: y + grid + p,
      })
    // E (outward +x)
    if (!has(c + 1, r))
      segs.push({
        x1: x + grid + p,
        y1: y - p,
        x2: x + grid + p,
        y2: y + grid + p,
      })
  }
  return segs
}

/**
 * Exterior SVG path for a unit-cell polyomino (absolute board px).
 *
 * Emits one `M…L…` per exterior edge (not a single stitched loop). Stitching
 * used to drop edges at T-junctions / L-corners and produced broken borders.
 * Per-edge segments always cover the full outline; internal edges omitted.
 */
export function polyominoExteriorPathD(
  unit: Set<string>,
  grid: number,
  originX: number,
  originY: number,
  pad = 0,
): string {
  const segs = polyominoExteriorEdges(unit, grid, originX, originY, pad)
  if (segs.length === 0) return ''
  return segs
    .map(
      (s) =>
        `M ${Math.round(s.x1)} ${Math.round(s.y1)} L ${Math.round(s.x2)} ${Math.round(s.y2)}`,
    )
    .join(' ')
}

/**
 * Morphological close: dilate then hole-fill so nearby card clusters fuse into
 * one solid region (no deep notches / “room walls” in the exterior outline).
 */
export function closePolyomino(unit: Set<string>, radius = 2): Set<string> {
  if (unit.size === 0 || radius < 1) return fillPolyominoHoles(unit)
  let u = new Set(unit)
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const
  for (let i = 0; i < radius; i++) {
    const next = new Set(u)
    for (const k of u) {
      const [cs, rs] = k.split(',')
      const c = Number(cs)
      const r = Number(rs)
      for (const [dc, dr] of dirs) next.add(`${c + dc},${r + dr}`)
    }
    u = next
  }
  return fillPolyominoHoles(u)
}

/**
 * Fill interior holes in a unit-cell polyomino so n-gon chrome never forms a
 * “donut” (empty island fully enclosed by the group).
 */
export function fillPolyominoHoles(unit: Set<string>): Set<string> {
  if (unit.size === 0) return unit
  let minC = Infinity
  let maxC = -Infinity
  let minR = Infinity
  let maxR = -Infinity
  for (const k of unit) {
    const [cs, rs] = k.split(',')
    const c = Number(cs)
    const r = Number(rs)
    minC = Math.min(minC, c)
    maxC = Math.max(maxC, c)
    minR = Math.min(minR, r)
    maxR = Math.max(maxR, r)
  }
  const exterior = new Set<string>()
  const q: Array<[number, number]> = []
  const key = (c: number, r: number) => `${c},${r}`
  const inB = (c: number, r: number) =>
    c >= minC - 1 && c <= maxC + 1 && r >= minR - 1 && r <= maxR + 1
  for (let c = minC - 1; c <= maxC + 1; c++) {
    q.push([c, minR - 1], [c, maxR + 1])
  }
  for (let r = minR; r <= maxR; r++) {
    q.push([minC - 1, r], [maxC + 1, r])
  }
  while (q.length) {
    const [c, r] = q.pop()!
    const k = key(c, r)
    if (!inB(c, r) || exterior.has(k) || unit.has(k)) continue
    exterior.add(k)
    q.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1])
  }
  const filled = new Set(unit)
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const k = key(c, r)
      if (!unit.has(k) && !exterior.has(k)) filled.add(k)
    }
  }
  return filled
}

/**
 * Cluster cards into horizontal row strips (solid rects). Used for n-gon
 * chrome so incomplete last rows produce a stepped exterior without snaking
 * corridors between individual cards.
 */
export function rowBlocksFromMembers(
  members: Array<{ x: number; y: number; width: number; height: number }>,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (members.length === 0) return []
  const sorted = [...members].sort((a, b) => a.y - b.y || a.x - b.x)
  type Row = {
    y0: number
    y1: number
    items: typeof members
  }
  const rows: Row[] = []
  for (const m of sorted) {
    const my0 = m.y
    const my1 = m.y + m.height
    let placed = false
    for (const row of rows) {
      // Same row if vertical ranges overlap by ≥40% of the shorter height
      const overlap = Math.min(row.y1, my1) - Math.max(row.y0, my0)
      const shorter = Math.min(row.y1 - row.y0, my1 - my0)
      if (overlap >= shorter * 0.4) {
        row.items.push(m)
        row.y0 = Math.min(row.y0, my0)
        row.y1 = Math.max(row.y1, my1)
        placed = true
        break
      }
    }
    if (!placed) rows.push({ y0: my0, y1: my1, items: [m] })
  }
  return rows.map((row) => {
    const x0 = Math.min(...row.items.map((i) => i.x))
    const x1 = Math.max(...row.items.map((i) => i.x + i.width))
    return {
      x: x0,
      y: row.y0,
      width: Math.max(8, x1 - x0),
      height: Math.max(8, row.y1 - row.y0),
    }
  })
}

/**
 * Tetris chrome: solid blocks from free-flow card footprints.
 *
 * Strategy:
 * 1. Pad each **card** (not the full row AABB) so empty corners stay outside.
 * 2. Merge only rects that **overlap or share an edge** (true tetris union).
 * 3. Fallback to row-strips only when cards already form clean shelf rows with
 *    unequal widths (classic L / stepped silhouette).
 *
 * Unlike a full AABB, incomplete last rows and side-by-side packs keep steps.
 */
export function steppedLChromeFromMembers(
  members: Array<{ x: number; y: number; width: number; height: number }>,
  opts: { pad: number; titleBand: number; grid?: number },
): {
  x: number
  y: number
  width: number
  height: number
  runs: Array<{ x: number; y: number; width: number; height: number }>
  outlinePath: string
} {
  const pad = Math.max(0, opts.pad)
  const edge = Math.max(0, pad) // honor pad=0 (no forced 1px bloat)
  const titleBand = Math.max(0, opts.titleBand)
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)

  if (members.length === 0) {
    return {
      x: 0,
      y: 0,
      width: 8,
      height: 8,
      runs: [{ x: 0, y: 0, width: 8, height: 8 }],
      outlinePath: '',
    }
  }

  // Per-card solid blocks (true free-flow silhouette)
  let runs = members.map((m) => ({
    x: Math.round(m.x - edge),
    y: Math.round(m.y - edge),
    width: Math.max(8, Math.round(m.width + edge * 2)),
    height: Math.max(8, Math.round(m.height + edge * 2)),
  }))

  // When cards form clean multi-row shelves with unequal row widths, prefer
  // solid row strips (cleaner L). Equal-width multi-row → keep card blocks
  // so per-card steps remain (row strips would collapse to a single rect).
  const rows = rowBlocksFromMembers(members)
  if (rows.length >= 2) {
    const widths = rows.map((r) => Math.round(r.width))
    const minW = Math.min(...widths)
    const maxW = Math.max(...widths)
    if (maxW - minW >= grid) {
      // Stepped rows — solid strips read better than card swiss-cheese
      runs = rows.map((r) => ({
        x: Math.round(r.x - edge),
        y: Math.round(r.y - edge),
        width: Math.max(8, Math.round(r.width + edge * 2)),
        height: Math.max(8, Math.round(r.height + edge * 2)),
      }))
    }
  }

  // Title band: only as wide as the topmost block (not the full AABB)
  if (titleBand > 0 && runs.length > 0) {
    const top = [...runs].sort((a, b) => a.y - b.y || a.x - b.x)[0]!
    runs = [
      {
        x: top.x,
        y: Math.round(top.y - titleBand),
        width: top.width,
        height: titleBand,
      },
      ...runs,
    ]
  }

  // Merge overlapping / edge-adjacent rects (union without filling distant gaps)
  runs = mergeAbuttingRuns(runs)

  const x0 = Math.min(...runs.map((r) => r.x))
  const y0 = Math.min(...runs.map((r) => r.y))
  const x1 = Math.max(...runs.map((r) => r.x + r.width))
  const y1 = Math.max(...runs.map((r) => r.y + r.height))

  // Rasterize blocks → unit cells → exterior outline (true polyomino perimeter)
  const originX = x0
  const originY = y0
  const unit = new Set<string>()
  for (const r of runs) {
    const c0 = Math.floor((r.x - originX) / grid)
    const c1 = Math.ceil((r.x + r.width - originX) / grid)
    const r0 = Math.floor((r.y - originY) / grid)
    const r1 = Math.ceil((r.y + r.height - originY) / grid)
    for (let rr = r0; rr < Math.max(r0 + 1, r1); rr++) {
      for (let cc = c0; cc < Math.max(c0 + 1, c1); cc++) {
        unit.add(`${cc},${rr}`)
      }
    }
  }
  // Do NOT fill holes — that turns L/C/U silhouettes into solid AABBs
  // (the classic “no tetris” look). Exterior path follows the stepped outline.
  const outlinePath =
    polyominoExteriorPathD(unit, grid, originX, originY, 0) ||
    rectPerimeterPathD(x0, y0, x1 - x0, y1 - y0)

  return {
    x: x0,
    y: y0,
    width: Math.max(8, x1 - x0),
    height: Math.max(8, y1 - y0),
    runs,
    outlinePath,
  }
}

/** Merge runs that overlap or share a full edge (axis-aligned union steps). */
function mergeAbuttingRuns(
  input: Array<{ x: number; y: number; width: number; height: number }>,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (input.length <= 1) return input.map((r) => ({ ...r }))
  let runs = input.map((r) => ({ ...r }))
  let changed = true
  while (changed) {
    changed = false
    const next: typeof runs = []
    const used = new Set<number>()
    for (let i = 0; i < runs.length; i++) {
      if (used.has(i)) continue
      let cur = { ...runs[i]! }
      for (let j = i + 1; j < runs.length; j++) {
        if (used.has(j)) continue
        const o = runs[j]!
        // Horizontal merge: same y/height, x ranges touch or overlap
        if (
          cur.y === o.y &&
          cur.height === o.height &&
          cur.x <= o.x + o.width + 1 &&
          o.x <= cur.x + cur.width + 1
        ) {
          const x0 = Math.min(cur.x, o.x)
          const x1 = Math.max(cur.x + cur.width, o.x + o.width)
          cur = { x: x0, y: cur.y, width: x1 - x0, height: cur.height }
          used.add(j)
          changed = true
          continue
        }
        // Vertical merge: same x/width, y ranges touch or overlap
        if (
          cur.x === o.x &&
          cur.width === o.width &&
          cur.y <= o.y + o.height + 1 &&
          o.y <= cur.y + cur.height + 1
        ) {
          const y0 = Math.min(cur.y, o.y)
          const y1 = Math.max(cur.y + cur.height, o.y + o.height)
          cur = { x: cur.x, y: y0, width: cur.width, height: y1 - y0 }
          used.add(j)
          changed = true
        }
      }
      next.push(cur)
    }
    runs = next
  }
  return runs.sort((a, b) => a.y - b.y || a.x - b.x)
}

/** AABB or n-gon runs from member card geometry. */
export function chromeFromMembers(
  members: Array<{ x: number; y: number; width: number; height: number }>,
  opts: {
    pad: number
    titleBand: number
    shape: PanelShape
    grid: number
    /**
     * solid-aabb: fill full bounding box → one clean outer perimeter (no
     * internal “room walls”). Default for rectangle chrome.
     * close: morphological close so nearby clusters fuse.
     * silhouette: card cells + hole-fill only (legacy).
     * blocks: solid rects per row / child group → stepped L exterior (n-gon).
     */
    solidMode?: 'solid-aabb' | 'close' | 'silhouette' | 'blocks'
    /** Dilation radius for solidMode 'close' (default 1). */
    closeRadius?: number
    /** Optional solid rects for solidMode 'blocks' (child folder AABBs). */
    blocks?: Array<{ x: number; y: number; width: number; height: number }>
  },
): {
  x: number
  y: number
  width: number
  height: number
  runs?: Array<{ x: number; y: number; width: number; height: number }>
  outlinePath?: string
} {
  const pad = Math.max(0, opts.pad)
  const titleBand = Math.max(0, opts.titleBand)
  const grid = Math.max(4, opts.grid)
  const solidMode = opts.solidMode ?? 'silhouette'
  const closeRadius = Math.max(1, Math.min(3, opts.closeRadius ?? 1))

  const minX = Math.min(...members.map((m) => m.x))
  const minY = Math.min(...members.map((m) => m.y))
  const maxX = Math.max(...members.map((m) => m.x + m.width))
  const maxY = Math.max(...members.map((m) => m.y + m.height))

  if (opts.shape !== 'polygon' || solidMode === 'solid-aabb') {
    // Clean outer rectangle perimeter (always exterior-only, no internal edges)
    const x = Math.round(minX - pad)
    const y = Math.round(minY - pad - titleBand)
    const width = Math.max(8, Math.round(maxX - minX + pad * 2))
    const height = Math.max(8, Math.round(maxY - minY + pad * 2 + titleBand))
    if (opts.shape === 'polygon' || solidMode === 'solid-aabb') {
      // Prefer outline path so stroke is one continuous perimeter
      return {
        x,
        y,
        width,
        height,
        runs: [{ x, y, width, height }],
        outlinePath: rectPerimeterPathD(x, y, width, height),
      }
    }
    return { x, y, width, height }
  }

  // N-gon blocks: continuous stepped/L chrome (not grid-jagged polyomino).
  if (solidMode === 'blocks') {
    // Prefer clean L from row strips of members. Optional `blocks` override
    // is only used when they already look like shelf rows.
    if (!opts.blocks || opts.blocks.length === 0) {
      return steppedLChromeFromMembers(members, { pad, titleBand, grid })
    }
    // Provided blocks: treat each as a solid rect and build a stepped outline
    // from their vertical stacking (same L algorithm on synthetic members).
    const asMembers = opts.blocks.map((b) => ({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    }))
    return steppedLChromeFromMembers(asMembers, { pad, titleBand, grid })
  }

  // silhouette / close: cells covering each card (legacy path)
  const originX = minX
  const originY = minY
  let unit = new Set<string>()
  for (const m of members) {
    const left = m.x - originX
    const right = m.x + m.width - originX
    const top = m.y - originY
    const bottom = m.y + m.height - originY
    const c0 = Math.floor(left / grid)
    const c1 = Math.ceil(right / grid)
    const r0 = Math.floor(top / grid)
    const r1 = Math.ceil(bottom / grid)
    for (let r = r0; r < Math.max(r0 + 1, r1); r++) {
      for (let c = c0; c < Math.max(c0 + 1, c1); c++) {
        unit.add(`${c},${r}`)
      }
    }
  }
  unit = fillPolyominoHoles(unit)
  if (solidMode === 'close') {
    unit = closePolyomino(unit, closeRadius)
  }

  const titleRows = Math.max(0, Math.ceil(titleBand / grid))
  if (titleRows > 0 && unit.size > 0) {
    let minR = Infinity
    for (const k of unit) minR = Math.min(minR, Number(k.split(',')[1]))
    // Full-width title band across solid top (not just topmost cols)
    let minC = Infinity
    let maxC = -Infinity
    for (const k of unit) {
      const c = Number(k.split(',')[0])
      minC = Math.min(minC, c)
      maxC = Math.max(maxC, c)
    }
    for (let dr = 1; dr <= titleRows; dr++) {
      for (let c = minC; c <= maxC; c++) unit.add(`${c},${minR - dr}`)
    }
  }

  const solidCells: Array<{ c: number; r: number; cw: number; ch: number }> = []
  for (const k of unit) {
    const [cs, rs] = k.split(',')
    solidCells.push({ c: Number(cs), r: Number(rs), cw: 1, ch: 1 })
  }
  let runsRaw = cellsToOrthogonalRuns(solidCells, grid, originX, originY, 0)
  runsRaw = runsRaw.map((r) => ({
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  }))
  const outlinePath = polyominoExteriorPathD(unit, grid, originX, originY, pad)

  const guardX0 = minX - pad
  const guardY0 = minY - pad - titleBand
  const guardX1 = maxX + pad
  const guardY1 = maxY + pad
  if (runsRaw.length === 0) {
    return {
      x: Math.round(guardX0),
      y: Math.round(guardY0),
      width: Math.max(8, Math.round(guardX1 - guardX0)),
      height: Math.max(8, Math.round(guardY1 - guardY0)),
      outlinePath: rectPerimeterPathD(
        guardX0,
        guardY0,
        guardX1 - guardX0,
        guardY1 - guardY0,
      ),
    }
  }
  const x0 = Math.min(guardX0, ...runsRaw.map((r) => r.x))
  const y0 = Math.min(guardY0, ...runsRaw.map((r) => r.y))
  const x1 = Math.max(guardX1, ...runsRaw.map((r) => r.x + r.width))
  const y1 = Math.max(guardY1, ...runsRaw.map((r) => r.y + r.height))
  return {
    x: Math.round(x0),
    y: Math.round(y0),
    width: Math.max(8, Math.round(x1 - x0)),
    height: Math.max(8, Math.round(y1 - y0)),
    runs: runsRaw.map((r) => ({
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.max(8, Math.round(r.width)),
      height: Math.max(8, Math.round(r.height)),
    })),
    outlinePath: outlinePath || undefined,
  }
}
