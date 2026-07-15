import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import { chromeFromMembers } from '../polyomino'
import { rectPerimeterPathD } from '../geometry'
import { enforcePanelLayoutInvariants } from '../densify'

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
  // Nested panels fully contained in this panel's membership also move
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
    const level = p.hierarchyLevel ?? 1
    const titleBand =
      p.showTitle === false
        ? 0
        : 16 + (level <= 1 && (p.showStroke !== false) ? 12 : 0)
    const chrome = chromeFromMembers(members, {
      pad: level <= 1 ? pad + 4 : pad,
      titleBand,
      shape: p.shape === 'polygon' ? 'polygon' : 'rect',
      grid,
    })
    return {
      ...p,
      ...chrome,
      shape: p.shape,
      showStroke: p.showStroke,
    }
  })

  return { items: nextItems, panels: nextPanels }
}

/**
 * Rebuild panel chrome from current member card geometry.
 * Shared by translate + in-panel relayout so nested L2/L3 stay in sync.
 */
function rebuildPanelChromeFromMembers(
  p: LayoutPanel,
  byId: Map<string, CanvasItem>,
  opts: { grid: number; panelPad: number },
): LayoutPanel {
  const members = (p.memberIds ?? [])
    .map((id) => byId.get(id))
    .filter((m): m is CanvasItem => m != null && !m.hidden)
  if (members.length === 0) return p
  const level = p.hierarchyLevel ?? 1
  const titleBand =
    p.showTitle === false
      ? 0
      : 16 + (level <= 1 && p.showStroke !== false ? 12 : 0)
  const pad =
    level <= 1 ? Math.max(2, opts.panelPad) + 2 : Math.max(2, opts.panelPad)
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

/**
 * Re-pack cards inside one panel (shelf within panel content box).
 * Used when user sets contentSort or after showTitle changes title band.
 *
 * When `allPanels` is provided, every nested child panel whose members are a
 * subset of this panel also has its chrome rebuilt so L2 frames follow the
 * cards (Auto-layout inside L1 was leaving L2 panels stranded).
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
  const showTitle = panel.showTitle !== false
  const titleBand = showTitle ? 16 : 0
  const pad = Math.max(2, opts?.panelPad ?? 4)
  const grid = opts?.grid ?? ORGANIZE_GRID
  const dense = opts?.mode === 'dense'

  let members = items.filter((i) => ids.has(i.id) && !i.hidden)
  if ((panel.contentSort ?? 'none') === 'none' && panel.memberIds?.length) {
    const rank = new Map(panel.memberIds.map((id, i) => [id, i]))
    members = [...members].sort(
      (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    )
  }
  const sort = panel.contentSort ?? 'none'
  if (sort === 'name-asc' || sort === 'name-desc') {
    const dir = sort === 'name-desc' ? -1 : 1
    members = [...members].sort((a, b) => {
      const ta = (a.title ?? a.latex ?? a.id).toLocaleLowerCase()
      const tb = (b.title ?? b.latex ?? b.id).toLocaleLowerCase()
      if (ta < tb) return -1 * dir
      if (ta > tb) return 1 * dir
      return a.id.localeCompare(b.id)
    })
  }
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
  // (flat shelf mixed L2s and left L2 frames stranded / broken).
  const nestedChildren = (opts?.allPanels ?? [])
    .filter(
      (p) =>
        p.id !== panel.id &&
        p.memberIds?.length &&
        p.memberIds.every((id) => ids.has(id)) &&
        (p.hierarchyLevel ?? 1) > (panel.hierarchyLevel ?? 1),
    )
    .sort(
      (a, b) => (b.hierarchyLevel ?? 1) - (a.hierarchyLevel ?? 1),
    )

  // Deepest nested panels only (leaves) — avoid packing both L2 and L3 for same cards
  const leafNested = nestedChildren.filter((p) => {
    const deeper = nestedChildren.some(
      (o) =>
        o.id !== p.id &&
        (o.hierarchyLevel ?? 1) > (p.hierarchyLevel ?? 1) &&
        o.memberIds?.every((id) => p.memberIds?.includes(id)),
    )
    return !deeper
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

  if (dense && leafNested.length >= 1) {
    // 1) Dense-pack cards inside each leaf L2/L3 group
    // 2) Stack those groups inside the parent content box (keep clusters intact)
    type LeafPack = { places: Place[]; w: number; h: number }
    let scale = 1
    const packAllLeaves = (s: number): { out: Place[]; height: number } => {
      const leaves: LeafPack[] = []
      const claimed = new Set<string>()
      for (const child of leafNested) {
        const group = members.filter((m) => child.memberIds?.includes(m.id))
        if (group.length === 0) continue
        for (const m of group) claimed.add(m.id)
        const local = packShelfInBox(group, 0, 0, contentW, s, false)
        leaves.push({ places: local.out, w: local.width, h: local.height })
      }
      const rest = members.filter((m) => !claimed.has(m.id))
      if (rest.length > 0) {
        const local = packShelfInBox(rest, 0, 0, contentW, s, false)
        leaves.push({ places: local.out, w: local.width, h: local.height })
      }
      // Place leaf blocks: free-flow left→right, wrap (tetris of L2 slabs)
      let x = contentX
      let y = contentY
      let rowH = 0
      const abs: Place[] = []
      for (const leaf of leaves) {
        if (x > contentX && x + leaf.w > contentX + contentW + 0.5) {
          x = contentX
          y += rowH + gap
          rowH = 0
        }
        for (const p of leaf.places) {
          abs.push({
            id: p.id,
            x: Math.round(x + p.x),
            y: Math.round(y + p.y),
            w: p.w,
            h: p.h,
          })
        }
        x += leaf.w + gap
        rowH = Math.max(rowH, leaf.h)
      }
      const height =
        abs.reduce((b, p) => Math.max(b, p.y + p.h), contentY) - contentY
      return { out: abs, height }
    }
    let best = packAllLeaves(1)
    while (best.height > contentH + 2 && scale > 0.55) {
      scale *= 0.9
      best = packAllLeaves(scale)
    }
    places = best.out
  } else if (dense) {
    // Flat dense shelf (no nested children)
    const packShelf = (scale: number) => {
      const packed = packShelfInBox(
        members,
        contentX,
        contentY,
        contentW,
        scale,
        false,
      )
      return { out: packed.out, height: packed.height }
    }
    let scale = 1
    let best = packShelf(1)
    while (best.height > contentH + 2 && scale > 0.55) {
      scale *= 0.9
      best = packShelf(scale)
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
  const chromeOpts = { grid, panelPad: pad }

  // Rebuild this panel from reflowed cards
  const nextPanel = rebuildPanelChromeFromMembers(panel, byId, chromeOpts)

  // Nested L2/L3 panels (member subset of this panel) must follow the cards
  const allPanels = opts?.allPanels
  if (!allPanels?.length) {
    return { items: nextItems, panel: nextPanel }
  }

  const nestedIds = new Set<string>()
  for (const p of allPanels) {
    if (p.id === panel.id) continue
    if (!p.memberIds?.length) continue
    if (p.memberIds.every((id) => ids.has(id))) nestedIds.add(p.id)
  }

  // Rebuild deepest children first so parents hug updated child frames
  const nestedSorted = allPanels
    .filter((p) => nestedIds.has(p.id))
    .sort(
      (a, b) => (b.hierarchyLevel ?? 1) - (a.hierarchyLevel ?? 1),
    )

  const rebuilt = new Map<string, LayoutPanel>()
  rebuilt.set(panel.id, nextPanel)
  for (const child of nestedSorted) {
    rebuilt.set(
      child.id,
      rebuildPanelChromeFromMembers(child, byId, chromeOpts),
    )
  }

  // Expand parent again so it covers nested L2 frames after they moved
  const afterChildren = rebuildPanelChromeFromMembers(
    nextPanel,
    byId,
    chromeOpts,
  )
  // Prefer covering child panel AABBs when nested frames exist
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
  // Enforce no same-level overlap + clear title bands after in-panel reflow
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

