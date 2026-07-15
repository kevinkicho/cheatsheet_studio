import type { PanelGroupLevel } from './constants'
import { folderAtGroupLevel, type FolderRef } from './folders'

/** Insertion-order strategies for greedy skyline packing (order-sensitive). */
export type PackOrderStrategy =
  | 'height-desc'
  | 'area-desc'
  | 'width-desc'
  | 'height-asc'
  | 'area-asc'
  | 'input'
  | 'input-rev'
  | 'perimeter-desc'

const DENSITY_ORDERS: PackOrderStrategy[] = [
  'height-desc',
  'area-desc',
  'width-desc',
  'perimeter-desc',
  'height-asc',
  'input',
  'input-rev',
  'area-asc',
]

function orderIndices(
  regions: Array<{ index: number; cw: number; ch: number }>,
  strategy: PackOrderStrategy,
): number[] {
  const entries = regions.map((r, i) => ({
    i,
    index: r.index,
    cw: r.cw,
    ch: r.ch,
    area: r.cw * r.ch,
    peri: 2 * (r.cw + r.ch),
  }))
  switch (strategy) {
    case 'height-desc':
      entries.sort(
        (a, b) => b.ch - a.ch || b.area - a.area || a.i - b.i,
      )
      break
    case 'height-asc':
      entries.sort(
        (a, b) => a.ch - b.ch || b.area - a.area || a.i - b.i,
      )
      break
    case 'area-desc':
      entries.sort(
        (a, b) => b.area - a.area || b.ch - a.ch || a.i - b.i,
      )
      break
    case 'area-asc':
      entries.sort(
        (a, b) => a.area - b.area || b.ch - a.ch || a.i - b.i,
      )
      break
    case 'width-desc':
      entries.sort(
        (a, b) => b.cw - a.cw || b.ch - a.ch || a.i - b.i,
      )
      break
    case 'perimeter-desc':
      entries.sort(
        (a, b) => b.peri - a.peri || b.area - a.area || a.i - b.i,
      )
      break
    case 'input-rev':
      entries.reverse()
      break
    case 'input':
    default:
      // keep input order (stable)
      break
  }
  return entries.map((e) => e.i)
}

/**
 * Score a placement: lower is better (tetris / density).
 * Primary: height, then bounding area, then width (prefer short stacks that
 * fill width rather than tall left-aligned slabs).
 * When `filledArea` is provided, heavily penalize empty AABB corners so
 * free-flow does not leave Swiss-cheese voids inside parent frames.
 */
export function packBBoxScore(
  usedCw: number,
  usedCh: number,
  filledArea?: number,
): number {
  const box = Math.max(1, usedCw * usedCh)
  const fill =
    filledArea != null && filledArea > 0
      ? Math.min(1, filledArea / box)
      : 1
  // Empty corner tax — sparse L packs look broken inside outer panels
  const emptyTax = (1 - fill) * 5e5
  return usedCh * 1e6 + box * 8 + usedCw * 0.25 + emptyTax
}

function usedExtent(
  pos: Map<number, { c: number; r: number }>,
  regions: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
): { usedCw: number; usedCh: number } {
  let usedCw = 1
  let usedCh = 1
  for (const reg of regions) {
    const p = pos.get(reg.index) ?? { c: 0, r: 0 }
    const cw = Math.min(pageCols, Math.max(1, reg.cw))
    usedCw = Math.max(usedCw, p.c + cw)
    usedCh = Math.max(usedCh, p.r + reg.ch)
  }
  return {
    usedCw: Math.min(pageCols, usedCw),
    usedCh: Math.max(1, usedCh),
  }
}

/**
 * Greedy skyline free-flow pack with a fixed insertion order.
 * Order is critical for density — prefer {@link placeTopicRegionsDense} which
 * multi-orders and keeps the best bbox when densifying.
 */
function placeTopicRegionsOnce(
  regions: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
  gapCells: number,
  orderIdx: number[],
  opts?: { readingFlow?: boolean },
): Map<number, { c: number; r: number }> {
  const pos = new Map<number, { c: number; r: number }>()
  if (pageCols < 1 || regions.length === 0) return pos

  const gap = Math.max(0, gapCells)
  const readingFlow = opts?.readingFlow === true
  type Placed = {
    index: number
    c: number
    r: number
    cw: number
    ch: number
    seq: number
  }
  const placed: Placed[] = []

  const collides = (
    c: number,
    r: number,
    cw: number,
    ch: number,
    ignoreIndex?: number,
  ) => {
    for (const p of placed) {
      if (ignoreIndex != null && p.index === ignoreIndex) continue
      if (
        c < p.c + p.cw + gap &&
        c + cw + gap > p.c &&
        r < p.r + p.ch + gap &&
        r + ch + gap > p.r
      ) {
        return true
      }
    }
    return false
  }

  const contactScore = (
    c: number,
    r: number,
    cw: number,
    ch: number,
    ignoreIndex?: number,
  ) => {
    if (placed.length === 0) return 0
    let contact = 0
    for (const p of placed) {
      if (ignoreIndex != null && p.index === ignoreIndex) continue
      const yOverlap =
        Math.min(r + ch, p.r + p.ch) - Math.max(r, p.r)
      if (yOverlap > 0) {
        if (c + cw + gap === p.c || p.c + p.cw + gap === c) contact += yOverlap
      }
      const xOverlap =
        Math.min(c + cw, p.c + p.cw) - Math.max(c, p.c)
      if (xOverlap > 0) {
        if (r + ch + gap === p.r || p.r + p.ch + gap === r) contact += xOverlap
      }
    }
    if (c === 0) contact += ch * 0.25
    if (r === 0) contact += cw * 0.25
    return contact
  }

  const n = orderIdx.length
  let seq = 0
  for (const ri of orderIdx) {
    const reg = regions[ri]!
    const cw = Math.min(pageCols, Math.max(1, reg.cw))
    const ch = Math.max(1, reg.ch)
    const currentBottom = placed.reduce((m, p) => Math.max(m, p.r + p.ch), 0)
    const searchR = currentBottom + ch + gap + 2
    const t = n <= 1 ? 0 : seq / (n - 1)
    const diagTarget = t * Math.max(currentBottom, ch)

    let best: { c: number; r: number; score: number } | null = null
    for (let r = 0; r <= searchR; r++) {
      for (let c = 0; c <= pageCols - cw; c++) {
        if (collides(c, r, cw, ch)) continue
        const newBottom = Math.max(currentBottom, r + ch)
        const contact = contactScore(c, r, cw, ch)
        let score =
          newBottom * 1e9 + r * 1e5 + c * 10 - contact * 50
        if (readingFlow) {
          const diag = r + c * 0.35
          score =
            newBottom * 1e9 +
            Math.abs(diag - diagTarget) * 120 +
            r * 1e4 +
            c * 10 -
            contact * 40
        }
        if (!best || score < best.score) {
          best = { c, r, score }
        }
      }
    }

    if (!best) {
      const r = currentBottom + (placed.length ? gap : 0)
      best = { c: 0, r, score: r }
    }
    placed.push({
      index: reg.index,
      c: best.c,
      r: best.r,
      cw,
      ch,
      seq: seq++,
    })
  }

  // Gravity compaction: pull up+left (or mild up when reading-flow)
  for (let sweep = 0; sweep < 12; sweep++) {
    let moved = false
    const sorted = [...placed].sort((a, b) => a.r - b.r || a.c - b.c)
    for (const p of sorted) {
      let bestC = p.c
      let bestR = p.r
      let bestContact = contactScore(p.c, p.r, p.cw, p.ch, p.index)
      const rMax = p.r
      const rMin = readingFlow ? Math.max(0, p.r - 2) : 0
      for (let r = rMin; r <= rMax; r++) {
        for (let c = 0; c <= pageCols - p.cw; c++) {
          if (collides(c, r, p.cw, p.ch, p.index)) continue
          const contact = contactScore(c, r, p.cw, p.ch, p.index)
          if (
            r < bestR ||
            (r === bestR && contact > bestContact) ||
            (r === bestR && contact === bestContact && c < bestC)
          ) {
            bestR = r
            bestC = c
            bestContact = contact
          }
        }
      }
      if (bestC !== p.c || bestR !== p.r) {
        p.c = bestC
        p.r = bestR
        moved = true
      }
    }
    if (!moved) break
  }

  for (const p of placed) {
    pos.set(p.index, { c: p.c, r: p.r })
  }
  return pos
}

/**
 * Free-flow pack of rectangular regions on a grid.
 *
 * **Density mode (default):** tries multiple insertion orders (height / area /
 * width / input / …) and keeps the placement with the best bounding-box score.
 * Greedy skyline packing is order-sensitive — a single height-first pass often
 * leaves large voids that another order packs tightly.
 *
 * **Reading-flow mode:** places in input order only (A→Z diagonal bias) so
 * name sorting stays meaningful for outer topic blocks.
 */
export function placeTopicRegionsDense(
  regions: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
  gapCells = 0,
  opts?: {
    sortByHeight?: boolean
    readingFlow?: boolean
    /**
     * Try multiple insertion orders and keep the densest bbox.
     * Default: true when not readingFlow.
     * When false: single order — height-desc if sortByHeight≠false, else input.
     * Note: sortByHeight is ignored when multiOrder is true (all orders tried).
     */
    multiOrder?: boolean
    /** Limit which strategies to try (default: full density set). */
    orders?: PackOrderStrategy[]
  },
): Map<number, { c: number; r: number }> {
  const pos = new Map<number, { c: number; r: number }>()
  if (pageCols < 1 || regions.length === 0) return pos

  const readingFlow = opts?.readingFlow === true
  const multiOrder =
    opts?.multiOrder !== undefined
      ? opts.multiOrder
      : !readingFlow

  // Single-order modes: reading-flow (input) or explicit multiOrder: false
  if (readingFlow || !multiOrder) {
    let order: number[]
    if (readingFlow) {
      order = regions.map((_, i) => i)
    } else if (opts?.sortByHeight !== false) {
      order = orderIndices(regions, 'height-desc')
    } else {
      order = orderIndices(regions, 'input')
    }
    return placeTopicRegionsOnce(regions, pageCols, gapCells, order, {
      readingFlow,
    })
  }

  // Density: multi-order best-of (prefer high fill, not just short height)
  const strategies = opts?.orders?.length ? opts.orders : DENSITY_ORDERS
  let bestPos: Map<number, { c: number; r: number }> | null = null
  let bestScore = Infinity
  let bestUsed = { usedCw: pageCols, usedCh: 1e9 }
  const filled = regions.reduce(
    (s, r) => s + Math.max(1, r.cw) * Math.max(1, r.ch),
    0,
  )

  for (const strategy of strategies) {
    const order = orderIndices(regions, strategy)
    const candidate = placeTopicRegionsOnce(
      regions,
      pageCols,
      gapCells,
      order,
      { readingFlow: false },
    )
    const ext = usedExtent(candidate, regions, pageCols)
    const score = packBBoxScore(ext.usedCw, ext.usedCh, filled)
    if (
      score < bestScore - 1e-9 ||
      (Math.abs(score - bestScore) < 1e-9 &&
        (ext.usedCh < bestUsed.usedCh ||
          (ext.usedCh === bestUsed.usedCh &&
            ext.usedCw < bestUsed.usedCw)))
    ) {
      bestScore = score
      bestPos = candidate
      bestUsed = ext
    }
  }

  return bestPos ?? pos
}

/**
 * Pack leaf regions into the tightest free-flow box among candidate widths
 * **and** insertion orders (via placeTopicRegionsDense multi-order).
 */
export function packClusterTight(
  members: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
  gapCells = 0,
): {
  pos: Map<number, { c: number; r: number }>
  usedCw: number
  usedCh: number
} {
  if (members.length === 0 || pageCols < 1) {
    return { pos: new Map(), usedCw: 1, usedCh: 1 }
  }
  const gap = Math.max(0, gapCells)
  const maxLeafW = Math.max(1, ...members.map((m) => m.cw))
  const area = members.reduce((s, m) => s + m.cw * m.ch, 0)
  const candidates = Array.from(
    new Set(
      [
        pageCols,
        Math.ceil((pageCols * 3) / 4),
        Math.ceil((pageCols * 2) / 3),
        Math.ceil(pageCols / 2),
        Math.ceil(pageCols / 3),
        Math.min(pageCols, Math.max(maxLeafW, Math.ceil(Math.sqrt(area * 1.2)))),
        Math.min(pageCols, maxLeafW),
      ]
        .map((w) => Math.max(maxLeafW, Math.min(pageCols, w)))
        .filter((w) => w >= 1),
    ),
  ).sort((a, b) => a - b)

  let best: {
    pos: Map<number, { c: number; r: number }>
    usedCw: number
    usedCh: number
    score: number
  } | null = null

  for (const cols of candidates) {
    const sized = members.map((m) => ({
      index: m.index,
      cw: Math.min(m.cw, cols),
      ch: m.ch,
    }))
    // multiOrder default true → best insertion order for this width
    const pos = placeTopicRegionsDense(sized, cols, gap, {
      multiOrder: true,
      sortByHeight: true,
      readingFlow: false,
    })
    const ext = usedExtent(pos, sized, cols)
    const filled = sized.reduce((s, m) => s + m.cw * m.ch, 0)
    const score = packBBoxScore(ext.usedCw, ext.usedCh, filled)
    if (!best || score < best.score) {
      best = {
        pos,
        usedCw: ext.usedCw,
        usedCh: ext.usedCh,
        score,
      }
    }
  }
  return {
    pos: best!.pos,
    usedCw: best!.usedCw,
    usedCh: best!.usedCh,
  }
}

/**
 * Hierarchical free-flow placement for nested panel levels.
 *
 * Strategy (density-first):
 * 1. Pack leaf groups **tightly** inside each L1 parent (best width × order).
 * 2. Free-flow outer L1 boxes on the page.
 * 3. Expand each outer into residual columns when re-pack stays dense.
 */
export function placePlansHierarchical(
  plans: Array<{
    index: number
    cw: number
    ch: number
    /** Folder id at deepest pack level (leaf group). */
    leafFolderId: string | null
  }>,
  folders: FolderRef[],
  /** Shallowest selected level (e.g. 1) — outer cluster key. */
  outerLevel: PanelGroupLevel,
  pageCols: number,
  gapCells = 0,
  opts?: {
    sortByHeight?: boolean
    readingFlow?: boolean
    /** Cells reserved at top of each outer cluster for L1 title chip. */
    outerTitleCells?: number
    /**
     * Gap between outer parent boxes (defaults to gapCells).
     * Should be ≥ chrome pad of outer frames so L1 panels never collide.
     */
    outerGapCells?: number
    /**
     * Inset (cells) between L1 outer border and L2 leaf content — prevents
     * stacked double borders (outer+inner lines on top of each other).
     */
    nestInsetCells?: number
  },
): Map<number, { c: number; r: number }> {
  const pos = new Map<number, { c: number; r: number }>()
  if (pageCols < 1 || plans.length === 0) return pos

  // Honor full leaf gap (do not cap — large L2 panel gaps must pass through)
  const gap = Math.max(0, gapCells)
  const outerGap = Math.max(0, opts?.outerGapCells ?? 0)
  const outerTitle = Math.max(0, opts?.outerTitleCells ?? 0)
  const nestInset = Math.max(0, opts?.nestInsetCells ?? 0)
  type Cluster = {
    key: string
    members: Array<{ index: number; cw: number; ch: number }>
  }
  const orderKeys: string[] = []
  const clusters = new Map<string, Cluster>()
  for (const p of plans) {
    const key =
      folderAtGroupLevel(p.leafFolderId, folders, outerLevel) ??
      p.leafFolderId ??
      `__plan_${p.index}`
    if (!clusters.has(key)) {
      clusters.set(key, { key, members: [] })
      orderKeys.push(key)
    }
    clusters.get(key)!.members.push({
      index: p.index,
      cw: p.cw,
      ch: p.ch,
    })
  }

  type OuterBox = {
    key: string
    cw: number
    ch: number
    members: Array<{ index: number; cw: number; ch: number }>
    local: Map<number, { c: number; r: number }>
  }
  const packOuter = (
    members: Array<{ index: number; cw: number; ch: number }>,
    innerCols: number,
  ): {
    local: Map<number, { c: number; r: number }>
    usedCw: number
    usedCh: number
  } => {
    const tight = packClusterTight(members, innerCols, gap)
    const local = new Map<number, { c: number; r: number }>()
    for (const [idx, p] of tight.pos) {
      local.set(idx, {
        c: p.c + nestInset,
        r: p.r + outerTitle + nestInset,
      })
    }
    return {
      local,
      usedCw: tight.usedCw,
      usedCh: tight.usedCh,
    }
  }

  const outers: OuterBox[] = []
  for (const key of orderKeys) {
    const cl = clusters.get(key)!
    const innerCols = Math.max(1, pageCols - nestInset * 2)
    const packed = packOuter(cl.members, innerCols)
    outers.push({
      key,
      members: cl.members,
      cw: Math.min(
        pageCols,
        Math.max(1, packed.usedCw + nestInset * 2),
      ),
      ch: Math.max(1, packed.usedCh + outerTitle + nestInset * 2),
      local: packed.local,
    })
  }

  // Outer L1 free-flow: density multi-order unless name reading-flow is on
  const outerPlace = placeTopicRegionsDense(
    outers.map((o, i) => ({ index: i, cw: o.cw, ch: o.ch })),
    pageCols,
    outerGap,
    {
      sortByHeight: opts?.sortByHeight,
      readingFlow: opts?.readingFlow,
      // When name-sorted topics, keep reading flow; otherwise pick densest order
      multiOrder: opts?.readingFlow ? false : true,
    },
  )

  // Expand into residual columns only when re-pack actually fills the width
  // and gets shorter — avoids bloated L1 frames full of empty interior.
  for (let i = 0; i < outers.length; i++) {
    const o = outers[i]!
    const origin = outerPlace.get(i) ?? { c: 0, r: 0 }
    let freeRight = pageCols - (origin.c + o.cw)
    for (const [j, other] of outers.entries()) {
      if (j === i) continue
      const oo = outerPlace.get(j) ?? { c: 0, r: 0 }
      const yOverlap =
        Math.min(origin.r + o.ch, oo.r + other.ch) - Math.max(origin.r, oo.r)
      if (yOverlap <= 0) continue
      if (oo.c >= origin.c + o.cw) {
        freeRight = Math.min(freeRight, oo.c - (origin.c + o.cw) - outerGap)
      }
    }
    freeRight = Math.max(0, freeRight)
    if (freeRight >= 1) {
      const widerInner = Math.max(
        1,
        Math.min(pageCols - nestInset * 2, o.cw - nestInset * 2 + freeRight),
      )
      const repacked = packOuter(o.members, widerInner)
      const fillRatio = repacked.usedCw / Math.max(1, widerInner)
      const newCw = Math.min(
        pageCols - origin.c,
        Math.max(1, repacked.usedCw + nestInset * 2),
      )
      const newCh = Math.max(1, repacked.usedCh + outerTitle + nestInset * 2)
      const shorter = newCh < o.ch
      const meaningfullyWider =
        newCw > o.cw && fillRatio >= 0.9 && newCh <= o.ch
      if (shorter || meaningfullyWider) {
        let ok = true
        for (const [j, other] of outers.entries()) {
          if (j === i) continue
          const oo = outerPlace.get(j) ?? { c: 0, r: 0 }
          if (
            origin.c < oo.c + other.cw + outerGap &&
            origin.c + newCw + outerGap > oo.c &&
            origin.r < oo.r + other.ch + outerGap &&
            origin.r + newCh + outerGap > oo.r
          ) {
            ok = false
            break
          }
        }
        if (ok && origin.c + newCw <= pageCols) {
          o.cw = newCw
          o.ch = newCh
          o.local = repacked.local
        }
      }
    }
  }

  for (let i = 0; i < outers.length; i++) {
    const o = outers[i]!
    const origin = outerPlace.get(i) ?? { c: 0, r: 0 }
    for (const [planIndex, loc] of o.local) {
      pos.set(planIndex, { c: origin.c + loc.c, r: origin.r + loc.r })
    }
  }
  return pos
}
