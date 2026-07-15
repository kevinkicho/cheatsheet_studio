import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'

/**
 * Tetris gravity: slide leaf groups up/left inside the same L1 parent only.
 */
export function gravityCompactGroups(
  items: CanvasItem[],
  folders: FolderRef[],
  level: PanelGroupLevel,
  opts?: {
    grid?: number
    gapPx?: number
    parentLevel?: PanelGroupLevel
    contentLeft?: number
    contentTop?: number
    contentRight?: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts?.grid ?? ORGANIZE_GRID)
  const gap = Math.max(0, opts?.gapPx ?? 0)
  const parentLevel = opts?.parentLevel
  const contentLeft = opts?.contentLeft ?? -Infinity
  const contentTop = opts?.contentTop ?? -Infinity
  const contentRight = opts?.contentRight ?? Infinity
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

  const collides = (g: G, x0: number, y0: number, ignoreKey: string) => {
    const x1 = x0 + (g.x1 - g.x0)
    const y1 = y0 + (g.y1 - g.y0)
    if (x0 < contentLeft - 0.5) return true
    if (x1 > contentRight + 0.5) return true
    if (y0 < contentTop - 0.5) return true
    for (const o of groups) {
      if (o.key === ignoreKey) continue
      if (parentLevel != null && o.parent !== g.parent) continue
      if (
        x0 < o.x1 + gap &&
        x1 + gap > o.x0 &&
        y0 < o.y1 + gap &&
        y1 + gap > o.y0
      ) {
        return true
      }
    }
    return false
  }

  const maxSlide = (
    g: G,
    axis: 'y' | 'x',
    from: number,
    limit: number,
  ): number => {
    if (!(limit < from - 0.5)) return from
    const lo0 = Math.ceil(Math.max(limit, -1e9) / grid) * grid
    let lo = lo0
    let hi = Math.floor(from / grid) * grid
    if (lo >= hi) return from
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2 / grid) * grid
      const x = axis === 'x' ? mid : g.x0
      const y = axis === 'y' ? mid : g.y0
      if (collides(g, x, y, g.key)) lo = mid + grid
      else hi = mid
    }
    const x = axis === 'x' ? lo : g.x0
    const y = axis === 'y' ? lo : g.y0
    return collides(g, x, y, g.key) ? from : lo
  }

  // Fewer sweeps ΓÇö binary search is already O(log) per move
  for (let sweep = 0; sweep < 4; sweep++) {
    let moved = false
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
