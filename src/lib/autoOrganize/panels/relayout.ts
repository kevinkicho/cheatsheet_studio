import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { chromeFromMembers } from '../polyomino'
import { enforcePanelLayoutInvariants } from '../densify'
import type { FolderRef } from '../folders'
import { packBBoxScore, type PackOrderStrategy } from '../shelf'
import {
  exclusiveTitleBandPx,
  NESTED_TITLE_BAND_PX,
  L1_TITLE_BAND_PX,
  L1_NESTED_TITLE_BAND_PX,
} from './hierarchy'
import { relayoutPanelDenseSheetParity } from './denseRelayout'

/** Per-panel click counter so each Auto-layout click can try a new seed. */
const panelPackSeedById = new Map<string, number>()

type InPanelSeed = {
  /** Optional single-order override; default = full multi-order (sheet densify). */
  orders?: PackOrderStrategy[]
  multiOrder: boolean
  /**
   * Fraction of content width. Always 1 to match full-sheet densify
   * (narrow fracs produced sparse mosaics unlike sheet auto-layout).
   */
  widthFrac: number
  leafSort: 'name' | 'height' | 'area' | 'input' | 'input-rev'
}

/**
 * Sheet-matching pack seeds (rect + n-gon share the same packing).
 * Seed 0 = full multi-order densest free-flow at full width (same engine as
 * sheet densifyPlacedGroups / packClusterTight). Later seeds only change
 * leaf insertion order — never shrink width.
 */
const SHEET_MATCH_SEEDS: InPanelSeed[] = [
  { multiOrder: true, widthFrac: 1, leafSort: 'height' },
  { multiOrder: true, widthFrac: 1, leafSort: 'area' },
  { multiOrder: true, widthFrac: 1, leafSort: 'name' },
  { multiOrder: true, orders: ['height-desc'], widthFrac: 1, leafSort: 'height' },
  { multiOrder: true, orders: ['area-desc'], widthFrac: 1, leafSort: 'area' },
  { multiOrder: true, orders: ['width-desc'], widthFrac: 1, leafSort: 'height' },
  { multiOrder: true, orders: ['perimeter-desc'], widthFrac: 1, leafSort: 'area' },
  { multiOrder: true, orders: ['input'], widthFrac: 1, leafSort: 'input' },
  { multiOrder: true, orders: ['input-rev'], widthFrac: 1, leafSort: 'input-rev' },
  { multiOrder: true, orders: ['height-asc'], widthFrac: 1, leafSort: 'name' },
]

export function peekPanelPackSeed(panelId: string): number {
  return panelPackSeedById.get(panelId) ?? 0
}

/** Advance and return the seed used for this click. */
export function takePanelPackSeed(panelId: string): number {
  const n = panelPackSeedById.get(panelId) ?? 0
  panelPackSeedById.set(panelId, n + 1)
  return n
}

/** Test helper: reset seed counter for a panel. */
export function resetPanelPackSeed(panelId?: string): void {
  if (panelId) panelPackSeedById.delete(panelId)
  else panelPackSeedById.clear()
}

/**
 * Move a layout panel and its member cards by (dx, dy). Nested child panels
 * whose members are a subset of the moved set also translate. Chrome is
 * rebuilt from member geometry after the move.
 */
export function translateLayoutPanelCluster(
  items: CanvasItem[],
  panels: LayoutPanel[],
  panelId: string,
  dx: number,
  dy: number,
  opts?: { grid?: number; panelPad?: number },
): { items: CanvasItem[]; panels: LayoutPanel[] } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { items, panels }
  }
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return { items, panels }
  }
  const panel = panels.find((p) => p.id === panelId)
  if (!panel?.memberIds?.length) return { items, panels }

  const rootIds = new Set(panel.memberIds)
  const related = panels.filter(
    (p) =>
      p.id === panelId ||
      (p.memberIds?.length && p.memberIds.every((id) => rootIds.has(id))),
  )
  const moveIds = new Set<string>()
  for (const p of related) {
    for (const id of p.memberIds ?? []) moveIds.add(id)
  }

  const nextItems = items.map((it) => {
    if (!moveIds.has(it.id) || it.locked) return it
    return {
      ...it,
      x: Math.round(it.x + dx),
      y: Math.round(it.y + dy),
    }
  })
  const byId = new Map(nextItems.map((i) => [i.id, i]))
  const grid = opts?.grid ?? ORGANIZE_GRID
  const pad = opts?.panelPad ?? 8

  const nextPanels = panels.map((p) => {
    if (!related.some((r) => r.id === p.id)) return p
    const members = (p.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => m != null && !m.hidden)
    if (members.length === 0) {
      return {
        ...p,
        x: Math.round(p.x + dx),
        y: Math.round(p.y + dy),
      }
    }
    return rebuildPanelChromeFromMembers(p, byId, {
      grid,
      panelPad: pad,
      allPanels: panels,
    })
  })

  return { items: nextItems, panels: nextPanels }
}

/**
 * Rebuild panel chrome from current member card geometry.
 * Title band matches exclusiveTitleBandPx / LayoutPanelsLayer.
 */
function rebuildPanelChromeFromMembers(
  p: LayoutPanel,
  byId: Map<string, CanvasItem>,
  opts: {
    grid: number
    panelPad: number
    allPanels?: LayoutPanel[]
    /** Force chrome shape for this rebuild (in-panel rect vs n-gon). */
    forceShape?: 'rect' | 'polygon'
  },
): LayoutPanel {
  const members = (p.memberIds ?? [])
    .map((id) => byId.get(id))
    .filter((m): m is CanvasItem => m != null && !m.hidden)
  if (members.length === 0) return p
  const all = opts.allPanels ?? [p]
  const titleBand = exclusiveTitleBandPx(p, all)
  const pad = Math.max(2, opts.panelPad)
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
    // Parent wrapping L2s: solid; leaf: n-gon card blocks
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

function cardSortKey(c: CanvasItem): string {
  return (c.title ?? c.latex ?? c.id).toLocaleLowerCase()
}

function sortCards(
  cards: CanvasItem[],
  sort: 'none' | 'name-asc' | 'name-desc',
  memberOrder?: string[],
): CanvasItem[] {
  if (sort === 'name-asc' || sort === 'name-desc') {
    const dir = sort === 'name-desc' ? -1 : 1
    return [...cards].sort((a, b) => {
      const ta = cardSortKey(a)
      const tb = cardSortKey(b)
      if (ta < tb) return -1 * dir
      if (ta > tb) return 1 * dir
      return a.id.localeCompare(b.id)
    })
  }
  // none: preserve panel memberIds order
  if (memberOrder?.length) {
    const rank = new Map(memberOrder.map((id, i) => [id, i]))
    return [...cards].sort(
      (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    )
  }
  return cards
}

type PackedCard = { id: string; x: number; y: number; w: number; h: number }
type PackResult = { out: PackedCard[]; width: number; height: number }

const PIXEL_PACK_ORDERS: PackOrderStrategy[] = [
  'height-desc',
  'area-desc',
  'width-desc',
  'perimeter-desc',
  'height-asc',
  'input',
  'input-rev',
  'area-asc',
]

function orderCardsForPack(
  cards: CanvasItem[],
  strategy: PackOrderStrategy,
): CanvasItem[] {
  const entries = cards.map((c, i) => ({
    c,
    i,
    area: c.width * c.height,
    peri: 2 * (c.width + c.height),
  }))
  switch (strategy) {
    case 'height-desc':
      entries.sort((a, b) => b.c.height - a.c.height || b.area - a.area || a.i - b.i)
      break
    case 'height-asc':
      entries.sort((a, b) => a.c.height - b.c.height || b.area - a.area || a.i - b.i)
      break
    case 'area-desc':
      entries.sort((a, b) => b.area - a.area || b.c.height - a.c.height || a.i - b.i)
      break
    case 'area-asc':
      entries.sort((a, b) => a.area - b.area || b.c.height - a.c.height || a.i - b.i)
      break
    case 'width-desc':
      entries.sort((a, b) => b.c.width - a.c.width || b.c.height - a.c.height || a.i - b.i)
      break
    case 'perimeter-desc':
      entries.sort((a, b) => b.peri - a.peri || b.area - a.area || a.i - b.i)
      break
    case 'input-rev':
      entries.reverse()
      break
    case 'input':
    default:
      break
  }
  return entries.map((e) => e.c)
}

/**
 * Pixel skyline pack — true stacking without cell-ceil waste.
 * Cell free-flow (ceil(w/grid)) reserved full cells for partial cards, so
 * short cards could not nest beside tall ones → "stacking not happening well".
 * Places at exact pixel sizes + exact gapPx; multi-order densest bbox.
 */
function packCardsPixelSkyline(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  boxW: number,
  gapPx: number,
  orderOpts?: {
    multiOrder?: boolean
    orders?: PackOrderStrategy[]
  },
): PackResult {
  if (cards.length === 0) return { out: [], width: 0, height: 0 }
  const gap = Math.max(0, Math.round(gapPx))
  const bandW = Math.max(48, Math.round(boxW))
  const strategies =
    orderOpts?.multiOrder === false
      ? (orderOpts.orders?.length ? orderOpts.orders : (['height-desc'] as PackOrderStrategy[]))
      : orderOpts?.orders?.length
        ? orderOpts.orders
        : PIXEL_PACK_ORDERS

  const filled = cards.reduce((s, c) => s + c.width * c.height, 0)
  let best: PackResult & { score: number } | null = null

  for (const strategy of strategies) {
    const ordered = orderCardsForPack(cards, strategy)
    const placed = placePixelSkylineOnce(ordered, ox, oy, bandW, gap)
    compactPixelPack(placed, ox, oy, bandW, gap)
    let maxX = ox
    let maxY = oy
    for (const p of placed) {
      maxX = Math.max(maxX, p.x + p.w)
      maxY = Math.max(maxY, p.y + p.h)
    }
    const width = Math.max(8, maxX - ox)
    const height = Math.max(8, maxY - oy)
    const score = packBBoxScore(
      Math.max(1, Math.ceil(width / 8)),
      Math.max(1, Math.ceil(height / 8)),
      Math.max(1, Math.ceil(filled / 64)),
    )
    if (!best || score < best.score) {
      best = { out: placed.map((p) => ({ ...p })), width, height, score }
    }
  }
  return best ?? { out: [], width: 0, height: 0 }
}

function placePixelSkylineOnce(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  boxW: number,
  gap: number,
): PackedCard[] {
  const placed: PackedCard[] = []
  const boxRight = ox + boxW

  const collides = (x: number, y: number, w: number, h: number) => {
    for (const p of placed) {
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

  const contact = (x: number, y: number, w: number, h: number) => {
    let c = 0
    for (const p of placed) {
      const yOl = Math.min(y + h, p.y + p.h) - Math.max(y, p.y)
      if (yOl > 0) {
        if (x + w + gap === p.x || p.x + p.w + gap === x) c += yOl
      }
      const xOl = Math.min(x + w, p.x + p.w) - Math.max(x, p.x)
      if (xOl > 0) {
        if (y + h + gap === p.y || p.y + p.h + gap === y) c += xOl
      }
    }
    if (x === ox) c += h * 0.25
    if (y === oy) c += w * 0.25
    return c
  }

  for (const card of cards) {
    const w = Math.max(24, Math.min(boxW, Math.round(card.width)))
    const h = Math.max(20, Math.round(card.height))
    // Candidate anchors: origin + right/bottom edges of placed (classic BL)
    const xCands = new Set<number>([ox])
    const yCands = new Set<number>([oy])
    for (const p of placed) {
      xCands.add(p.x)
      xCands.add(p.x + p.w + gap)
      yCands.add(p.y)
      yCands.add(p.y + p.h + gap)
    }
    let best: { x: number; y: number; score: number } | null = null
    const ys = [...yCands].filter((y) => y >= oy).sort((a, b) => a - b)
    const xs = [...xCands]
      .filter((x) => x >= ox && x + w <= boxRight + 0.5)
      .sort((a, b) => a - b)
    for (const y of ys) {
      for (const x of xs) {
        if (collides(x, y, w, h)) continue
        const bottom =
          Math.max(
            placed.reduce((m, p) => Math.max(m, p.y + p.h), oy),
            y + h,
          ) - oy
        const score = bottom * 1e9 + y * 1e5 + x * 10 - contact(x, y, w, h) * 50
        if (!best || score < best.score) best = { x, y, score }
      }
    }
    // Fallback: stack under current pile at left
    if (!best) {
      const y =
        placed.length === 0
          ? oy
          : Math.max(...placed.map((p) => p.y + p.h)) + gap
      best = { x: ox, y, score: y }
    }
    placed.push({
      id: card.id,
      x: Math.round(best.x),
      y: Math.round(best.y),
      w,
      h,
    })
  }
  return placed
}

/** Pull each card up then left while honoring gap (closes residual voids). */
function compactPixelPack(
  placed: PackedCard[],
  ox: number,
  oy: number,
  boxW: number,
  gap: number,
): void {
  const boxRight = ox + boxW
  const collides = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    for (const p of placed) {
      if (p.id === id) continue
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

  for (let sweep = 0; sweep < 10; sweep++) {
    let moved = false
    // Up first (bottom-most cards first)
    for (const p of [...placed].sort((a, b) => b.y - a.y || a.x - b.x)) {
      let lo = oy
      let hi = p.y
      let best = p.y
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (!collides(p.id, p.x, mid, p.w, p.h)) {
          best = mid
          hi = mid - 1
        } else lo = mid + 1
      }
      if (best < p.y) {
        p.y = best
        moved = true
      }
    }
    // Left (right-most first)
    for (const p of [...placed].sort((a, b) => b.x - a.x || a.y - b.y)) {
      let lo = ox
      let hi = p.x
      let best = p.x
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (
          mid + p.w <= boxRight + 0.5 &&
          !collides(p.id, mid, p.y, p.w, p.h)
        ) {
          best = mid
          hi = mid - 1
        } else lo = mid + 1
      }
      if (best < p.x) {
        p.x = best
        moved = true
      }
    }
    if (!moved) break
  }
}

/**
 * Pixel skyline for arbitrary rects (L2 chrome footprints).
 * Same engine as card packing so leaf frames stack without overlap.
 */
function packRectsPixelSkyline(
  rects: Array<{ id: string; w: number; h: number }>,
  ox: number,
  oy: number,
  boxW: number,
  gapPx: number,
  orderOpts?: { multiOrder?: boolean; orders?: PackOrderStrategy[] },
): PackResult {
  // Reuse card packer via synthetic CanvasItems
  const cards = rects.map((r, i) => ({
    id: r.id,
    type: 'equation' as const,
    x: 0,
    y: 0,
    width: Math.max(8, Math.round(r.w)),
    height: Math.max(8, Math.round(r.h)),
    zIndex: i,
    latex: r.id,
  }))
  return packCardsPixelSkyline(cards, ox, oy, boxW, gapPx, orderOpts)
}

/**
 * Pixel pack at several candidate widths; keep densest bbox.
 * Critical for L2 leaves under an L1: packing every leaf into the *full* L1
 * width made each leaf AABB full-width → only vertical stack → sparse L1.
 */
function packCardsDenseBestWidth(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  maxBoxW: number,
  gapPx: number,
  orderOpts?: {
    multiOrder?: boolean
    orders?: PackOrderStrategy[]
  },
): PackResult {
  if (cards.length === 0) return { out: [], width: 0, height: 0 }
  const maxCardW = Math.max(...cards.map((c) => c.width), 48)
  const area = cards.reduce((s, c) => s + c.width * c.height, 0)
  const candidates = Array.from(
    new Set(
      [
        maxBoxW,
        Math.ceil((maxBoxW * 3) / 4),
        Math.ceil((maxBoxW * 2) / 3),
        Math.ceil(maxBoxW / 2),
        Math.ceil(maxBoxW / 3),
        Math.min(maxBoxW, Math.max(maxCardW, Math.ceil(Math.sqrt(area * 1.25)))),
        Math.min(maxBoxW, maxCardW + 8),
      ]
        .map((w) => Math.max(maxCardW, Math.min(maxBoxW, w)))
        .filter((w) => w >= 24),
    ),
  ).sort((a, b) => b - a)

  const filled = area
  let best: PackResult & { score: number } | null = null
  for (const boxW of candidates) {
    const packed = packCardsPixelSkyline(cards, ox, oy, boxW, gapPx, orderOpts)
    const score = packBBoxScore(
      Math.max(1, Math.ceil(packed.width / 8)),
      Math.max(1, Math.ceil(packed.height / 8)),
      Math.max(1, Math.ceil(filled / 64)),
    )
    if (!best || score < best.score) best = { ...packed, score }
  }
  return (
    best ?? packCardsPixelSkyline(cards, ox, oy, maxBoxW, gapPx, orderOpts)
  )
}

function sortLeafPanels(
  leaves: LayoutPanel[],
  members: CanvasItem[],
  mode: 'name' | 'height' | 'area' | 'input' | 'input-rev',
  nameDir: 1 | -1,
): LayoutPanel[] {
  const withStats = leaves.map((p) => {
    const cards = members.filter((m) => p.memberIds?.includes(m.id))
    const h =
      cards.length > 0
        ? Math.max(...cards.map((c) => c.height))
        : 0
    const area = cards.reduce((s, c) => s + c.width * c.height, 0)
    const minY =
      cards.length > 0 ? Math.min(...cards.map((c) => c.y)) : 0
    const minX =
      cards.length > 0 ? Math.min(...cards.map((c) => c.x)) : 0
    return { p, h, area, minY, minX, title: (p.title ?? p.id).toLocaleLowerCase() }
  })
  switch (mode) {
    case 'height':
      withStats.sort((a, b) => b.h - a.h || a.title.localeCompare(b.title))
      break
    case 'area':
      withStats.sort((a, b) => b.area - a.area || a.title.localeCompare(b.title))
      break
    case 'input':
      withStats.sort((a, b) => a.minY - b.minY || a.minX - b.minX)
      break
    case 'input-rev':
      withStats.sort((a, b) => b.minY - a.minY || b.minX - a.minX)
      break
    case 'name':
    default:
      withStats.sort((a, b) => {
        if (a.title < b.title) return -1 * nameDir
        if (a.title > b.title) return 1 * nameDir
        return a.p.id.localeCompare(b.p.id)
      })
      break
  }
  return withStats.map((x) => x.p)
}

/**
 * Re-pack cards inside one panel (shelf within panel content box).
 * Used when user sets contentSort or after showTitle changes title band.
 *
 * Default sort is Name A→Z. Dense mode free-flows cards (and nested L2 leaf
 * clusters) so mixed diagram sizes fill voids instead of row-shelf gaps.
 */
export function relayoutPanelContents(
  items: CanvasItem[],
  panel: LayoutPanel,
  opts?: {
    grid?: number
    gapPx?: number
    panelPad?: number
    /**
     * shelf = keep sizes, row pack.
     * dense = free-flow tetris at full card size (never shrinks cards).
     */
    mode?: 'shelf' | 'dense'
    /** Full layout panel list — nested children are rebuilt in place. */
    allPanels?: LayoutPanel[]
    /**
     * Packing seed index. When omitted in dense mode, uses densest multi-order
     * (seed 0 = sheet match). Pass a number only for variety tests.
     */
    packSeed?: number
    /**
     * Chrome shape for this panel (+ nested children). Defaults to panel.shape.
     */
    panelShape?: 'rect' | 'polygon'
    /** Card-to-card gap (px). Default 4. */
    blockGapPx?: number
    /** L2 sibling panel gap (px). Default 4. */
    l2PanelGapPx?: number
    /** Folder tree — enables sheet densifyPlacedGroups / repackLeafInteriors. */
    folders?: FolderRef[]
    /**
     * Printable content right edge (px). Dense mode may grow panel width up to
     * this (matches sheet pack band). Default: keep original panel right.
     */
    contentRight?: number
  },
): { items: CanvasItem[]; panel: LayoutPanel; panels?: LayoutPanel[] } {
  const ids = new Set(panel.memberIds ?? [])
  if (ids.size === 0) return { items, panel }

  const gap = Math.max(0, opts?.gapPx ?? 6)
  const blockGapPx = Math.max(0, opts?.blockGapPx ?? 4)
  const l2PanelGapPx = Math.max(0, opts?.l2PanelGapPx ?? gap)
  const pad = Math.max(2, opts?.panelPad ?? 4)
  const grid = opts?.grid ?? ORGANIZE_GRID
  const dense = opts?.mode === 'dense'
  // Default: Name A→Z for shelf mode; dense free-flow matches sheet multi-order
  const sort = panel.contentSort ?? 'name-asc'
  // Shape only affects chrome (rect AABB vs n-gon stepped) — packing is shared
  const chromeShape = opts?.panelShape ?? panel.shape ?? 'rect'
  // Dense default: always densest multi-order (seed 0). Optional packSeed for tests.
  const packSeed = opts?.packSeed ?? 0
  const seedCfg = SHEET_MATCH_SEEDS[packSeed % SHEET_MATCH_SEEDS.length]!
  const folders = opts?.folders ?? []

  const allPanels = opts?.allPanels ?? []
  const hasNestedStroke = allPanels.some(
    (c) =>
      c.id !== panel.id &&
      c.showStroke !== false &&
      (c.hierarchyLevel ?? 1) > (panel.hierarchyLevel ?? 1) &&
      c.memberIds?.length &&
      panel.memberIds?.length &&
      c.memberIds.every((id) => panel.memberIds!.includes(id)),
  )
  const level = panel.hierarchyLevel ?? 1
  const titleBand =
    panel.showTitle === false
      ? 0
      : level <= 1
        ? hasNestedStroke
          ? L1_NESTED_TITLE_BAND_PX
          : L1_TITLE_BAND_PX
        : NESTED_TITLE_BAND_PX

  let members = items.filter((i) => ids.has(i.id) && !i.hidden)
  members = sortCards(members, sort, panel.memberIds)
  if (members.length === 0) return { items, panel }

  // Pack inside the *incoming* panel box. pinW/pinH are locked as the
  // horizontal (and vertical) budget for this click — never shrink the root
  // frame on rebuild (repeated clicks were walking the right edge left:
  // pack → shrink-wrap to content → narrower pack next time).
  const pinX = panel.x
  const pinY = panel.y
  const pinW = Math.max(48, panel.width)
  const pinH = Math.max(48, panel.height)
  const contentX = pinX + pad
  const contentY = pinY + pad + titleBand
  const packLimitRight = pinX + pinW - pad
  // Available content width = panel interior only (not max(card) which can
  // inflate the pack band beyond the panel, then shrink-wrap fights it).
  const contentW = Math.max(48, packLimitRight - contentX)

  type Place = { id: string; x: number; y: number; w: number; h: number }
  let places: Place[] = []

  // Nested L2/L3 under this panel — pack by group so children stay clustered
  const nestedChildren = allPanels
    .filter(
      (p) =>
        p.id !== panel.id &&
        p.memberIds?.length &&
        p.memberIds.every((id) => ids.has(id)) &&
        (p.hierarchyLevel ?? 1) > (panel.hierarchyLevel ?? 1),
    )
    .sort((a, b) => (b.hierarchyLevel ?? 1) - (a.hierarchyLevel ?? 1))

  // Deepest nested panels only (leaves)
  const leafNested = nestedChildren.filter((p) => {
    const deeper = nestedChildren.some(
      (o) =>
        o.id !== p.id &&
        (o.hierarchyLevel ?? 1) > (p.hierarchyLevel ?? 1) &&
        o.memberIds?.every((id) => p.memberIds?.includes(id)),
    )
    return !deeper
  })

  // Leaf order varies by packing seed (and user name sort when seed uses name)
  const nameDir: 1 | -1 = sort === 'name-desc' ? -1 : 1
  const orderedLeaves = sortLeafPanels(
    leafNested,
    members,
    seedCfg.leafSort,
    nameDir,
  )

  // Dense mode: same refinePlacedCards brain as full-sheet auto-layout
  // (densify / repackLeaf / repackGroupsInParents / block gaps), scoped to
  // this panel. Custom pixel/rigid packers repeatedly failed on stack/overlap.
  if (dense) {
    return relayoutPanelDenseSheetParity({
      items,
      panel,
      members,
      memberIds: ids,
      folders,
      allPanels,
      pinX,
      pinY,
      pinW,
      pinH,
      contentX,
      contentY,
      packLimitRight,
      contentW,
      pad,
      grid,
      blockGapPx,
      l2PanelGapPx,
      l1GapPx: gap,
      chromeShape,
      titleBand,
      orderedLeaves,
      level,
      hasNestedStroke,
    })
  }

  const packShelfInBox = (
    group: CanvasItem[],
    ox: number,
    oy: number,
    boxW: number,
  ): { out: Place[]; width: number; height: number } => {
    const out: Place[] = []
    let x = ox
    let y = oy
    let rowH = 0
    let maxX = ox
    for (const m of group) {
      const w = m.width
      const h = m.height
      if (x > ox && x + w > ox + boxW) {
        x = ox
        y += rowH + gap
        rowH = 0
      }
      const ww = Math.min(w, boxW)
      out.push({ id: m.id, x: Math.round(x), y: Math.round(y), w: ww, h })
      x += ww + gap
      rowH = Math.max(rowH, h)
      maxX = Math.max(maxX, Math.round(x - gap))
    }
    const bottom = out.reduce((b, p) => Math.max(b, p.y + p.h), oy)
    return {
      out,
      width: Math.max(8, maxX - ox),
      height: Math.max(8, bottom - oy),
    }
  }

  // ── Dense pack: pixel skyline (true stacking) ─────────────────────────
  // Cell free-flow wasted up to almost one grid cell per card edge so short
  // cards could not nest beside tall ones. Pixel skyline stacks with exact
  // blockGap and multi-order densest placement.
  const packBoxW = Math.max(48, contentW)
  const orderOpts = {
    multiOrder: true as const,
    orders: seedCfg.orders,
  }
  void hasNestedStroke

  if (dense && orderedLeaves.length >= 1) {
    // Hierarchical L1⊃L2: pack cards inside each leaf, then pack *chrome
    // footprints* (title + pad) so L2 frames never overlap (screenshot
    // 120437: Molecular Biology over Biochemistry when only content AABBs
    // were packed flush).
    type LeafPack = {
      places: Place[]
      /** Chrome footprint width/height used for inter-leaf packing */
      footW: number
      footH: number
      memberIds: string[]
    }
    const leaves: LeafPack[] = []
    const claimed = new Set<string>()
    const titlePx = NESTED_TITLE_BAND_PX
    // Max content width inside an L2 chrome: panel band minus L2 side pads
    const leafContentMaxW = Math.max(48, packBoxW - pad * 2)

    for (const child of orderedLeaves) {
      const group = sortCards(
        members.filter((m) => child.memberIds?.includes(m.id)),
        sort,
        child.memberIds,
      )
      if (group.length === 0) continue
      for (const m of group) claimed.add(m.id)
      const local = packCardsDenseBestWidth(
        group,
        0,
        0,
        leafContentMaxW,
        blockGapPx,
        orderOpts,
      )
      // Cards relative to chrome top-left: inset by pad, below title band
      leaves.push({
        places: local.out.map((p) => ({
          ...p,
          x: p.x + pad,
          y: p.y + titlePx + pad,
        })),
        footW: local.width + pad * 2,
        footH: local.height + titlePx + pad * 2,
        memberIds: group.map((m) => m.id),
      })
    }
    const rest = sortCards(
      members.filter((m) => !claimed.has(m.id)),
      sort,
      panel.memberIds,
    )
    if (rest.length > 0) {
      const local = packCardsDenseBestWidth(
        rest,
        0,
        0,
        leafContentMaxW,
        blockGapPx,
        orderOpts,
      )
      leaves.push({
        places: local.out.map((p) => ({
          ...p,
          x: p.x + pad,
          y: p.y + pad,
        })),
        footW: local.width + pad * 2,
        footH: local.height + pad * 2,
        memberIds: rest.map((m) => m.id),
      })
    }
    if (leaves.length > 0) {
      // Pixel pack leaf chrome footprints with L2 gap (not cell packClusterTight)
      const leafGap = Math.max(0, l2PanelGapPx)
      const footRects = leaves.map((L, i) => ({
        id: `leaf-${i}`,
        w: L.footW,
        h: L.footH,
      }))
      const footPack = packRectsPixelSkyline(
        footRects,
        0,
        0,
        packBoxW,
        leafGap,
        { multiOrder: true },
      )
      const footById = new Map(footPack.out.map((p) => [p.id, p]))
      const abs: Place[] = []
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i]!
        const fp = footById.get(`leaf-${i}`)
        const baseX = contentX + (fp?.x ?? 0)
        const baseY = contentY + (fp?.y ?? 0)
        for (const pl of leaf.places) {
          abs.push({
            id: pl.id,
            x: Math.round(baseX + pl.x),
            y: Math.round(baseY + pl.y),
            w: pl.w,
            h: pl.h,
          })
        }
      }
      places = abs
    }
  } else if (dense) {
    // Flat leaf: pixel skyline across full panel content width + block gap
    const packed = packCardsPixelSkyline(
      members,
      contentX,
      contentY,
      packBoxW,
      blockGapPx,
      orderOpts,
    )
    places = packed.out
  } else {
    places = packShelfInBox(members, contentX, contentY, contentW).out
  }

  const byPlace = new Map(places.map((p) => [p.id, p]))
  let nextItems = items.map((it) => {
    const p = byPlace.get(it.id)
    if (!p) return it
    return { ...it, x: p.x, y: p.y }
  })

  const memberSet = new Set(panel.memberIds ?? [])
  const contentLeft = contentX
  const contentRightLimit = packLimitRight

  // Soft clamp into band
  nextItems = nextItems.map((it) => {
    if (!memberSet.has(it.id) || it.hidden) return it
    let x = it.x
    let y = it.y
    if (x < contentLeft) x = contentLeft
    if (y < contentY) y = contentY
    if (
      x + it.width > contentRightLimit &&
      it.width <= contentRightLimit - contentLeft
    ) {
      x = Math.max(contentLeft, contentRightLimit - it.width)
    }
    return { ...it, x: Math.round(x), y: Math.round(y) }
  })

  // Build leaf member groups once (L2 clusters or whole panel)
  const leafGroups: string[][] = []
  if (orderedLeaves.length > 0) {
    for (const leaf of orderedLeaves) {
      if (leaf.memberIds?.length) leafGroups.push([...leaf.memberIds])
    }
  } else {
    leafGroups.push([...ids])
  }

  // Block gap inside each leaf (per-leaf top floor — never pull to L1 top)
  if (dense) {
    for (const leafIds of leafGroups) {
      if (leafIds.length < 2) continue
      const groupYs = nextItems
        .filter((i) => leafIds.includes(i.id) && !i.hidden)
        .map((i) => i.y)
      const leafTop =
        groupYs.length > 0
          ? Math.max(contentY, Math.min(...groupYs))
          : contentY
      nextItems = separateNeighborsByGap(nextItems, leafIds, blockGapPx, {
        left: contentLeft,
        right: contentRightLimit,
        top: leafTop,
      })
    }
  }

  // Hierarchical: separate + gravity-compact L2 clusters as rigid bodies.
  // Hard right wall = panel content edge. Prefer side-by-side when it fits
  // (fill horizontal budget); only stack when it does not (screenshot 125333:
  // preferVertical-first left a huge empty right interior).
  if (dense && orderedLeaves.length >= 2) {
    nextItems = resolveRigidLeafClusters(nextItems, leafGroups, {
      contentLeft,
      contentTop: contentY,
      contentRight: contentRightLimit,
      pad,
      titlePx: NESTED_TITLE_BAND_PX,
      gapPx: Math.max(0, l2PanelGapPx),
      preferVertical: false,
    })
  }

  // Hard clamp cards into the original panel content band (no right overflow)
  nextItems = clampMembersToBand(nextItems, memberSet, {
    left: contentLeft,
    right: contentRightLimit,
    top: contentY,
  })

  const moved = nextItems.filter((i) => ids.has(i.id) && !i.hidden)
  if (moved.length === 0) return { items: nextItems, panel }

  // Pin content under fixed chrome origin (translate only — keeps density)
  {
    const minMemX = Math.min(...moved.map((m) => m.x))
    const minMemY = Math.min(...moved.map((m) => m.y))
    const dx = Math.round(contentX - minMemX)
    const dy = Math.round(contentY - minMemY)
    if (dx !== 0 || dy !== 0) {
      nextItems = nextItems.map((it) =>
        memberSet.has(it.id)
          ? { ...it, x: Math.round(it.x + dx), y: Math.round(it.y + dy) }
          : it,
      )
    }
  }
  nextItems = clampMembersToBand(nextItems, memberSet, {
    left: contentLeft,
    right: contentRightLimit,
    top: contentY,
  })

  // Compact again after pin — fill voids, stay in-band
  if (dense && orderedLeaves.length >= 2) {
    nextItems = resolveRigidLeafClusters(nextItems, leafGroups, {
      contentLeft,
      contentTop: contentY,
      contentRight: contentRightLimit,
      pad,
      titlePx: NESTED_TITLE_BAND_PX,
      gapPx: Math.max(0, l2PanelGapPx),
      preferVertical: false,
    })
    nextItems = clampMembersToBand(nextItems, memberSet, {
      left: contentLeft,
      right: contentRightLimit,
      top: contentY,
    })
  }

  const forceShape = chromeShape
  const chromeOpts = {
    grid,
    panelPad: pad,
    allPanels,
    forceShape: forceShape as 'rect' | 'polygon',
  }
  const panelWithSort: LayoutPanel = {
    ...panel,
    contentSort: panel.contentSort ?? 'name-asc',
    shape: forceShape,
  }

  const nestedIds = new Set<string>()
  for (const p of allPanels) {
    if (p.id === panel.id) continue
    if (!p.memberIds?.length) continue
    if (p.memberIds.every((id) => ids.has(id))) nestedIds.add(p.id)
  }
  const nestedSorted = allPanels
    .filter((p) => nestedIds.has(p.id))
    .sort((a, b) => (b.hierarchyLevel ?? 1) - (a.hierarchyLevel ?? 1))

  const rebuildAll = (itemsNow: CanvasItem[]): LayoutPanel[] => {
    const byIdNow = new Map(itemsNow.map((i) => [i.id, i]))
    const rebuilt = new Map<string, LayoutPanel>()
    for (const child of nestedSorted) {
      rebuilt.set(
        child.id,
        rebuildPanelChromeFromMembers(child, byIdNow, {
          ...chromeOpts,
          allPanels: allPanels.map((p) => rebuilt.get(p.id) ?? p),
        }),
      )
    }
    const kids = nestedSorted
      .map((c) => rebuilt.get(c.id)!)
      .filter(Boolean)
    const parent =
      kids.length > 0
        ? rebuildPanelChromeFromMembers(panelWithSort, byIdNow, {
            ...chromeOpts,
            allPanels: [panelWithSort, ...kids],
          })
        : rebuildPanelChromeFromMembers(panelWithSort, byIdNow, chromeOpts)
    // Hug packed content from pinned origin. Width floors at the *pack band*
    // used this click (pinW) only when content nearly fills it — otherwise
    // shrink-wrap so we don't leave a huge empty right (screenshot 125333).
    // Next click re-measures from this chrome, so packing can reflow into the
    // true used width without a one-way right-edge walk.
    const memNow = itemsNow.filter(
      (i) => memberSet.has(i.id) && !i.hidden,
    )
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
    // Pack budget is pinW (hard max). Hug content when it does not fill the
    // band; keep pinW when content nearly spans it (stable re-clicks).
    const fillRatio = needW / Math.max(1, pinW)
    const lockedW =
      fillRatio >= 0.85 ? pinW : Math.min(pinW, Math.max(needW, parent.width))
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
    return allPanels.map((p) => rebuilt.get(p.id) ?? p)
  }

  const lockRootFrame = (p: LayoutPanel): LayoutPanel => {
    // Never exceed the pack budget to the right; never walk origin.
    // Allow shrink-wrap below pinW when content is clearly narrower (empty
    // right interior); never grow past pinW (horizontal overflow).
    const w = Math.min(pinW, Math.max(48, p.width))
    const h = Math.max(pinH, p.height)
    const runs =
      p.runs?.length && (p.shape !== 'polygon' || nestedIds.size > 0)
        ? [{ x: pinX, y: pinY, width: w, height: h }]
        : p.runs
    return {
      ...p,
      x: pinX,
      y: pinY,
      width: w,
      height: h,
      ...(runs ? { runs } : {}),
    }
  }

  let panelsOut = allPanels.length
    ? rebuildAll(nextItems)
    : [
        lockRootFrame(
          rebuildPanelChromeFromMembers(
            panelWithSort,
            new Map(nextItems.map((i) => [i.id, i])),
            chromeOpts,
          ),
        ),
      ]

  // Title clearance + L2 sibling separation via frame geometry
  const scopePanelIds = new Set<string>([panel.id, ...nestedIds])
  // Pack/enforce band = original panel content width (hard right wall)
  const fixed = enforcePanelLayoutInvariants(nextItems, panelsOut, {
    grid,
    panelPad: pad,
    minGapPx: Math.max(0, l2PanelGapPx),
    l1GapPx: Math.max(0, gap),
    l2GapPx: Math.max(0, l2PanelGapPx),
    contentLeft,
    contentRight: packLimitRight,
    contentTop: pinY,
    scopePanelIds,
  })
  nextItems = clampMembersToBand(fixed.items, memberSet, {
    left: contentLeft,
    right: packLimitRight,
    top: contentY,
  })

  // Final rigid cluster resolve — fill horizontal budget, hard right wall
  if (dense && orderedLeaves.length >= 2) {
    nextItems = resolveRigidLeafClusters(nextItems, leafGroups, {
      contentLeft,
      contentTop: contentY,
      contentRight: packLimitRight,
      pad,
      titlePx: NESTED_TITLE_BAND_PX,
      gapPx: Math.max(0, l2PanelGapPx),
      preferVertical: false,
    })
    nextItems = clampMembersToBand(nextItems, memberSet, {
      left: contentLeft,
      right: packLimitRight,
      top: contentY,
    })
  }

  // Re-pin top-left of whole cluster to content origin
  {
    const mem = nextItems.filter((i) => memberSet.has(i.id) && !i.hidden)
    if (mem.length > 0) {
      const minMemX = Math.min(...mem.map((m) => m.x))
      const minMemY = Math.min(...mem.map((m) => m.y))
      const dx = Math.round(contentX - minMemX)
      const dy = Math.round(contentY - minMemY)
      if (dx !== 0 || dy !== 0) {
        nextItems = nextItems.map((it) =>
          memberSet.has(it.id)
            ? { ...it, x: Math.round(it.x + dx), y: Math.round(it.y + dy) }
            : it,
        )
      }
    }
  }

  // Block gaps one last time (per-leaf floor)
  if (dense) {
    for (const leafIds of leafGroups) {
      if (leafIds.length < 2) continue
      const groupYs = nextItems
        .filter((i) => leafIds.includes(i.id) && !i.hidden)
        .map((i) => i.y)
      const leafTop =
        groupYs.length > 0
          ? Math.max(contentY, Math.min(...groupYs))
          : contentY
      nextItems = separateNeighborsByGap(nextItems, leafIds, blockGapPx, {
        left: contentLeft,
        right: contentRightLimit,
        top: leafTop,
      })
    }
  }

  panelsOut = allPanels.length
    ? rebuildAll(nextItems)
    : [
        lockRootFrame(
          rebuildPanelChromeFromMembers(
            panelWithSort,
            new Map(nextItems.map((i) => [i.id, i])),
            chromeOpts,
          ),
        ),
      ]

  // Final hard lock: origin + never-shrink width/height
  panelsOut = panelsOut.map((p) =>
    p.id === panel.id ? lockRootFrame(p) : p,
  )

  return {
    items: nextItems,
    panel: panelsOut.find((p) => p.id === panel.id) ?? panelWithSort,
    panels: panelsOut,
  }
}

/**
 * Treat each leaf's cards as a rigid body. Separate chrome footprints
 * (content AABB + title + pad) so frames never overlap, then gravity-compact
 * up/left to fill skyline voids (screenshot 122251 empty pocket).
 */
function clampMembersToBand(
  items: CanvasItem[],
  memberSet: Set<string>,
  band: { left: number; right: number; top: number },
): CanvasItem[] {
  return items.map((it) => {
    if (!memberSet.has(it.id) || it.hidden) return it
    let x = it.x
    let y = it.y
    if (x < band.left) x = band.left
    if (y < band.top) y = band.top
    if (it.width <= band.right - band.left) {
      if (x + it.width > band.right) x = Math.max(band.left, band.right - it.width)
    } else {
      x = band.left
    }
    return { ...it, x: Math.round(x), y: Math.round(y) }
  })
}

function resolveRigidLeafClusters(
  items: CanvasItem[],
  groups: string[][],
  opts: {
    contentLeft: number
    contentTop: number
    contentRight: number
    pad: number
    titlePx: number
    gapPx: number
    /** Prefer stacking below over expanding right (default true). */
    preferVertical?: boolean
  },
): CanvasItem[] {
  if (groups.length < 2) return items
  const gap = Math.max(0, opts.gapPx)
  const pad = Math.max(0, opts.pad)
  const titlePx = Math.max(0, opts.titlePx)
  const preferVertical = opts.preferVertical !== false
  const next = items.map((i) => ({ ...i }))

  type Cluster = {
    ids: string[]
    // chrome footprint
    fx: number
    fy: number
    fw: number
    fh: number
  }

  const build = (): Cluster[] => {
    const list: Cluster[] = []
    for (const ids of groups) {
      const mem = next.filter((i) => ids.includes(i.id) && !i.hidden)
      if (mem.length === 0) continue
      const minX = Math.min(...mem.map((m) => m.x))
      const minY = Math.min(...mem.map((m) => m.y))
      const maxX = Math.max(...mem.map((m) => m.x + m.width))
      const maxY = Math.max(...mem.map((m) => m.y + m.height))
      // Match rebuildPanelChromeFromMembers: pad around cards + title above
      list.push({
        ids: mem.map((m) => m.id),
        fx: minX - pad,
        fy: minY - titlePx - pad,
        fw: maxX - minX + pad * 2,
        fh: maxY - minY + titlePx + pad * 2,
      })
    }
    return list
  }

  const shiftCluster = (c: Cluster, dx: number, dy: number) => {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    for (const id of c.ids) {
      const bi = next.findIndex((x) => x.id === id)
      if (bi >= 0) {
        next[bi] = {
          ...next[bi]!,
          x: Math.round(next[bi]!.x + dx),
          y: Math.round(next[bi]!.y + dy),
        }
      }
    }
  }

  // ── A: separate chrome footprints (no overlap + min stroke gap) ──
  for (let pass = 0; pass < 16; pass++) {
    const clusters = build().sort(
      (a, b) => a.fy - b.fy || a.fx - b.fx || a.ids[0]!.localeCompare(b.ids[0]!),
    )
    let any = false
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i]!
        const b = clusters[j]!
        const xOl =
          Math.min(a.fx + a.fw, b.fx + b.fw) - Math.max(a.fx, b.fx)
        const yOl =
          Math.min(a.fy + a.fh, b.fy + b.fh) - Math.max(a.fy, b.fy)
        const xGap = Math.max(
          0,
          Math.max(a.fx - (b.fx + b.fw), b.fx - (a.fx + a.fw)),
        )
        const yGap = Math.max(
          0,
          Math.max(a.fy - (b.fy + b.fh), b.fy - (a.fy + a.fh)),
        )
        const tooCloseH = yOl > 1 && xGap < gap
        const tooCloseV = xOl > 1 && yGap < gap
        const hit = xOl > 0.5 && yOl > 0.5
        if (!(hit || tooCloseH || tooCloseV)) continue

        const stackBelow = () => {
          const top = a.fy <= b.fy ? a : b
          const bot = a.fy <= b.fy ? b : a
          const need = top.fy + top.fh + gap - bot.fy
          if (need > 0.5) {
            shiftCluster(bot, 0, Math.ceil(need))
            return true
          }
          return false
        }
        const pushRight = () => {
          const left = a.fx <= b.fx ? a : b
          const right = a.fx <= b.fx ? b : a
          const need = left.fx + left.fw + gap - right.fx
          if (need <= 0.5) return false
          // Only push right if the whole chrome footprint still fits in band
          const nx = right.fx + need
          if (nx + right.fw > opts.contentRight + 0.5) return false
          shiftCluster(right, Math.ceil(need), 0)
          return true
        }

        // Horizontal-first when it fits in-band (fill width); else stack.
        // preferVertical forces stack-first (rarely needed).
        if (preferVertical) {
          if (tooCloseV || hit || tooCloseH) {
            if (stackBelow() || pushRight()) any = true
          }
        } else {
          if (tooCloseH || (hit && yOl > xOl)) {
            if (pushRight() || stackBelow()) any = true
          } else if (tooCloseV || hit) {
            if (stackBelow() || pushRight()) any = true
          }
        }
      }
    }
    if (!any) break
  }

  // ── B: gravity compact — pull each cluster up then left into voids ──
  const clusterCollides = (
    c: Cluster,
    fx: number,
    fy: number,
    others: Cluster[],
  ) => {
    const probe = { ...c, fx, fy }
    for (const o of others) {
      if (o.ids[0] === c.ids[0]) continue
      const xOl =
        Math.min(probe.fx + probe.fw, o.fx + o.fw) - Math.max(probe.fx, o.fx)
      const yOl =
        Math.min(probe.fy + probe.fh, o.fy + o.fh) - Math.max(probe.fy, o.fy)
      // Hard overlap
      if (xOl > 0.5 && yOl > 0.5) return true
      // Side-by-side too close
      if (yOl > 1) {
        const xG = Math.max(
          0,
          Math.max(probe.fx - (o.fx + o.fw), o.fx - (probe.fx + probe.fw)),
        )
        if (xG < gap) return true
      }
      // Stacked too close
      if (xOl > 1) {
        const yG = Math.max(
          0,
          Math.max(probe.fy - (o.fy + o.fh), o.fy - (probe.fy + probe.fh)),
        )
        if (yG < gap) return true
      }
    }
    return false
  }

  for (let sweep = 0; sweep < 12; sweep++) {
    let any = false
    let clusters = build()
    // Up (bottom-most first)
    clusters = clusters.sort((a, b) => b.fy - a.fy || a.fx - b.fx)
    for (const c of clusters) {
      const others = build()
      let lo = opts.contentTop
      let hi = c.fy
      let best = c.fy
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (!clusterCollides(c, c.fx, mid, others)) {
          best = mid
          hi = mid - 1
        } else lo = mid + 1
      }
      const dy = best - c.fy
      if (dy < -0.5) {
        shiftCluster(c, 0, dy)
        any = true
      }
    }
    // Left (right-most first)
    clusters = build().sort((a, b) => b.fx - a.fx || a.fy - b.fy)
    for (const c of clusters) {
      const others = build()
      let lo = opts.contentLeft
      let hi = c.fx
      let best = c.fx
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (
          mid + c.fw <= opts.contentRight + 0.5 &&
          !clusterCollides(c, mid, c.fy, others)
        ) {
          best = mid
          hi = mid - 1
        } else lo = mid + 1
      }
      const dx = best - c.fx
      if (dx < -0.5) {
        shiftCluster(c, dx, 0)
        any = true
      }
    }
    if (!any) break
  }

  return next
}

/**
 * Open exact minGap between neighbors, then compact left/up so free-flow cell
 * snap air collapses. Keeps skyline topology; does not shelf-rebuild.
 */
function separateNeighborsByGap(
  items: CanvasItem[],
  memberIds: string[],
  minGapPx: number,
  band: { left: number; right: number; top: number },
): CanvasItem[] {
  const minGap = Math.max(0, minGapPx)
  const idSet = new Set(memberIds)
  const next = items.map((i) => ({ ...i }))

  const live = () =>
    next
      .filter((i) => idSet.has(i.id) && !i.hidden)
      .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))

  const setPos = (id: string, x: number, y: number) => {
    const bi = next.findIndex((t) => t.id === id)
    if (bi >= 0) next[bi] = { ...next[bi]!, x: Math.round(x), y: Math.round(y) }
  }

  // Soft left/top
  for (const it of live()) {
    let x = it.x
    let y = it.y
    if (x < band.left) x = band.left
    if (y < band.top) y = band.top
    if (x !== it.x || y !== it.y) setPos(it.id, x, y)
  }

  // ── Open gaps that are too tight ──
  for (let pass = 0; pass < 12; pass++) {
    const list = live()
    let any = false
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = next.find((x) => x.id === list[i]!.id)!
        const B = next.find((x) => x.id === list[j]!.id)!
        const yOverlap =
          Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y)
        const xOverlap =
          Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x)
        const xGap = Math.max(
          0,
          Math.max(A.x - (B.x + B.width), B.x - (A.x + A.width)),
        )
        const yGap = Math.max(
          0,
          Math.max(A.y - (B.y + B.height), B.y - (A.y + A.height)),
        )

        if (yOverlap > 4 && xGap < minGap) {
          const left = A.x <= B.x ? A : B
          const rightC = A.x <= B.x ? B : A
          const need = left.x + left.width + minGap - rightC.x
          if (need > 0.5) {
            const nx = Math.round(rightC.x + need)
            if (nx + rightC.width <= band.right + 0.5) {
              setPos(rightC.id, nx, rightC.y)
              any = true
            } else {
              setPos(
                rightC.id,
                Math.max(
                  band.left,
                  Math.min(left.x, band.right - rightC.width),
                ),
                left.y + left.height + minGap,
              )
              any = true
            }
            continue
          }
        }

        if (xOverlap > 4 && yGap < minGap) {
          const top = A.y <= B.y ? A : B
          const bot = A.y <= B.y ? B : A
          const needY = top.y + top.height + minGap - bot.y
          if (needY > 0.5) {
            setPos(bot.id, bot.x, bot.y + needY)
            any = true
          }
          continue
        }

        if (xOverlap > 0.5 && yOverlap > 0.5) {
          const top = A.y <= B.y ? A : B
          const bot = A.y <= B.y ? B : A
          const needY = top.y + top.height + minGap - bot.y
          if (needY > 0.5) {
            setPos(bot.id, bot.x, bot.y + Math.max(needY, minGap))
            any = true
          }
        }
      }
    }
    if (!any) break
  }

  // ── Compact left then up (close free-flow cell voids, keep minGap) ──
  const collides = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): boolean => {
    for (const o of live()) {
      if (o.id === id) continue
      const xOl = Math.min(x + w, o.x + o.width) - Math.max(x, o.x)
      const yOl = Math.min(y + h, o.y + o.height) - Math.max(y, o.y)
      if (xOl > 0.5 && yOl > 0.5) return true
      // too-close horizontal neighbor
      if (yOl > 4) {
        const gap = Math.max(0, Math.max(x - (o.x + o.width), o.x - (x + w)))
        if (gap < minGap - 0.5) return true
      }
      // too-close vertical neighbor
      if (xOl > 4) {
        const gap = Math.max(0, Math.max(y - (o.y + o.height), o.y - (y + h)))
        if (gap < minGap - 0.5) return true
      }
    }
    return false
  }

  for (let pass = 0; pass < 8; pass++) {
    let any = false
    // Pull left (rightmost first so they slide toward left neighbors)
    for (const c of [...live()].sort((a, b) => b.x - a.x || a.y - b.y)) {
      let lo = band.left
      let hi = c.x
      let best = c.x
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (!collides(c.id, mid, c.y, c.width, c.height)) {
          best = mid
          hi = mid - 1
        } else {
          lo = mid + 1
        }
      }
      if (best < c.x - 0.5) {
        setPos(c.id, best, c.y)
        any = true
      }
    }
    // Pull up (bottom-most first)
    for (const c of [...live()].sort((a, b) => b.y - a.y || a.x - b.x)) {
      let lo = band.top
      let hi = c.y
      let best = c.y
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (!collides(c.id, c.x, mid, c.width, c.height)) {
          best = mid
          hi = mid - 1
        } else {
          lo = mid + 1
        }
      }
      if (best < c.y - 0.5) {
        setPos(c.id, c.x, best)
        any = true
      }
    }
    if (!any) break
  }

  return next.map((it) => {
    if (!idSet.has(it.id) || it.hidden) return it
    let x = it.x
    let y = it.y
    if (x < band.left) x = band.left
    if (y < band.top) y = band.top
    if (x + it.width > band.right && it.width <= band.right - band.left) {
      x = Math.max(band.left, band.right - it.width)
    }
    return { ...it, x: Math.round(x), y: Math.round(y) }
  })
}

/**
 * Push leaf card-clusters apart so content AABBs honor minGap (for L2 frame air).
 */
function separateLeafClusterAabbs(
  items: CanvasItem[],
  groups: string[][],
  minGapPx: number,
  contentRight: number,
): CanvasItem[] {
  if (groups.length < 2 || minGapPx < 0) return items
  const next = items.map((i) => ({ ...i }))
  const byId = () => new Map(next.map((i) => [i.id, i]))

  type Box = {
    ids: string[]
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  const boxes = (): Box[] => {
    const map = byId()
    return groups
      .map((ids) => {
        const mem = ids
          .map((id) => map.get(id))
          .filter((m): m is CanvasItem => m != null && !m.hidden)
        if (mem.length === 0) return null
        return {
          ids,
          minX: Math.min(...mem.map((m) => m.x)),
          minY: Math.min(...mem.map((m) => m.y)),
          maxX: Math.max(...mem.map((m) => m.x + m.width)),
          maxY: Math.max(...mem.map((m) => m.y + m.height)),
        }
      })
      .filter(Boolean) as Box[]
  }

  for (let pass = 0; pass < 6; pass++) {
    const list = boxes().sort((a, b) => a.minY - b.minY || a.minX - b.minX)
    let any = false
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!
        const b = list[j]!
        const xOl = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
        const yOl = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
        const xGap = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX))
        const yGap = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY))
        // Prefer vertical separation when x-overlap
        if (xOl > 4 && yGap < minGapPx) {
          const top = a.minY <= b.minY ? a : b
          const bot = a.minY <= b.minY ? b : a
          const need = top.maxY + minGapPx - bot.minY
          if (need > 0.5) {
            const dy = Math.ceil(need)
            for (const id of bot.ids) {
              const idx = next.findIndex((x) => x.id === id)
              if (idx >= 0) next[idx] = { ...next[idx]!, y: next[idx]!.y + dy }
            }
            any = true
            continue
          }
        }
        if (yOl > 4 && xGap < minGapPx) {
          const left = a.minX <= b.minX ? a : b
          const right = a.minX <= b.minX ? b : a
          const need = left.maxX + minGapPx - right.minX
          if (need > 0.5) {
            let dx = Math.ceil(need)
            const maxDx = Math.max(0, contentRight - right.maxX)
            dx = Math.min(dx, Math.floor(maxDx))
            if (dx > 0) {
              for (const id of right.ids) {
                const idx = next.findIndex((x) => x.id === id)
                if (idx >= 0)
                  next[idx] = { ...next[idx]!, x: next[idx]!.x + dx }
              }
              any = true
            }
          }
        }
      }
    }
    if (!any) break
  }
  return next
}
