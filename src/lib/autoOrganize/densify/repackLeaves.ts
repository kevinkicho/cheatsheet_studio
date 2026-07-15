import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'
import { placeTopicRegionsDense } from '../shelf'

/**
 * Re-pack card interiors of every leaf group with multi-order free-flow
 * (same as in-panel dense), without peer-box blocking. Then callers can
 * free-flow the leaf AABBs. This closes the gap where full-sheet auto-layout
 * left a sparse shelf inside L2 (e.g. 6.1 Algebra) that only ΓÇ£Auto-layout
 * inside panelΓÇ¥ fixed.
 */
export function repackLeafInteriors(
  items: CanvasItem[],
  folders: FolderRef[],
  leafLevel: PanelGroupLevel,
  opts: {
    grid?: number
    contentLeft: number
    contentRight: number
    gapCells?: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const gap = Math.max(0, opts.gapCells ?? 0)
  const contentLeft = opts.contentLeft
  const contentRight = opts.contentRight
  const cards = items.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length < 2) return items

  const groups = new Map<string, CanvasItem[]>()
  for (const c of cards) {
    const key =
      folderAtGroupLevel(c.folderId, folders, leafLevel) ?? c.folderId ?? c.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  const moved = new Map<
    string,
    { x: number; y: number; w: number; h: number }
  >()

  for (const [, members] of groups) {
    if (members.length < 1) continue
    const minX = Math.min(...members.map((m) => m.x))
    const minY = Math.min(...members.map((m) => m.y))
    const maxX = Math.max(...members.map((m) => m.x + m.width))
    const spanCw = Math.max(
      1,
      Math.ceil((maxX - minX) / grid),
      ...members.map((m) => Math.ceil(m.width / grid)),
    )
    // Prefer packing into remaining printable width from this group's left
    const maxColsHere = Math.max(
      1,
      Math.floor((contentRight - minX + 0.5) / grid),
    )
    const packCols = Math.max(
      1,
      Math.min(maxColsHere, Math.max(spanCw, Math.ceil(maxColsHere * 0.5))),
    )

    // Try a few widths; keep densest multi-order free-flow
    const widths = Array.from(
      new Set(
        [
          spanCw,
          packCols,
          Math.min(packCols, Math.max(spanCw, Math.ceil(packCols * 0.75))),
          Math.min(packCols, Math.max(spanCw, Math.ceil(packCols * 0.5))),
        ].map((w) =>
          Math.max(
            1,
            Math.min(
              packCols,
              Math.max(w, ...members.map((m) => Math.ceil(m.width / grid))),
            ),
          ),
        ),
      ),
    )

    let best: {
      next: Array<{ id: string; x: number; y: number; w: number; h: number }>
      area: number
      ch: number
    } | null = null

    for (const cols of widths) {
      const regions = members.map((m, i) => ({
        index: i,
        cw: Math.min(cols, Math.max(1, Math.ceil(m.width / grid))),
        ch: Math.max(1, Math.ceil(m.height / grid)),
      }))
      const pos = placeTopicRegionsDense(regions, cols, gap, {
        multiOrder: true,
        readingFlow: false,
      })
      let usedCw = 0
      let usedCh = 0
      const next: Array<{
        id: string
        x: number
        y: number
        w: number
        h: number
      }> = []
      for (let i = 0; i < members.length; i++) {
        const m = members[i]!
        const p = pos.get(i) ?? { c: 0, r: 0 }
        const r = regions[i]!
        usedCw = Math.max(usedCw, p.c + r.cw)
        usedCh = Math.max(usedCh, p.r + r.ch)
        const w = Math.min(m.width, r.cw * grid)
        const h = Math.min(m.height, r.ch * grid)
        let x = Math.round(minX + p.c * grid)
        let y = Math.round(minY + p.r * grid)
        if (x < contentLeft) x = contentLeft
        if (x + w > contentRight) {
          x = Math.max(contentLeft, contentRight - w)
        }
        next.push({ id: m.id, x, y, w, h })
      }
      const area = usedCw * usedCh
      if (
        !best ||
        area < best.area ||
        (area === best.area && usedCh < best.ch)
      ) {
        best = { next, area, ch: usedCh }
      }
    }

    if (best) {
      for (const n of best.next) moved.set(n.id, n)
    }
  }

  if (moved.size === 0) return items
  return items.map((it) => {
    const n = moved.get(it.id)
    return n
      ? { ...it, x: n.x, y: n.y, width: n.w, height: n.h }
      : it
  })
}
