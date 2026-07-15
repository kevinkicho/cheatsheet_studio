import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { chromeFromMembers } from '../polyomino'
import { enforcePanelLayoutInvariants } from '../densify'
import {
  placeTopicRegionsDense,
  packClusterTight,
  type PackOrderStrategy,
} from '../shelf'
import {
  exclusiveTitleBandPx,
  NESTED_TITLE_BAND_PX,
  L1_TITLE_BAND_PX,
  L1_NESTED_TITLE_BAND_PX,
} from './hierarchy'

/** Per-panel click counter so each Auto-layout inside panel tries a new seed. */
const panelPackSeedById = new Map<string, number>()

type InPanelSeed = {
  orders?: PackOrderStrategy[]
  multiOrder: boolean
  /** Fraction of content width for free-flow columns (1 = full). */
  widthFrac: number
  leafSort: 'name' | 'height' | 'area' | 'input' | 'input-rev'
}

/** Rectangular tetris seeds — may vary column width for different mosaics. */
const RECT_PACK_SEEDS: InPanelSeed[] = [
  { multiOrder: true, widthFrac: 1, leafSort: 'name' },
  { multiOrder: true, orders: ['height-desc'], widthFrac: 1, leafSort: 'height' },
  { multiOrder: true, orders: ['area-desc'], widthFrac: 1, leafSort: 'area' },
  { multiOrder: true, orders: ['width-desc'], widthFrac: 1, leafSort: 'name' },
  { multiOrder: true, orders: ['perimeter-desc'], widthFrac: 0.85, leafSort: 'height' },
  { multiOrder: true, orders: ['input'], widthFrac: 1, leafSort: 'input' },
  { multiOrder: true, orders: ['input-rev'], widthFrac: 1, leafSort: 'input-rev' },
  { multiOrder: true, orders: ['height-asc'], widthFrac: 0.75, leafSort: 'area' },
  { multiOrder: true, orders: ['area-asc'], widthFrac: 0.9, leafSort: 'name' },
  { multiOrder: true, widthFrac: 0.66, leafSort: 'height' },
]

/**
 * N-gon hard-tetris seeds — match full-sheet polygon pack: multi-order dense
 * free-flow, full width, 0–1 cell gaps (never sparse widthFrac shrinks).
 */
const NGON_PACK_SEEDS: InPanelSeed[] = [
  { multiOrder: true, widthFrac: 1, leafSort: 'height' },
  { multiOrder: true, widthFrac: 1, leafSort: 'area' },
  { multiOrder: true, widthFrac: 1, leafSort: 'name' },
  { multiOrder: true, orders: ['height-desc'], widthFrac: 1, leafSort: 'height' },
  { multiOrder: true, orders: ['area-desc'], widthFrac: 1, leafSort: 'area' },
  { multiOrder: true, orders: ['width-desc'], widthFrac: 1, leafSort: 'height' },
  { multiOrder: true, orders: ['perimeter-desc'], widthFrac: 1, leafSort: 'area' },
  { multiOrder: true, orders: ['input'], widthFrac: 1, leafSort: 'input' },
  { multiOrder: true, orders: ['height-asc'], widthFrac: 1, leafSort: 'name' },
  { multiOrder: true, orders: ['area-asc'], widthFrac: 1, leafSort: 'height' },
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
  const chrome = chromeFromMembers(members, {
    pad,
    titleBand,
    shape: useNgon ? 'polygon' : 'rect',
    grid: opts.grid,
    solidMode: useNgon ? 'blocks' : 'solid-aabb',
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

/**
 * Free-flow (skyline) pack of cards into a content box on the organize grid.
 * Always keeps original card sizes — never shrinks (repeated Auto-layout
 * clicks used to compound scale-down).
 */
function packCardsDenseFreeFlow(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  boxW: number,
  grid: number,
  gapCells: number,
  orderOpts?: {
    multiOrder?: boolean
    orders?: PackOrderStrategy[]
  },
): { out: Array<{ id: string; x: number; y: number; w: number; h: number }>; width: number; height: number } {
  if (cards.length === 0) {
    return { out: [], width: 0, height: 0 }
  }
  const g = Math.max(4, grid)
  const boxRight = ox + boxW
  // Pixel budget for columns — never place past boxRight
  const pageCols = Math.max(1, Math.floor(boxW / g))
  const regions = cards.map((m, i) => {
    // Clamp card width to box so cw never implies a right edge past boxW
    const w = Math.max(24, Math.min(boxW, Math.round(m.width)))
    const h = Math.max(20, Math.round(m.height))
    return {
      index: i,
      cw: Math.min(pageCols, Math.max(1, Math.ceil(w / g))),
      ch: Math.max(1, Math.ceil(h / g)),
      w,
      h,
      id: m.id,
    }
  })
  const pos = placeTopicRegionsDense(
    regions.map((r) => ({ index: r.index, cw: r.cw, ch: r.ch })),
    pageCols,
    Math.max(0, gapCells),
    {
      multiOrder: orderOpts?.multiOrder !== false,
      orders: orderOpts?.orders,
      readingFlow: false,
    },
  )
  const out: Array<{ id: string; x: number; y: number; w: number; h: number }> =
    []
  let maxX = ox
  let maxY = oy
  for (const r of regions) {
    const p = pos.get(r.index) ?? { c: 0, r: 0 }
    let x = Math.round(ox + p.c * g)
    const y = Math.round(oy + p.r * g)
    const ww = r.w
    // Hard clamp into [ox, boxRight] — cell snap + full pixel width used to
    // spill past the panel (right overflow on each Auto-layout click).
    if (x + ww > boxRight) x = Math.round(boxRight - ww)
    if (x < ox) x = ox
    out.push({ id: r.id, x, y, w: ww, h: r.h })
    maxX = Math.max(maxX, x + ww)
    maxY = Math.max(maxY, y + r.h)
  }
  return {
    out,
    width: Math.max(8, Math.min(boxW, maxX - ox)),
    height: Math.max(8, maxY - oy),
  }
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
     * Packing seed index. When omitted in dense mode, advances a per-panel
     * counter so each Auto-layout click tries a different arrangement.
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
  // Default: Name A→Z (user preference for Auto-layout inside panel)
  const sort = panel.contentSort ?? 'name-asc'
  // N-gon = denser multi-order seeds; both shapes honor gap knobs
  const chromeShape = opts?.panelShape ?? panel.shape ?? 'rect'
  const hardTetris = chromeShape === 'polygon'
  const packSeed =
    opts?.packSeed ??
    (dense ? takePanelPackSeed(panel.id) : 0)
  const seedTable = hardTetris ? NGON_PACK_SEEDS : RECT_PACK_SEEDS
  const seedCfg = seedTable[packSeed % seedTable.length]!

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

  // Target content box from current panel (dense: use panel as budget)
  const contentX = panel.x + pad
  const contentY = panel.y + pad + titleBand
  const contentW = Math.max(
    48,
    panel.width - pad * 2,
    ...members.map((m) => m.width),
  )
  const contentH = Math.max(48, panel.height - pad * 2 - titleBand)
  void contentH

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

  const pxToCells = (px: number) => {
    if (px <= 0) return 0
    if (px < grid / 2) return 0
    return Math.max(1, Math.ceil(px / grid))
  }
  // Card free-flow gap from blockGap (rect + n-gon both honor this)
  const cardGapCells = pxToCells(blockGapPx)
  // L2 sibling frames: user l2 gap + pad floor + title band when nested stroke
  const leafGapCells = hasNestedStroke
    ? Math.max(
        0,
        pxToCells(l2PanelGapPx + pad * 2 + NESTED_TITLE_BAND_PX),
      )
    : pxToCells(l2PanelGapPx)
  // N-gon prefers full width seeds; rect may try narrower mosaics
  const packBoxW = hardTetris
    ? contentW
    : Math.max(
        48,
        Math.round(contentW * Math.min(1, Math.max(0.5, seedCfg.widthFrac))),
      )
  const orderOpts = {
    multiOrder: seedCfg.multiOrder,
    orders: seedCfg.orders,
  }

  if (dense && orderedLeaves.length >= 1) {
    // Hierarchical: free-flow cards inside each leaf (hard tetris gaps for n-gon),
    // then packClusterTight leaf boxes — mirrors sheet hierarchical n-gon pack.
    type LeafPack = {
      places: Place[]
      cw: number
      ch: number
      w: number
      h: number
    }
    const leaves: LeafPack[] = []
    const claimed = new Set<string>()
    for (const child of orderedLeaves) {
      const group = sortCards(
        members.filter((m) => child.memberIds?.includes(m.id)),
        sort,
        child.memberIds,
      )
      if (group.length === 0) continue
      for (const m of group) claimed.add(m.id)
      const local = packCardsDenseFreeFlow(
        group,
        0,
        0,
        packBoxW,
        grid,
        cardGapCells,
        orderOpts,
      )
      // Nested L2 title band (n-gon chrome hugs cards + this strip)
      const titlePx = NESTED_TITLE_BAND_PX
      const w = local.width
      const h = local.height + titlePx
      leaves.push({
        places: local.out.map((p) => ({
          ...p,
          y: p.y + titlePx,
        })),
        w,
        h,
        cw: Math.max(1, Math.ceil(w / grid)),
        ch: Math.max(1, Math.ceil(h / grid)),
      })
    }
    const rest = sortCards(
      members.filter((m) => !claimed.has(m.id)),
      sort,
      panel.memberIds,
    )
    if (rest.length > 0) {
      const local = packCardsDenseFreeFlow(
        rest,
        0,
        0,
        packBoxW,
        grid,
        cardGapCells,
        orderOpts,
      )
      leaves.push({
        places: local.out,
        w: local.width,
        h: local.height,
        cw: Math.max(1, Math.ceil(local.width / grid)),
        ch: Math.max(1, Math.ceil(local.height / grid)),
      })
    }
    if (leaves.length > 0) {
      const pageCols = Math.max(1, Math.floor(contentW / grid))
      const tight = packClusterTight(
        leaves.map((L, i) => ({
          index: i,
          cw: Math.min(pageCols, L.cw),
          ch: L.ch,
        })),
        pageCols,
        leafGapCells,
      )
      const abs: Place[] = []
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i]!
        const p = tight.pos.get(i) ?? { c: 0, r: 0 }
        const baseX = contentX + p.c * grid
        const baseY = contentY + p.r * grid
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
    // Flat dense free-flow — n-gon uses hard multi-order tetris at full width
    const packed = packCardsDenseFreeFlow(
      members,
      contentX,
      contentY,
      packBoxW,
      grid,
      cardGapCells,
      orderOpts,
    )
    places = packed.out
  } else {
    // Simple shelf (keep sizes) — contentSort path
    places = packShelfInBox(members, contentX, contentY, contentW).out
  }

  const byPlace = new Map(places.map((p) => [p.id, p]))
  // Dense: move only — never rewrite card width/height (avoids shrink spiral)
  let nextItems = items.map((it) => {
    const p = byPlace.get(it.id)
    if (!p) return it
    return {
      ...it,
      x: p.x,
      y: p.y,
    }
  })

  const moved = nextItems.filter((i) => ids.has(i.id) && !i.hidden)
  if (moved.length === 0) return { items: nextItems, panel }

  const byId = new Map(nextItems.map((i) => [i.id, i]))
  const forceShape = chromeShape
  const chromeOpts = {
    grid,
    panelPad: pad,
    allPanels,
    forceShape: forceShape as 'rect' | 'polygon',
  }

  // Ensure default contentSort is persisted; apply chosen chrome shape
  const panelWithSort: LayoutPanel = {
    ...panel,
    contentSort: panel.contentSort ?? 'name-asc',
    shape: forceShape,
  }

  const nextPanel = rebuildPanelChromeFromMembers(
    panelWithSort,
    byId,
    chromeOpts,
  )

  if (!allPanels.length) {
    return { items: nextItems, panel: nextPanel }
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

  const rebuilt = new Map<string, LayoutPanel>()
  rebuilt.set(panel.id, nextPanel)
  for (const child of nestedSorted) {
    rebuilt.set(
      child.id,
      rebuildPanelChromeFromMembers(child, byId, {
        ...chromeOpts,
        allPanels: allPanels.map((p) => rebuilt.get(p.id) ?? p),
      }),
    )
  }

  /**
   * Rebuild parent chrome from children.
   * N-gon: union of child frames as blocks (stepped L) — not a solid AABB
   * (that wiped n-gon and looked like rectangle packing).
   * Rect: solid AABB hug of children.
   */
  const rebuildParentFromChildren = (
    itemsNow: CanvasItem[],
    childPanels: LayoutPanel[],
  ): LayoutPanel => {
    const byIdNow = new Map(itemsNow.map((i) => [i.id, i]))
    const members = (panel.memberIds ?? [])
      .map((id) => byIdNow.get(id))
      .filter((m): m is CanvasItem => m != null && !m.hidden)
    if (members.length === 0) return panelWithSort
    const titleBand = exclusiveTitleBandPx(panelWithSort, [
      panelWithSort,
      ...childPanels,
    ])
    const strokedKids = childPanels.filter((c) => c.showStroke !== false)
    if (forceShape === 'polygon' && strokedKids.length > 0) {
      const chrome = chromeFromMembers(members, {
        pad,
        titleBand,
        shape: 'polygon',
        grid,
        solidMode: 'blocks',
        blocks: strokedKids.map((c) => ({
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
        })),
      })
      return {
        ...panelWithSort,
        ...chrome,
        shape: 'polygon',
        showStroke: panelWithSort.showStroke,
        id: panelWithSort.id,
        folderId: panelWithSort.folderId,
        title: panelWithSort.title,
        showTitle: panelWithSort.showTitle,
        contentSort: panelWithSort.contentSort,
        memberIds: panelWithSort.memberIds,
        accent: panelWithSort.accent,
        zIndex: panelWithSort.zIndex,
        hierarchyLevel: panelWithSort.hierarchyLevel,
      }
    }
    // Rect (or no stroked kids): solid AABB around members + pad/title
    return rebuildPanelChromeFromMembers(panelWithSort, byIdNow, {
      ...chromeOpts,
      allPanels: [panelWithSort, ...childPanels],
    })
  }

  if (nestedSorted.length > 0) {
    const kids = nestedSorted
      .map((c) => rebuilt.get(c.id)!)
      .filter(Boolean)
    rebuilt.set(panel.id, rebuildParentFromChildren(nextItems, kids))
  }

  // ── Clamp members into original panel content box (no right overflow) ──
  // Pack band is [pinX+pad, pinX+origW-pad]. Grow height only, never width.
  const pinX = panel.x
  const pinY = panel.y
  const pinW = panel.width
  const contentLeft = pinX + pad
  const contentRight = pinX + pinW - pad
  const memberSet = new Set(panel.memberIds ?? [])
  nextItems = nextItems.map((it) => {
    if (!memberSet.has(it.id) || it.hidden) return it
    let x = it.x
    let y = it.y
    const w = it.width
    if (x + w > contentRight) x = contentRight - w
    if (x < contentLeft) x = contentLeft
    return { ...it, x: Math.round(x), y: Math.round(y) }
  })
  {
    const byIdClamp = new Map(nextItems.map((i) => [i.id, i]))
    for (const id of nestedIds) {
      const prev = rebuilt.get(id)
      if (!prev) continue
      rebuilt.set(
        id,
        rebuildPanelChromeFromMembers(prev, byIdClamp, {
          ...chromeOpts,
          allPanels: allPanels.map((p) => rebuilt.get(p.id) ?? p),
        }),
      )
    }
    if (nestedSorted.length > 0) {
      const kids = nestedSorted
        .map((c) => rebuilt.get(c.id)!)
        .filter(Boolean)
      rebuilt.set(panel.id, rebuildParentFromChildren(nextItems, kids))
    } else {
      rebuilt.set(
        panel.id,
        rebuildPanelChromeFromMembers(panelWithSort, byIdClamp, chromeOpts),
      )
    }
  }

  let panelsOut = allPanels.map((p) => rebuilt.get(p.id) ?? p)

  // ── Pin origin once: shift cluster so root top-left stays at (pinX, pinY)
  const pinCluster = (
    itemsIn: CanvasItem[],
    panelsIn: LayoutPanel[],
  ): { items: CanvasItem[]; panels: LayoutPanel[] } => {
    const root = panelsIn.find((p) => p.id === panel.id)
    if (!root) return { items: itemsIn, panels: panelsIn }
    const dx = Math.round(pinX - root.x)
    const dy = Math.round(pinY - root.y)
    if (dx === 0 && dy === 0) return { items: itemsIn, panels: panelsIn }
    const moved = itemsIn.map((it) => {
      if (!memberSet.has(it.id)) return it
      return { ...it, x: Math.round(it.x + dx), y: Math.round(it.y + dy) }
    })
    // Also clamp after pin so we don't slide past right when correcting left
    const clamped = moved.map((it) => {
      if (!memberSet.has(it.id) || it.hidden) return it
      let x = it.x
      if (x + it.width > contentRight) x = contentRight - it.width
      if (x < contentLeft) x = contentLeft
      return { ...it, x: Math.round(x) }
    })
    const byIdP = new Map(clamped.map((i) => [i.id, i]))
    const nextP = panelsIn.map((p) => {
      if (p.id !== panel.id && !nestedIds.has(p.id)) return p
      return rebuildPanelChromeFromMembers(p, byIdP, {
        ...chromeOpts,
        allPanels: panelsIn,
      })
    })
    // Parent from children again after pin
    if (nestedIds.size > 0) {
      const kids = nextP.filter((p) => nestedIds.has(p.id))
      const parent = rebuildParentFromChildren(clamped, kids)
      return {
        items: clamped,
        panels: nextP.map((p) => (p.id === panel.id ? parent : p)),
      }
    }
    return { items: clamped, panels: nextP }
  }

  {
    const pinned = pinCluster(nextItems, panelsOut)
    nextItems = pinned.items
    panelsOut = pinned.panels
  }

  // Enforce only inside the edited cluster
  const scopePanelIds = new Set<string>([panel.id, ...nestedIds])
  const fixed = enforcePanelLayoutInvariants(nextItems, panelsOut, {
    grid,
    panelPad: pad,
    minGapPx: 2,
    contentLeft,
    contentRight,
    scopePanelIds,
    rootPanelId: panel.id,
  })

  // Final pin + clamp (enforce title-clear may shift y; never walk right)
  const after = pinCluster(fixed.items, fixed.panels)
  return {
    items: after.items,
    panel: after.panels.find((p) => p.id === panel.id) ?? nextPanel,
    panels: after.panels,
  }
}
