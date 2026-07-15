import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { chromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'
import { enforcePanelLayoutInvariants } from '../densify'
import { placeTopicRegionsDense, packClusterTight } from '../shelf'
import {
  exclusiveTitleBandPx,
  NESTED_TITLE_BAND_PX,
  L1_TITLE_BAND_PX,
  L1_NESTED_TITLE_BAND_PX,
} from './hierarchy'

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
 * Much denser than simple L→R shelf for mixed-size diagram cards.
 */
function packCardsDenseFreeFlow(
  cards: CanvasItem[],
  ox: number,
  oy: number,
  boxW: number,
  scale: number,
  grid: number,
  gapCells: number,
): { out: Array<{ id: string; x: number; y: number; w: number; h: number }>; width: number; height: number } {
  if (cards.length === 0) {
    return { out: [], width: 0, height: 0 }
  }
  const g = Math.max(4, grid)
  const pageCols = Math.max(1, Math.floor(boxW / g))
  const regions = cards.map((m, i) => {
    const w = Math.max(24, Math.round(m.width * scale))
    const h = Math.max(20, Math.round(m.height * scale))
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
    { sortByHeight: true, readingFlow: false },
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
    /** shelf = keep sizes; dense = pack + optional scale-to-fit + rebuild chrome */
    mode?: 'shelf' | 'dense'
    /** Full layout panel list — nested children are rebuilt in place. */
    allPanels?: LayoutPanel[]
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

  // Order leaf groups for packing: name-asc/desc by panel title, else by
  // current top-left of members (reading order).
  const orderedLeaves = [...leafNested].sort((a, b) => {
    if (sort === 'name-asc' || sort === 'name-desc') {
      const dir = sort === 'name-desc' ? -1 : 1
      const ta = (a.title ?? a.id).toLocaleLowerCase()
      const tb = (b.title ?? b.id).toLocaleLowerCase()
      if (ta < tb) return -1 * dir
      if (ta > tb) return 1 * dir
      return a.id.localeCompare(b.id)
    }
    const aCards = members.filter((m) => a.memberIds?.includes(m.id))
    const bCards = members.filter((m) => b.memberIds?.includes(m.id))
    const ay = aCards.length ? Math.min(...aCards.map((c) => c.y)) : 0
    const by = bCards.length ? Math.min(...bCards.map((c) => c.y)) : 0
    const ax = aCards.length ? Math.min(...aCards.map((c) => c.x)) : 0
    const bx = bCards.length ? Math.min(...bCards.map((c) => c.x)) : 0
    return ay - by || ax - bx
  })

  const packShelfInBox = (
    group: CanvasItem[],
    ox: number,
    oy: number,
    boxW: number,
    scale: number,
    keepSize: boolean,
  ): { out: Place[]; width: number; height: number } => {
    const out: Place[] = []
    let x = ox
    let y = oy
    let rowH = 0
    let maxX = ox
    for (const m of group) {
      const w = keepSize
        ? m.width
        : Math.max(24, Math.round(m.width * scale))
      const h = keepSize
        ? m.height
        : Math.max(20, Math.round(m.height * scale))
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
  // Extra cells reserved above each leaf's cards for L2 title chip
  const leafTitleCells = Math.max(1, Math.ceil(NESTED_TITLE_BAND_PX / grid))

  if (dense && orderedLeaves.length >= 1) {
    // 1) Free-flow pack cards inside each leaf L2/L3
    // 2) packClusterTight those leaf boxes inside the parent content band
    const packAllLeaves = (s: number): { out: Place[]; height: number } => {
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
          contentW,
          s,
          grid,
          gapCells,
        )
        // Reserve title band above cards (chrome will draw chip here)
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
          contentW,
          s,
          grid,
          gapCells,
        )
        leaves.push({
          places: local.out,
          w: local.width,
          h: local.height,
          cw: Math.max(1, Math.ceil(local.width / grid)),
          ch: Math.max(1, Math.ceil(local.height / grid)),
        })
      }
      if (leaves.length === 0) return { out: [], height: 0 }

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
      const height =
        abs.reduce((b, p) => Math.max(b, p.y + p.h), contentY) - contentY
      return { out: abs, height }
    }
    let scale = 1
    let best = packAllLeaves(1)
    while (best.height > contentH + 2 && scale > 0.55) {
      scale *= 0.9
      best = packAllLeaves(scale)
    }
    places = best.out
    void leafTitleCells
  } else if (dense) {
    // Flat dense free-flow (no nested children)
    const packOnce = (scale: number) => {
      const packed = packCardsDenseFreeFlow(
        members,
        contentX,
        contentY,
        contentW,
        scale,
        grid,
        gapCells,
      )
      return { out: packed.out, height: packed.height }
    }
    let scale = 1
    let best = packOnce(1)
    while (best.height > contentH + 2 && scale > 0.55) {
      scale *= 0.9
      best = packOnce(scale)
    }
    places = best.out
  } else {
    // Simple shelf (keep sizes) — contentSort path
    places = packShelfInBox(
      members,
      contentX,
      contentY,
      contentW,
      1,
      true,
    ).out
  }

  const byPlace = new Map(places.map((p) => [p.id, p]))
  const nextItems = items.map((it) => {
    const p = byPlace.get(it.id)
    if (!p) return it
    return {
      ...it,
      x: p.x,
      y: p.y,
      width: dense ? p.w : it.width,
      height: dense ? p.h : it.height,
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
  const fixed = enforcePanelLayoutInvariants(nextItems, panelsOut, {
    grid,
    panelPad: pad,
    minGapPx: Math.max(2, gap),
  })
  panelsOut = fixed.panels
  return {
    items: fixed.items,
    panel: panelsOut.find((p) => p.id === panel.id) ?? nextPanel,
    panels: panelsOut,
  }
}
