import type { CanvasItem } from '@/types'
import type { PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'

/**
 * Push leaf-folder groups apart when content AABBs violate min gap.
 *
 * **Axis-aware clearance (critical for 2px L2 fidelity):**
 * - Horizontal: only pad+user gap (title chips sit on TOP, not between
 *   side-by-side frames). Using vertical clear on X left ~16px extra air.
 * - Vertical: pad+user gap+title so stroke-to-stroke ≈ user gap after chrome.
 *
 * Separates on both axes (no force-stack of near side-by-side neighbors).
 */
export function resolveLeafGroupCollisions(
  items: CanvasItem[],
  folders: FolderRef[],
  level: PanelGroupLevel,
  opts: {
    grid?: number
    /** Fallback applied to both axes when X/Y not set. */
    minGapPx?: number
    /** Content AABB min gap for side-by-side (row) neighbors. */
    minGapX?: number
    /** Content AABB min gap for stacked (column) neighbors. */
    minGapY?: number
    parentLevel?: PanelGroupLevel
    contentRight?: number
  },
): CanvasItem[] {
  const fallback = Math.max(0, opts.minGapPx ?? 0)
  const minGapX = Math.max(0, opts.minGapX ?? fallback)
  const minGapY = Math.max(0, opts.minGapY ?? fallback)
  const parentLevel = (opts.parentLevel ?? 1) as PanelGroupLevel
  const contentRight = opts.contentRight
  if (minGapX <= 0 && minGapY <= 0) return items

  type G = {
    key: string
    parent: string
    ids: string[]
    x0: number
    y0: number
    x1: number
    y1: number
  }

  const buildGroups = (list: CanvasItem[]): G[] => {
    const cards = list.filter(
      (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
    )
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
    return groups
  }

  let next = items
  for (let pass = 0; pass < 8; pass++) {
    const groups = buildGroups(next)
    if (groups.length < 2) return next

    const dyOf = new Map<string, number>()
    const dxOf = new Map<string, number>()

    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i]!
        const b = groups[j]!
        if (a.parent !== b.parent) continue

        const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
        const yOverlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
        const xGap = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1))
        const yGap = Math.max(0, Math.max(a.y0 - b.y1, b.y0 - a.y1))
        const shareX = xOverlap > 0
        const shareY = yOverlap > 0
        const tooCloseV = shareX && yGap < minGapY
        const tooCloseH = shareY && xGap < minGapX
        const boxHit = shareX && shareY
        if (!(boxHit || tooCloseV || tooCloseH)) continue

        const top = a.y0 <= b.y0 ? a : b
        const bot = a.y0 <= b.y0 ? b : a
        const left = a.x0 <= b.x0 ? a : b
        const right = a.x0 <= b.x0 ? b : a
        const needY = top.y1 + minGapY - bot.y0
        const needX = left.x1 + minGapX - right.x0

        // Prefer the axis that is actually too-close; on true overlap pick
        // smaller push so free-flow stays dense.
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
          bot.y0 += dy
          bot.y1 += dy
        } else if ((preferH || tooCloseH || boxHit) && needX > 0.5) {
          let dx = Math.ceil(needX)
          if (contentRight != null) {
            const maxDx = Math.max(0, contentRight - right.x1)
            dx = Math.min(dx, Math.floor(maxDx))
          }
          if (dx > 0.5) {
            dxOf.set(right.key, Math.max(dxOf.get(right.key) ?? 0, dx))
            right.x0 += dx
            right.x1 += dx
          } else if (needY > 0.5) {
            const dy = Math.ceil(needY)
            dyOf.set(bot.key, Math.max(dyOf.get(bot.key) ?? 0, dy))
            bot.y0 += dy
            bot.y1 += dy
          }
        }
      }
    }

    if (dyOf.size === 0 && dxOf.size === 0) break

    const idDy = new Map<string, number>()
    const idDx = new Map<string, number>()
    for (const g of groups) {
      const dy = dyOf.get(g.key) ?? 0
      const dx = dxOf.get(g.key) ?? 0
      if (dy)
        for (const id of g.ids)
          idDy.set(id, Math.max(idDy.get(id) ?? 0, dy))
      if (dx)
        for (const id of g.ids)
          idDx.set(id, Math.max(idDx.get(id) ?? 0, dx))
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
