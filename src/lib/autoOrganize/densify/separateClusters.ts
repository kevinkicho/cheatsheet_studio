import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'

/**
 * Push whole folder clusters apart so parent-level AABBs never interleave.
 */
export function separateFolderClusters(
  items: CanvasItem[],
  folders: FolderRef[],
  level: PanelGroupLevel,
  opts?: { grid?: number; minGapPx?: number },
): CanvasItem[] {
  const grid = Math.max(4, opts?.grid ?? ORGANIZE_GRID)
  const minGap = Math.max(0, opts?.minGapPx ?? 0)
  const cards = items.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length < 2) return items

  type Cluster = {
    key: string
    ids: string[]
    minY: number
    maxY: number
    minX: number
    maxX: number
  }
  const map = new Map<string, CanvasItem[]>()
  for (const c of cards) {
    const key =
      folderAtGroupLevel(c.folderId, folders, level) ?? c.folderId ?? c.id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  const clusters: Cluster[] = []
  for (const [key, members] of map) {
    clusters.push({
      key,
      ids: members.map((m) => m.id),
      minY: Math.min(...members.map((m) => m.y)),
      maxY: Math.max(...members.map((m) => m.y + m.height)),
      minX: Math.min(...members.map((m) => m.x)),
      maxX: Math.max(...members.map((m) => m.x + m.width)),
    })
  }
  clusters.sort((a, b) => a.minY - b.minY || a.minX - b.minX)

  const dyOf = new Map<string, number>()
  for (let i = 0; i < clusters.length; i++) {
    const g = clusters[i]!
    let newMinY = g.minY
    for (let j = 0; j < i; j++) {
      const h = clusters[j]!
      const hy1 = h.maxY
      const hx0 = h.minX
      const hx1 = h.maxX
      const xGap = Math.max(g.minX - hx1, hx0 - g.maxX)
      if (xGap >= Math.max(2, minGap)) continue
      if (newMinY >= hy1 + minGap) continue
      newMinY = Math.max(newMinY, hy1 + minGap)
    }
    // Pixel-exact so L1 gap=2 does not become 24
    const dy = newMinY > g.minY ? Math.ceil(newMinY - g.minY) : 0
    if (dy !== 0) dyOf.set(g.key, dy)
    if (dy !== 0) {
      g.minY += dy
      g.maxY += dy
    }
  }
  if (dyOf.size === 0) return items
  const idDy = new Map<string, number>()
  for (const c of clusters) {
    const dy = dyOf.get(c.key) ?? 0
    if (dy === 0) continue
    for (const id of c.ids) idDy.set(id, dy)
  }
  return items.map((it) => {
    const dy = idDy.get(it.id)
    return dy ? { ...it, y: it.y + dy } : it
  })
}
