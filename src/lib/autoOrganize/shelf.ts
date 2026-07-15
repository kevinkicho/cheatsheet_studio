import type { PanelGroupLevel } from './constants'
import { folderAtGroupLevel, type FolderRef } from './folders'

export function placeTopicRegionsDense(
  regions: Array<{ index: number; cw: number; ch: number }>,
  pageCols: number,
  gapCells = 0,
  opts?: { sortByHeight?: boolean; readingFlow?: boolean },
): Map<number, { c: number; r: number }> {
  const pos = new Map<number, { c: number; r: number }>()
  if (pageCols < 1 || regions.length === 0) return pos

  const gap = Math.max(0, gapCells)
  const readingFlow = opts?.readingFlow === true
  // Reading-flow places in given order; height-first densifies when flow is off
  const sortByHeight = !readingFlow && opts?.sortByHeight !== false
  type Placed = {
    index: number
    c: number
    r: number
    cw: number
    ch: number
    /** Stable place-sequence index (0 = first placed for reading flow). */
    seq: number
  }
  const placed: Placed[] = []

  const order = regions.map((reg, i) => ({ r: reg, i }))
  if (sortByHeight) {
    // Taller / larger first fills the skyline better; document order as tie-break
    order.sort(
      (a, b) =>
        b.r.ch - a.r.ch || b.r.cw * b.r.ch - a.r.cw * a.r.ch || a.i - b.i,
    )
  }

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

  /** Count how many sides touch an already-placed block (prefer nestling in holes). */
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
      // Horizontal abut (share vertical edge)
      const yOverlap =
        Math.min(r + ch, p.r + p.ch) - Math.max(r, p.r)
      if (yOverlap > 0) {
        if (c + cw + gap === p.c || p.c + p.cw + gap === c) contact += yOverlap
      }
      // Vertical abut (share horizontal edge)
      const xOverlap =
        Math.min(c + cw, p.c + p.cw) - Math.max(c, p.c)
      if (xOverlap > 0) {
        if (r + ch + gap === p.r || p.r + p.ch + gap === r) contact += xOverlap
      }
    }
    // Also reward sitting on the left wall / top
    if (c === 0) contact += ch * 0.25
    if (r === 0) contact += cw * 0.25
    return contact
  }

  const n = order.length
  let seq = 0
  for (const { r: reg } of order) {
    const cw = Math.min(pageCols, Math.max(1, reg.cw))
    const ch = Math.max(1, reg.ch)
    const currentBottom = placed.reduce((m, p) => Math.max(m, p.r + p.ch), 0)
    const searchR = currentBottom + ch + gap + 2
    // Soft diagonal target for reading flow (not a hard shelf — just a bias)
    const t = n <= 1 ? 0 : seq / (n - 1)
    const diagTarget = t * Math.max(currentBottom, ch)

    let best: { c: number; r: number; score: number } | null = null
    for (let r = 0; r <= searchR; r++) {
      for (let c = 0; c <= pageCols - cw; c++) {
        if (collides(c, r, cw, ch)) continue
        const newBottom = Math.max(currentBottom, r + ch)
        const contact = contactScore(c, r, cw, ch)
        // Primary: compact bottom (hole-fill). Contact fills right-side voids.
        let score =
          newBottom * 1e9 + r * 1e5 + c * 10 - contact * 50
        if (readingFlow) {
          // Weak ascending bias — densification still wins (contact + bottom).
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

  // Gravity compaction. Full up+left for densest packs; reading-flow only
  // slides left (and slight up) so A→Z diagonal bias isn’t fully erased.
  for (let sweep = 0; sweep < 12; sweep++) {
    let moved = false
    const sorted = [...placed].sort((a, b) => a.r - b.r || a.c - b.c)
    for (const p of sorted) {
      let bestC = p.c
      let bestR = p.r
      let bestContact = contactScore(p.c, p.r, p.cw, p.ch, p.index)
      const rMax = readingFlow ? p.r : p.r
      const rMin = readingFlow ? Math.max(0, p.r - 2) : 0
      for (let r = rMin; r <= rMax; r++) {
        for (let c = 0; c <= pageCols - p.cw; c++) {
          if (collides(c, r, p.cw, p.ch, p.index)) continue
          const contact = contactScore(c, r, p.cw, p.ch, p.index)
          // Prefer higher, then more contact (fill right holes), then left
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
 * Pack leaf regions into the tightest free-flow box among candidate widths.
 * Using full pageCols for local pack made every outer parent full-width →
 * vertical stacking and huge empty space lower on the sheet.
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
    const pos = placeTopicRegionsDense(
      members.map((m) => ({
        index: m.index,
        cw: Math.min(m.cw, cols),
        ch: m.ch,
      })),
      cols,
      gap,
      { sortByHeight: true, readingFlow: false },
    )
    let usedCw = 1
    let usedCh = 1
    for (const m of members) {
      const o = pos.get(m.index) ?? { c: 0, r: 0 }
      const cw = Math.min(m.cw, cols)
      usedCw = Math.max(usedCw, o.c + cw)
      usedCh = Math.max(usedCh, o.r + m.ch)
    }
    usedCw = Math.min(cols, usedCw)
    // Prefer shorter stacks (fill width / right-side holes) over tall slabs
    const score = usedCh * 1e6 + usedCw * usedCh * 8 + usedCw * 0.25
    if (!best || score < best.score) {
      best = { pos, usedCw, usedCh, score }
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
 * 1. Pack leaf groups **tightly** inside each L1 parent (prefer short/wide).
 * 2. Free-flow outer L1 boxes on the page with outer gap 0 (touch for merge).
 * 3. **Expand** each outer into residual columns on its row so right-side
 *    page space is used (re-pack leaves into the wider budget).
 *
 * Outer title band is reserved so L1 chips sit above L2 content.
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

  // Leaf gap inside L1: when L2/L3 stroke, callers pass gap+2×pad+titleBand
  // cells so sibling frames clear. Cap only the densest “chip-only” case.
  const gap = Math.max(0, Math.min(gapCells, 6))
  const outerGap = Math.max(0, opts?.outerGapCells ?? 0)
  const outerTitle = Math.max(0, opts?.outerTitleCells ?? 0)
  const nestInset = Math.max(0, opts?.nestInsetCells ?? 0)
  // Cluster leaf plans by outer ancestor
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

  // Global free-flow of outer boxes (non-overlapping L1 / shallow frames)
  const outerPlace = placeTopicRegionsDense(
    outers.map((o, i) => ({ index: i, cw: o.cw, ch: o.ch })),
    pageCols,
    outerGap,
    {
      sortByHeight: opts?.sortByHeight,
      readingFlow: opts?.readingFlow,
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
    // Claim residual printable columns only when re-pack stays dense.
    // Low fillRatio left cards on the left and empty “padding” on the right
    // inside L1 frames (user screenshot: big right/bottom gutters in borders).
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
      // Require high fill so we don't invent empty right/bottom chrome
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
