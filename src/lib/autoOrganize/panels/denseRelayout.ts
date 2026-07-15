/**
 * In-panel dense auto-layout — hierarchical-first, sheet densify primitives.
 *
 * Root causes fixed here (deeper than prior rewrites):
 *
 * 1. **Hierarchy ignored at seed** — free-flowing ALL L1 cards as one soup
 *    interleaved L2 subsections; densify could not recover clean L2 tiles.
 *    → Pack each L2 leaf first, then pack leaf chrome footprints.
 *
 * 2. **Size restore without re-separation** — densify/repack set
 *    width=min(orig, cw*grid); restoring orig sizes on those coords caused
 *    block overlaps. → Always re-run position-only separation after restore.
 *
 * 3. **Wrong pack budget** — inflated/shrunk band each click.
 *    → Fixed content band from panel at click; hard right wall; hug chrome.
 *
 * 4. **Missing sheet steps** — no resolveLeafGroupCollisions /
 *    separateLeafCardsByGap / repack leaf multi-width.
 *    → Use those densify modules on the hierarchical result.
 */
import type { CanvasItem, LayoutPanel } from '@/types'
import { gapPxToCells, type PanelGroupLevel } from '../constants'
import {
  densifyPlacedGroups,
  repackLeafInteriors,
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
 * Free-flow place keeping **full original pixel sizes**.
 * Skyline uses ceil(w/grid) footprints so cards don't claim less space than
 * they paint (avoids post-restore overlaps).
 */
function freeFlowKeepSizes(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  boxW: number,
  grid: number,
  gapCells: number,
): { placed: CanvasItem[]; width: number; height: number } {
  if (cards.length === 0) {
    return { placed: [], width: 0, height: 0 }
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
    multiOrder: true,
    readingFlow: false,
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
): { placed: CanvasItem[]; width: number; height: number } {
  if (cards.length === 0) {
    return { placed: [], width: 0, height: 0 }
  }
  const g = Math.max(4, grid)
  const maxCardW = Math.max(...cards.map((c) => c.width), 48)
  const area = cards.reduce((s, c) => s + c.width * c.height, 0)
  const candidates = Array.from(
    new Set(
      [
        maxBoxW,
        Math.ceil((maxBoxW * 3) / 4),
        Math.ceil((maxBoxW * 2) / 3),
        Math.ceil(maxBoxW / 2),
        Math.min(maxBoxW, Math.max(maxCardW, Math.ceil(Math.sqrt(area * 1.2)))),
      ]
        .map((w) => Math.max(maxCardW, Math.min(maxBoxW, w)))
        .filter((w) => w >= 24),
    ),
  ).sort((a, b) => b - a)

  let best: {
    placed: CanvasItem[]
    width: number
    height: number
    score: number
  } | null = null

  for (const boxW of candidates) {
    const r = freeFlowKeepSizes(cards, ox, oy, boxW, g, gapCells)
    // Prefer short+filled (same spirit as packBBoxScore)
    const box = Math.max(1, r.width * r.height)
    const fill = Math.min(1, area / box)
    const score =
      r.height * 1e6 + box * 8 + r.width * 0.25 + (1 - fill) * 5e5
    if (!best || score < best.score) {
      best = { ...r, score }
    }
  }
  return best ?? freeFlowKeepSizes(cards, ox, oy, maxBoxW, g, gapCells)
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

function clampBand(
  placed: CanvasItem[],
  packLeft: number,
  packTop: number,
  packRight: number,
): CanvasItem[] {
  const packW = Math.max(48, packRight - packLeft)
  return placed.map((m) => {
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
}

type FootLeaf = {
  locals: Array<{ id: string; dx: number; dy: number }>
  footW: number
  footH: number
}

/**
 * Pixel skyline pack of chrome footprints (no cell ceil air between L2s).
 * Multi-order densest; then gravity up/left into voids.
 */
function packFootprintsPixel(
  leaves: FootLeaf[],
  packLeft: number,
  packTop: number,
  packW: number,
  gapPx: number,
): Map<string, { x: number; y: number }> {
  if (leaves.length === 0) return new Map()
  const gap = Math.max(0, Math.round(gapPx))
  const bandW = Math.max(48, Math.round(packW))

  type Placed = { i: number; x: number; y: number; w: number; h: number }
  const orderings: number[][] = []
  const idxs = leaves.map((_, i) => i)
  // height-desc, area-desc, width-desc, input
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
  orderings.push(byH, byA, byW, idxs)

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

  const placeOnce = (order: number[]): Placed[] => {
    const placed: Placed[] = []
    for (const i of order) {
      const L = leaves[i]!
      const w = Math.min(bandW, Math.max(8, Math.round(L.footW)))
      const h = Math.max(8, Math.round(L.footH))
      const xCands = new Set<number>([0])
      const yCands = new Set<number>([0])
      for (const p of placed) {
        xCands.add(p.x)
        xCands.add(p.x + p.w + gap)
        yCands.add(p.y)
        yCands.add(p.y + p.h + gap)
      }
      let best: { x: number; y: number; score: number } | null = null
      for (const y of [...yCands].sort((a, b) => a - b)) {
        for (const x of [...xCands].sort((a, b) => a - b)) {
          if (x + w > bandW + 0.5) continue
          if (collides(placed, x, y, w, h)) continue
          const bottom =
            Math.max(
              placed.reduce((m, p) => Math.max(m, p.y + p.h), 0),
              y + h,
            )
          const score = bottom * 1e9 + y * 1e5 + x * 10
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
    // Gravity: up then left
    for (let sweep = 0; sweep < 10; sweep++) {
      let any = false
      for (const p of [...placed].sort((a, b) => b.y - a.y || a.x - b.x)) {
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
      for (const p of [...placed].sort((a, b) => b.x - a.x || a.y - b.y)) {
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
    return placed
  }

  let bestPlaced: Placed[] | null = null
  let bestScore = Infinity
  for (const order of orderings) {
    const pl = placeOnce(order)
    const maxY = Math.max(...pl.map((p) => p.y + p.h), 0)
    const maxX = Math.max(...pl.map((p) => p.x + p.w), 0)
    const area = Math.max(1, maxX * maxY)
    const filled = leaves.reduce((s, L) => s + L.footW * L.footH, 0)
    const score =
      maxY * 1e6 + area * 8 + maxX * 0.25 + (1 - Math.min(1, filled / area)) * 5e5
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
    l2GapPx: number
    leafContentW: number
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
    l2GapPx,
    leafContentW,
    sort,
  } = opts
  const g = Math.max(4, grid)
  const titlePx = NESTED_TITLE_BAND_PX
  const maxContent = Math.max(48, leafContentW)

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
    )
    leaves.push({
      locals: local.placed.map((m) => ({
        id: m.id,
        dx: m.x + pad,
        dy: m.y + titlePx + pad,
      })),
      footW: local.width + pad * 2,
      footH: local.height + titlePx + pad * 2,
    })
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
    )
    leaves.push({
      locals: local.placed.map((m) => ({
        id: m.id,
        dx: m.x + pad,
        dy: m.y + pad,
      })),
      footW: local.width + pad * 2,
      footH: local.height + pad * 2,
    })
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
    l2GapPx: number
    sort: (cards: CanvasItem[], leaf: LayoutPanel) => CanvasItem[]
  },
): CanvasItem[] {
  const { packW, pad } = opts
  const full = Math.max(48, packW - pad)
  // Multi-leaf: also try ~2/3 and ~1/2 band so medium L2s can tile.
  // Single leaf: full band only (same as flat free-flow).
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
  },
): CanvasItem[] {
  const { packLeft, packTop, packW, pad, titlePx, l2GapPx } = opts
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
    leaves.push({
      locals: mem.map((m) => ({
        id: m.id,
        dx: m.x - minX + pad,
        dy: m.y - minY + titlePx + pad,
      })),
      footW: maxX - minX + pad * 2,
      footH: maxY - minY + titlePx + pad * 2,
    })
  }
  if (leaves.length === 0) return placed

  const byId = packFootprintsPixel(
    leaves,
    packLeft,
    packTop,
    packW,
    Math.max(0, l2GapPx),
  )

  return placed.map((m) => {
    const p = byId.get(m.id)
    return p ? { ...m, x: p.x, y: p.y } : m
  })
}

/**
 * Dense in-panel reflow — hierarchical-first + size-safe densify polish.
 */
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
  const packW = Math.max(48, packRight - packLeft)
  const g = Math.max(4, grid)

  const multiLevel = orderedLeaves.length > 0
  const shallowLevel = Math.min(3, Math.max(1, level)) as PanelGroupLevel
  const deepLevel = Math.min(
    3,
    Math.max(shallowLevel, level + (multiLevel ? 1 : 0)),
  ) as PanelGroupLevel

  const blockGapCells = gapPxToCells(blockGapPx, g)
  // Sheet parity: content-to-content clearance so stroked L2 frames sit
  // ~userGap apart (pad lives inside each frame; title strip needs vertical
  // room or ensureLeafTitleClearance shoves groups into sparse voids).
  const l2ContentClearPx = multiLevel
    ? Math.max(0, l2PanelGapPx) + pad * 2 + NESTED_TITLE_BAND_PX
    : Math.max(0, l2PanelGapPx)

  const sizeById = new Map(
    members.map((m) => [m.id, { w: m.width, h: m.height }] as const),
  )

  // ── 1) Hierarchical-first place (multi-budget leaf free-flow) ──────────
  let placed: CanvasItem[]
  if (multiLevel && orderedLeaves.length > 0) {
    placed = packHierarchicalLeaves(members, orderedLeaves, {
      packLeft,
      packTop,
      packRight,
      packW,
      grid: g,
      pad,
      blockGapCells,
      l2GapPx: l2PanelGapPx,
      sort: (cards, leaf) => {
        // Preserve leaf member order when contentSort is none; else name
        const sortMode = panel.contentSort ?? 'name-asc'
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
  } else {
    // Flat L2 leaf (or no nested panels): full-band free-flow
    placed = freeFlowBestWidthKeepSizes(
      members,
      packLeft,
      packTop,
      packW,
      g,
      blockGapCells,
    ).placed
  }

  placed = restoreSizes(placed, sizeById)

  // ── 2) Interior polish ─────────────────────────────────────────────────
  // Multi-level L1: hierarchical multi-budget already free-flowed each L2 and
  // packed chrome footprints. densify/repackLeafInteriors reflow leaf aspect
  // ratios into residual columns (Genetics 274→176 stacked) and destroy the
  // global tile. Only run sheet densify on flat leaves / folder-only packs.
  if (folders.length > 0 && !multiLevel) {
    const pageCols = Math.max(1, Math.floor(packW / g))
    const before = new Map(
      placed.map((m) => [m.id, { w: m.width, h: m.height }] as const),
    )
    placed = densifyPlacedGroups(placed, folders, deepLevel, {
      grid: g,
      contentLeft: packLeft,
      contentTop: packTop,
      contentRight: packRight,
      pageCols,
      gapCells: blockGapCells,
    })
    placed = repackLeafInteriors(placed, folders, deepLevel, {
      grid: g,
      contentLeft: packLeft,
      contentRight: packRight,
      gapCells: blockGapCells,
    })
    placed = restoreSizes(placed, before)
  }

  placed = resolveCardOverlaps(placed, { grid: g, contentRight: packRight })
  if (folders.length > 0 && blockGapPx > 0) {
    placed = separateLeafCardsByGap(placed, folders, deepLevel, {
      grid: g,
      minGapPx: blockGapPx,
      contentRight: packRight,
    })
    placed = restoreSizes(placed, sizeById)
  }

  // ── 3) L2 frame clearance (no reflow of leaf interiors) ────────────────
  if (multiLevel && folders.length > 0) {
    placed = ensureLeafTitleClearance(
      placed,
      folders,
      deepLevel,
      Math.max(18, NESTED_TITLE_BAND_PX),
      g,
    )
    placed = resolveLeafGroupCollisions(placed, folders, deepLevel, {
      grid: g,
      minGapPx: Math.max(0, l2ContentClearPx),
      parentLevel: shallowLevel,
    })
    placed = restoreSizes(placed, sizeById)

    // Re-tile chrome footprints only (rigid leaf interiors). Prefer pixel
    // pack over repackGroupsInParents — cell ceil was adding gutters and
    // residual-column squeeze after collision pushes.
    if (orderedLeaves.length > 0) {
      placed = retileLeafChromeFootprints(placed, orderedLeaves, {
        packLeft,
        packTop,
        packW,
        grid: g,
        pad,
        titlePx: NESTED_TITLE_BAND_PX,
        l2GapPx: l2PanelGapPx,
      })
      placed = restoreSizes(placed, sizeById)
    }
  }

  // ── 4) Pin + hard clamp into panel content band ────────────────────────
  placed = pinCluster(placed, packLeft, packTop)
  placed = clampBand(placed, packLeft, packTop, packRight)
  placed = restoreSizes(placed, sizeById)

  if (folders.length > 0 && blockGapPx > 0) {
    placed = separateLeafCardsByGap(placed, folders, deepLevel, {
      grid: g,
      minGapPx: blockGapPx,
      contentRight: packRight,
    })
    placed = restoreSizes(placed, sizeById)
  }
  placed = clampBand(placed, packLeft, packTop, packRight)

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

    const memNow = itemsNow.filter((i) => memberIds.has(i.id) && !i.hidden)
    const contentMaxX =
      memNow.length > 0
        ? Math.max(...memNow.map((i) => i.x + i.width))
        : pinX + pinW
    const contentMaxY =
      memNow.length > 0
        ? Math.max(...memNow.map((i) => i.y + i.height))
        : pinY + pinH
    const needW = Math.max(48, Math.round(contentMaxX - pinX + pad))
    const needH = Math.round(contentMaxY - pinY + pad)
    const fillRatio = needW / Math.max(1, pinW)
    // Keep pack budget when nearly full; hug when sparse; never exceed pinW
    const lockedW =
      fillRatio >= 0.85 ? pinW : Math.min(pinW, Math.max(needW, 48))

    const locked: LayoutPanel = {
      ...parent,
      x: pinX,
      y: pinY,
      width: Math.max(48, Math.min(pinW, lockedW)),
      height: Math.max(pinH, needH, parent.height),
    }
    if (kids.length > 0 || locked.shape !== 'polygon') {
      locked.runs = [
        {
          x: locked.x,
          y: locked.y,
          width: locked.width,
          height: locked.height,
        },
      ]
      locked.outlinePath = undefined
    }
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

  // Re-pin + clamp after frame pushes
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

  panelsOut = rebuildAll(nextItems)
  panelsOut = panelsOut.map((p) => {
    if (p.id !== panel.id) return p
    const w = Math.min(pinW, Math.max(48, p.width))
    const h = Math.max(pinH, p.height)
    return {
      ...p,
      x: pinX,
      y: pinY,
      width: w,
      height: h,
      runs:
        p.runs?.length && (p.shape !== 'polygon' || nestedSorted.length > 0)
          ? [{ x: pinX, y: pinY, width: w, height: h }]
          : p.runs,
    }
  })

  void titleBand
  void l1GapPx

  return {
    items: nextItems,
    panel: panelsOut.find((p) => p.id === panel.id) ?? panelWithSort,
    panels: panelsOut,
  }
}
