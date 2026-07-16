import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'

/**
 * Tetris gravity: slide leaf groups up/left inside the same parent.
 *
 * Closes **residual free-flow voids** so neighbor gaps approach the user
 * target (min gap), not just "≥ min". Push-only collision left wishy-washy
 * air (2px next to 74px on the same row).
 *
 * Axis-aware gaps: horizontal neighbors use gapX; stacked use gapY (title
 * band only on vertical). Pixel-exact slides (not grid-snapped) so 2px
 * targets survive a 24px organize grid.
 */
export function gravityCompactGroups(
  items: CanvasItem[],
  folders: FolderRef[],
  level: PanelGroupLevel,
  opts?: {
    grid?: number
    /** @deprecated isotropic fallback — prefer gapX/gapY */
    gapPx?: number
    /** Min content AABB gap for side-by-side (row) neighbors. */
    gapX?: number
    /** Min content AABB gap for stacked (column) neighbors. */
    gapY?: number
    parentLevel?: PanelGroupLevel
    contentLeft?: number
    contentTop?: number
    contentRight?: number
    /** Max sweeps (default 10). */
    sweeps?: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts?.grid ?? ORGANIZE_GRID)
  const fallback = Math.max(0, opts?.gapPx ?? 0)
  const gapX = Math.max(0, opts?.gapX ?? fallback)
  const gapY = Math.max(0, opts?.gapY ?? fallback)
  const parentLevel = opts?.parentLevel
  const contentLeft = opts?.contentLeft ?? -Infinity
  const contentTop = opts?.contentTop ?? -Infinity
  const contentRight = opts?.contentRight ?? Infinity
  const maxSweeps = Math.max(1, opts?.sweeps ?? 10)
  const cards = items.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length < 2) return items

  type G = {
    key: string
    parent: string
    ids: string[]
    x0: number
    y0: number
    x1: number
    y1: number
  }
  const map = new Map<string, CanvasItem[]>()
  for (const c of cards) {
    const key =
      folderAtGroupLevel(c.folderId, folders, level) ?? c.folderId ?? c.id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  const groups: G[] = []
  for (const [key, members] of map) {
    const parent =
      parentLevel != null
        ? (folderAtGroupLevel(key, folders, parentLevel) ??
          folderAtGroupLevel(members[0]?.folderId, folders, parentLevel) ??
          '__root__')
        : '__root__'
    groups.push({
      key,
      parent,
      ids: members.map((m) => m.id),
      x0: Math.min(...members.map((m) => m.x)),
      y0: Math.min(...members.map((m) => m.y)),
      x1: Math.max(...members.map((m) => m.x + m.width)),
      y1: Math.max(...members.map((m) => m.y + m.height)),
    })
  }

  /**
   * True if placed at (x0,y0) would violate gaps vs peers.
   * - Same parent: axis-aware leaf gaps (gapX / gapY)
   * - Other parent: HARD obstacle (any overlap) — without this, leaves freefall
   *   to packTop through other L1s (Biology under #6, General on top).
   */
  const collides = (g: G, x0: number, y0: number, ignoreKey: string) => {
    const x1 = x0 + (g.x1 - g.x0)
    const y1 = y0 + (g.y1 - g.y0)
    if (x0 < contentLeft - 0.5) return true
    if (x1 > contentRight + 0.5) return true
    if (y0 < contentTop - 0.5) return true
    for (const o of groups) {
      if (o.key === ignoreKey) continue
      const xSep = Math.max(x0 - o.x1, o.x0 - x1)
      const ySep = Math.max(y0 - o.y1, o.y0 - y1)
      if (parentLevel != null && o.parent !== g.parent) {
        // Other L1: solid — no interleave
        if (xSep < 0 && ySep < 0) return true
        continue
      }
      if (xSep < gapX && ySep < gapY) return true
    }
    return false
  }

  /** Pixel-exact binary search: slide toward limit (up or left). */
  const maxSlide = (
    g: G,
    axis: 'y' | 'x',
    from: number,
    limit: number,
  ): number => {
    if (!(limit < from - 0.5)) return from
    let lo = Math.ceil(limit)
    let hi = Math.floor(from)
    if (lo >= hi) return from
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      const x = axis === 'x' ? mid : g.x0
      const y = axis === 'y' ? mid : g.y0
      if (collides(g, x, y, g.key)) lo = mid + 1
      else hi = mid
    }
    const x = axis === 'x' ? lo : g.x0
    const y = axis === 'y' ? lo : g.y0
    return collides(g, x, y, g.key) ? from : lo
  }

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let moved = false
    // Bottom-right first so upper-left items settle, then others fill holes
    const order = [...groups].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    for (const g of order) {
      const bestY = maxSlide(g, 'y', g.y0, contentTop)
      const dy0 = bestY - g.y0
      if (dy0 < -0.5) {
        g.y0 += dy0
        g.y1 += dy0
        moved = true
      }
      const bestX = maxSlide(g, 'x', g.x0, contentLeft)
      const dx0 = bestX - g.x0
      if (dx0 < -0.5) {
        g.x0 += dx0
        g.x1 += dx0
        moved = true
      }
    }
    if (!moved) break
  }

  const idDelta = new Map<string, { dx: number; dy: number }>()
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const g of groups) {
    const members = g.ids
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => Boolean(m))
    if (members.length === 0) continue
    const ox0 = Math.min(...members.map((m) => m.x))
    const oy0 = Math.min(...members.map((m) => m.y))
    const dx = g.x0 - ox0
    const dy = g.y0 - oy0
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
    for (const id of g.ids) idDelta.set(id, { dx, dy })
  }
  if (idDelta.size === 0) return items
  return items.map((it) => {
    const d = idDelta.get(it.id)
    return d
      ? { ...it, x: Math.round(it.x + d.dx), y: Math.round(it.y + d.dy) }
      : it
  })
}

/**
 * After gravity: re-seat each leaf into the best free top-left slot inside its
 * parent. Fills L-shaped skyline holes that pure up/left slide cannot enter
 * (e.g. wide Genetics blocked under Ecology by Enzymes on the right).
 *
 * Never goes below gapX/gapY; prefers smaller y then x (reading-dense).
 */
export function refitLeafGroupsIntoHoles(
  items: CanvasItem[],
  folders: FolderRef[],
  level: PanelGroupLevel,
  opts: {
    grid?: number
    gapX?: number
    gapY?: number
    gapPx?: number
    parentLevel?: PanelGroupLevel
    contentLeft: number
    contentTop: number
    contentRight: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const fallback = Math.max(0, opts.gapPx ?? 0)
  const gapX = Math.max(0, opts.gapX ?? fallback)
  const gapY = Math.max(0, opts.gapY ?? fallback)
  const parentLevel = opts.parentLevel
  const contentLeft = opts.contentLeft
  const contentTop = opts.contentTop
  const contentRight = opts.contentRight
  const pageW = Math.max(grid, contentRight - contentLeft)

  const cards = items.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length < 2) return items

  type G = {
    key: string
    parent: string
    ids: string[]
    x0: number
    y0: number
    x1: number
    y1: number
    w: number
    h: number
  }
  const map = new Map<string, CanvasItem[]>()
  for (const c of cards) {
    const key =
      folderAtGroupLevel(c.folderId, folders, level) ?? c.folderId ?? c.id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  const groups: G[] = []
  for (const [key, members] of map) {
    const parent =
      parentLevel != null
        ? (folderAtGroupLevel(key, folders, parentLevel) ??
          folderAtGroupLevel(members[0]?.folderId, folders, parentLevel) ??
          '__root__')
        : '__root__'
    const x0 = Math.min(...members.map((m) => m.x))
    const y0 = Math.min(...members.map((m) => m.y))
    const x1 = Math.max(...members.map((m) => m.x + m.width))
    const y1 = Math.max(...members.map((m) => m.y + m.height))
    groups.push({
      key,
      parent,
      ids: members.map((m) => m.id),
      x0,
      y0,
      x1,
      y1,
      w: x1 - x0,
      h: y1 - y0,
    })
  }

  const collides = (g: G, x0: number, y0: number, ignoreKey: string) => {
    const x1 = x0 + g.w
    const y1 = y0 + g.h
    if (x0 < contentLeft - 0.5) return true
    if (x1 > contentRight + 0.5) return true
    if (y0 < contentTop - 0.5) return true
    for (const o of groups) {
      if (o.key === ignoreKey) continue
      const xSep = Math.max(x0 - o.x1, o.x0 - x1)
      const ySep = Math.max(y0 - o.y1, o.y0 - y1)
      if (parentLevel != null && o.parent !== g.parent) {
        if (xSep < 0 && ySep < 0) return true
        continue
      }
      if (xSep < gapX && ySep < gapY) return true
    }
    return false
  }

  // Larger leaves first so small ones fill remaining notches
  const order = [...groups].sort(
    (a, b) => b.w * b.h - a.w * a.h || a.y0 - b.y0 || a.x0 - b.x0,
  )

  // Candidate Y / X from content edges + coarse grid (full pixel scan is too slow)
  const collectCandidates = (parent: string) => {
    const xs = new Set<number>([contentLeft])
    const ys = new Set<number>([contentTop])
    let maxBottom = contentTop
    for (const o of groups) {
      if (parentLevel != null && o.parent !== parent) continue
      xs.add(Math.round(o.x0))
      xs.add(Math.round(o.x1 + gapX))
      ys.add(Math.round(o.y0))
      ys.add(Math.round(o.y1 + gapY))
      maxBottom = Math.max(maxBottom, o.y1)
    }
    const yLimit = maxBottom + pageW
    for (let x = contentLeft; x < contentRight; x += grid) xs.add(x)
    for (let y = contentTop; y < yLimit; y += grid) ys.add(y)
    return {
      xs: [...xs].filter((x) => x >= contentLeft - 0.5).sort((a, b) => a - b),
      ys: [...ys].filter((y) => y >= contentTop - 0.5).sort((a, b) => a - b),
    }
  }

  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const g of order) {
      const { xs, ys } = collectCandidates(g.parent)
      let bestX = g.x0
      let bestY = g.y0
      let bestScore = g.y0 * 1e6 + g.x0
      for (const y of ys) {
        for (const x of xs) {
          if (x + g.w > contentRight + 0.5) continue
          if (collides(g, x, y, g.key)) continue
          const score = y * 1e6 + x
          if (score < bestScore - 0.5) {
            bestScore = score
            bestX = x
            bestY = y
          }
        }
      }
      if (bestX !== g.x0 || bestY !== g.y0) {
        g.x0 = bestX
        g.y0 = bestY
        g.x1 = bestX + g.w
        g.y1 = bestY + g.h
        moved = true
      }
    }
    if (!moved) break
  }

  const idDelta = new Map<string, { dx: number; dy: number }>()
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const g of groups) {
    const members = g.ids
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => Boolean(m))
    if (members.length === 0) continue
    const ox0 = Math.min(...members.map((m) => m.x))
    const oy0 = Math.min(...members.map((m) => m.y))
    const dx = g.x0 - ox0
    const dy = g.y0 - oy0
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
    for (const id of g.ids) idDelta.set(id, { dx, dy })
  }
  if (idDelta.size === 0) return items
  return items.map((it) => {
    const d = idDelta.get(it.id)
    return d
      ? { ...it, x: Math.round(it.x + d.dx), y: Math.round(it.y + d.dy) }
      : it
  })
}
