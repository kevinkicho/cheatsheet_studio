import type { CanvasItem } from '@/types'
import {
  ORGANIZE_GRID,
  type GroupSortOrder,
  type PanelGroupLevel,
} from '../constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from '../folders'
import { packClusterTight } from '../shelf'
import { packLeavesPixelDense, type PixelLeaf } from './packLeavesPixel'

/**
 * Re-pack every leaf (L2) *inside* its parent (L1):
 * 1. Shrink each leaf interior to min free-flow bbox
 * 2. Pixel multi-order densest footprint pack (hole-aware)
 * 3. Stack L1 parents by groupSort
 *
 * Never freefalls across L1s — each parent is packed in its own band then stacked.
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
    groupSort?: GroupSortOrder
    denseLeaves?: boolean
    leafGapXPx?: number
    leafGapYPx?: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const parentGap = Math.max(0, opts.parentGapPx ?? 0)
  const titleCells = Math.max(0, opts.titleCells ?? 0)
  const contentLeft = opts.contentLeft
  const contentTop = opts.contentTop
  const contentRight = opts.contentRight
  const groupSort = opts.groupSort ?? 'none'
  const preserveOrder =
    groupSort === 'name-asc' || groupSort === 'name-desc'
  // Pixel gap between L2 footprints — use horizontal clear (no title) so
  // free-flow doesn't reserve 16px phantom gutters between side-by-side L2s.
  // Vertical title room is restored by resolveLeafGroupCollisions after.
  const leafGapPx = Math.max(
    0,
    Math.round(opts.leafGapXPx ?? opts.leafGapYPx ?? 0),
  )
  const pageCols = Math.max(
    1,
    Math.floor((contentRight - contentLeft) / grid),
  )
  const packW = Math.max(48, contentRight - contentLeft)

  // Include ungrouped (no folderId) — same bug as restackParentClusters:
  // excluding them left process charts freefloating under restacked topics.
  const cards = items.filter((i) => !i.hidden && !isHeadingCard(i))
  if (cards.length < 2) return items

  type Leaf = {
    key: string
    name: string
    ids: string[]
    pixel: PixelLeaf
  }

  const UNGROUPED = '__ungrouped__'
  const folderName = new Map(
    folders.map((f) => [f.id, (f.name ?? f.id).toLocaleLowerCase()]),
  )
  const leafName = (key: string) =>
    key === UNGROUPED
      ? 'ungrouped'
      : (folderName.get(key) ?? key.toLocaleLowerCase())

  const parents = new Map<string, Leaf[]>()
  const parentOrder: string[] = []
  const parentMinY = new Map<string, number>()
  const parentName = new Map<string, string>()
  const leafMap = new Map<string, CanvasItem[]>()

  for (const c of cards) {
    const leafKey = c.folderId
      ? (folderAtGroupLevel(c.folderId, folders, leafLevel) ??
        c.folderId)
      : UNGROUPED
    if (!leafMap.has(leafKey)) leafMap.set(leafKey, [])
    leafMap.get(leafKey)!.push(c)
  }

  for (const [leafKey, members] of leafMap) {
    const parentKey =
      leafKey === UNGROUPED
        ? UNGROUPED
        : (folderAtGroupLevel(leafKey, folders, parentLevel) ??
          folderAtGroupLevel(members[0]?.folderId, folders, parentLevel) ??
          leafKey)
    const minY = Math.min(...members.map((m) => m.y))
    if (!parents.has(parentKey)) {
      parents.set(parentKey, [])
      parentOrder.push(parentKey)
      parentMinY.set(parentKey, minY)
      parentName.set(parentKey, leafName(parentKey))
    } else {
      parentMinY.set(
        parentKey,
        Math.min(parentMinY.get(parentKey) ?? minY, minY),
      )
    }

    // Minimal interior free-flow for this leaf's cards
    const cardRegs = members.map((m, i) => ({
      index: i,
      cw: Math.max(1, Math.ceil(m.width / grid)),
      ch: Math.max(1, Math.ceil(m.height / grid)),
    }))
    const inner = packClusterTight(cardRegs, pageCols, 0, {
      multiOrder: true,
      preserveOrder: false,
    })
    const locals: PixelLeaf['locals'] = []
    let maxR = 0
    let maxB = 0
    for (let i = 0; i < members.length; i++) {
      const m = members[i]!
      const p = inner.pos.get(i) ?? { c: 0, r: 0 }
      const w = Math.max(grid, Math.round(m.width))
      const h = Math.max(grid, Math.round(m.height))
      const dx = p.c * grid
      const dy = p.r * grid
      locals.push({ id: m.id, dx, dy, w, h })
      maxR = Math.max(maxR, dx + w)
      maxB = Math.max(maxB, dy + h)
    }
    const footW = Math.max(8, maxR, inner.usedCw * grid)
    const footH = Math.max(8, maxB, inner.usedCh * grid)
    parents.get(parentKey)!.push({
      key: leafKey,
      name: leafName(leafKey),
      ids: members.map((m) => m.id),
      pixel: { id: leafKey, w: footW, h: footH, locals },
    })
  }

  if (preserveOrder) {
    const dir = groupSort === 'name-desc' ? -1 : 1
    parentOrder.sort((a, b) => {
      const na = parentName.get(a) ?? a
      const nb = parentName.get(b) ?? b
      if (na < nb) return -1 * dir
      if (na > nb) return 1 * dir
      return (parentMinY.get(a) ?? 0) - (parentMinY.get(b) ?? 0)
    })
  } else {
    parentOrder.sort(
      (a, b) => (parentMinY.get(a) ?? 0) - (parentMinY.get(b) ?? 0),
    )
  }

  const idPos = new Map<string, { x: number; y: number; w: number; h: number }>()
  let cursorY = contentTop

  for (const parentKey of parentOrder) {
    const leaves = parents.get(parentKey) ?? []
    if (leaves.length === 0) continue

    const originY = Math.max(contentTop, cursorY) + titleCells * grid
    const packed = packLeavesPixelDense(
      leaves.map((L) => L.pixel),
      packW,
      leafGapPx,
    )

    let maxBottom = originY
    for (const [cardId, p] of packed.cardPos) {
      const x = Math.round(contentLeft + p.x)
      const y = Math.round(originY + p.y)
      let w = p.w
      let h = p.h
      let nx = x
      if (nx < contentLeft) {
        w -= contentLeft - nx
        nx = contentLeft
      }
      if (nx + w > contentRight) {
        w = Math.max(grid, contentRight - nx)
      }
      idPos.set(cardId, {
        x: nx,
        y,
        w: Math.max(grid, Math.round(w)),
        h: Math.max(grid, Math.round(h)),
      })
      maxBottom = Math.max(maxBottom, y + h)
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
