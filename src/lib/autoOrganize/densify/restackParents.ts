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

/** Synthetic cluster key for cards with no Layers folder (process charts, etc.). */
export const UNGROUPED_CLUSTER_KEY = '__ungrouped__'

/**
 * Re-stack whole L1 parent clusters in groupSort order without changing
 * *relative* leaf layout inside each parent.
 *
 * Why: leaf gravity/refit only collide with same-parent peers, so with
 * contentTop=packTop every L1 could freefall to the top and interleave
 * (Biology under #6, General on top — massive shakedown). This pass is the
 * hard guarantee that topic order matches the sidebar Group sort.
 *
 * Critical: cards **without folderId** (process chart, loose cards) MUST join
 * an "Ungrouped" cluster. Older code filtered `&& i.folderId`, so Apply
 * restacked folder topics onto freefloating ungrouped cards (screenshot
 * 014214→014235: mindmap crushed under COLLECTION 123).
 */
export function restackParentClusters(
  items: CanvasItem[],
  folders: FolderRef[],
  parentLevel: PanelGroupLevel,
  opts: {
    grid?: number
    contentLeft: number
    contentTop: number
    contentRight: number
    parentGapPx?: number
    groupSort?: GroupSortOrder
  },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const parentGap = Math.max(0, opts.parentGapPx ?? 0)
  const contentLeft = opts.contentLeft
  const contentTop = opts.contentTop
  const contentRight = opts.contentRight
  const groupSort = opts.groupSort ?? 'none'
  // Include ungrouped body cards — they form a real L1 band
  const cards = items.filter((i) => !i.hidden && !isHeadingCard(i))
  if (cards.length < 1) return items

  type Cluster = {
    key: string
    name: string
    ids: string[]
    minX: number
    minY: number
    maxX: number
    maxY: number
  }

  const folderName = new Map(
    folders.map((f) => [f.id, (f.name ?? f.id).toLocaleLowerCase()]),
  )
  const map = new Map<string, CanvasItem[]>()
  for (const c of cards) {
    const key = c.folderId
      ? (folderAtGroupLevel(c.folderId, folders, parentLevel) ??
        c.folderId)
      : UNGROUPED_CLUSTER_KEY
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }

  const clusters: Cluster[] = []
  for (const [key, members] of map) {
    clusters.push({
      key,
      name:
        key === UNGROUPED_CLUSTER_KEY
          ? 'ungrouped'
          : (folderName.get(key) ?? key.toLocaleLowerCase()),
      ids: members.map((m) => m.id),
      minX: Math.min(...members.map((m) => m.x)),
      minY: Math.min(...members.map((m) => m.y)),
      maxX: Math.max(...members.map((m) => m.x + m.width)),
      maxY: Math.max(...members.map((m) => m.y + m.height)),
    })
  }

  if (groupSort === 'name-asc' || groupSort === 'name-desc') {
    const dir = groupSort === 'name-desc' ? -1 : 1
    clusters.sort((a, b) => {
      // Keep Ungrouped last for predictable reading (named topics first)
      if (a.key === UNGROUPED_CLUSTER_KEY) return 1
      if (b.key === UNGROUPED_CLUSTER_KEY) return -1
      if (a.name < b.name) return -1 * dir
      if (a.name > b.name) return 1 * dir
      return a.minY - b.minY
    })
  } else {
    // Document / spatial order: keep current top-to-bottom
    clusters.sort((a, b) => a.minY - b.minY || a.minX - b.minX)
  }

  const idDelta = new Map<string, { dx: number; dy: number }>()
  let cursorY = contentTop
  // Cluster AABB is card content only; panel chrome (title chip + pad + stroke)
  // extends past that on top and bottom. Without this fudge, L1 frames
  // paint-overlap even when card bands are gap-separated.
  const chromeFudge = 56

  for (const cl of clusters) {
    const w = cl.maxX - cl.minX
    const h = cl.maxY - cl.minY + chromeFudge
    // Full-width band stack: pin every L1 cluster to contentLeft so sibling
    // topics never share a horizontal band (overlapping L1 frames).
    let destX = contentLeft
    if (destX + w > contentRight) {
      destX = Math.max(contentLeft, contentRight - w)
    }
    const destY = cursorY
    const dx = destX - cl.minX
    const dy = destY - cl.minY
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      for (const id of cl.ids) idDelta.set(id, { dx, dy })
    }
    cursorY = destY + h + parentGap
  }

  if (idDelta.size === 0) return items
  return items.map((it) => {
    const d = idDelta.get(it.id)
    return d
      ? { ...it, x: Math.round(it.x + d.dx), y: Math.round(it.y + d.dy) }
      : it
  })
}
