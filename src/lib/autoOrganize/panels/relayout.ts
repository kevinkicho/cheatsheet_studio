import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { chromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'
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

/** Packing seeds: order strategy + optional column width fraction. */
const IN_PANEL_PACK_SEEDS: Array<{
  orders?: PackOrderStrategy[]
  multiOrder: boolean
  /** Fraction of content width for free-flow columns (1 = full). */
  widthFrac: number
  leafSort: 'name' | 'height' | 'area' | 'input' | 'input-rev'
}> = [
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
  },
): LayoutPanel {
  const members = (p.memberIds ?? [])
    .map((id) => byId.get(id))
    .filter((m): m is CanvasItem => m != null && !m.hidden)
  if (members.length === 0) return p
  const all = opts.allPanels ?? [p]
  const titleBand = exclusiveTitleBandPx(p, all)
  const pad = Math.max(2, opts.panelPad)
  const useNgon = p.shape === 'polygon'
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
    shape: p.shape,
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
  const pageCols = Math.max(1, Math.floor(boxW / g))
  const regions = cards.map((m, i) => {
    const w = Math.max(24, Math.round(m.width))
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
    const x = Math.round(ox + p.c * g)
    const y = Math.round(oy + p.r * g)
    const ww = Math.min(r.w, boxW)
    out.push({ id: r.id, x, y, w: ww, h: r.h })
    maxX = Math.max(maxX, x + ww)
    maxY = Math.max(maxY, y + r.h)
  }
  return {
    out,
    width: Math.max(8, maxX - ox),
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
  },
): { items: CanvasItem[]; panel: LayoutPanel; panels?: LayoutPanel[] } {
  const ids = new Set(panel.memberIds ?? [])
  if (ids.size === 0) return { items, panel }

  const gap = Math.max(2, opts?.gapPx ?? 6)
  const pad = Math.max(2, opts?.panelPad ?? 4)
  const grid = opts?.grid ?? ORGANIZE_GRID
  const dense = opts?.mode === 'dense'
  // Default: Name A→Z (user preference for Auto-layout inside panel)
  const sort = panel.contentSort ?? 'name-asc'
  const packSeed =
    opts?.packSeed ??
    (dense ? takePanelPackSeed(panel.id) : 0)
  const seedCfg =
    IN_PANEL_PACK_SEEDS[packSeed % IN_PANEL_PACK_SEEDS.length]!

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

  const gapCells = Math.max(0, Math.floor(gap / grid))
  // Between leaf L2 slabs: pad + nested title so chrome doesn't collide
  const leafGapCells = Math.max(
    gapCells,
    Math.ceil((pad * 2 + NESTED_TITLE_BAND_PX) / grid),
  )
  const packBoxW = Math.max(
    48,
    Math.round(contentW * Math.min(1, Math.max(0.5, seedCfg.widthFrac))),
  )
  const orderOpts = {
    multiOrder: seedCfg.multiOrder,
    orders: seedCfg.orders,
  }

  if (dense && orderedLeaves.length >= 1) {
    // Free-flow each leaf at full card size, then packClusterTight leaf boxes.
    // Panel chrome grows to fit — never scale cards down (that compounded
    // on every Auto-layout click).
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
        gapCells,
        orderOpts,
      )
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
        gapCells,
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
    // Flat dense free-flow at full size + seed order
    const packed = packCardsDenseFreeFlow(
      members,
      contentX,
      contentY,
      packBoxW,
      grid,
      gapCells,
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
  const chromeOpts = { grid, panelPad: pad, allPanels }

  // Ensure default contentSort is persisted on the panel when missing
  const panelWithSort: LayoutPanel = {
    ...panel,
    contentSort: panel.contentSort ?? 'name-asc',
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

  // Expand parent so it covers nested L2 frames after they moved
  const afterChildren = rebuildPanelChromeFromMembers(
    nextPanel,
    byId,
    {
      ...chromeOpts,
      allPanels: allPanels.map((p) => rebuilt.get(p.id) ?? p),
    },
  )
  if (nestedSorted.length > 0) {
    const childBoxes = nestedSorted
      .map((c) => rebuilt.get(c.id)!)
      .filter((c) => c.showStroke !== false)
    if (childBoxes.length > 0) {
      const inset = Math.max(2, pad)
      const minX = Math.min(
        afterChildren.x,
        ...childBoxes.map((c) => c.x - inset),
      )
      const minY = Math.min(
        afterChildren.y,
        ...childBoxes.map((c) => c.y - inset),
      )
      const maxX = Math.max(
        afterChildren.x + afterChildren.width,
        ...childBoxes.map((c) => c.x + c.width + inset),
      )
      const maxY = Math.max(
        afterChildren.y + afterChildren.height,
        ...childBoxes.map((c) => c.y + c.height + inset),
      )
      const x = Math.round(minX)
      const y = Math.round(minY)
      const width = Math.max(8, Math.round(maxX - x))
      const height = Math.max(8, Math.round(maxY - y))
      rebuilt.set(panel.id, {
        ...afterChildren,
        x,
        y,
        width,
        height,
        runs: [{ x, y, width, height }],
        outlinePath: rectPerimeterPathD(x, y, width, height),
        shape: afterChildren.shape === 'polygon' ? 'polygon' : 'rect',
      })
    } else {
      rebuilt.set(panel.id, afterChildren)
    }
  }

  let panelsOut = allPanels.map((p) => rebuilt.get(p.id) ?? p)

  // Pin the edited panel's top edge so packing doesn't walk the cluster down
  // the page (title-clearance + rebuild used to nudge y every click).
  const pinY = panel.y
  const pinX = panel.x
  const rootAfter = rebuilt.get(panel.id) ?? nextPanel
  const dyPin = Math.round(rootAfter.y - pinY)
  const dxPin = Math.round(rootAfter.x - pinX)
  if (dyPin !== 0 || dxPin !== 0) {
    const moveIds = new Set(panel.memberIds ?? [])
    nextItems = nextItems.map((it) => {
      if (!moveIds.has(it.id)) return it
      return {
        ...it,
        x: Math.round(it.x - dxPin),
        y: Math.round(it.y - dyPin),
      }
    })
    const byIdPin = new Map(nextItems.map((i) => [i.id, i]))
    for (const id of [panel.id, ...nestedIds]) {
      const prev = rebuilt.get(id)
      if (!prev) continue
      rebuilt.set(
        id,
        rebuildPanelChromeFromMembers(prev, byIdPin, {
          ...chromeOpts,
          allPanels: allPanels.map((p) => rebuilt.get(p.id) ?? p),
        }),
      )
    }
    // Re-expand parent after pin
    if (nestedSorted.length > 0) {
      const childBoxes = nestedSorted
        .map((c) => rebuilt.get(c.id)!)
        .filter((c) => c && c.showStroke !== false)
      const parent = rebuildPanelChromeFromMembers(
        panelWithSort,
        byIdPin,
        chromeOpts,
      )
      if (childBoxes.length > 0) {
        const inset = Math.max(2, pad)
        const minX = Math.min(parent.x, ...childBoxes.map((c) => c.x - inset))
        const minY = Math.min(parent.y, ...childBoxes.map((c) => c.y - inset))
        const maxX = Math.max(
          parent.x + parent.width,
          ...childBoxes.map((c) => c.x + c.width + inset),
        )
        const maxY = Math.max(
          parent.y + parent.height,
          ...childBoxes.map((c) => c.y + c.height + inset),
        )
        const x = Math.round(minX)
        const y = Math.round(minY)
        const width = Math.max(8, Math.round(maxX - x))
        const height = Math.max(8, Math.round(maxY - y))
        rebuilt.set(panel.id, {
          ...parent,
          x,
          y,
          width,
          height,
          runs: [{ x, y, width, height }],
          outlinePath: rectPerimeterPathD(x, y, width, height),
          shape: parent.shape === 'polygon' ? 'polygon' : 'rect',
        })
      } else {
        rebuilt.set(panel.id, parent)
      }
    }
    panelsOut = allPanels.map((p) => rebuilt.get(p.id) ?? p)
  }

  // Enforce only inside the edited cluster — full-sheet sibling separation
  // was pushing neighboring panels downward after every in-panel pack.
  const scopePanelIds = new Set<string>([panel.id, ...nestedIds])
  const fixed = enforcePanelLayoutInvariants(nextItems, panelsOut, {
    grid,
    panelPad: pad,
    minGapPx: 2,
    scopePanelIds,
    rootPanelId: panel.id,
  })
  panelsOut = fixed.panels

  // Re-pin top after enforce (title clearance may have nudged y again)
  const rootFinal = panelsOut.find((p) => p.id === panel.id)
  if (rootFinal && Math.abs(rootFinal.y - pinY) > 0.5) {
    const dy2 = Math.round(rootFinal.y - pinY)
    const memberSet = new Set(panel.memberIds ?? [])
    const pinnedItems = fixed.items.map((it) =>
      memberSet.has(it.id) ? { ...it, y: Math.round(it.y - dy2) } : it,
    )
    const byId2 = new Map(pinnedItems.map((i) => [i.id, i]))
    const pinnedPanels = panelsOut.map((p) => {
      if (!scopePanelIds.has(p.id)) return p
      return rebuildPanelChromeFromMembers(p, byId2, {
        ...chromeOpts,
        allPanels: panelsOut,
      })
    })
    return {
      items: pinnedItems,
      panel: pinnedPanels.find((p) => p.id === panel.id) ?? rootFinal,
      panels: pinnedPanels,
    }
  }

  return {
    items: fixed.items,
    panel: panelsOut.find((p) => p.id === panel.id) ?? nextPanel,
    panels: panelsOut,
  }
}
