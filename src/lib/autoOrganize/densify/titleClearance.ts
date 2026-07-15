import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'

export function ensureLeafTitleClearance(
  items: CanvasItem[],
  folders: FolderRef[],
  leafLevel: PanelGroupLevel,
  titlePx: number,
  grid = ORGANIZE_GRID,
): CanvasItem[] {
  const band = Math.max(20, titlePx)
  const g = Math.max(1, grid)
  const cards = items.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length === 0) return items

  const map = new Map<string, string[]>()
  for (const c of cards) {
    const key =
      folderAtGroupLevel(c.folderId, folders, leafLevel) ??
      c.folderId ??
      c.id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c.id)
  }

  const byId = new Map(items.map((i) => [i.id, { ...i }]))

  const groupMeta = () => {
    const list: Array<{
      key: string
      ids: string[]
      minY: number
      minX: number
      maxX: number
    }> = []
    for (const [key, ids] of map) {
      const members = ids.map((id) => byId.get(id)!).filter(Boolean)
      if (members.length === 0) continue
      list.push({
        key,
        ids,
        minY: Math.min(...members.map((m) => m.y)),
        minX: Math.min(...members.map((m) => m.x)),
        maxX: Math.max(...members.map((m) => m.x + m.width)),
      })
    }
    list.sort((a, b) => a.minY - b.minY || a.minX - b.minX)
    return list
  }

  // Multiple passes: shifting one group can free/block another strip
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (const gr of groupMeta()) {
      const idSet = new Set(gr.ids)
      const stripTop = gr.minY - band
      const stripBot = gr.minY
      let needMinY = gr.minY

      for (const o of byId.values()) {
        if (o.hidden || isHeadingCard(o) || !o.folderId) continue
        if (idSet.has(o.id)) continue
        // Horizontal overlap with this group's title strip
        if (o.x + o.width <= gr.minX + 1 || o.x >= gr.maxX - 1) continue
        // Foreign card intersects title strip ΓåÆ push our cards below it
        if (o.y < stripBot && o.y + o.height > stripTop) {
          needMinY = Math.max(
            needMinY,
            Math.ceil((o.y + o.height + band) / g) * g,
          )
        }
      }

      const dy = needMinY - gr.minY
      if (dy > 0.5) {
        for (const id of gr.ids) {
          const it = byId.get(id)
          if (it) it.y = Math.round(it.y + dy)
        }
        moved = true
      }
    }
    if (!moved) break
  }

  return items.map((it) => byId.get(it.id) ?? it)
}
