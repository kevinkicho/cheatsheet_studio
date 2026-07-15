import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from './constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from './folders'
import { packClusterTight, placeTopicRegionsDense } from './shelf'
import { panelRunsOverlap, rectsOverlap, rectPerimeterPathD } from './geometry'
import { chromeFromMembers } from './polyomino'

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
        // Foreign card intersects title strip → push our cards below it
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
    /** Printable right edge — densify must not place past this. */
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

  // Peer AABBs (other L1 groups) — densify must not invade them
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

    if (
      best &&
      (best.area < oldArea * 0.995 ||
        best.ch < spanCh ||
        best.area < oldArea * 0.9)
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

/** Push leaf-folder groups apart when AABBs collide (stroked L2/L3 frames). */
export function resolveLeafGroupCollisions(
  items: CanvasItem[],
  folders: FolderRef[],
  level: PanelGroupLevel,
  opts: { grid?: number; minGapPx?: number; parentLevel?: PanelGroupLevel },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const minGap = Math.max(0, opts.minGapPx ?? 0)
  const parentLevel = (opts.parentLevel ?? 1) as PanelGroupLevel
  const cards = items.filter((i) => !i.hidden && !isHeadingCard(i) && i.folderId)
  if (cards.length < 2) return items

  type G = {
    key: string
    parent: string
    ids: string[]
    x0: number
    y0: number
    x1: number
    y1: number
  }
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

  const dyOf = new Map<string, number>()
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!
    let newMinY = g.y0
    for (let j = 0; j < i; j++) {
      const h = groups[j]!
      if (h.parent !== g.parent) continue
      const xGap = Math.max(g.x0 - h.x1, h.x0 - g.x1)
      if (xGap >= Math.max(2, minGap)) continue
      if (newMinY >= h.y1 + minGap) continue
      newMinY = Math.max(newMinY, h.y1 + minGap)
    }
    const dy =
      newMinY > g.y0 ? Math.ceil((newMinY - g.y0) / grid) * grid : 0
    if (dy !== 0) {
      dyOf.set(g.key, dy)
      g.y0 += dy
      g.y1 += dy
    }
  }
  if (dyOf.size === 0) return items
  const idDy = new Map<string, number>()
  for (const g of groups) {
    const dy = dyOf.get(g.key) ?? 0
    if (dy === 0) continue
    for (const id of g.ids) idDy.set(id, dy)
  }
  return items.map((it) => {
    const dy = idDy.get(it.id)
    return dy ? { ...it, y: it.y + dy } : it
  })
}

/**
 * Tetris gravity: slide leaf groups up/left inside the same L1 parent only.
 */
export function gravityCompactGroups(
  items: CanvasItem[],
  folders: FolderRef[],
  level: PanelGroupLevel,
  opts?: {
    grid?: number
    gapPx?: number
    parentLevel?: PanelGroupLevel
    contentLeft?: number
    contentTop?: number
    contentRight?: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts?.grid ?? ORGANIZE_GRID)
  const gap = Math.max(0, opts?.gapPx ?? 0)
  const parentLevel = opts?.parentLevel
  const contentLeft = opts?.contentLeft ?? -Infinity
  const contentTop = opts?.contentTop ?? -Infinity
  const contentRight = opts?.contentRight ?? Infinity
  const cards = items.filter(
    (i) => !i.hidden && !isHeadingCard(i) && i.folderId,
  )
  if (cards.length < 2) return items

  type G = {
    key: string
    parent: string
    ids: string[]
    x0: number
    y0: number
    x1: number
    y1: number
  }
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
      parentLevel != null
        ? (folderAtGroupLevel(key, folders, parentLevel) ??
          folderAtGroupLevel(members[0]?.folderId, folders, parentLevel) ??
          '__root__')
        : '__root__'
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

  const collides = (g: G, x0: number, y0: number, ignoreKey: string) => {
    const x1 = x0 + (g.x1 - g.x0)
    const y1 = y0 + (g.y1 - g.y0)
    if (x0 < contentLeft - 0.5) return true
    if (x1 > contentRight + 0.5) return true
    if (y0 < contentTop - 0.5) return true
    for (const o of groups) {
      if (o.key === ignoreKey) continue
      if (parentLevel != null && o.parent !== g.parent) continue
      if (
        x0 < o.x1 + gap &&
        x1 + gap > o.x0 &&
        y0 < o.y1 + gap &&
        y1 + gap > o.y0
      ) {
        return true
      }
    }
    return false
  }

  const maxSlide = (
    g: G,
    axis: 'y' | 'x',
    from: number,
    limit: number,
  ): number => {
    if (!(limit < from - 0.5)) return from
    const lo0 = Math.ceil(Math.max(limit, -1e9) / grid) * grid
    let lo = lo0
    let hi = Math.floor(from / grid) * grid
    if (lo >= hi) return from
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2 / grid) * grid
      const x = axis === 'x' ? mid : g.x0
      const y = axis === 'y' ? mid : g.y0
      if (collides(g, x, y, g.key)) lo = mid + grid
      else hi = mid
    }
    const x = axis === 'x' ? lo : g.x0
    const y = axis === 'y' ? lo : g.y0
    return collides(g, x, y, g.key) ? from : lo
  }

  // Fewer sweeps — binary search is already O(log) per move
  for (let sweep = 0; sweep < 4; sweep++) {
    let moved = false
    const order = [...groups].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    for (const g of order) {
      const bestY = maxSlide(g, 'y', g.y0, contentTop)
      const dy0 = bestY - g.y0
      if (dy0 < -0.5) {
        g.y0 += dy0
        g.y1 += dy0
        moved = true
      }
      const bestX = maxSlide(g, 'x', g.x0, contentLeft)
      const dx0 = bestX - g.x0
      if (dx0 < -0.5) {
        g.x0 += dx0
        g.x1 += dx0
        moved = true
      }
    }
    if (!moved) break
  }

  const idDelta = new Map<string, { dx: number; dy: number }>()
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const g of groups) {
    const members = g.ids
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => Boolean(m))
    if (members.length === 0) continue
    const ox0 = Math.min(...members.map((m) => m.x))
    const oy0 = Math.min(...members.map((m) => m.y))
    const dx = g.x0 - ox0
    const dy = g.y0 - oy0
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
    for (const id of g.ids) idDelta.set(id, { dx, dy })
  }
  if (idDelta.size === 0) return items
  return items.map((it) => {
    const d = idDelta.get(it.id)
    return d
      ? { ...it, x: Math.round(it.x + d.dx), y: Math.round(it.y + d.dy) }
      : it
  })
}

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
    const dy =
      newMinY > g.minY ? Math.ceil((newMinY - g.minY) / grid) * grid : 0
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

export function resolveCardOverlaps(
  items: CanvasItem[],
  opts: { grid?: number; contentRight?: number },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const contentRight = opts.contentRight ?? Infinity
  const next = items.map((it) => ({ ...it }))
  const visible = () => next.filter((i) => !i.hidden && !isHeadingCard(i))

  for (let pass = 0; pass < 6; pass++) {
    let moved = false
    const cards = visible().sort(
      (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
    )
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]!
        const b = cards[j]!
        if (a.folderId && b.folderId && a.folderId !== b.folderId) {
          continue
        }
        if (!rectsOverlap(a, b, 0)) continue
        const bi = next.findIndex((x) => x.id === b.id)
        if (bi < 0) continue
        const cur = next[bi]!
        let nx = a.x + a.width
        let ny = cur.y
        if (nx + cur.width > contentRight + 1) {
          nx = Math.min(a.x, cur.x)
          ny = Math.max(a.y + a.height, cur.y + 1)
        }
        nx = Math.round(nx / grid) * grid
        ny = Math.round(ny / grid) * grid
        if (nx === cur.x && ny === cur.y) {
          ny = cur.y + grid
        }
        next[bi] = { ...cur, x: nx, y: ny }
        moved = true
      }
    }
    if (!moved) break
  }
  return next
}

/**
 * Rebuild chrome for same-level sibling panels that still overlap after pack
 * (residual pad collisions). Nested parent/child pairs are ignored.
 */
export function resolveSameLevelPanelCollisions(
  panels: LayoutPanel[],
  opts: {
    grid?: number
    panelPad?: number
    placed?: CanvasItem[]
    contentLeft?: number
    contentRight?: number
    multiLevel?: boolean
    outerLevel?: PanelGroupLevel
  },
): LayoutPanel[] {
  if (panels.length <= 1) return panels
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const padBudget = Math.max(0, opts.panelPad ?? 8)
  const byId = new Map((opts.placed ?? []).map((p) => [p.id, p]))
  const multi = opts.multiLevel === true
  const outerLevel = opts.outerLevel ?? 1
  const L1_CHIP = 22
  const L2_CHIP = 16
  let next = panels.slice()
  const padOf = new Map<string, number>(
    panels.map((p) => [p.id, padBudget]),
  )

  const isNested = (a: LayoutPanel, b: LayoutPanel) => {
    if (!a.memberIds?.length || !b.memberIds?.length) return false
    const aSet = new Set(a.memberIds)
    const bSet = new Set(b.memberIds)
    const aHasB = b.memberIds.every((id) => aSet.has(id))
    const bHasA = a.memberIds.every((id) => bSet.has(id))
    return aHasB || bHasA
  }

  const titleBandFor = (p: LayoutPanel): number => {
    if (p.showTitle === false) return 0
    const level = p.hierarchyLevel ?? 1
    if (multi && level === outerLevel) {
      // Room for L1 chip + top-row nested L2 chip (~42)
      return L1_CHIP + 4 + L2_CHIP
    }
    if (multi && level > outerLevel) return L2_CHIP
    return 16
  }

  const rebuild = (p: LayoutPanel, pad: number): LayoutPanel => {
    const members = (p.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => m != null && !m.hidden)
    if (members.length === 0) return p
    const titleBand = titleBandFor(p)
    const useNgon = p.shape === 'polygon'
    const minX = Math.min(...members.map((m) => m.x))
    const maxX = Math.max(...members.map((m) => m.x + m.width))
    let effPad = Math.max(0, pad)
    if (opts.contentLeft != null) {
      effPad = Math.min(effPad, Math.max(0, minX - opts.contentLeft))
    }
    if (opts.contentRight != null) {
      effPad = Math.min(effPad, Math.max(0, opts.contentRight - maxX))
    }
    const chrome = chromeFromMembers(members, {
      pad: effPad,
      titleBand,
      shape: useNgon ? 'polygon' : 'rect',
      grid,
      solidMode: useNgon ? 'blocks' : 'solid-aabb',
    })
    let { x, y, width, height } = chrome
    if (opts.contentLeft != null && x < opts.contentLeft) {
      width -= opts.contentLeft - x
      x = opts.contentLeft
    }
    if (opts.contentRight != null && x + width > opts.contentRight) {
      width = Math.max(8, opts.contentRight - x)
    }
    const runs = (chrome.runs ?? [{ x, y, width, height }]).map((r) => {
      let rx = r.x
      let rw = r.width
      if (opts.contentLeft != null && rx < opts.contentLeft) {
        rw -= opts.contentLeft - rx
        rx = opts.contentLeft
      }
      if (opts.contentRight != null && rx + rw > opts.contentRight) {
        rw = Math.max(8, opts.contentRight - rx)
      }
      return {
        x: Math.round(rx),
        y: Math.round(r.y),
        width: Math.max(8, Math.round(rw)),
        height: Math.max(8, Math.round(r.height)),
      }
    })
    const outline =
      chrome.outlinePath && width >= chrome.width - 1
        ? chrome.outlinePath
        : rectPerimeterPathD(x, y, width, height)
    return {
      ...p,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(8, Math.round(width)),
      height: Math.max(8, Math.round(height)),
      runs,
      outlinePath: outline,
      shape: useNgon ? 'polygon' : 'rect',
    }
  }

  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const a = next[i]!
        const b = next[j]!
        if ((a.hierarchyLevel ?? 1) !== (b.hierarchyLevel ?? 1)) continue
        if (a.showStroke === false || b.showStroke === false) continue
        if (isNested(a, b)) continue
        if (!(panelRunsOverlap(a, b, 0) || rectsOverlap(a, b, 0))) continue

        const pa = Math.max(0, (padOf.get(a.id) ?? padBudget) - 2)
        const pb = Math.max(0, (padOf.get(b.id) ?? padBudget) - 2)
        padOf.set(a.id, pa)
        padOf.set(b.id, pb)
        next[i] = rebuild(a, pa)
        next[j] = rebuild(b, pb)
        changed = true
      }
    }
    if (!changed) break
  }
  return next
}

/**
 * Hard panel layout invariants (fast):
 * - cards clear visual panel header chips (incl. nested L2 under L1)
 * - same-level stroked panels do not overlap
 *
 * Batches moves and rebuilds once per pass (not per collision).
 */
export function enforcePanelLayoutInvariants(
  items: CanvasItem[],
  panels: LayoutPanel[],
  opts?: {
    grid?: number
    panelPad?: number
    contentLeft?: number
    contentRight?: number
    contentTop?: number
    minGapPx?: number
  },
): { items: CanvasItem[]; panels: LayoutPanel[] } {
  if (panels.length === 0) return { items, panels }
  const grid = Math.max(4, opts?.grid ?? ORGANIZE_GRID)
  const padBudget = Math.max(0, opts?.panelPad ?? 4)
  const minGap = Math.max(0, opts?.minGapPx ?? 2)
  const left = opts?.contentLeft
  const right = opts?.contentRight
  const top = opts?.contentTop

  /**
   * Bottom of the *visible* title chip — matches LayoutPanelsLayer.
   * Cards must sit strictly below this Y.
   */
  const visualTitleBottom = (p: LayoutPanel, all: LayoutPanel[]): number => {
    if (p.showTitle === false || p.showStroke === false) return p.y
    // Match LayoutPanelsLayer: chip always on this panel's top edge.
    const level = p.hierarchyLevel ?? 1
    if (level <= 1) return p.y + exclusiveBand(p, all)
    // Nested L2/L3: local chip (~14px tall at y+2)
    return p.y + 2 + 14
  }

  const exclusiveBand = (p: LayoutPanel, all: LayoutPanel[]): number => {
    if (p.showTitle === false || p.showStroke === false) return 0
    if ((p.hierarchyLevel ?? 1) <= 1) {
      const hasNestedStroke = all.some(
        (c) =>
          c.id !== p.id &&
          c.showStroke !== false &&
          (c.hierarchyLevel ?? 1) > 1 &&
          c.memberIds?.length &&
          p.memberIds?.length &&
          c.memberIds.every((id) => p.memberIds!.includes(id)),
      )
      return hasNestedStroke ? 42 : 26
    }
    // Nested L2/L3: local chip strip (even under outer parent)
    return 16
  }

  const isNestedPair = (a: LayoutPanel, b: LayoutPanel) => {
    if (!a.memberIds?.length || !b.memberIds?.length) return false
    const aSet = new Set(a.memberIds)
    const bSet = new Set(b.memberIds)
    return (
      b.memberIds.every((id) => aSet.has(id)) ||
      a.memberIds.every((id) => bSet.has(id))
    )
  }

  const padOf = new Map<string, number>(
    panels.map((p) => [p.id, padBudget]),
  )

  const rebuild = (
    p: LayoutPanel,
    byId: Map<string, CanvasItem>,
    allPanels: LayoutPanel[],
    padUse?: number,
  ): LayoutPanel => {
    const members = (p.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is CanvasItem => Boolean(m) && !m.hidden)
    if (members.length === 0) return p
    const titleBand = exclusiveBand(p, allPanels)
    const useNgon = p.shape === 'polygon'
    let effPad = Math.max(0, padUse ?? padOf.get(p.id) ?? padBudget)
    const minX = Math.min(...members.map((m) => m.x))
    const maxX = Math.max(...members.map((m) => m.x + m.width))
    if (left != null) {
      effPad = Math.min(effPad, Math.max(0, minX - left))
    }
    if (right != null) {
      effPad = Math.min(effPad, Math.max(0, right - maxX))
    }
    const chrome = chromeFromMembers(members, {
      pad: effPad,
      titleBand,
      shape: useNgon ? 'polygon' : 'rect',
      grid,
      solidMode: useNgon ? 'blocks' : 'solid-aabb',
    })
    let { x, y, width, height } = chrome
    if (left != null && x < left) {
      width -= left - x
      x = left
    }
    if (right != null && x + width > right) {
      width = Math.max(8, right - x)
    }
    if (top != null && y < top) {
      height -= top - y
      y = top
    }
    const runs = (chrome.runs ?? [{ x, y, width, height }]).map((r) => {
      let rx = r.x
      let ry = r.y
      let rw = r.width
      let rh = r.height
      if (left != null && rx < left) {
        rw -= left - rx
        rx = left
      }
      if (right != null && rx + rw > right) rw = Math.max(8, right - rx)
      if (top != null && ry < top) {
        rh -= top - ry
        ry = top
      }
      return {
        x: Math.round(rx),
        y: Math.round(ry),
        width: Math.max(8, Math.round(rw)),
        height: Math.max(8, Math.round(rh)),
      }
    })
    return {
      ...p,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(8, Math.round(width)),
      height: Math.max(8, Math.round(height)),
      runs,
      outlinePath:
        chrome.outlinePath && width >= chrome.width - 1
          ? chrome.outlinePath
          : rectPerimeterPathD(x, y, width, height),
      shape: useNgon ? 'polygon' : p.shape,
    }
  }

  const rebuildAll = (nextItems: CanvasItem[], nextPanels: LayoutPanel[]) => {
    const byId = new Map(nextItems.map((i) => [i.id, i]))
    return nextPanels.map((p) =>
      rebuild(p, byId, nextPanels, padOf.get(p.id)),
    )
  }

  let nextItems = items.map((i) => ({ ...i }))
  let nextPanels = rebuildAll(nextItems, panels.map((p) => ({ ...p })))

  // ── A: cards clear visual title chips (batch per pass) ────────────────
  for (let pass = 0; pass < 3; pass++) {
    nextPanels = rebuildAll(nextItems, nextPanels)
    const byId = new Map(nextItems.map((i) => [i.id, i]))
    const dyById = new Map<string, number>()
    for (const p of nextPanels) {
      if (p.showStroke === false) continue
      const titleBot = visualTitleBottom(p, nextPanels)
      for (const id of p.memberIds ?? []) {
        const c = byId.get(id)
        if (!c || c.hidden) continue
        if (c.y < titleBot - 0.5) {
          const dy = Math.ceil((titleBot - c.y) / grid) * grid
          if (dy > 0) {
            dyById.set(id, Math.max(dyById.get(id) ?? 0, dy))
          }
        }
      }
    }
    if (dyById.size === 0) break
    nextItems = nextItems.map((it) => {
      const dy = dyById.get(it.id)
      return dy ? { ...it, y: Math.round(it.y + dy) } : it
    })
  }

  // ── B: sibling non-overlap (≤4 passes, one rebuild at end of each) ────
  for (let pass = 0; pass < 4; pass++) {
    nextPanels = rebuildAll(nextItems, nextPanels)
    const byIdPanel = new Map(nextPanels.map((p) => [p.id, p]))
    let any = false
    const dyCluster = new Map<string, number>() // panelId → dy for its members

    const levels = [
      ...new Set(nextPanels.map((p) => p.hierarchyLevel ?? 1)),
    ].sort((a, b) => a - b)

    for (const level of levels) {
      const list = nextPanels
        .filter(
          (p) =>
            (p.hierarchyLevel ?? 1) === level && p.showStroke !== false,
        )
        .sort(
          (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
        )
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = byIdPanel.get(list[i]!.id) ?? list[i]!
          const b = byIdPanel.get(list[j]!.id) ?? list[j]!
          if (isNestedPair(a, b)) continue
          if (!(panelRunsOverlap(a, b, 0) || rectsOverlap(a, b, minGap))) {
            continue
          }
          const yOverlap =
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
          const xOverlap =
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
          const padA = padOf.get(a.id) ?? padBudget
          const padB = padOf.get(b.id) ?? padBudget
          // Prefer vertical separation over pad-shrink (pad-shrink left cards
          // flush on the stroke — contain-cards flushBorder).
          const needY = a.y + a.height + minGap - b.y
          if (needY > 0.5 && b.memberIds?.length && yOverlap > 0) {
            const dy = Math.ceil(needY / grid) * grid
            dyCluster.set(b.id, Math.max(dyCluster.get(b.id) ?? 0, dy))
            any = true
            continue
          }
          // Thin side-pad collision only: trim pad but never below 2px
          if (
            xOverlap > 0 &&
            yOverlap > 0 &&
            xOverlap <= padA + padB + minGap + 2 &&
            (padA > 2 || padB > 2)
          ) {
            padOf.set(a.id, Math.max(2, padA - 2))
            padOf.set(b.id, Math.max(2, padB - 2))
            any = true
          }
        }
      }
    }

    if (dyCluster.size === 0 && !any) break
    if (dyCluster.size > 0) {
      const idDy = new Map<string, number>()
      for (const [pid, dy] of dyCluster) {
        const p = byIdPanel.get(pid)
        if (!p?.memberIds) continue
        for (const id of p.memberIds) {
          idDy.set(id, Math.max(idDy.get(id) ?? 0, dy))
        }
      }
      nextItems = nextItems.map((it) => {
        const dy = idDy.get(it.id)
        return dy ? { ...it, y: Math.round(it.y + dy) } : it
      })
    }
    if (!any) break
  }

  nextPanels = rebuildAll(nextItems, nextPanels)
  return { items: nextItems, panels: nextPanels }
}
