/**
 * Fixed-bin rectangle packer for in-panel auto-layout.
 *
 * Places fixed-size cards into a content box (packW × packH) as densely as
 * possible, filling residual columns beside tall cards (process charts).
 *
 * Algorithm: MaxRects free-list + bottom-left (BSSF waste tie-break), multi-order
 * search. Does not resize cards. May leave empty margin when total card area
 * is less than the bin, or when residual holes are smaller than every remaining
 * card.
 */
import type { CanvasItem } from '@/types'
import { isHeadingCard } from '../folders'

export type PackIntoBoxResult = {
  placed: CanvasItem[]
  /** Used bounding box width/height from origin */
  usedW: number
  usedH: number
  /** Fraction of bin covered by card areas (0–1) */
  areaFill: number
  /** Fraction of used AABB covered by cards */
  bboxFill: number
  /** True if any card extends past packH (content taller than frame) */
  overflowH: boolean
}

type Rect = { x: number; y: number; w: number; h: number }
type Pl = { i: number; x: number; y: number; w: number; h: number }

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  )
}

/**
 * MaxRects split: replace each free rect that intersects the placed card
 * (including gap) with the up-to-four non-overlapping remainders.
 */
function splitFree(free: Rect[], used: Rect, gap: number): Rect[] {
  const next: Rect[] = []
  for (const f of free) {
    if (!overlaps(f, used, gap)) {
      next.push(f)
      continue
    }
    // Left strip
    if (used.x >= f.x + gap + 0.5) {
      next.push({
        x: f.x,
        y: f.y,
        w: used.x - gap - f.x,
        h: f.h,
      })
    }
    // Right strip
    const right = used.x + used.w + gap
    if (right + 0.5 < f.x + f.w) {
      next.push({
        x: right,
        y: f.y,
        w: f.x + f.w - right,
        h: f.h,
      })
    }
    // Top strip
    if (used.y >= f.y + gap + 0.5) {
      next.push({
        x: f.x,
        y: f.y,
        w: f.w,
        h: used.y - gap - f.y,
      })
    }
    // Bottom strip
    const bottom = used.y + used.h + gap
    if (bottom + 0.5 < f.y + f.h) {
      next.push({
        x: f.x,
        y: bottom,
        w: f.w,
        h: f.y + f.h - bottom,
      })
    }
  }
  return pruneFree(next)
}

/** Drop free rects contained in another (and tiny noise). */
function pruneFree(free: Rect[]): Rect[] {
  const out: Rect[] = []
  for (let i = 0; i < free.length; i++) {
    const a = free[i]!
    if (a.w < 2 || a.h < 2) continue
    let contained = false
    for (let j = 0; j < free.length; j++) {
      if (i === j) continue
      const b = free[j]!
      if (
        a.x >= b.x - 0.5 &&
        a.y >= b.y - 0.5 &&
        a.x + a.w <= b.x + b.w + 0.5 &&
        a.y + a.h <= b.y + b.h + 0.5
      ) {
        contained = true
        break
      }
    }
    if (!contained) out.push(a)
  }
  return out
}

/**
 * Pack one insertion order into a bin.
 * Free list starts as the full packW × packH content box so residual columns
 * inside the panel are first-class free rects. If a card cannot fit any free
 * rect, place at skyline bottom (may overflow height — preferred over
 * overlapping).
 */
function packOnce(
  order: number[],
  cards: CanvasItem[],
  binW: number,
  binH: number,
  gap: number,
): Pl[] | null {
  // Soft extend free-list height so we can still place overflow cards without
  // inventing overlapping coordinates; scoring penalizes overflow heavily.
  const freeH = Math.max(
    binH,
    cards.reduce((s, c) => s + Math.round(c.height) + gap, gap) + 32,
  )
  let free: Rect[] = [{ x: 0, y: 0, w: binW, h: freeH }]
  const placed: Pl[] = []

  for (const i of order) {
    const c = cards[i]!
    const w = Math.min(binW, Math.max(8, Math.round(c.width)))
    const h = Math.max(8, Math.round(c.height))

    let best: { x: number; y: number; waste: number } | null = null
    for (const fr of free) {
      if (w > fr.w + 0.5 || h > fr.h + 0.5) continue
      // Prefer placements that stay inside the real panel height
      const overflows = fr.y + h > binH + 0.5
      const waste = fr.w * fr.h - w * h
      // Bottom-left: min y, then min x, then BSSF waste; heavy penalty past binH
      const key =
        (overflows ? 1e15 : 0) +
        fr.y * 1e9 +
        fr.x * 1e3 +
        waste * 0.001
      if (
        !best ||
        key <
          (best.y + h > binH + 0.5 ? 1e15 : 0) +
            best.y * 1e9 +
            best.x * 1e3 +
            best.waste * 0.001
      ) {
        best = { x: fr.x, y: fr.y, waste }
      }
    }

    if (!best) {
      // No free rect fits — skyline bottom (never overlap)
      const y =
        placed.length === 0
          ? 0
          : Math.max(...placed.map((p) => p.y + p.h)) + gap
      if (w > binW + 0.5) return null
      best = { x: 0, y, waste: 0 }
    }

    const pl: Pl = { i, x: best.x, y: best.y, w, h }
    placed.push(pl)
    free = splitFree(free, { x: pl.x, y: pl.y, w: pl.w, h: pl.h }, gap)
  }
  return placed
}

function scorePlaced(
  placed: Pl[],
  binW: number,
  binH: number,
): number {
  if (placed.length === 0) return Infinity
  const maxX = Math.max(...placed.map((p) => p.x + p.w))
  const maxY = Math.max(...placed.map((p) => p.y + p.h))
  const used = placed.reduce((s, p) => s + p.w * p.h, 0)
  const bbox = Math.max(1, maxX * maxY)
  const fill = used / bbox
  const unusedW = Math.max(0, binW - maxX)
  const overflowH = Math.max(0, maxY - binH)
  // Primary: fit in bin height. Then short used height, use width, dense bbox.
  return (
    overflowH * 1e9 +
    maxY * 1e6 +
    unusedW * 4e4 +
    (1 - fill) * 2e5 +
    maxX * 0.1
  )
}

function orderVariants(cards: CanvasItem[], seed: number): number[][] {
  const n = cards.length
  const idxs = cards.map((_, i) => i)
  const rot = (s: number) => {
    const k = ((s % n) + n) % n
    return [...idxs.slice(k), ...idxs.slice(0, k)]
  }
  const byH = [...idxs].sort(
    (a, b) =>
      cards[b]!.height - cards[a]!.height ||
      cards[b]!.width * cards[b]!.height -
        cards[a]!.width * cards[a]!.height,
  )
  const byA = [...idxs].sort(
    (a, b) =>
      cards[b]!.width * cards[b]!.height -
        cards[a]!.width * cards[a]!.height ||
      cards[b]!.height - cards[a]!.height,
  )
  const byW = [...idxs].sort(
    (a, b) =>
      cards[b]!.width - cards[a]!.width ||
      cards[b]!.height - cards[a]!.height,
  )
  const byHAsc = [...idxs].sort(
    (a, b) =>
      cards[a]!.height - cards[b]!.height ||
      cards[b]!.width - cards[a]!.width,
  )
  // Tall first, then short cards fill residual columns
  const tallThenArea = [...idxs].sort((a, b) => {
    const ha = cards[a]!.height
    const hb = cards[b]!.height
    const tallA = ha >= 160 ? 0 : 1
    const tallB = hb >= 160 ? 0 : 1
    if (tallA !== tallB) return tallA - tallB
    return (
      hb * cards[b]!.width - ha * cards[a]!.width || hb - ha || a - b
    )
  })
  const byName = [...idxs].sort((a, b) => {
    const ta = (cards[a]!.title ?? cards[a]!.id).toLocaleLowerCase()
    const tb = (cards[b]!.title ?? cards[b]!.id).toLocaleLowerCase()
    return ta.localeCompare(tb) || a - b
  })
  return [
    byH,
    tallThenArea,
    byA,
    byW,
    byHAsc,
    byName,
    rot(seed),
    rot(seed + 1),
    rot(seed + 2),
    rot(seed + 3),
    [...byH].reverse(),
  ]
}

/**
 * Pack cards into a fixed content bin starting at (ox, oy).
 * Card sizes are preserved. Positions are absolute canvas coords.
 */
export function packIntoBox(
  cards: CanvasItem[],
  opts: {
    ox: number
    oy: number
    packW: number
    packH: number
    gapPx?: number
    seed?: number
  },
): PackIntoBoxResult {
  const vis = cards.filter((c) => !c.hidden && !isHeadingCard(c))
  if (vis.length === 0) {
    return {
      placed: cards,
      usedW: 0,
      usedH: 0,
      areaFill: 0,
      bboxFill: 0,
      overflowH: false,
    }
  }
  const gap = Math.max(0, Math.round(opts.gapPx ?? 2))
  const binW = Math.max(48, Math.round(opts.packW))
  const binH = Math.max(48, Math.round(opts.packH))
  const seed = opts.seed ?? 0

  let bestPl: Pl[] | null = null
  let bestScore = Infinity
  for (const order of orderVariants(vis, seed)) {
    const pl = packOnce(order, vis, binW, binH, gap)
    if (!pl || pl.length !== vis.length) continue
    const sc = scorePlaced(pl, binW, binH)
    if (sc < bestScore) {
      bestScore = sc
      bestPl = pl
    }
  }
  // Fallback: single column stack (never overlaps)
  if (!bestPl) {
    let y = 0
    bestPl = vis.map((c, i) => {
      const pl = {
        i,
        x: 0,
        y,
        w: Math.min(binW, Math.round(c.width)),
        h: Math.round(c.height),
      }
      y += pl.h + gap
      return pl
    })
  }

  // Enforce gap: if any pair overlaps (bug), push later card down
  bestPl = enforceNoOverlap(bestPl, gap)

  const byI = new Map(bestPl.map((p) => [p.i, p]))
  const placed = vis.map((c, i) => {
    const p = byI.get(i)!
    return {
      ...c,
      x: Math.round(opts.ox + p.x),
      y: Math.round(opts.oy + p.y),
      width: Math.round(c.width),
      height: Math.round(c.height),
    }
  })
  const placedById = new Map(placed.map((p) => [p.id, p]))
  const allPlaced = cards.map((c) => placedById.get(c.id) ?? c)

  const maxX =
    Math.max(...placed.map((p) => p.x + p.width), opts.ox) - opts.ox
  const maxY =
    Math.max(...placed.map((p) => p.y + p.height), opts.oy) - opts.oy
  const used = placed.reduce((s, p) => s + p.width * p.height, 0)
  const bbox = Math.max(1, maxX * maxY)
  const binArea = Math.max(1, binW * binH)

  return {
    placed: allPlaced,
    usedW: maxX,
    usedH: maxY,
    areaFill: used / binArea,
    bboxFill: used / bbox,
    overflowH: maxY > binH + 0.5,
  }
}

/** Safety: push later cards so no pair violates gap (pixel, no grid snap). */
function enforceNoOverlap(placed: Pl[], gap: number): Pl[] {
  const out = placed.map((p) => ({ ...p }))
  // Stable: earlier in list kept; later moved
  for (let pass = 0; pass < out.length + 2; pass++) {
    let moved = false
    out.sort((a, b) => a.y - b.y || a.x - b.x || a.i - b.i)
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!
        const b = out[j]!
        if (!overlaps(
          { x: a.x, y: a.y, w: a.w, h: a.h },
          { x: b.x, y: b.y, w: b.w, h: b.h },
          gap,
        )) {
          continue
        }
        // Prefer push right if it stays in a reasonable band; else push down
        const pushRight = a.x + a.w + gap
        const rightOk = true // width budget enforced by caller pack
        if (rightOk && pushRight + b.w <= a.x + a.w + b.w + gap + 1e6) {
          // Check if right is "more natural" (significant y-overlap)
          const yOl =
            Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
          if (yOl > 4 && pushRight !== b.x) {
            // Only push right if the cards already share a row-ish band
            // and b is not clearly below a
            if (b.y < a.y + a.h - 4) {
              out[j] = { ...b, x: pushRight }
              moved = true
              continue
            }
          }
        }
        const pushDown = a.y + a.h + gap
        if (b.y < pushDown) {
          out[j] = { ...b, y: pushDown }
          moved = true
        }
      }
    }
    if (!moved) break
  }
  return out
}
