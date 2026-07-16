import type { CanvasItem } from '@/types'
import type { PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'

/**
 * Push whole folder clusters apart so parent-level AABBs honor minGap.
 *
 * Separates on both axes (column → push down, row → push right). Using only
 * vertical push with `xGap < minGap` used to destroy side-by-side free-flow
 * and leave huge residual voids.
 */
export function separateFolderClusters(
  items: CanvasItem[],
  folders: FolderRef[],
  level: PanelGroupLevel,
  opts?: { grid?: number; minGapPx?: number; contentRight?: number },
): CanvasItem[] {
  const minGap = Math.max(0, opts?.minGapPx ?? 0)
  const contentRight = opts?.contentRight
  if (minGap <= 0) return items

  type Cluster = {
    key: string
    ids: string[]
    minY: number
    maxY: number
    minX: number
    maxX: number
  }

  const build = (list: CanvasItem[]): Cluster[] => {
    const cards = list.filter(
      (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
    )
    if (cards.length < 2) return []
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
    return clusters
  }

  let next = items
  for (let pass = 0; pass < 8; pass++) {
    const clusters = build(next)
    if (clusters.length < 2) return next

    const dyOf = new Map<string, number>()
    const dxOf = new Map<string, number>()

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i]!
        const b = clusters[j]!
        const xOverlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
        const yOverlap = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
        const xGap = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX))
        const yGap = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY))
        const shareX = xOverlap > 0
        const shareY = yOverlap > 0
        const tooCloseV = shareX && yGap < minGap
        const tooCloseH = shareY && xGap < minGap
        const boxHit = shareX && shareY
        if (!(boxHit || tooCloseV || tooCloseH)) continue

        const top = a.minY <= b.minY ? a : b
        const bot = a.minY <= b.minY ? b : a
        const left = a.minX <= b.minX ? a : b
        const right = a.minX <= b.minX ? b : a
        const needY = top.maxY + minGap - bot.minY
        const needX = left.maxX + minGap - right.minX

        const preferV =
          tooCloseV ||
          (boxHit && (!tooCloseH || needY <= needX)) ||
          (shareX && !shareY)
        const preferH =
          !preferV &&
          (tooCloseH || (boxHit && needX < needY) || (shareY && !shareX))

        if (preferV && needY > 0.5) {
          const dy = Math.ceil(needY)
          dyOf.set(bot.key, Math.max(dyOf.get(bot.key) ?? 0, dy))
          bot.minY += dy
          bot.maxY += dy
        } else if ((preferH || tooCloseH || boxHit) && needX > 0.5) {
          let dx = Math.ceil(needX)
          if (contentRight != null) {
            const maxDx = Math.max(0, contentRight - right.maxX)
            dx = Math.min(dx, Math.floor(maxDx))
          }
          if (dx > 0.5) {
            dxOf.set(right.key, Math.max(dxOf.get(right.key) ?? 0, dx))
            right.minX += dx
            right.maxX += dx
          } else if (needY > 0.5) {
            const dy = Math.ceil(needY)
            dyOf.set(bot.key, Math.max(dyOf.get(bot.key) ?? 0, dy))
            bot.minY += dy
            bot.maxY += dy
          }
        }
      }
    }

    if (dyOf.size === 0 && dxOf.size === 0) break

    const idDy = new Map<string, number>()
    const idDx = new Map<string, number>()
    for (const c of clusters) {
      const dy = dyOf.get(c.key) ?? 0
      const dx = dxOf.get(c.key) ?? 0
      if (dy) for (const id of c.ids) idDy.set(id, Math.max(idDy.get(id) ?? 0, dy))
      if (dx) for (const id of c.ids) idDx.set(id, Math.max(idDx.get(id) ?? 0, dx))
    }
    next = next.map((it) => {
      const dy = idDy.get(it.id) ?? 0
      const dx = idDx.get(it.id) ?? 0
      if (!dy && !dx) return it
      return { ...it, x: it.x + dx, y: it.y + dy }
    })
  }
  return next
}
