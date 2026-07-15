import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'
import { packClusterTight, placeTopicRegionsDense } from '../shelf'

/**
 * After packing, densify cards within each folder group (prefer leaf level)
 * so voids close without merging different L2 subsections together.
 */
export function densifyPlacedGroups(
  items: CanvasItem[],
  folders: FolderRef[],
  outerLevel: PanelGroupLevel,
  opts: {
    grid?: number
    contentLeft: number
    contentTop: number
    /** Printable right edge ΓÇö densify must not place past this. */
    contentRight?: number
    pageCols: number
    gapCells?: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const gap = Math.max(0, opts.gapCells ?? 0)
  const contentRight = opts.contentRight
  const cards = items.filter((i) => !i.hidden && !isHeadingCard(i) && i.folderId)
  if (cards.length < 2) return items

  const groups = new Map<string, CanvasItem[]>()
  for (const c of cards) {
    const key =
      folderAtGroupLevel(c.folderId, folders, outerLevel) ?? c.folderId ?? c.id
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  // Peer AABBs (other L1 groups) ΓÇö densify must not invade them
  const peerBoxes: Array<{
    x0: number
    y0: number
    x1: number
    y1: number
    key: string
  }> = []
  for (const [key, members] of groups) {
    peerBoxes.push({
      key,
      x0: Math.min(...members.map((m) => m.x)),
      y0: Math.min(...members.map((m) => m.y)),
      x1: Math.max(...members.map((m) => m.x + m.width)),
      y1: Math.max(...members.map((m) => m.y + m.height)),
    })
  }

  const moved = new Map<
    string,
    { x: number; y: number; w: number; h: number }
  >()
  for (const [key, members] of groups) {
    if (members.length < 2) continue
    const minX = Math.min(...members.map((m) => m.x))
    const minY = Math.min(...members.map((m) => m.y))
    const maxX = Math.max(...members.map((m) => m.x + m.width))
    const maxY = Math.max(...members.map((m) => m.y + m.height))
    const spanCw = Math.max(1, Math.ceil((maxX - minX) / grid))
    const spanCh = Math.max(1, Math.ceil((maxY - minY) / grid))
    const oldArea = spanCw * spanCh
    const maxCardW = Math.max(
      1,
      ...members.map((m) => Math.ceil(m.width / grid)),
    )

    // Remaining printable columns from this group's left edge (not full page).
    const maxColsHere =
      contentRight != null && Number.isFinite(contentRight)
        ? Math.max(1, Math.floor((contentRight - minX + 0.5) / grid))
        : opts.pageCols
    const colBudget = Math.max(1, Math.min(opts.pageCols, maxColsHere))

    const candidates = Array.from(
      new Set(
        [
          Math.min(colBudget, spanCw),
          Math.min(colBudget, Math.max(maxCardW, Math.ceil(spanCw * 0.85))),
          Math.min(colBudget, spanCw + 2),
          Math.min(
            colBudget,
            Math.max(
              maxCardW,
              Math.ceil(
                Math.sqrt(
                  members.reduce(
                    (s, m) =>
                      s +
                      Math.max(1, Math.ceil(m.width / grid)) *
                        Math.max(1, Math.ceil(m.height / grid)),
                    0,
                  ) * 1.15,
                ),
              ),
            ),
          ),
        ].map((w) => Math.max(maxCardW, Math.min(colBudget, w))),
      ),
    )

    let best: {
      next: Array<{ id: string; x: number; y: number; w: number; h: number }>
      area: number
      ch: number
    } | null = null

    for (const packCols of candidates) {
      const regions = members.map((m, i) => ({
        index: i,
        cw: Math.min(packCols, Math.max(1, Math.ceil(m.width / grid))),
        ch: Math.max(1, Math.ceil(m.height / grid)),
      }))
      // Multi-order best tetris (not only height-first)
      const pos = placeTopicRegionsDense(regions, packCols, gap, {
        multiOrder: true,
        readingFlow: false,
      })
      let usedCh = 0
      let usedCw = 0
      const next: Array<{ id: string; x: number; y: number; w: number; h: number }> =
        []
      for (let i = 0; i < members.length; i++) {
        const m = members[i]!
        const p = pos.get(i) ?? { c: 0, r: 0 }
        const r = regions[i]!
        usedCw = Math.max(usedCw, p.c + r.cw)
        usedCh = Math.max(usedCh, p.r + r.ch)
        const w = Math.min(m.width, r.cw * grid)
        const h = Math.min(m.height, r.ch * grid)
        next.push({
          id: m.id,
          x: Math.round(minX + p.c * grid),
          y: Math.round(minY + p.r * grid),
          w,
          h,
        })
      }
      const area = usedCw * usedCh
      // Prefer denser bbox; allow modest height growth if area drops a lot
      if (usedCh > spanCh + 3 && area >= oldArea * 0.92) continue
      if (
        contentRight != null &&
        next.some((n) => n.x + n.w > contentRight + 0.5)
      ) {
        continue
      }
      if (next.some((n) => n.y < opts.contentTop - 0.5)) {
        continue
      }
      let hitsPeer = false
      for (const n of next) {
        const nx1 = n.x + n.w
        const ny1 = n.y + n.h
        for (const peer of peerBoxes) {
          if (peer.key === key) continue
          if (
            n.x < peer.x1 - 1 &&
            nx1 > peer.x0 + 1 &&
            n.y < peer.y1 - 1 &&
            ny1 > peer.y0 + 1
          ) {
            hitsPeer = true
            break
          }
        }
        if (hitsPeer) break
      }
      if (hitsPeer) continue
      let selfOl = false
      for (let a = 0; a < next.length && !selfOl; a++) {
        for (let b = a + 1; b < next.length; b++) {
          const A = next[a]!
          const B = next[b]!
          if (
            A.x < B.x + B.w &&
            A.x + A.w > B.x &&
            A.y < B.y + B.h &&
            A.y + A.h > B.y
          ) {
            selfOl = true
            break
          }
        }
      }
      if (selfOl) continue
      if (
        !best ||
        area < best.area ||
        (area === best.area && usedCh < best.ch)
      ) {
        best = { next, area, ch: usedCh }
      }
    }

    // Apply multi-order tetris whenever it is not *worse* than the current
    // leaf bbox. Previously we required a strict area shrink ΓÇö so a shelf
    // layout with the same bounding box never got rewritten to free-flow,
    // and ΓÇ£Auto-layout inside panelΓÇ¥ looked magically better (it always
    // re-packs from scratch). Equal-area multi-order still wins.
    if (
      best &&
      best.area <= oldArea * 1.001 &&
      best.ch <= spanCh + 3
    ) {
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
