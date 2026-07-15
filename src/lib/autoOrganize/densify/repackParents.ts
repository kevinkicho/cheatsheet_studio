import type { CanvasItem } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'
import { packClusterTight, placeTopicRegionsDense } from '../shelf'

/**
 * Re-pack every leaf (L2/L3) group *inside* its parent (L1) into a tight
 * rectangular free-flow, then stack parents with no interleave.
 */
export function repackGroupsInParents(
  items: CanvasItem[],
  folders: FolderRef[],
  leafLevel: PanelGroupLevel,
  parentLevel: PanelGroupLevel,
  opts: {
    grid?: number
    contentLeft: number
    contentTop: number
    contentRight: number
    gapCells?: number
    parentGapPx?: number
    titleCells?: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const gapCells = Math.max(0, opts.gapCells ?? 0)
  const parentGap = Math.max(0, opts.parentGapPx ?? 0)
  const titleCells = Math.max(0, opts.titleCells ?? 0)
  const contentLeft = opts.contentLeft
  const contentTop = opts.contentTop
  const contentRight = opts.contentRight
  const pageCols = Math.max(
    1,
    Math.floor((contentRight - contentLeft) / grid),
  )

  const cards = items.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length < 2) return items

  type Leaf = {
    key: string
    ids: string[]
    cw: number
    ch: number
    locals: Array<{ id: string; dx: number; dy: number; w: number; h: number }>
  }

  const parents = new Map<string, Leaf[]>()
  const parentOrder: string[] = []
  const parentMinY = new Map<string, number>()
  const leafMap = new Map<string, CanvasItem[]>()

  for (const c of cards) {
    const leafKey =
      folderAtGroupLevel(c.folderId, folders, leafLevel) ??
      c.folderId ??
      c.id
    if (!leafMap.has(leafKey)) leafMap.set(leafKey, [])
    leafMap.get(leafKey)!.push(c)
  }

  for (const [leafKey, members] of leafMap) {
    const parentKey =
      folderAtGroupLevel(leafKey, folders, parentLevel) ??
      folderAtGroupLevel(members[0]?.folderId, folders, parentLevel) ??
      leafKey
    const minY = Math.min(...members.map((m) => m.y))
    if (!parents.has(parentKey)) {
      parents.set(parentKey, [])
      parentOrder.push(parentKey)
      parentMinY.set(parentKey, minY)
    } else {
      parentMinY.set(
        parentKey,
        Math.min(parentMinY.get(parentKey) ?? minY, minY),
      )
    }
    const minX = Math.min(...members.map((m) => m.x))
    const minYy = Math.min(...members.map((m) => m.y))
    const maxX = Math.max(...members.map((m) => m.x + m.width))
    const maxY = Math.max(...members.map((m) => m.y + m.height))
    const cw = Math.max(1, Math.ceil((maxX - minX) / grid))
    const ch = Math.max(1, Math.ceil((maxY - minYy) / grid))
    parents.get(parentKey)!.push({
      key: leafKey,
      ids: members.map((m) => m.id),
      cw: Math.min(pageCols, cw),
      ch,
      locals: members.map((m) => ({
        id: m.id,
        dx: m.x - minX,
        dy: m.y - minYy,
        w: m.width,
        h: m.height,
      })),
    })
  }
  parentOrder.sort(
    (a, b) => (parentMinY.get(a) ?? 0) - (parentMinY.get(b) ?? 0),
  )

  const idPos = new Map<string, { x: number; y: number; w: number; h: number }>()
  let cursorY = contentTop

  for (const parentKey of parentOrder) {
    const leaves = parents.get(parentKey) ?? []
    if (leaves.length === 0) continue

    const regions = leaves.map((L, i) => ({
      index: i,
      cw: Math.min(pageCols, Math.max(1, L.cw)),
      ch: Math.max(1, L.ch),
    }))
    const tight = packClusterTight(regions, pageCols, gapCells)
    const originX = contentLeft
    const originY = Math.max(contentTop, cursorY) + titleCells * grid

    let maxBottom = originY
    for (let i = 0; i < leaves.length; i++) {
      const L = leaves[i]!
      const p = tight.pos.get(i) ?? { c: 0, r: 0 }
      const baseX = originX + p.c * grid
      const baseY = originY + p.r * grid
      for (const loc of L.locals) {
        let w = loc.w
        let h = loc.h
        const maxW = Math.max(grid, L.cw * grid - loc.dx)
        if (w > maxW) w = maxW
        let x = baseX + loc.dx
        let y = baseY + loc.dy
        if (x + w > contentRight) {
          w = Math.max(grid, contentRight - x)
        }
        if (x < contentLeft) {
          w -= contentLeft - x
          x = contentLeft
        }
        const nx = Math.round(x)
        const ny = Math.round(y)
        const nw = Math.max(grid, Math.round(w))
        const nh = Math.max(grid, Math.round(h))
        idPos.set(loc.id, { x: nx, y: ny, w: nw, h: nh })
        maxBottom = Math.max(maxBottom, ny + nh)
      }
    }

    cursorY = maxBottom + parentGap
  }

  if (idPos.size === 0) return items
  return items.map((it) => {
    const n = idPos.get(it.id)
    return n
      ? { ...it, x: n.x, y: n.y, width: n.w, height: n.h }
      : it
  })
}
