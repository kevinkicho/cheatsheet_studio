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
 * Tetris / n-gon chrome from free-flow card footprints.
 *
 * Strategy (screenshot 235248 — snaking L, swiss-cheese, empty notches):
 * 1. **Dense pack → solid rect**: if cards already fill ≥78% of their AABB,
 *    use a clean rectangle (best default; avoids fake steps).
 * 2. **Else row strips**: one solid band per horizontal shelf (never per-card
 *    blocks — unequal card heights refused to merge and drew broken L-shapes).
 * 3. **Title**: grow the top strip upward (no separate title stem that snakes).
 * 4. **Merge** abutting strips; exterior path from the union.
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
  const edge = Math.max(0, pad)
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

  const minX = Math.min(...members.map((m) => m.x))
  const minY = Math.min(...members.map((m) => m.y))
  const maxX = Math.max(...members.map((m) => m.x + m.width))
  const maxY = Math.max(...members.map((m) => m.y + m.height))
  const aabbW = Math.max(1, maxX - minX)
  const aabbH = Math.max(1, maxY - minY)
  const cardArea = members.reduce((s, m) => s + m.width * m.height, 0)
  const fill = cardArea / (aabbW * aabbH)

  const solidAabb = () => {
    const x = Math.round(minX - edge)
    const y = Math.round(minY - edge - titleBand)
    const width = Math.max(8, Math.round(maxX - minX + edge * 2))
    const height = Math.max(8, Math.round(maxY - minY + edge * 2 + titleBand))
    return {
      x,
      y,
      width,
      height,
      runs: [{ x, y, width, height }],
      outlinePath: rectPerimeterPathD(x, y, width, height),
    }
  }

  // Single card, or cards already pack into a near-rectangle → clean frame
  if (members.length === 1 || fill >= 0.78) {
    return solidAabb()
  }

  // Multi-card free-flow: solid horizontal shelf strips (not per-card blocks).
  // Per-card blocks + unequal heights left unmerged L-notches (Molecular Biology
  // yellow empty L, Biochemistry stepped void in 235248).
  let runs = rowBlocksFromMembers(members).map((r) => ({
    x: Math.round(r.x - edge),
    y: Math.round(r.y - edge),
    width: Math.max(8, Math.round(r.width + edge * 2)),
    height: Math.max(8, Math.round(r.height + edge * 2)),
  }))

  // One shelf after clustering → solid rect (side-by-side pack)
  if (runs.length <= 1) {
    return solidAabb()
  }

  // Bridge small gaps between strips (≤ pad+grid/2) so near-touching rows fuse
  runs = mergeAbuttingRuns(runs, Math.max(2, edge + Math.floor(grid / 2)))

  // After merge, if we collapsed to one run or high strip-fill → solid
  if (runs.length <= 1) {
    return solidAabb()
  }
  {
    const rx0 = Math.min(...runs.map((r) => r.x))
    const ry0 = Math.min(...runs.map((r) => r.y))
    const rx1 = Math.max(...runs.map((r) => r.x + r.width))
    const ry1 = Math.max(...runs.map((r) => r.y + r.height))
    const stripArea = runs.reduce((s, r) => s + r.width * r.height, 0)
    const boxArea = Math.max(1, (rx1 - rx0) * (ry1 - ry0))
    if (stripArea / boxArea >= 0.9) {
      return solidAabb()
    }
  }

  // Title band: grow the topmost strip upward (same width) — never a separate
  // narrow stem that snakes into empty space.
  if (titleBand > 0 && runs.length > 0) {
    const topIdx = runs.reduce(
      (bi, r, i, arr) =>
        r.y < arr[bi]!.y || (r.y === arr[bi]!.y && r.x < arr[bi]!.x) ? i : bi,
      0,
    )
    const top = runs[topIdx]!
    runs[topIdx] = {
      ...top,
      y: Math.round(top.y - titleBand),
      height: Math.max(8, top.height + titleBand),
    }
  }

  runs = mergeAbuttingRuns(runs, Math.max(2, edge))

  const x0 = Math.min(...runs.map((r) => r.x))
  const y0 = Math.min(...runs.map((r) => r.y))
  const x1 = Math.max(...runs.map((r) => r.x + r.width))
  const y1 = Math.max(...runs.map((r) => r.y + r.height))

  // Rasterize strips → exterior outline (no hole-fill: keep true step silhouette)
  const originX = x0
  const originY = y0
  const unit = new Set<string>()
  for (const r of runs) {
    const c0 = Math.floor((r.x - originX) / grid)
    const c1 = Math.max(
      c0 + 1,
      Math.floor((r.x + r.width - originX + 1e-6) / grid),
    )
    const r0 = Math.floor((r.y - originY) / grid)
    const r1 = Math.max(
      r0 + 1,
      Math.floor((r.y + r.height - originY + 1e-6) / grid),
    )
    for (let rr = r0; rr < r1; rr++) {
      for (let cc = c0; cc < c1; cc++) {
        unit.add(`${cc},${rr}`)
      }
    }
  }
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

/**
 * Merge runs that overlap or nearly share an edge.
 * @param gapTol max gap (px) still treated as abutting (bridges small free-flow air)
 */
function mergeAbuttingRuns(
  input: Array<{ x: number; y: number; width: number; height: number }>,
  gapTol = 1,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (input.length <= 1) return input.map((r) => ({ ...r }))
  const tol = Math.max(1, gapTol)
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
        // Horizontal merge: same y-band (within tol), x ranges touch/overlap
        const yClose =
          Math.abs(cur.y - o.y) <= tol &&
          Math.abs(cur.height - o.height) <= tol * 2
        if (
          yClose &&
          cur.x <= o.x + o.width + tol &&
          o.x <= cur.x + cur.width + tol
        ) {
          const x0 = Math.min(cur.x, o.x)
          const x1 = Math.max(cur.x + cur.width, o.x + o.width)
          const y0 = Math.min(cur.y, o.y)
          const y1 = Math.max(cur.y + cur.height, o.y + o.height)
          cur = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
          used.add(j)
          changed = true
          continue
        }
        // Vertical merge: same x-band, y ranges touch/overlap
        const xClose =
          Math.abs(cur.x - o.x) <= tol &&
          Math.abs(cur.width - o.width) <= tol * 2
        if (
          xClose &&
          cur.y <= o.y + o.height + tol &&
          o.y <= cur.y + cur.height + tol
        ) {
          const x0 = Math.min(cur.x, o.x)
          const x1 = Math.max(cur.x + cur.width, o.x + o.width)
          const y0 = Math.min(cur.y, o.y)
          const y1 = Math.max(cur.y + cur.height, o.y + o.height)
          cur = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
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

  // Solid AABB: one clean rectangle (rectangular tetris chrome).
  if (solidMode === 'solid-aabb') {
    const x = Math.round(minX - pad)
    const y = Math.round(minY - pad - titleBand)
    const width = Math.max(8, Math.round(maxX - minX + pad * 2))
    const height = Math.max(8, Math.round(maxY - minY + pad * 2 + titleBand))
    return {
      x,
      y,
      width,
      height,
      runs: [{ x, y, width, height }],
      outlinePath: rectPerimeterPathD(x, y, width, height),
    }
  }

  // Blocks / stepped L: works for n-gon outline and multi-run rect chrome
  // (union of solid child rects — no empty AABB corners).
  if (solidMode === 'blocks') {
    if (!opts.blocks || opts.blocks.length === 0) {
      return steppedLChromeFromMembers(members, { pad, titleBand, grid })
    }
    const asMembers = opts.blocks.map((b) => ({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    }))
    return steppedLChromeFromMembers(asMembers, { pad, titleBand, grid })
  }

  // Legacy rect fallback (shape=rect without solidMode)
  if (opts.shape !== 'polygon') {
    const x = Math.round(minX - pad)
    const y = Math.round(minY - pad - titleBand)
    const width = Math.max(8, Math.round(maxX - minX + pad * 2))
    const height = Math.max(8, Math.round(maxY - minY + pad * 2 + titleBand))
    return {
      x,
      y,
      width,
      height,
      runs: [{ x, y, width, height }],
      outlinePath: rectPerimeterPathD(x, y, width, height),
    }
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
