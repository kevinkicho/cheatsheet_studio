/**
 * In-panel dense auto-layout — hierarchical-first, sheet densify primitives.
 *
 * Two modes:
 * - **forceFlat** (in-panel Rectangle/N-gon button): MaxRects into the user
 *   pin box only. No clamp-to-overlap, no grid-snap overlap resolver, no
 *   hierarchical chrome retile. Frame size stays exact.
 * - **hierarchical** (default when forceFlat is off): pack L2 leaves then
 *   footprints, densify/gap polish — sheet parity.
 */
import type { CanvasItem, LayoutPanel } from '@/types'
import { gapPxToCells, type PanelGroupLevel } from '../constants'
import {
  resolveLeafGroupCollisions,
  resolveCardOverlaps,
  separateLeafCardsByGap,
  ensureLeafTitleClearance,
  enforcePanelLayoutInvariants,
} from '../densify'
import type { FolderRef } from '../folders'
import { isHeadingCard } from '../folders'
import { chromeFromMembers } from '../polyomino'
import { placeTopicRegionsDense, packBBoxScore } from '../shelf'
import {
  NESTED_TITLE_BAND_PX,
  L1_TITLE_BAND_PX,
  L1_NESTED_TITLE_BAND_PX,
} from './hierarchy'
import { packIntoBox } from './packIntoBox'

export type DenseRelayoutArgs = {
  items: CanvasItem[]
  panel: LayoutPanel
  members: CanvasItem[]
  memberIds: Set<string>
  folders: FolderRef[]
  allPanels: LayoutPanel[]
  pinX: number
  pinY: number
  pinW: number
  pinH: number
  contentX: number
  contentY: number
  packLimitRight: number
  contentW: number
  pad: number
  grid: number
  blockGapPx: number
  l2PanelGapPx: number
  l1GapPx: number
  chromeShape: 'rect' | 'polygon'
  titleBand: number
  orderedLeaves: LayoutPanel[]
  level: number
  hasNestedStroke: boolean
  /**
   * Pack all members as one flat free-flow (ignore nested L2 leaf structure).
   * Used by in-panel Auto-layout button so residual holes get filled.
   */
  forceFlat?: boolean
  /** Rotate insertion-order seeds so re-clicks can improve residual fill. */
  packSeed?: number
}

function exclusiveBand(p: LayoutPanel, all: LayoutPanel[]): number {
  if (p.showTitle === false || p.showStroke === false) return 0
  if ((p.hierarchyLevel ?? 1) <= 1) {
    const hasNested = all.some(
      (c) =>
        c.id !== p.id &&
        c.showStroke !== false &&
        (c.hierarchyLevel ?? 1) > 1 &&
        c.memberIds?.length &&
        p.memberIds?.length &&
        c.memberIds.every((id) => p.memberIds!.includes(id)),
    )
    return hasNested ? L1_NESTED_TITLE_BAND_PX : L1_TITLE_BAND_PX
  }
  return NESTED_TITLE_BAND_PX
}

function rebuildChrome(
  p: LayoutPanel,
  byId: Map<string, CanvasItem>,
  opts: {
    grid: number
    panelPad: number
    allPanels: LayoutPanel[]
    forceShape?: 'rect' | 'polygon'
  },
): LayoutPanel {
  const members = (p.memberIds ?? [])
    .map((id) => byId.get(id))
    .filter((m): m is CanvasItem => m != null && !m.hidden)
  if (members.length === 0) return p
  const all = opts.allPanels
  const titleBand = exclusiveBand(p, all)
  const pad = Math.max(0, opts.panelPad)
  const shape = opts.forceShape ?? p.shape ?? 'rect'
  const useNgon = shape === 'polygon'
  const hasNestedStrokeKids = all.some(
    (c) =>
      c.id !== p.id &&
      c.showStroke !== false &&
      (c.hierarchyLevel ?? 1) > (p.hierarchyLevel ?? 1) &&
      c.memberIds?.length &&
      p.memberIds?.length &&
      c.memberIds.every((id) => p.memberIds!.includes(id)),
  )
  const chrome = chromeFromMembers(members, {
    pad,
    titleBand,
    shape: useNgon ? 'polygon' : 'rect',
    grid: opts.grid,
    solidMode: useNgon && !hasNestedStrokeKids ? 'blocks' : 'solid-aabb',
  })
  return {
    ...p,
    ...chrome,
    shape,
    showStroke: p.showStroke,
    id: p.id,
    folderId: p.folderId,
    title: p.title,
    showTitle: p.showTitle,
    contentSort: p.contentSort,
    memberIds: p.memberIds,
    accent: p.accent,
    zIndex: p.zIndex,
    hierarchyLevel: p.hierarchyLevel,
  }
}

/**
 * Pixel skyline free-flow at full card sizes with exact gapPx (sub-cell gaps).
 * Used when gapPx > 0 but gapPxToCells is 0 so cell free-flow would pack flush.
 *
 * Contact-aware placement + gravity + void-fill so residual columns beside tall
 * process cards get used (screenshot 192700 empty bottom-right).
 */
function freeFlowPixelKeepSizes(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  boxW: number,
  gapPx: number,
): { placed: CanvasItem[]; width: number; height: number } {
  if (cards.length === 0) return { placed: [], width: 0, height: 0 }
  const gap = Math.max(0, Math.round(gapPx))
  const bandW = Math.max(48, Math.round(boxW))
  type Pl = { i: number; x: number; y: number; w: number; h: number }
  const idxs = cards.map((_, i) => i)
  const orderings: number[][] = [
    [...idxs].sort(
      (a, b) =>
        cards[b]!.height - cards[a]!.height ||
        cards[b]!.width * cards[b]!.height -
          cards[a]!.width * cards[a]!.height,
    ),
    [...idxs].sort(
      (a, b) =>
        cards[b]!.width * cards[b]!.height -
          cards[a]!.width * cards[a]!.height ||
        cards[b]!.height - cards[a]!.height,
    ),
    [...idxs].sort(
      (a, b) =>
        cards[b]!.width - cards[a]!.width ||
        cards[b]!.height - cards[a]!.height,
    ),
    // Short first: slip into residual beside tall process charts
    [...idxs].sort(
      (a, b) =>
        cards[a]!.height - cards[b]!.height ||
        cards[b]!.width - cards[a]!.width,
    ),
    idxs,
  ]
  const collides = (
    placed: Pl[],
    x: number,
    y: number,
    w: number,
    h: number,
    ignore?: number,
  ) => {
    for (const p of placed) {
      if (ignore != null && p.i === ignore) continue
      if (
        x < p.x + p.w + gap &&
        x + w + gap > p.x &&
        y < p.y + p.h + gap &&
        y + h + gap > p.y
      ) {
        return true
      }
    }
    return false
  }
  const contactScore = (
    placed: Pl[],
    x: number,
    y: number,
    w: number,
    h: number,
    ignore?: number,
  ) => {
    let c = 0
    if (x <= 0.5) c += h * 0.5
    if (y <= 0.5) c += w * 0.5
    for (const p of placed) {
      if (ignore != null && p.i === ignore) continue
      const yOl = Math.min(y + h, p.y + p.h) - Math.max(y, p.y)
      if (yOl > 0) {
        if (Math.abs(x - (p.x + p.w + gap)) < 0.6) c += yOl
        if (Math.abs(p.x - (x + w + gap)) < 0.6) c += yOl
      }
      const xOl = Math.min(x + w, p.x + p.w) - Math.max(x, p.x)
      if (xOl > 0) {
        if (Math.abs(y - (p.y + p.h + gap)) < 0.6) c += xOl
        if (Math.abs(p.y - (y + h + gap)) < 0.6) c += xOl
      }
    }
    return c
  }
  const candSets = (placed: Pl[]) => {
    const xCands = new Set<number>([0])
    const yCands = new Set<number>([0])
    for (const p of placed) {
      xCands.add(p.x)
      xCands.add(p.x + p.w + gap)
      yCands.add(p.y)
      yCands.add(p.y + p.h + gap)
    }
    return { xCands, yCands }
  }
  const gravity = (placed: Pl[]) => {
    for (let sweep = 0; sweep < 12; sweep++) {
      let any = false
      for (const p of [...placed].sort((a, b) => a.y - b.y || a.x - b.x)) {
        let lo = 0
        let hi = p.y
        let bestY = p.y
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2)
          if (!collides(placed, p.x, mid, p.w, p.h, p.i)) {
            bestY = mid
            hi = mid - 1
          } else lo = mid + 1
        }
        if (bestY < p.y) {
          p.y = bestY
          any = true
        }
      }
      for (const p of [...placed].sort((a, b) => a.x - b.x || a.y - b.y)) {
        let lo = 0
        let hi = p.x
        let bestX = p.x
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2)
          if (
            mid + p.w <= bandW + 0.5 &&
            !collides(placed, mid, p.y, p.w, p.h, p.i)
          ) {
            bestX = mid
            hi = mid - 1
          } else lo = mid + 1
        }
        if (bestX < p.x) {
          p.x = bestX
          any = true
        }
      }
      if (!any) break
    }
  }
  const voidFill = (placed: Pl[]) => {
    for (let round = 0; round < 5; round++) {
      let any = false
      for (const p of [...placed].sort(
        (a, b) => b.w * b.h - a.w * a.h || b.h - a.h,
      )) {
        const others = placed.filter((o) => o.i !== p.i)
        const { xCands, yCands } = candSets(others)
        let best: { x: number; y: number; score: number } | null = null
        for (const y of [...yCands].sort((a, b) => a - b)) {
          for (const x of [...xCands].sort((a, b) => a - b)) {
            if (x + p.w > bandW + 0.5) continue
            if (collides(others, x, y, p.w, p.h)) continue
            const bottom = Math.max(
              others.reduce((m, o) => Math.max(m, o.y + o.h), 0),
              y + p.h,
            )
            const contact = contactScore(others, x, y, p.w, p.h)
            // Prefer compact height + contact (fills residual beside tall cards)
            const score = bottom * 1e9 + y * 1e5 + x * 10 - contact * 120
            if (!best || score < best.score) best = { x, y, score }
          }
        }
        if (!best) continue
        const curContact = contactScore(others, p.x, p.y, p.w, p.h)
        const curBottom = Math.max(
          others.reduce((m, o) => Math.max(m, o.y + o.h), 0),
          p.y + p.h,
        )
        const curScore =
          curBottom * 1e9 + p.y * 1e5 + p.x * 10 - curContact * 120
        if (best.score < curScore - 1) {
          p.x = best.x
          p.y = best.y
          any = true
        }
      }
      if (!any) break
      gravity(placed)
    }
  }

  let bestPl: Pl[] | null = null
  let bestScore = Infinity
  for (const order of orderings) {
    const placed: Pl[] = []
    for (const i of order) {
      const c = cards[i]!
      const w = Math.min(bandW, Math.max(8, Math.round(c.width)))
      const h = Math.max(8, Math.round(c.height))
      const { xCands, yCands } = candSets(placed)
      let best: { x: number; y: number; score: number } | null = null
      for (const y of [...yCands].sort((a, b) => a - b)) {
        for (const x of [...xCands].sort((a, b) => a - b)) {
          if (x + w > bandW + 0.5) continue
          if (collides(placed, x, y, w, h)) continue
          const bottom = Math.max(
            placed.reduce((m, p) => Math.max(m, p.y + p.h), 0),
            y + h,
          )
          const contact = contactScore(placed, x, y, w, h)
          const score = bottom * 1e9 + y * 1e5 + x * 10 - contact * 100
          if (!best || score < best.score) best = { x, y, score }
        }
      }
      if (!best) {
        const y =
          placed.length === 0
            ? 0
            : Math.max(...placed.map((p) => p.y + p.h)) + gap
        best = { x: 0, y, score: y }
      }
      placed.push({ i, x: best.x, y: best.y, w, h })
    }
    gravity(placed)
    voidFill(placed)
    gravity(placed)
    const maxY = Math.max(...placed.map((p) => p.y + p.h), 0)
    const maxX = Math.max(...placed.map((p) => p.x + p.w), 0)
    // Prefer short packs that still use the band width (less empty right/bottom)
    const unusedW = Math.max(0, bandW - maxX)
    const score = maxY * 1e6 + unusedW * 8e3 + maxX * maxY * 4
    if (score < bestScore) {
      bestScore = score
      bestPl = placed.map((p) => ({ ...p }))
    }
  }
  let maxX = ox
  let maxY = oy
  const placed = cards.map((m, i) => {
    const p =
      bestPl?.find((x) => x.i === i) ?? {
        x: 0,
        y: 0,
        w: m.width,
        h: m.height,
      }
    const x = Math.round(ox + p.x)
    const y = Math.round(oy + p.y)
    maxX = Math.max(maxX, x + m.width)
    maxY = Math.max(maxY, y + m.height)
    return { ...m, x, y }
  })
  return {
    placed,
    width: Math.max(8, maxX - ox),
    height: Math.max(8, maxY - oy),
  }
}

/**
 * Free-flow place keeping **full original pixel sizes**.
 * Cell skyline when gap fits grid; pixel skyline for sub-cell block gaps
 * so user 2–12px gaps are not packed flush then “forgotten”.
 */
function freeFlowKeepSizes(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  boxW: number,
  grid: number,
  gapCells: number,
  gapPx = 0,
  /** When true: keep input order (name reading flow), like sheet groupSort. */
  readingFlow = false,
): { placed: CanvasItem[]; width: number; height: number } {
  if (cards.length === 0) {
    return { placed: [], width: 0, height: 0 }
  }
  // Sub-cell but non-zero: exact pixel pack (gapPxToCells floor → 0)
  if (gapPx > 0 && gapCells <= 0) {
    return freeFlowPixelKeepSizes(cards, ox, oy, boxW, gapPx)
  }
  const g = Math.max(4, grid)
  const bandW = Math.max(48, Math.round(boxW))
  const pageCols = Math.max(1, Math.floor(bandW / g))
  const regions = cards.map((m, i) => ({
    index: i,
    cw: Math.min(pageCols, Math.max(1, Math.ceil(Math.max(24, m.width) / g))),
    ch: Math.max(1, Math.ceil(Math.max(20, m.height) / g)),
  }))
  const pos = placeTopicRegionsDense(regions, pageCols, Math.max(0, gapCells), {
    multiOrder: !readingFlow,
    readingFlow,
  })
  let maxX = ox
  let maxY = oy
  const placed = cards.map((m, i) => {
    const p = pos.get(i) ?? { c: 0, r: 0 }
    let x = Math.round(ox + p.c * g)
    const y = Math.round(oy + p.r * g)
    if (m.width <= bandW && x + m.width > ox + bandW) {
      x = Math.max(ox, ox + bandW - m.width)
    }
    if (x < ox) x = ox
    maxX = Math.max(maxX, x + m.width)
    maxY = Math.max(maxY, y + m.height)
    return { ...m, x, y }
  })
  return {
    placed,
    width: Math.max(8, maxX - ox),
    height: Math.max(8, maxY - oy),
  }
}

/**
 * Multi-width free-flow; keep densest while preserving full card sizes.
 * Matches sheet repackLeafInteriors intent without width clamp.
 */
function freeFlowBestWidthKeepSizes(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  maxBoxW: number,
  grid: number,
  gapCells: number,
  gapPx = 0,
  readingFlow = false,
): { placed: CanvasItem[]; width: number; height: number } {
  if (cards.length === 0) {
    return { placed: [], width: 0, height: 0 }
  }
  const g = Math.max(4, grid)
  return freeFlowKeepSizes(
    cards,
    ox,
    oy,
    maxBoxW,
    g,
    gapCells,
    gapPx,
    readingFlow,
  )
}

/** Rotate card order so successive in-panel clicks try different densest packs. */
function rotateMembers(cards: CanvasItem[], seed: number): CanvasItem[] {
  if (cards.length <= 1) return cards
  const n = ((seed % cards.length) + cards.length) % cards.length
  if (n === 0) return cards
  return [...cards.slice(n), ...cards.slice(0, n)]
}

function packResidualScore(
  placed: CanvasItem[],
  ox: number,
  oy: number,
  packW: number,
  packH: number,
): number {
  const vis = placed.filter((m) => !m.hidden && !isHeadingCard(m))
  if (vis.length === 0) return Infinity
  const maxX = Math.max(...vis.map((m) => m.x + m.width)) - ox
  const maxY = Math.max(...vis.map((m) => m.y + m.height)) - oy
  const used = vis.reduce((s, m) => s + m.width * m.height, 0)
  const bbox = Math.max(1, maxX * maxY)
  const fill = Math.min(1, used / bbox)
  const unusedW = Math.max(0, packW - maxX)
  const unusedH = Math.max(0, packH - maxY)
  // Prefer short packs that still use width (fill residual columns)
  return maxY * 1e6 + unusedW * 8e4 + unusedH * 2e3 + (1 - fill) * 5e5
}

/**
 * Try several free-flow seeds; pick the one that best fills residual space
 * inside the fixed panel content box (not just first densest order).
 */
function freeFlowMultiSeed(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  packW: number,
  packH: number,
  grid: number,
  gapCells: number,
  gapPx: number,
  readingFlow: boolean,
  packSeed: number,
): CanvasItem[] {
  if (cards.length === 0) return []
  // Seeds: rotate start + height/area preferred pre-sorts
  const variants: CanvasItem[][] = []
  const base = [...cards]
  for (let s = 0; s < Math.min(6, Math.max(3, cards.length)); s++) {
    variants.push(rotateMembers(base, packSeed + s))
  }
  variants.push(
    [...base].sort(
      (a, b) =>
        b.height - a.height || b.width * b.height - a.width * a.height,
    ),
  )
  variants.push(
    [...base].sort(
      (a, b) =>
        b.width * b.height - a.width * a.height || b.height - a.height,
    ),
  )
  variants.push(
    [...base].sort((a, b) => a.height - b.height || b.width - a.width),
  )

  let best: { placed: CanvasItem[]; score: number } | null = null
  for (const variant of variants) {
    const r = freeFlowBestWidthKeepSizes(
      variant,
      ox,
      oy,
      packW,
      grid,
      gapCells,
      gapPx,
      readingFlow,
    )
    const score = packResidualScore(r.placed, ox, oy, packW, packH)
    if (!best || score < best.score - 1e-6) {
      best = { placed: r.placed, score }
    }
  }
  return best?.placed ?? cards
}

function restoreSizes(
  placed: CanvasItem[],
  sizeById: Map<string, { w: number; h: number }>,
): CanvasItem[] {
  return placed.map((m) => {
    const s = sizeById.get(m.id)
    return s ? { ...m, width: s.w, height: s.h } : m
  })
}

function pinCluster(
  placed: CanvasItem[],
  packLeft: number,
  packTop: number,
): CanvasItem[] {
  const vis = placed.filter((m) => !m.hidden && !isHeadingCard(m))
  if (vis.length === 0) return placed
  const minX = Math.min(...vis.map((m) => m.x))
  const minY = Math.min(...vis.map((m) => m.y))
  const dx = Math.round(packLeft - minX)
  const dy = Math.round(packTop - minY)
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return placed
  return placed.map((m) => ({
    ...m,
    x: Math.round(m.x + dx),
    y: Math.round(m.y + dy),
  }))
}

type FootLeaf = {
  locals: Array<{ id: string; dx: number; dy: number }>
  footW: number
  footH: number
}

/**
 * L9: Keep footprint width ≤ pack band and scale local offsets so cards stay
 * inside the packed chrome box (pack used min(bandW, footW) while dx used
 * full leaf width → paint-over after rebuild).
 */
function normalizeFootLeaf(leaf: FootLeaf, bandW: number): FootLeaf {
  const maxW = Math.max(48, Math.round(bandW))
  const fw = Math.max(8, Math.round(leaf.footW))
  const fh = Math.max(8, Math.round(leaf.footH))
  if (fw <= maxW + 0.5) {
    return { locals: leaf.locals, footW: fw, footH: fh }
  }
  const sx = maxW / fw
  const locals = leaf.locals.map((loc) => ({
    id: loc.id,
    dx: Math.max(0, Math.min(maxW - 1, Math.round(loc.dx * sx))),
    dy: loc.dy,
  }))
  return { locals, footW: maxW, footH: fh }
}

/**
 * Pixel skyline pack of L2 chrome footprints with **user gap only** between
 * frames (e.g. 2px). Prior version left large skyline voids (screenshot 144157
 * red circles) that looked like “gaps not 2px” — those were empty residual
 * columns, not the L2 gap knob.
 *
 * Fixes: more insertion orders, residual/hole candidates, contact-aware
 * placement score, aggressive gravity + void-fill into free rectangles.
 */
function packFootprintsPixel(
  leavesIn: FootLeaf[],
  packLeft: number,
  packTop: number,
  packW: number,
  gapPx: number,
  /**
   * Sheet groupSort parity: name A→Z/Z→A keeps leaf insertion order (reading
   * flow). `none` tries multi-order densest (same as sheet densest free-flow).
   */
  readingFlow = false,
): Map<string, { x: number; y: number }> {
  if (leavesIn.length === 0) return new Map()
  // Exact user L2 gap (stroke-to-stroke between chrome footprints)
  const gap = Math.max(0, Math.round(gapPx))
  const bandW = Math.max(48, Math.round(packW))
  const leaves = leavesIn.map((L) => normalizeFootLeaf(L, bandW))

  type Placed = { i: number; x: number; y: number; w: number; h: number }
  const idxs = leaves.map((_, i) => i)
  const byH = [...idxs].sort(
    (a, b) =>
      leaves[b]!.footH - leaves[a]!.footH ||
      leaves[b]!.footW * leaves[b]!.footH -
        leaves[a]!.footW * leaves[a]!.footH,
  )
  const byA = [...idxs].sort(
    (a, b) =>
      leaves[b]!.footW * leaves[b]!.footH -
        leaves[a]!.footW * leaves[a]!.footH ||
      leaves[b]!.footH - leaves[a]!.footH,
  )
  const byW = [...idxs].sort(
    (a, b) =>
      leaves[b]!.footW - leaves[a]!.footW ||
      leaves[b]!.footH - leaves[a]!.footH,
  )
  // Short/wide first often fills residual beside tall leaves better
  const byHAsc = [...idxs].sort(
    (a, b) =>
      leaves[a]!.footH - leaves[b]!.footH ||
      leaves[b]!.footW - leaves[a]!.footW,
  )
  const byPeri = [...idxs].sort((a, b) => {
    const pa = leaves[a]!.footW + leaves[a]!.footH
    const pb = leaves[b]!.footW + leaves[b]!.footH
    return pb - pa || leaves[b]!.footH - leaves[a]!.footH
  })
  // Name sort: single pass in given leaf order (reading flow). No-sort: densest.
  const orderings = readingFlow
    ? [idxs]
    : [byH, byA, byW, byHAsc, byPeri, idxs, [...idxs].reverse()]

  const collides = (
    placed: Placed[],
    x: number,
    y: number,
    w: number,
    h: number,
    ignore?: number,
  ) => {
    for (const p of placed) {
      if (ignore != null && p.i === ignore) continue
      if (
        x < p.x + p.w + gap &&
        x + w + gap > p.x &&
        y < p.y + p.h + gap &&
        y + h + gap > p.y
      ) {
        return true
      }
    }
    return false
  }

  /** Edge contact length with already-placed (higher = denser tetris). */
  const contactScore = (
    placed: Placed[],
    x: number,
    y: number,
    w: number,
    h: number,
    ignore?: number,
  ) => {
    let c = 0
    // Bonus for sitting on pack origin
    if (x <= 0.5) c += h * 0.5
    if (y <= 0.5) c += w * 0.5
    for (const p of placed) {
      if (ignore != null && p.i === ignore) continue
      // Horizontal abut (right of p or left of p) with y-overlap
      const yOl =
        Math.min(y + h, p.y + p.h) - Math.max(y, p.y)
      if (yOl > 0) {
        if (Math.abs(x - (p.x + p.w + gap)) < 0.6) c += yOl
        if (Math.abs(p.x - (x + w + gap)) < 0.6) c += yOl
      }
      // Vertical abut with x-overlap
      const xOl =
        Math.min(x + w, p.x + p.w) - Math.max(x, p.x)
      if (xOl > 0) {
        if (Math.abs(y - (p.y + p.h + gap)) < 0.6) c += xOl
        if (Math.abs(p.y - (y + h + gap)) < 0.6) c += xOl
      }
    }
    return c
  }

  const candSets = (placed: Placed[]) => {
    const xCands = new Set<number>([0])
    const yCands = new Set<number>([0])
    for (const p of placed) {
      xCands.add(p.x)
      xCands.add(p.x + p.w + gap)
      // Residual column under a shorter neighbor: same x as p, below others
      yCands.add(p.y)
      yCands.add(p.y + p.h + gap)
    }
    // Also try mid residual: for each pair, x after left item
    for (const p of placed) {
      for (const q of placed) {
        if (p.i === q.i) continue
        // slot to the right of p if free
        xCands.add(p.x + p.w + gap)
        yCands.add(Math.max(p.y, q.y))
      }
    }
    return { xCands, yCands }
  }

  const gravity = (placed: Placed[]) => {
    for (let sweep = 0; sweep < 16; sweep++) {
      let any = false
      // Up
      for (const p of [...placed].sort((a, b) => a.y - b.y || a.x - b.x)) {
        let lo = 0
        let hi = p.y
        let bestY = p.y
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2)
          if (!collides(placed, p.x, mid, p.w, p.h, p.i)) {
            bestY = mid
            hi = mid - 1
          } else lo = mid + 1
        }
        if (bestY < p.y) {
          p.y = bestY
          any = true
        }
      }
      // Left
      for (const p of [...placed].sort((a, b) => a.x - b.x || a.y - b.y)) {
        let lo = 0
        let hi = p.x
        let bestX = p.x
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2)
          if (
            mid + p.w <= bandW + 0.5 &&
            !collides(placed, mid, p.y, p.w, p.h, p.i)
          ) {
            bestX = mid
            hi = mid - 1
          } else lo = mid + 1
        }
        if (bestX < p.x) {
          p.x = bestX
          any = true
        }
      }
      if (!any) break
    }
  }

  /**
   * Try re-seat each leaf into residual holes (fills voids under short top
   * neighbors — screenshot 144157 red empty columns).
   */
  const voidFill = (placed: Placed[]) => {
    for (let round = 0; round < 4; round++) {
      let any = false
      for (const p of [...placed].sort(
        (a, b) => b.w * b.h - a.w * a.h || b.h - a.h,
      )) {
        const { xCands, yCands } = candSets(placed.filter((o) => o.i !== p.i))
        let best: { x: number; y: number; score: number } | null = null
        const others = placed.filter((o) => o.i !== p.i)
        const curBottom = Math.max(
          ...others.map((o) => o.y + o.h),
          p.y + p.h,
          0,
        )
        for (const y of [...yCands].sort((a, b) => a - b)) {
          for (const x of [...xCands].sort((a, b) => a - b)) {
            if (x + p.w > bandW + 0.5) continue
            if (collides(others, x, y, p.w, p.h)) continue
            const bottom = Math.max(
              others.reduce((m, o) => Math.max(m, o.y + o.h), 0),
              y + p.h,
            )
            const contact = contactScore(others, x, y, p.w, p.h)
            // Prefer not growing height; prefer top-left; prefer contact
            const score =
              bottom * 1e9 + y * 1e5 + x * 10 - contact * 50
            if (!best || score < best.score) best = { x, y, score }
          }
        }
        if (
          best &&
          (best.y < p.y - 0.5 ||
            best.x < p.x - 0.5 ||
            best.y + p.h < curBottom - 0.5)
        ) {
          // Only move if placement score is better than current
          const curContact = contactScore(others, p.x, p.y, p.w, p.h)
          const curBottom2 = Math.max(
            others.reduce((m, o) => Math.max(m, o.y + o.h), 0),
            p.y + p.h,
          )
          const curScore =
            curBottom2 * 1e9 + p.y * 1e5 + p.x * 10 - curContact * 50
          if (best.score < curScore - 1) {
            p.x = best.x
            p.y = best.y
            any = true
          }
        }
      }
      if (!any) break
      gravity(placed)
    }
  }

  const placeOnce = (order: number[]): Placed[] => {
    const placed: Placed[] = []
    for (const i of order) {
      const L = leaves[i]!
      const w = Math.min(bandW, Math.max(8, Math.round(L.footW)))
      const h = Math.max(8, Math.round(L.footH))
      const { xCands, yCands } = candSets(placed)
      let best: { x: number; y: number; score: number } | null = null
      for (const y of [...yCands].sort((a, b) => a - b)) {
        for (const x of [...xCands].sort((a, b) => a - b)) {
          if (x + w > bandW + 0.5) continue
          if (collides(placed, x, y, w, h)) continue
          const bottom = Math.max(
            placed.reduce((m, p) => Math.max(m, p.y + p.h), 0),
            y + h,
          )
          const contact = contactScore(placed, x, y, w, h)
          // Contact bonus fills residual holes instead of stacking below
          const score = bottom * 1e9 + y * 1e5 + x * 10 - contact * 80
          if (!best || score < best.score) best = { x, y, score }
        }
      }
      if (!best) {
        const y =
          placed.length === 0
            ? 0
            : Math.max(...placed.map((p) => p.y + p.h)) + gap
        best = { x: 0, y, score: y }
      }
      placed.push({ i, x: best.x, y: best.y, w, h })
    }
    gravity(placed)
    voidFill(placed)
    gravity(placed)
    return placed
  }

  let bestPlaced: Placed[] | null = null
  let bestScore = Infinity
  const filledArea = leaves.reduce((s, L) => s + L.footW * L.footH, 0)
  for (const order of orderings) {
    const pl = placeOnce(order)
    const maxY = Math.max(...pl.map((p) => p.y + p.h), 0)
    const maxX = Math.max(...pl.map((p) => p.x + p.w), 0)
    const area = Math.max(1, maxX * maxY)
    const fill = Math.min(1, filledArea / area)
    // Strong empty-tax: large red-circle voids must lose to denser packs
    const score =
      maxY * 1e6 +
      area * 12 +
      maxX * 0.25 +
      (1 - fill) * 2e6
    if (score < bestScore) {
      bestScore = score
      bestPlaced = pl
    }
  }

  const out = new Map<string, { x: number; y: number }>()
  for (const p of bestPlaced ?? []) {
    const L = leaves[p.i]!
    for (const loc of L.locals) {
      out.set(loc.id, {
        x: Math.round(packLeft + p.x + loc.dx),
        y: Math.round(packTop + p.y + loc.dy),
      })
    }
  }
  return out
}

/**
 * Build chrome footprints for one leaf-content width budget, then pixel-pack.
 * Returns placed members + overall bbox score (lower better).
 */
function hierarchicalAtLeafBudget(
  members: CanvasItem[],
  orderedLeaves: LayoutPanel[],
  opts: {
    packLeft: number
    packTop: number
    packW: number
    grid: number
    pad: number
    blockGapCells: number
    blockGapPx: number
    l2GapPx: number
    leafContentW: number
    /** Sheet groupSort parity: name flow vs densest multi-order. */
    readingFlow?: boolean
    sort: (cards: CanvasItem[], leaf: LayoutPanel) => CanvasItem[]
  },
): { placed: CanvasItem[]; score: number; spanH: number; spanW: number } {
  const {
    packLeft,
    packTop,
    packW,
    grid,
    pad,
    blockGapCells,
    blockGapPx,
    l2GapPx,
    leafContentW,
    sort,
  } = opts
  const readingFlow = opts.readingFlow === true
  const g = Math.max(4, grid)
  const titlePx = NESTED_TITLE_BAND_PX
  // Content band inside L2 chrome (both side pads reserved for footW = c + 2*pad)
  const maxContent = Math.max(48, Math.min(leafContentW, packW - pad * 2))

  const leaves: FootLeaf[] = []
  const claimed = new Set<string>()

  for (const leaf of orderedLeaves) {
    const group = sort(
      members.filter((m) => leaf.memberIds?.includes(m.id)),
      leaf,
    )
    if (group.length === 0) continue
    for (const m of group) claimed.add(m.id)

    const local = freeFlowBestWidthKeepSizes(
      group,
      0,
      0,
      maxContent,
      g,
      blockGapCells,
      blockGapPx,
      readingFlow,
    )
    leaves.push(
      normalizeFootLeaf(
        {
          locals: local.placed.map((m) => ({
            id: m.id,
            dx: m.x + pad,
            dy: m.y + titlePx + pad,
          })),
          footW: local.width + pad * 2,
          footH: local.height + titlePx + pad * 2,
        },
        packW,
      ),
    )
  }

  const rest = members.filter((m) => !claimed.has(m.id))
  if (rest.length > 0) {
    const local = freeFlowBestWidthKeepSizes(
      rest,
      0,
      0,
      maxContent,
      g,
      blockGapCells,
      blockGapPx,
      readingFlow,
    )
    leaves.push(
      normalizeFootLeaf(
        {
          locals: local.placed.map((m) => ({
            id: m.id,
            dx: m.x + pad,
            dy: m.y + pad,
          })),
          footW: local.width + pad * 2,
          footH: local.height + pad * 2,
        },
        packW,
      ),
    )
  }

  if (leaves.length === 0) {
    return { placed: members, score: Infinity, spanH: 0, spanW: 0 }
  }

  const byId = packFootprintsPixel(
    leaves,
    packLeft,
    packTop,
    packW,
    Math.max(0, l2GapPx),
    readingFlow,
  )
  const placed = members.map((m) => {
    const p = byId.get(m.id)
    return p ? { ...m, x: p.x, y: p.y } : m
  })
  const vis = placed.filter((m) => !m.hidden && byId.has(m.id))
  if (vis.length === 0) {
    return { placed, score: Infinity, spanH: 0, spanW: 0 }
  }
  const minX = Math.min(...vis.map((m) => m.x))
  const minY = Math.min(...vis.map((m) => m.y))
  const maxX = Math.max(...vis.map((m) => m.x + m.width))
  const maxY = Math.max(...vis.map((m) => m.y + m.height))
  const spanW = Math.max(1, maxX - minX)
  const spanH = Math.max(1, maxY - minY)
  const filled = vis.reduce((s, m) => s + m.width * m.height, 0)
  // Cell-normalized packBBoxScore so multi-budget pick matches shelf densify
  const score = packBBoxScore(
    Math.max(1, Math.ceil(spanW / g)),
    Math.max(1, Math.ceil(spanH / g)),
    filled / (g * g),
  )
  return { placed, score, spanH, spanW }
}

/**
 * Hierarchical pack: free-flow each L2 leaf, then pack chrome footprints.
 *
 * Critical multi-leaf fix: free-flowing every leaf at full band width makes
 * each L2 ultra-wide/short (min height). Those footprints cannot sit
 * side-by-side → pure vertical stack + empty right (Biology L1 after
 * Auto-layout-by-panel looked worse than sheet). Try several leaf content
 * budgets and keep the densest global pack.
 */
function packHierarchicalLeaves(
  members: CanvasItem[],
  orderedLeaves: LayoutPanel[],
  opts: {
    packLeft: number
    packTop: number
    packRight: number
    packW: number
    grid: number
    pad: number
    blockGapCells: number
    blockGapPx: number
    l2GapPx: number
    readingFlow?: boolean
    sort: (cards: CanvasItem[], leaf: LayoutPanel) => CanvasItem[]
  },
): CanvasItem[] {
  const { packW, pad } = opts
  // L9: max content inside L2 = pack band − both chrome side pads
  const full = Math.max(48, packW - pad * 2)
  // Multi-leaf: also try ~2/3 and ~1/2 band so medium L2s can tile.
  // Single leaf: full content band only (same as flat free-flow).
  const budgets =
    orderedLeaves.length >= 2
      ? Array.from(
          new Set(
            [
              full,
              Math.max(48, Math.ceil((full * 3) / 4)),
              Math.max(48, Math.ceil((full * 2) / 3)),
              Math.max(48, Math.ceil(full / 2)),
            ].map((w) => Math.max(48, Math.min(full, w))),
          ),
        ).sort((a, b) => b - a)
      : [full]

  let best: {
    placed: CanvasItem[]
    score: number
    spanH: number
  } | null = null

  for (const leafContentW of budgets) {
    const r = hierarchicalAtLeafBudget(members, orderedLeaves, {
      ...opts,
      leafContentW,
    })
    if (
      !best ||
      r.score < best.score - 1e-9 ||
      (Math.abs(r.score - best.score) < 1e-9 && r.spanH < best.spanH)
    ) {
      best = { placed: r.placed, score: r.score, spanH: r.spanH }
    }
  }
  return best?.placed ?? members
}

/**
 * After leaf-interior densify, re-pack L2 chrome footprints in pixels so
 * frames cannot overlap and cell ceil does not add extra gutters.
 */
function retileLeafChromeFootprints(
  placed: CanvasItem[],
  orderedLeaves: LayoutPanel[],
  opts: {
    packLeft: number
    packTop: number
    packW: number
    grid: number
    pad: number
    titlePx: number
    l2GapPx: number
    readingFlow?: boolean
  },
): CanvasItem[] {
  const { packLeft, packTop, packW, pad, titlePx, l2GapPx } = opts
  const readingFlow = opts.readingFlow === true
  const leaves: FootLeaf[] = []

  for (const leaf of orderedLeaves) {
    const mem = placed.filter(
      (m) => leaf.memberIds?.includes(m.id) && !m.hidden,
    )
    if (mem.length === 0) continue
    const minX = Math.min(...mem.map((m) => m.x))
    const minY = Math.min(...mem.map((m) => m.y))
    const maxX = Math.max(...mem.map((m) => m.x + m.width))
    const maxY = Math.max(...mem.map((m) => m.y + m.height))
    leaves.push(
      normalizeFootLeaf(
        {
          locals: mem.map((m) => ({
            id: m.id,
            dx: m.x - minX + pad,
            dy: m.y - minY + titlePx + pad,
          })),
          footW: maxX - minX + pad * 2,
          footH: maxY - minY + titlePx + pad * 2,
        },
        packW,
      ),
    )
  }
  if (leaves.length === 0) return placed

  const byId = packFootprintsPixel(
    leaves,
    packLeft,
    packTop,
    packW,
    Math.max(0, l2GapPx),
    readingFlow,
  )

  return placed.map((m) => {
    const p = byId.get(m.id)
    return p ? { ...m, x: p.x, y: p.y } : m
  })
}

/**
 * Dense in-panel reflow — hierarchical-first + size-safe densify polish.
 */
/**
 * Pack all members as one flat MaxRects into the fixed panel content box.
 * Intentionally minimal post-process — prior densify/clamp passes undid
 * residual-column placement.
 */
function packForceFlatIntoPin(args: {
  items: CanvasItem[]
  panel: LayoutPanel
  members: CanvasItem[]
  memberIds: Set<string>
  allPanels: LayoutPanel[]
  pinX: number
  pinY: number
  pinW: number
  pinH: number
  packLeft: number
  packTop: number
  packW: number
  packH: number
  pad: number
  blockGapPx: number
  chromeShape: 'rect' | 'polygon'
  packSeed: number
  sizeById: Map<string, { w: number; h: number }>
}): { items: CanvasItem[]; panel: LayoutPanel; panels?: LayoutPanel[] } {
  const {
    items,
    panel,
    members,
    memberIds,
    allPanels,
    pinX,
    pinY,
    pinW,
    pinH,
    packLeft,
    packTop,
    packW,
    packH,
    pad,
    blockGapPx,
    chromeShape,
    packSeed,
    sizeById,
  } = args

  const packed = packIntoBox(members, {
    ox: packLeft,
    oy: packTop,
    packW,
    packH,
    gapPx: blockGapPx,
    seed: packSeed,
  })

  if (typeof console !== 'undefined') {
    console.info(
      '[in-panel packIntoBox]',
      `used ${Math.round(packed.usedW)}×${Math.round(packed.usedH)}`,
      `of ${Math.round(packW)}×${Math.round(packH)}`,
      `bboxFill=${packed.bboxFill.toFixed(2)}`,
      `areaFill=${packed.areaFill.toFixed(2)}`,
      packed.overflowH ? 'overflowH' : 'fitsH',
      `seed=${packSeed}`,
      `${members.length} cards`,
    )
  }

  const placed = packed.placed.map((m) => {
    const s = sizeById.get(m.id)
    return s
      ? {
          ...m,
          width: s.w,
          height: s.h,
          x: Math.round(m.x),
          y: Math.round(m.y),
        }
      : { ...m, x: Math.round(m.x), y: Math.round(m.y) }
  })

  // Soft floor only — never pull overflow up into overlaps.
  const packRight = packLeft + packW
  const settled = placed.map((m) => {
    if (m.hidden) return m
    let x = m.x
    let y = m.y
    if (x < packLeft) x = packLeft
    if (y < packTop) y = packTop
    if (m.width <= packW && x + m.width > packRight) {
      x = Math.max(packLeft, packRight - m.width)
    }
    return { ...m, x: Math.round(x), y: Math.round(y) }
  })

  const placedById = new Map(settled.map((m) => [m.id, m]))
  const nextItems = items.map((it) => {
    const p = placedById.get(it.id)
    if (!p) return it
    const s = sizeById.get(it.id)
    return {
      ...it,
      x: p.x,
      y: p.y,
      width: s?.w ?? it.width,
      height: s?.h ?? it.height,
    }
  })

  const nestedSorted = allPanels
    .filter(
      (p) =>
        p.id !== panel.id &&
        p.memberIds?.length &&
        p.memberIds.every((id) => memberIds.has(id)),
    )
    .sort((a, b) => (b.hierarchyLevel ?? 1) - (a.hierarchyLevel ?? 1))

  const byId = new Map(nextItems.map((i) => [i.id, i]))
  const rebuilt = new Map<string, LayoutPanel>()
  for (const child of nestedSorted) {
    rebuilt.set(
      child.id,
      rebuildChrome(child, byId, {
        grid: 24,
        panelPad: pad,
        allPanels: allPanels.map((p) => rebuilt.get(p.id) ?? p),
        forceShape: chromeShape,
      }),
    )
  }
  const kids = nestedSorted.map((c) => rebuilt.get(c.id)!).filter(Boolean)
  const parent = rebuildChrome(
    {
      ...panel,
      contentSort: panel.contentSort ?? 'none',
      shape: chromeShape,
    },
    byId,
    {
      grid: 24,
      panelPad: pad,
      allPanels: kids.length ? [panel, ...kids] : [panel],
      forceShape: chromeShape,
    },
  )
  const locked = lockPinnedFrame(parent, {
    pinX,
    pinY,
    pinW,
    pinH,
    needW: pinW,
    needH: pinH,
    forceRectRuns: kids.length > 0 || parent.shape !== 'polygon',
    exactPin: true,
  })
  rebuilt.set(panel.id, locked)

  const panelsOut = allPanels.length
    ? allPanels.map((p) => rebuilt.get(p.id) ?? p)
    : [locked]

  return {
    items: nextItems,
    panel: locked,
    panels: panelsOut,
  }
}

export function relayoutPanelDenseSheetParity(
  args: DenseRelayoutArgs,
): { items: CanvasItem[]; panel: LayoutPanel; panels?: LayoutPanel[] } {
  const {
    items,
    panel,
    members,
    memberIds,
    folders,
    allPanels,
    pinX,
    pinY,
    pinW,
    pinH,
    contentX,
    contentY,
    packLimitRight,
    pad,
    grid,
    blockGapPx,
    l2PanelGapPx,
    l1GapPx,
    chromeShape,
    titleBand,
    orderedLeaves,
    level,
  } = args

  const packLeft = contentX
  const packTop = contentY
  const packRight = packLimitRight
  // Fixed bin: panel size at click is the hard content budget (never grow).
  const packBottom = pinY + pinH - pad
  const packW = Math.max(48, packRight - packLeft)
  const packH = Math.max(48, packBottom - packTop)
  const g = Math.max(4, grid)

  const sizeById = new Map(
    members.map((m) => [m.id, { w: m.width, h: m.height }] as const),
  )
  const packSeed = Math.max(0, Math.floor(args.packSeed ?? 0))

  // ── Flat leaf / forceFlat button path ──────────────────────────────────
  // Clean MaxRects into the pin box → write x/y → lock frame.
  // Applies when:
  //   • forceFlat (in-panel Rectangle/N-gon button), or
  //   • no nested leaf panels (true L2 leaf pack)
  // Prior hierarchical polish (resolveCardOverlaps grid-snap, clampBandFull
  // pulling overflow into overlaps, separateLeafCardsByGap) undid residual
  // columns and zeroed block gaps (screenshot 192700 + gap tests).
  const multiLevel = !args.forceFlat && orderedLeaves.length > 0
  if (!multiLevel) {
    return packForceFlatIntoPin({
      items,
      panel,
      members,
      memberIds,
      allPanels,
      pinX,
      pinY,
      pinW,
      pinH,
      packLeft,
      packTop,
      packW,
      packH,
      pad,
      blockGapPx,
      chromeShape,
      packSeed,
      sizeById,
    })
  }

  // Hierarchical L1⊃L2 path only from here (multiLevel guaranteed)
  const shallowLevel = Math.min(3, Math.max(1, level)) as PanelGroupLevel
  const deepLevel = Math.min(3, Math.max(shallowLevel, level + 1)) as PanelGroupLevel

  const blockGapCells = gapPxToCells(blockGapPx, g)
  // Sheet parity: axis-aware content clear — title only on vertical stacks.
  const l2ContentClearH = Math.max(0, l2PanelGapPx) + pad * 2
  const l2ContentClearV =
    Math.max(0, l2PanelGapPx) + pad * 2 + NESTED_TITLE_BAND_PX
  const l2ContentClearPx = l2ContentClearV

  // Group sort: none → densest free-flow; name → reading order free-flow
  const sortMode = panel.contentSort ?? 'none'
  const readingFlow = sortMode === 'name-asc' || sortMode === 'name-desc'

  // ── 1) Pack each L2 leaf, then pack chrome footprints ──────────────────
  let placed: CanvasItem[] = packHierarchicalLeaves(members, orderedLeaves, {
    packLeft,
    packTop,
    packRight,
    packW,
    grid: g,
    pad,
    blockGapCells,
    blockGapPx,
    l2GapPx: l2PanelGapPx,
    readingFlow,
    sort: (cards, leaf) => {
      if (sortMode === 'none' && leaf.memberIds?.length) {
        const rank = new Map(leaf.memberIds.map((id, i) => [id, i]))
        return [...cards].sort(
          (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
        )
      }
      const dir = sortMode === 'name-desc' ? -1 : 1
      return [...cards].sort((a, b) => {
        const ta = (a.title ?? a.latex ?? a.id).toLocaleLowerCase()
        const tb = (b.title ?? b.latex ?? b.id).toLocaleLowerCase()
        if (ta < tb) return -1 * dir
        if (ta > tb) return 1 * dir
        return a.id.localeCompare(b.id)
      })
    },
  })

  placed = restoreSizes(placed, sizeById)
  void freeFlowMultiSeed
  void readingFlow
  void blockGapCells
  void packSeed
  void packH
  void packBottom

  // ── 2) Interior polish ─────────────────────────────────────────────────
  placed = resolveCardOverlaps(placed, { grid: g, contentRight: packRight })
  if (folders.length > 0 && blockGapPx > 0) {
    placed = separateLeafCardsByGap(placed, folders, deepLevel, {
      grid: g,
      minGapPx: blockGapPx,
      contentRight: packRight,
    })
    placed = restoreSizes(placed, sizeById)
  }

  // ── 3) L2 chrome re-tile ───────────────────────────────────────────────
  placed = retileLeafChromeFootprints(placed, orderedLeaves, {
    packLeft,
    packTop,
    packW,
    grid: g,
    pad,
    titlePx: NESTED_TITLE_BAND_PX,
    l2GapPx: l2PanelGapPx,
    readingFlow,
  })
  placed = restoreSizes(placed, sizeById)

  // ── 4) Pin to content origin; soft floor (no overlap-inducing clamp) ───
  placed = pinCluster(placed, packLeft, packTop)
  placed = placed.map((m) => {
    if (m.hidden) return m
    let x = m.x
    let y = m.y
    if (x < packLeft) x = packLeft
    if (y < packTop) y = packTop
    if (m.width <= packW && x + m.width > packRight) {
      x = Math.max(packLeft, packRight - m.width)
    }
    return { ...m, x: Math.round(x), y: Math.round(y) }
  })
  placed = restoreSizes(placed, sizeById)

  if (folders.length > 0 && blockGapPx > 0) {
    placed = separateLeafCardsByGap(placed, folders, deepLevel, {
      grid: g,
      minGapPx: blockGapPx,
      contentRight: packRight,
    })
    placed = restoreSizes(placed, sizeById)
  }

  // Final chrome re-tile after any card gap moves (keeps L2 frames clear)
  placed = retileLeafChromeFootprints(placed, orderedLeaves, {
    packLeft,
    packTop,
    packW,
    grid: g,
    pad,
    titlePx: NESTED_TITLE_BAND_PX,
    l2GapPx: l2PanelGapPx,
    readingFlow,
  })
  placed = restoreSizes(placed, sizeById)
  if (folders.length > 0 && blockGapPx > 0) {
    placed = separateLeafCardsByGap(placed, folders, deepLevel, {
      grid: g,
      minGapPx: blockGapPx,
      contentRight: packRight,
    })
    placed = restoreSizes(placed, sizeById)
    placed = retileLeafChromeFootprints(placed, orderedLeaves, {
      packLeft,
      packTop,
      packW,
      grid: g,
      pad,
      titlePx: NESTED_TITLE_BAND_PX,
      l2GapPx: l2PanelGapPx,
      readingFlow,
    })
    placed = restoreSizes(placed, sizeById)
  }
  placed = pinCluster(placed, packLeft, packTop)
  void l2ContentClearH
  void ensureLeafTitleClearance
  void resolveLeafGroupCollisions
  void shallowLevel

  const placedById = new Map(placed.map((m) => [m.id, m]))
  let nextItems = items.map((it) => {
    const p = placedById.get(it.id)
    if (!p) return it
    return { ...it, x: p.x, y: p.y }
  })

  // ── 4) Rebuild existing nested chrome (preserve panel IDs) ─────────────
  const nestedSorted = allPanels
    .filter(
      (p) =>
        p.id !== panel.id &&
        p.memberIds?.length &&
        p.memberIds.every((id) => memberIds.has(id)),
    )
    .sort((a, b) => (b.hierarchyLevel ?? 1) - (a.hierarchyLevel ?? 1))

  const panelWithSort: LayoutPanel = {
    ...panel,
    contentSort: panel.contentSort ?? 'name-asc',
    shape: chromeShape,
  }

  const rebuildAll = (itemsNow: CanvasItem[]): LayoutPanel[] => {
    const byId = new Map(itemsNow.map((i) => [i.id, i]))
    const rebuilt = new Map<string, LayoutPanel>()
    for (const child of nestedSorted) {
      rebuilt.set(
        child.id,
        rebuildChrome(child, byId, {
          grid: g,
          panelPad: pad,
          allPanels: allPanels.map((p) => rebuilt.get(p.id) ?? p),
          forceShape: chromeShape,
        }),
      )
    }
    const kids = nestedSorted
      .map((c) => rebuilt.get(c.id)!)
      .filter(Boolean)
    const parent = rebuildChrome(panelWithSort, byId, {
      grid: g,
      panelPad: pad,
      allPanels: kids.length ? [panelWithSort, ...kids] : [panelWithSort],
      forceShape: chromeShape,
    })

    // Fixed bin: panel geometry stays exactly the user-provided pin box.
    const locked = lockPinnedFrame(parent, {
      pinX,
      pinY,
      pinW,
      pinH,
      needW: pinW,
      needH: pinH,
      forceRectRuns: kids.length > 0 || parent.shape !== 'polygon',
      exactPin: true,
    })
    rebuilt.set(panel.id, locked)
    return allPanels.length
      ? allPanels.map((p) => rebuilt.get(p.id) ?? p)
      : [locked]
  }

  let panelsOut = rebuildAll(nextItems)

  // ── 5) Frame enforce (L2 stroke gaps) ──────────────────────────────────
  const scopePanelIds = new Set<string>([
    panel.id,
    ...nestedSorted.map((p) => p.id),
  ])
  const fixed = enforcePanelLayoutInvariants(nextItems, panelsOut, {
    grid: g,
    panelPad: pad,
    minGapPx: Math.max(0, l2PanelGapPx),
    l1GapPx: Math.max(0, l1GapPx),
    l2GapPx: Math.max(0, l2PanelGapPx),
    contentLeft: packLeft,
    contentRight: packRight,
    contentTop: pinY,
    scopePanelIds,
  })
  // Never accept size changes from enforce
  nextItems = fixed.items.map((it) => {
    const s = sizeById.get(it.id)
    return s ? { ...it, width: s.w, height: s.h } : it
  })

  // Re-pin origin after frame pushes. Multi-level: no per-card right-clamp
  // (that re-stacked L2s). Soft floor only, then chrome re-tile if needed.
  {
    const mem = nextItems.filter((i) => memberIds.has(i.id) && !i.hidden)
    if (mem.length > 0) {
      const minX = Math.min(...mem.map((m) => m.x))
      const minY = Math.min(...mem.map((m) => m.y))
      const dx = Math.round(packLeft - minX)
      const dy = Math.round(packTop - minY)
      if (dx !== 0 || dy !== 0) {
        nextItems = nextItems.map((it) =>
          memberIds.has(it.id)
            ? { ...it, x: Math.round(it.x + dx), y: Math.round(it.y + dy) }
            : it,
        )
      }
    }
  }
  nextItems = nextItems.map((it) => {
    if (!memberIds.has(it.id) || it.hidden) return it
    let x = it.x
    let y = it.y
    if (x < packLeft) x = packLeft
    if (y < packTop) y = packTop
    if (it.width <= packW && x + it.width > packRight) {
      x = Math.max(packLeft, packRight - it.width)
    }
    return { ...it, x: Math.round(x), y: Math.round(y) }
  })

  if (folders.length > 0 && blockGapPx > 0) {
    const slice = nextItems.filter((i) => memberIds.has(i.id))
    const gapped = separateLeafCardsByGap(slice, folders, deepLevel, {
      grid: g,
      minGapPx: blockGapPx,
      contentRight: packRight,
    })
    const byId = new Map(gapped.map((i) => [i.id, i]))
    nextItems = nextItems.map((it) => {
      const p = byId.get(it.id)
      if (!p) return it
      const s = sizeById.get(it.id)
      return s
        ? { ...it, x: p.x, y: p.y, width: s.w, height: s.h }
        : { ...it, x: p.x, y: p.y }
    })
  }

  // Re-tile L2 chrome after enforce / block-gap so frames never paint-overlap
  {
    const slice = nextItems.filter((i) => memberIds.has(i.id))
    const retiled = retileLeafChromeFootprints(slice, orderedLeaves, {
      packLeft,
      packTop,
      packW,
      grid: g,
      pad,
      titlePx: NESTED_TITLE_BAND_PX,
      l2GapPx: l2PanelGapPx,
      readingFlow,
    })
    const byId = new Map(retiled.map((i) => [i.id, i]))
    nextItems = nextItems.map((it) => {
      const p = byId.get(it.id)
      if (!p) return it
      const s = sizeById.get(it.id)
      return s
        ? { ...it, x: p.x, y: p.y, width: s.w, height: s.h }
        : { ...it, x: p.x, y: p.y }
    })
    // Pin again after retile
    {
      const mem = nextItems.filter((i) => memberIds.has(i.id) && !i.hidden)
      if (mem.length > 0) {
        const minX = Math.min(...mem.map((m) => m.x))
        const minY = Math.min(...mem.map((m) => m.y))
        const dx = Math.round(packLeft - minX)
        const dy = Math.round(packTop - minY)
        if (dx !== 0 || dy !== 0) {
          nextItems = nextItems.map((it) =>
            memberIds.has(it.id)
              ? { ...it, x: Math.round(it.x + dx), y: Math.round(it.y + dy) }
              : it,
          )
        }
      }
    }
  }

  // Final pin + clamp members into fixed content box (panel interior)
  {
    const mem = nextItems.filter((i) => memberIds.has(i.id) && !i.hidden)
    if (mem.length > 0) {
      const minX = Math.min(...mem.map((m) => m.x))
      const minY = Math.min(...mem.map((m) => m.y))
      const dx = Math.round(packLeft - minX)
      const dy = Math.round(packTop - minY)
      if (dx !== 0 || dy !== 0) {
        nextItems = nextItems.map((it) =>
          memberIds.has(it.id)
            ? { ...it, x: Math.round(it.x + dx), y: Math.round(it.y + dy) }
            : it,
        )
      }
    }
  }
  // Soft floor + right-pull only — never pull tall content up into overlaps
  nextItems = nextItems.map((it) => {
    if (!memberIds.has(it.id) || it.hidden) return it
    const s = sizeById.get(it.id)
    const w = s?.w ?? it.width
    const h = s?.h ?? it.height
    let x = it.x
    let y = it.y
    if (x < packLeft) x = packLeft
    if (y < packTop) y = packTop
    if (w <= packW && x + w > packRight) x = Math.max(packLeft, packRight - w)
    return {
      ...it,
      x: Math.round(x),
      y: Math.round(y),
      width: w,
      height: h,
    }
  })
  void packBottom

  panelsOut = rebuildAll(nextItems)
  // Exact pin box — sort & fit into provided panel size; never grow/shrink
  panelsOut = panelsOut.map((p) => {
    if (p.id !== panel.id) return p
    return lockPinnedFrame(p, {
      pinX,
      pinY,
      pinW,
      pinH,
      needW: pinW,
      needH: pinH,
      forceRectRuns: nestedSorted.length > 0 || p.shape !== 'polygon',
      exactPin: true,
    })
  })

  void titleBand
  void l1GapPx
  void l2ContentClearPx

  return {
    items: nextItems,
    panel: panelsOut.find((p) => p.id === panel.id) ?? panelWithSort,
    panels: panelsOut,
  }
}

/**
 * Pin panel origin. By default never grow past pin; with exactPin keep the
 * provided panel size exactly (fixed-bin in-panel auto-layout).
 */
function lockPinnedFrame(
  p: LayoutPanel,
  args: {
    pinX: number
    pinY: number
    pinW: number
    pinH: number
    needW: number
    needH: number
    forceRectRuns?: boolean
    /** Keep pinW×pinH exactly (user-provided panel size). */
    exactPin?: boolean
  },
): LayoutPanel {
  const {
    pinX,
    pinY,
    pinW,
    pinH,
    needW,
    needH,
    forceRectRuns,
    exactPin,
  } = args
  let width: number
  let height: number
  if (exactPin) {
    width = Math.max(48, Math.round(pinW))
    height = Math.max(48, Math.round(pinH))
  } else {
    const fillW = needW / Math.max(1, pinW)
    const fillH = needH / Math.max(1, pinH)
    const w =
      fillW >= 0.88 ? pinW : Math.min(pinW, Math.max(48, needW))
    const h =
      fillH >= 0.88 ? pinH : Math.min(pinH, Math.max(48, needH))
    width = Math.min(pinW, Math.max(48, Math.round(w)))
    height = Math.min(pinH, Math.max(48, Math.round(h)))
  }
  const runs =
    forceRectRuns || (p.runs?.length && p.shape !== 'polygon')
      ? [{ x: pinX, y: pinY, width, height }]
      : p.runs
  return {
    ...p,
    x: pinX,
    y: pinY,
    width,
    height,
    ...(runs ? { runs } : {}),
    ...(forceRectRuns ? { outlinePath: undefined } : {}),
  }
}
