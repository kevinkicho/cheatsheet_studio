import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'
import { rectsOverlap } from '../geometry'

/**
 * Separate paint-overlapping body cards.
 *
 * Always runs for **all** pairs (including different folders). An older
 * same-folder-only filter left Clinical Psychology ∩ CBT-style stacks after
 * hierarchical re-pack / multipage when leaf-group passes missed a collision.
 */
export function resolveCardOverlaps(
  items: CanvasItem[],
  opts: { grid?: number; contentRight?: number },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const contentRight = opts.contentRight ?? Infinity
  const next = items.map((it) => ({ ...it }))
  const visible = () => next.filter((i) => !i.hidden && !isHeadingCard(i))

  for (let pass = 0; pass < 24; pass++) {
    let moved = false
    // Re-read positions each pass from `next` (not a stale snapshot)
    const cards = visible().sort(
      (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
    )
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        // Always re-fetch from next — earlier pairs may have moved a/b
        const a = next.find((x) => x.id === cards[i]!.id)!
        const b = next.find((x) => x.id === cards[j]!.id)!
        if (!a || !b || a.hidden || b.hidden) continue
        if (!rectsOverlap(a, b, 0)) continue
        const bi = next.findIndex((x) => x.id === b.id)
        if (bi < 0) continue
        const cur = next[bi]!
        // Prefer slide right; wrap below when past pack right edge.
        let nx = a.x + a.width
        let ny = a.y
        if (nx + cur.width > contentRight + 1) {
          nx = Math.min(a.x, cur.x)
          ny = a.y + a.height
        }
        nx = Math.round(nx / grid) * grid
        ny = Math.round(ny / grid) * grid
        // Keep pushing down until this pair no longer paints over each other.
        let guard = 0
        let trial = { ...cur, x: nx, y: ny }
        while (rectsOverlap(a, trial, 0) && guard < 40) {
          ny = Math.round((Math.max(a.y + a.height, trial.y) + grid) / grid) * grid
          if (ny <= a.y) ny = a.y + a.height
          // If still too wide for the band, pin left of a and stack
          if (nx + cur.width > contentRight + 1) {
            nx = Math.round(a.x / grid) * grid
          }
          trial = { ...cur, x: nx, y: ny }
          guard++
        }
        if (cur.x !== trial.x || cur.y !== trial.y) {
          next[bi] = trial
          moved = true
        }
      }
    }
    if (!moved) break
  }
  return next
}

/**
 * Pixel-exact card-to-card gap inside each leaf folder group (block gap knob).
 * Free-flow is cell-quantized; this pass opens (or keeps) stroke-free air
 * between neighbor cards so blockGap=2 actually means ~2px, not 24px.
 */
export function separateLeafCardsByGap(
  items: CanvasItem[],
  folders: FolderRef[],
  leafLevel: PanelGroupLevel,
  opts: {
    grid?: number
    minGapPx: number
    contentRight?: number
  },
): CanvasItem[] {
  const minGap = Math.max(0, opts.minGapPx)
  if (minGap <= 0) return items
  const contentRight = opts.contentRight ?? Infinity
  const cards = items.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length < 2) return items

  const groups = new Map<string, string[]>()
  for (const c of cards) {
    const key =
      folderAtGroupLevel(c.folderId, folders, leafLevel) ??
      c.folderId ??
      c.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c.id)
  }

  const next = items.map((it) => ({ ...it }))
  const byId = () => new Map(next.map((i) => [i.id, i]))

  for (let pass = 0; pass < 8; pass++) {
    let any = false
    const map = byId()
    for (const ids of groups.values()) {
      if (ids.length < 2) continue
      const list = ids
        .map((id) => map.get(id)!)
        .filter(Boolean)
        .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!
          const b = list[j]!
          const yOverlap =
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
          const xOverlap =
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
          const xGap = Math.max(
            0,
            Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)),
          )
          const yGap = Math.max(
            0,
            Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)),
          )
          // Side-by-side neighbors — prefer opening horizontal gap (grow right).
          // Only fall back to vertical stack when a hard contentRight budget is
          // set and the right card cannot fit past it.
          if (yOverlap > 4 && xGap < minGap) {
            const left = a.x <= b.x ? a : b
            const rightC = a.x <= b.x ? b : a
            const need = left.x + left.width + minGap - rightC.x
            if (need > 0.5) {
              let nx = Math.round(rightC.x + need)
              const hitsBudget =
                Number.isFinite(contentRight) &&
                nx + rightC.width > contentRight + 0.5
              if (hitsBudget) {
                // Fall back to vertical separation only when budget is finite
                const top = a.y <= b.y ? a : b
                const bot = a.y <= b.y ? b : a
                const needY = top.y + top.height + minGap - bot.y
                if (needY > 0.5) {
                  const bi = next.findIndex((x) => x.id === bot.id)
                  if (bi >= 0) {
                    next[bi] = {
                      ...next[bi]!,
                      y: Math.round(bot.y + needY),
                    }
                    any = true
                  }
                }
              } else {
                const bi = next.findIndex((x) => x.id === rightC.id)
                if (bi >= 0) {
                  next[bi] = { ...next[bi]!, x: nx }
                  any = true
                }
              }
              continue
            }
          }
          // Vertical stack neighbors
          if (xOverlap > 4 && yGap < minGap) {
            const top = a.y <= b.y ? a : b
            const bot = a.y <= b.y ? b : a
            const needY = top.y + top.height + minGap - bot.y
            if (needY > 0.5) {
              const bi = next.findIndex((x) => x.id === bot.id)
              if (bi >= 0) {
                next[bi] = {
                  ...next[bi]!,
                  y: Math.round(bot.y + needY),
                }
                any = true
              }
            }
          }
        }
      }
    }
    if (!any) break
  }
  return next
}
