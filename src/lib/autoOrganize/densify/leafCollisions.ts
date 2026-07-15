import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'

/** Push leaf-folder groups apart when AABBs collide (stroked L2/L3 frames). */
export function resolveLeafGroupCollisions(
  items: CanvasItem[],
  folders: FolderRef[],
  level: PanelGroupLevel,
  opts: { grid?: number; minGapPx?: number; parentLevel?: PanelGroupLevel },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const minGap = Math.max(0, opts.minGapPx ?? 0)
  const parentLevel = (opts.parentLevel ?? 1) as PanelGroupLevel
  const cards = items.filter((i) => !i.hidden && !isHeadingCard(i) && i.folderId)
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
      folderAtGroupLevel(key, folders, parentLevel) ??
      folderAtGroupLevel(members[0]?.folderId, folders, parentLevel) ??
      '__root__'
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
  groups.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)

  const dyOf = new Map<string, number>()
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!
    let newMinY = g.y0
    for (let j = 0; j < i; j++) {
      const h = groups[j]!
      if (h.parent !== g.parent) continue
      const xGap = Math.max(g.x0 - h.x1, h.x0 - g.x1)
      if (xGap >= Math.max(2, minGap)) continue
      if (newMinY >= h.y1 + minGap) continue
      newMinY = Math.max(newMinY, h.y1 + minGap)
    }
    // Pixel-exact (grid snap turned small L2 gaps into full cells)
    const dy = newMinY > g.y0 ? Math.ceil(newMinY - g.y0) : 0
    if (dy !== 0) {
      dyOf.set(g.key, dy)
      g.y0 += dy
      g.y1 += dy
    }
  }
  if (dyOf.size === 0) return items
  const idDy = new Map<string, number>()
  for (const g of groups) {
    const dy = dyOf.get(g.key) ?? 0
    if (dy === 0) continue
    for (const id of g.ids) idDy.set(id, dy)
  }
  return items.map((it) => {
    const dy = idDy.get(it.id)
    return dy ? { ...it, y: it.y + dy } : it
  })
}
