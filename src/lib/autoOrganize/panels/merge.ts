import type { LayoutPanel } from '@/types'
import { ORGANIZE_GRID } from '../constants'
import {
  fillPolyominoHoles,
  closePolyomino,
  polyominoExteriorPathD,
} from '../polyomino'
import { cellsToOrthogonalRuns } from '../freeGrid'
import {
  rectPerimeterPathD,
  panelRunsOverlap,
  rectsOverlap,
} from '../geometry'

export function mergeAdjacentOutermostPanels(
  panels: LayoutPanel[],
  opts: { grid?: number; panelPad?: number },
): LayoutPanel[] {
  if (panels.length <= 1) return panels
  const grid = Math.max(4, opts.grid ?? ORGANIZE_GRID)
  const pad = Math.max(0, opts.panelPad ?? 8)

  // Merge per hierarchy level among panels that currently stroke
  const levels = Array.from(
    new Set(
      panels
        .filter((p) => p.showStroke !== false)
        .map((p) => p.hierarchyLevel ?? 1),
    ),
  ).sort((a, b) => a - b)

  let result = panels.slice()
  for (const level of levels) {
    result = mergeStrokedPanelsAtLevel(result, level, grid, pad)
  }
  return result
}

function mergeStrokedPanelsAtLevel(
  panels: LayoutPanel[],
  level: number,
  grid: number,
  pad: number,
): LayoutPanel[] {
  const stroked = panels.filter(
    (p) => (p.hierarchyLevel ?? 1) === level && p.showStroke !== false,
  )
  const rest = panels.filter((p) => !stroked.some((o) => o.id === p.id))
  if (stroked.length <= 1) {
    // Still ensure every stroked panel has a visible exterior outline
    return panels.map((p) => {
      if ((p.hierarchyLevel ?? 1) !== level || p.showStroke === false) return p
      const outline =
        p.outlinePath ||
        rectPerimeterPathD(p.x, p.y, p.width, p.height)
      return {
        ...p,
        showStroke: true,
        outlinePath: outline,
      }
    })
  }

  // Merge only when chrome **actually overlaps** (or shares an edge within 1px).
  // Do NOT use large proximity — that chain-merged the whole Everything sheet
  // into one mega n-gon (stroked:1) and wiped per-section borders.
  const parent = stroked.map((_, i) => i)
  const find = (i: number): number => {
    let p = i
    while (parent[p] !== p) p = parent[p]!
    let x = i
    while (parent[x] !== x) {
      const n = parent[x]!
      parent[x] = p
      x = n
    }
    return p
  }
  const unite = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  /** True when panels share area or a flush edge (not merely nearby). */
  const shouldMerge = (a: LayoutPanel, b: LayoutPanel) => {
    // Different topic folders at the same outermost level must keep separate
    // borders — free-flow often packs L1 topics flush against each other.
    if (
      a.folderId &&
      b.folderId &&
      a.folderId !== b.folderId &&
      (a.hierarchyLevel ?? 1) === (b.hierarchyLevel ?? 1)
    ) {
      return false
    }
    // Run/AABB overlap with tiny eps (touching edges count)
    if (panelRunsOverlap(a, b, 0)) return true
    if (rectsOverlap(a, b, 0)) return true
    return false
  }
  for (let i = 0; i < stroked.length; i++) {
    for (let j = i + 1; j < stroked.length; j++) {
      if (shouldMerge(stroked[i]!, stroked[j]!)) unite(i, j)
    }
  }

  const groups = new Map<number, LayoutPanel[]>()
  stroked.forEach((p, i) => {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(p)
  })

  const merged: LayoutPanel[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      const g = group[0]!
      const outline =
        g.outlinePath ||
        rectPerimeterPathD(g.x, g.y, g.width, g.height)
      merged.push({
        ...g,
        showStroke: true,
        outlinePath: outline,
      })
      continue
    }

    const leader = [...group].sort(
      (a, b) => a.y - b.y || a.x - b.x,
    )[0]!
    const minX = Math.min(...group.map((g) => g.x))
    const minY = Math.min(...group.map((g) => g.y))
    const maxX = Math.max(...group.map((g) => g.x + g.width))
    const maxY = Math.max(...group.map((g) => g.y + g.height))

    // Union runs → cells → close gaps → exterior outline only (internal joins
    // between overlapping panels are omitted). Pad expands stroke outward.
    const originX = minX
    const originY = minY
    let unit = new Set<string>()
    for (const g of group) {
      const runs =
        g.runs && g.runs.length > 0
          ? g.runs
          : [{ x: g.x, y: g.y, width: g.width, height: g.height }]
      for (const r of runs) {
        const c0 = Math.floor((r.x - originX) / grid)
        const c1 = Math.ceil((r.x + r.width - originX) / grid)
        const r0 = Math.floor((r.y - originY) / grid)
        const r1 = Math.ceil((r.y + r.height - originY) / grid)
        for (let rr = r0; rr < Math.max(r0 + 1, r1); rr++) {
          for (let cc = c0; cc < Math.max(c0 + 1, c1); cc++) {
            unit.add(`${cc},${rr}`)
          }
        }
      }
    }
    unit = fillPolyominoHoles(unit)
    // Light close only to seal 1-cell gaps at the join — keep L-steps
    unit = closePolyomino(unit, 1)
    const solidCells: Array<{ c: number; r: number; cw: number; ch: number }> =
      []
    for (const k of unit) {
      const [cs, rs] = k.split(',')
      solidCells.push({ c: Number(cs), r: Number(rs), cw: 1, ch: 1 })
    }
    const runsRaw = cellsToOrthogonalRuns(solidCells, grid, originX, originY, 0)
    // Pad > 0 so the exterior stroke is clearly visible outside the fill
    const outlinePath =
      polyominoExteriorPathD(unit, grid, originX, originY, Math.max(2, pad)) ||
      rectPerimeterPathD(minX, minY, maxX - minX, maxY - minY)
    const x0 = Math.min(minX, ...runsRaw.map((r) => r.x)) - pad
    const y0 = Math.min(minY, ...runsRaw.map((r) => r.y)) - pad
    const x1 = Math.max(maxX, ...runsRaw.map((r) => r.x + r.width)) + pad
    const y1 = Math.max(maxY, ...runsRaw.map((r) => r.y + r.height)) + pad

    for (const g of group) {
      if (g.id === leader.id) {
        merged.push({
          ...g,
          x: Math.round(x0),
          y: Math.round(y0),
          width: Math.max(8, Math.round(x1 - x0)),
          height: Math.max(8, Math.round(y1 - y0)),
          runs: runsRaw.map((r) => ({
            x: Math.round(r.x - pad),
            y: Math.round(r.y - pad),
            width: Math.max(8, Math.round(r.width + pad * 2)),
            height: Math.max(8, Math.round(r.height + pad * 2)),
          })),
          outlinePath,
          shape: 'polygon',
          showStroke: true,
        })
      } else {
        // Sibling in merged component: title chip only (no second border)
        merged.push({
          ...g,
          showStroke: false,
          outlinePath: undefined,
          runs: undefined,
          shape: 'rect',
        })
      }
    }
  }

  return [...merged, ...rest]
}
