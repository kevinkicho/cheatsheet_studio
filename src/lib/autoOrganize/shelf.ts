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
  // Empty-corner tax dominates — Swiss-cheese L1s (screenshot 155735) look
  // worse than a slightly taller solid pack. Prefer high fill over min height.
  const emptyTax = (1 - fill) * (1 - fill) * 3e6
  return emptyTax + usedCh * 4e5 + box * 4 + usedCw * 0.15
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
  opts?: {
    readingFlow?: boolean
    /**
     * Keep insertion order for groupSort A→Z / Z→A.
     * Skips post-place gravity (which can pull later topics into holes above
     * earlier ones and make name sort look like “no sorting”).
     */
    preserveOrder?: boolean
  },
): Map<number, { c: number; r: number }> {
  const pos = new Map<number, { c: number; r: number }>()
  if (pageCols < 1 || regions.length === 0) return pos

  const gap = Math.max(0, gapCells)
  const readingFlow = opts?.readingFlow === true
  const preserveOrder = opts?.preserveOrder === true
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
    // Search full skyline height + room for this tile (holes under tall neighbors)
    const searchR = currentBottom + ch + gap + Math.max(ch, 4)
    const t = n <= 1 ? 0 : seq / (n - 1)
    const diagTarget = t * Math.max(currentBottom, ch)

    let best: { c: number; r: number; score: number } | null = null
    for (let r = 0; r <= searchR; r++) {
      for (let c = 0; c <= pageCols - cw; c++) {
        if (collides(c, r, cw, ch)) continue
        const newBottom = Math.max(currentBottom, r + ch)
        const contact = contactScore(c, r, cw, ch)
        // Density-first: top-left + contact >> global height. Old newBottom*1e9
        // ignored holes beside tall tiles (Swiss-cheese Biology).
        let score =
          r * 1e7 +
          c * 200 -
          contact * 8e3 +
          newBottom * 40 +
          (r + ch === newBottom ? 0 : 15)
        if (readingFlow) {
          const diag = r + c * 0.35
          score =
            r * 1e7 +
            Math.abs(diag - diagTarget) * 80 +
            c * 50 -
            contact * 2e3 +
            newBottom * 20
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

  // Gravity compaction: pull up+left (or mild up when reading-flow).
  // preserveOrder (name A→Z): left-only — never climb into holes above earlier
  // insertion items (that scrambled groupSort into “no sort” visually).
  if (!preserveOrder) {
    // Extra sweeps + full-column search so tiles drop into L-holes beside
    // tall neighbors (Genetics ∥ short Cell Bio → fill under Cell Bio).
    for (let sweep = 0; sweep < 24; sweep++) {
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
    // Second pass: allow any free top-left slot (not only ≤ current r) so a
    // tile can jump into a hole that opened after a neighbor moved.
    for (let sweep = 0; sweep < 8; sweep++) {
      let moved = false
      const bottom = placed.reduce((m, p) => Math.max(m, p.r + p.ch), 0)
      const sorted = [...placed].sort(
        (a, b) => b.cw * b.ch - a.cw * a.ch || a.r - b.r,
      )
      for (const p of sorted) {
        let bestC = p.c
        let bestR = p.r
        let bestScore = p.r * 1e6 + p.c
        for (let r = 0; r <= bottom; r++) {
          for (let c = 0; c <= pageCols - p.cw; c++) {
            if (collides(c, r, p.cw, p.ch, p.index)) continue
            const score = r * 1e6 + c - contactScore(c, r, p.cw, p.ch, p.index) * 50
            if (score < bestScore - 0.5) {
              bestScore = score
              bestC = c
              bestR = r
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
  } else {
    // Order-locked: slide left only within the same row (no climb up)
    for (let sweep = 0; sweep < 8; sweep++) {
      let moved = false
      const sorted = [...placed].sort((a, b) => a.r - b.r || a.c - b.c)
      for (const p of sorted) {
        let bestC = p.c
        for (let c = 0; c < p.c; c++) {
          if (!collides(c, p.r, p.cw, p.ch, p.index)) {
            bestC = c
            break
          }
        }
        if (bestC !== p.c) {
          p.c = bestC
          moved = true
        }
      }
      if (!moved) break
    }
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
    /** Lock insertion order (groupSort name-asc/desc) — no reorder gravity. */
    preserveOrder?: boolean
    /** Limit which strategies to try (default: full density set). */
    orders?: PackOrderStrategy[]
  },
): Map<number, { c: number; r: number }> {
  const pos = new Map<number, { c: number; r: number }>()
  if (pageCols < 1 || regions.length === 0) return pos

  const readingFlow = opts?.readingFlow === true
  const preserveOrder = opts?.preserveOrder === true
  const multiOrder =
    opts?.multiOrder !== undefined
      ? opts.multiOrder
      : !readingFlow && !preserveOrder

  // Single-order modes: reading-flow, order-lock, or explicit multiOrder: false
  if (readingFlow || preserveOrder || !multiOrder) {
    let order: number[]
    if (readingFlow || preserveOrder) {
      order = regions.map((_, i) => i)
    } else if (opts?.sortByHeight !== false) {
      order = orderIndices(regions, 'height-desc')
    } else {
      order = orderIndices(regions, 'input')
    }
    return placeTopicRegionsOnce(regions, pageCols, gapCells, order, {
      readingFlow,
      preserveOrder,
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
 * **and** (unless order-locked) insertion orders via multi-order search.
 */
export function packClusterTight(
  members: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
  gapCells = 0,
  opts?: {
    /** Default true — densest insertion order. False = keep member list order. */
    multiOrder?: boolean
    /** groupSort A→Z: keep order, left-only compact. */
    preserveOrder?: boolean
  },
): {
  pos: Map<number, { c: number; r: number }>
  usedCw: number
  usedCh: number
} {
  if (members.length === 0 || pageCols < 1) {
    return { pos: new Map(), usedCw: 1, usedCh: 1 }
  }
  const gap = Math.max(0, gapCells)
  const preserveOrder = opts?.preserveOrder === true
  const multiOrder =
    opts?.multiOrder !== undefined ? opts.multiOrder : !preserveOrder
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
    const tryPos = (pos: Map<number, { c: number; r: number }>) => {
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
    tryPos(
      placeTopicRegionsDense(sized, cols, gap, {
        multiOrder,
        sortByHeight: multiOrder,
        readingFlow: false,
        preserveOrder,
      }),
    )
    // MaxRects BSSF — often denser than pure skyline on mixed L2 sizes
    if (!preserveOrder) {
      tryPos(placeMaxRectsBssf(sized, cols, gap, multiOrder))
    }
  }
  return {
    pos: best!.pos,
    usedCw: best!.usedCw,
    usedCh: best!.usedCh,
  }
}

/**
 * MaxRects Best-Short-Side-Fit free-rectangle packer.
 * Fills residual bins that skyline free-flow leaves beside tall tiles.
 */
function placeMaxRectsBssf(
  regions: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
  gapCells: number,
  multiOrder: boolean,
): Map<number, { c: number; r: number }> {
  const gap = Math.max(0, gapCells)
  const pos = new Map<number, { c: number; r: number }>()
  if (regions.length === 0 || pageCols < 1) return pos

  type FR = { c: number; r: number; cw: number; ch: number }
  const free: FR[] = [{ c: 0, r: 0, cw: pageCols, ch: 1e6 }]

  const orders = multiOrder
    ? DENSITY_ORDERS.map((s) => orderIndices(regions, s))
    : [regions.map((_, i) => i)]

  let bestPos: Map<number, { c: number; r: number }> | null = null
  let bestScore = Infinity

  for (const order of orders) {
    const freeLocal: FR[] = [{ c: 0, r: 0, cw: pageCols, ch: 1e6 }]
    const placed = new Map<number, { c: number; r: number; cw: number; ch: number }>()
    let ok = true
    for (const ri of order) {
      const reg = regions[ri]!
      const cw = Math.min(pageCols, Math.max(1, reg.cw))
      const ch = Math.max(1, reg.ch)
      const needW = cw + (gap > 0 ? gap : 0)
      const needH = ch + (gap > 0 ? gap : 0)
      // Best short side fit among free rects that fit
      let pick: { fi: number; c: number; r: number; short: number; long: number } | null =
        null
      for (let fi = 0; fi < freeLocal.length; fi++) {
        const fr = freeLocal[fi]!
        if (fr.cw < cw || fr.ch < ch) continue
        // Prefer placing at top-left of free rect (gap applied via split)
        const short = Math.min(fr.cw - cw, fr.ch - ch)
        const long = Math.max(fr.cw - cw, fr.ch - ch)
        if (
          !pick ||
          short < pick.short - 1e-9 ||
          (Math.abs(short - pick.short) < 1e-9 && long < pick.long) ||
          (Math.abs(short - pick.short) < 1e-9 &&
            Math.abs(long - pick.long) < 1e-9 &&
            (fr.r < pick.r || (fr.r === pick.r && fr.c < pick.c)))
        ) {
          pick = { fi, c: fr.c, r: fr.r, short, long }
        }
      }
      if (!pick) {
        ok = false
        break
      }
      placed.set(reg.index, { c: pick.c, r: pick.r, cw, ch })
      // Split free rects (standard MaxRects)
      const nextFree: FR[] = []
      for (const fr of freeLocal) {
        if (
          pick.c >= fr.c + fr.cw ||
          pick.c + cw <= fr.c ||
          pick.r >= fr.r + fr.ch ||
          pick.r + ch <= fr.r
        ) {
          nextFree.push(fr)
          continue
        }
        // leftover free rects around the placed tile (with gap as dead margin)
        const pc = pick.c
        const pr = pick.r
        const pright = pc + cw + gap
        const pbot = pr + ch + gap
        if (pc > fr.c) {
          nextFree.push({ c: fr.c, r: fr.r, cw: pc - fr.c, ch: fr.ch })
        }
        if (pright < fr.c + fr.cw) {
          nextFree.push({
            c: pright,
            r: fr.r,
            cw: fr.c + fr.cw - pright,
            ch: fr.ch,
          })
        }
        if (pr > fr.r) {
          nextFree.push({ c: fr.c, r: fr.r, cw: fr.cw, ch: pr - fr.r })
        }
        if (pbot < fr.r + fr.ch) {
          nextFree.push({
            c: fr.c,
            r: pbot,
            cw: fr.cw,
            ch: fr.r + fr.ch - pbot,
          })
        }
      }
      // Prune free list (remove contained rects)
      freeLocal.length = 0
      for (let i = 0; i < nextFree.length; i++) {
        const a = nextFree[i]!
        if (a.cw < 1 || a.ch < 1) continue
        let contained = false
        for (let j = 0; j < nextFree.length; j++) {
          if (i === j) continue
          const b = nextFree[j]!
          if (
            a.c >= b.c &&
            a.r >= b.r &&
            a.c + a.cw <= b.c + b.cw &&
            a.r + a.ch <= b.r + b.ch
          ) {
            contained = true
            break
          }
        }
        if (!contained) freeLocal.push(a)
      }
    }
    if (!ok || placed.size !== regions.length) continue
    const cand = new Map<number, { c: number; r: number }>()
    let usedCw = 1
    let usedCh = 1
    let filled = 0
    for (const [idx, p] of placed) {
      cand.set(idx, { c: p.c, r: p.r })
      usedCw = Math.max(usedCw, p.c + p.cw)
      usedCh = Math.max(usedCh, p.r + p.ch)
      filled += p.cw * p.ch
    }
    usedCw = Math.min(pageCols, usedCw)
    const score = packBBoxScore(usedCw, usedCh, filled)
    if (score < bestScore) {
      bestScore = score
      bestPos = cand
    }
  }

  return bestPos ?? pos
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
    /**
     * Multi-order density search for outer L1 boxes.
     * Default: true unless readingFlow (legacy). Prefer explicit multiOrder
     * when groupSort locks insertion order (name-asc) but still wants dense
     * skyline + full gravity (readingFlow diagonal mode is sparse).
     */
    multiOrder?: boolean
    /** groupSort A→Z/Z→A: keep L1 + L2 insertion order through leaf pack. */
    preserveOrder?: boolean
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
  const preserveOrder = opts?.preserveOrder === true
  // Leaves inside parent: densest multi-order when not order-locked; name-asc
  // keeps insertion order (outer L1 still uses preserveOrder too). Residual
  // L-holes are closed by pixel gravity after place, not by scrambling leaves.
  const leafMultiOrder =
    opts?.multiOrder !== undefined ? opts.multiOrder : !preserveOrder
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
    const tight = packClusterTight(members, innerCols, gap, {
      multiOrder: leafMultiOrder,
      preserveOrder: preserveOrder && !leafMultiOrder,
    })
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

  // Outer L1 free-flow: multi-order densest unless caller locks insertion order
  // (name-asc: multiOrder false + preserveOrder → input order, left-only compact).
  // Never use readingFlow diagonal bias for sheet packs — it leaves large voids.
  const outerMultiOrder =
    opts?.multiOrder !== undefined
      ? opts.multiOrder
      : preserveOrder
        ? false
        : opts?.readingFlow
          ? false
          : true
  const outerPlace = placeTopicRegionsDense(
    outers.map((o, i) => ({ index: i, cw: o.cw, ch: o.ch })),
    pageCols,
    outerGap,
    {
      sortByHeight: opts?.sortByHeight,
      readingFlow: opts?.readingFlow === true,
      multiOrder: outerMultiOrder,
      preserveOrder,
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
