import type { CanvasItem, LayoutPanel } from '@/types'
import { ORGANIZE_GRID, type PanelGroupLevel } from './constants'
import {
  folderAtGroupLevel,
  type FolderRef,
  isHeadingCard,
} from './folders'
import { placeTopicRegionsDense } from './shelf'
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
  for (let pass = 0; pass < 8; pass++) {
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
    pageCols: number
    gapCells?: number
  },
): CanvasItem[] {
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const gap = Math.max(0, opts.gapCells ?? 0)
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

    // Try several widths: tight, current span, slightly wider (fill residual)
    const candidates = Array.from(
      new Set(
        [
          spanCw,
          Math.min(opts.pageCols, Math.max(maxCardW, Math.ceil(spanCw * 0.85))),
          Math.min(opts.pageCols, spanCw + 2),
          Math.min(
            opts.pageCols,
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
        ].map((w) => Math.max(maxCardW, Math.min(opts.pageCols, w))),
      ),
    )

    let best: {
      next: Array<{ id: string; x: number; y: number; w: number; h: number }>
      area: number
      ch: number
    } | null = null

    for (const packCols of candidates) {
      // Cell sizes must be ceilings so pixel widths never spill into neighbors
      // (round caused card-card overlaps in export SVG).
      const regions = members.map((m, i) => ({
        index: i,
        cw: Math.min(packCols, Math.max(1, Math.ceil(m.width / grid))),
        ch: Math.max(1, Math.ceil(m.height / grid)),
      }))
      const pos = placeTopicRegionsDense(regions, packCols, gap, {
        sortByHeight: true,
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
        // Snap display size into allocated cells so no pixel spillover
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
      // Reject taller than original unless area much smaller
      if (usedCh > spanCh + 1) continue
      // Peer collision check
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
      // Reject self-overlaps (safety)
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
      (best.area < oldArea * 0.995 || best.ch < spanCh)
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
    // When separating the shallow (L1) level itself, all topics are siblings
    // under a synthetic root. Otherwise group by L1 parent.
    const parent =
      parentLevel >= level
        ? '__root__'
        : (folderAtGroupLevel(key, folders, parentLevel) ??
          folderAtGroupLevel(members[0]?.folderId, folders, parentLevel) ??
          key)
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

  // Only separate siblings under the same L1 parent
  const byParent = new Map<string, G[]>()
  for (const g of groups) {
    if (!byParent.has(g.parent)) byParent.set(g.parent, [])
    byParent.get(g.parent)!.push(g)
  }

  const dyOf = new Map<string, number>()
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    for (let i = 0; i < siblings.length; i++) {
      const g = siblings[i]!
      // Single target Y (max over prior siblings). Prior siblings already have
      // y0/y1 mutated — do NOT add dyOf again (that double-counted).
      let newY0 = g.y0
      for (let j = 0; j < i; j++) {
        const h = siblings[j]!
        const hy1 = h.y1
        const hx0 = h.x0
        const hx1 = h.x1
        // Side-by-side with clear horizontal gap → leave alone (tetris)
        const xGap = Math.max(g.x0 - hx1, hx0 - g.x1)
        if (xGap >= Math.max(2, minGap)) continue
        if (newY0 >= hy1 + minGap) continue
        newY0 = Math.max(newY0, hy1 + minGap)
      }
      const dy =
        newY0 > g.y0 ? Math.ceil((newY0 - g.y0) / grid) * grid : 0
      if (dy !== 0) dyOf.set(g.key, dy)
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
 * Tetris gravity: slide each leaf group up (then left) into free space so
 * n-gon / rect panels stack tightly toward the top like tetris blocks.
 * Respects peer AABBs and optional parent envelope.
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
      // Only compact inside the same L1 parent. Sliding into another topic's
      // internal holes was re-interleaving Biology/Chemistry (user “ugh no”).
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

  /** Binary-search lowest grid-aligned coord on −axis that still fits. */
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
    // Invariant: collides at positions < answer; free at answer..from
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

  // Gravity sweeps (up first, then left) — binary search, not per-cell walk
  for (let sweep = 0; sweep < 8; sweep++) {
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
  // Rebuild deltas from original positions via id → group
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const g of groups) {
    const sample = byId.get(g.ids[0]!)
    if (!sample) continue
    // Original group origin from current card positions before we apply —
    // recompute from first card vs g.x0
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
 * Push whole folder clusters apart so parent-level AABBs never interleave.
 *
 * Leaf densify / title clearance / sibling collision can expand an L1 band
 * downward into the next topic — both rect and n-gon then paint double
 * borders and look “broken”. This pass restores non-overlapping parents.
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
    // Single target Y. Prior clusters already have minY/maxY mutated.
    let newMinY = g.minY
    for (let j = 0; j < i; j++) {
      const h = clusters[j]!
      const hy1 = h.maxY
      const hx0 = h.minX
      const hx1 = h.maxX
      // Side-by-side only with a real horizontal gap. Any X overlap → stack
      // vertically (prevents Biology/Chemistry interleave).
      const xGap = Math.max(g.minX - hx1, hx0 - g.maxX)
      if (xGap >= Math.max(2, minGap)) continue
      if (newMinY >= hy1 + minGap) continue
      newMinY = Math.max(newMinY, hy1 + minGap)
    }
    const dy =
      newMinY > g.minY ? Math.ceil((newMinY - g.minY) / grid) * grid : 0
    if (dy !== 0) dyOf.set(g.key, dy)
    g.minY += dy
    g.maxY += dy
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

  for (let pass = 0; pass < 8; pass++) {
    let moved = false
    const cards = visible().sort(
      (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
    )
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]!
        const b = cards[j]!
        // Cross-folder pairs should not be moved — that expands panel AABBs
        // into siblings and causes stroke overlaps in the export SVG.
        if (
          a.folderId &&
          b.folderId &&
          a.folderId !== b.folderId
        ) {
          continue
        }
        if (!rectsOverlap(a, b, 0)) continue
        // Move the later card (j) out of the way
        const bi = next.findIndex((x) => x.id === b.id)
        if (bi < 0) continue
        const cur = next[bi]!
        // Try right first
        let nx = a.x + a.width
        let ny = cur.y
        if (nx + cur.width > contentRight + 1) {
          // wrap: below the pair
          nx = Math.min(a.x, cur.x)
          ny = Math.max(a.y + a.height, cur.y + 1)
        }
        // Snap to grid
        nx = Math.round(nx / grid) * grid
        ny = Math.round(ny / grid) * grid
        if (nx === cur.x && ny === cur.y) {
          ny = cur.y + grid
        }
        // Bail if still overlapping a (shouldn't after right shift)
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
 * Prefer reduced pad so member cards stay inside the frame.
 */
export function resolveSameLevelPanelCollisions(
  panels: LayoutPanel[],
  opts: {
    grid?: number
    panelPad?: number
    placed?: CanvasItem[]
    contentLeft?: number
    contentRight?: number
    /** Multi-level hierarchy: preserve exclusive L1 title band above L2. */
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
  const L2_CHIP = 18
  let next = panels.slice()
  // Track pad used per panel id (start at full pad)
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

  /** Hierarchy-aware title band — must match buildNestedHierarchyPanels. */
  const titleBandFor = (p: LayoutPanel): number => {
    if (p.showTitle === false) return 0
    const level = p.hierarchyLevel ?? 1
    if (multi && level === outerLevel) return L1_CHIP + 4 + L2_CHIP
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
    // Clamp pad so rebuild never leaves the print content box
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

  for (let pass = 0; pass < 5; pass++) {
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
