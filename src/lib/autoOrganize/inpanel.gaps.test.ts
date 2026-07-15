import { describe, it, expect } from 'vitest'
import { relayoutPanelContents } from './panels/relayout'
import type { CanvasItem, LayoutPanel } from '@/types'

const folders = [
  { id: 'l1', name: '1 Topic', parentId: null as string | null },
  { id: 'l2a', name: '1.1 A', parentId: 'l1' },
  { id: 'l2b', name: '1.2 B', parentId: 'l1' },
]

function mk(
  id: string,
  f: string,
  x: number,
  y: number,
  w = 80,
  h = 50,
): CanvasItem {
  return {
    id,
    type: 'equation',
    x,
    y,
    width: w,
    height: h,
    zIndex: 1,
    latex: id,
    title: id.toUpperCase(),
    folderId: f,
  }
}

function minNeighborGap(cs: CanvasItem[]): number {
  let best = Infinity
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i]!
      const b = cs[j]!
      const xOl =
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const yOl =
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (xOl > 5) {
        best = Math.min(
          best,
          Math.max(
            0,
            Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)),
          ),
        )
      } else if (yOl > 5) {
        best = Math.min(
          best,
          Math.max(
            0,
            Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)),
          ),
        )
      }
    }
  }
  return best === Infinity ? 0 : best
}

function clusterGapY(cs: CanvasItem[], aIds: string[], bIds: string[]) {
  const A = cs.filter((c) => aIds.includes(c.id))
  const B = cs.filter((c) => bIds.includes(c.id))
  const aMaxY = Math.max(...A.map((c) => c.y + c.height))
  const aMinY = Math.min(...A.map((c) => c.y))
  const bMaxY = Math.max(...B.map((c) => c.y + c.height))
  const bMinY = Math.min(...B.map((c) => c.y))
  return Math.max(0, Math.max(bMinY - aMaxY, aMinY - bMaxY))
}

describe('in-panel gaps (sheet-parity refine)', () => {
  it('L1 hierarchical: fills skyline voids under short top-right leaves', () => {
    // Wide leaf top-left, short leaf top-right, small leaf that should rise
    // into the pocket under the short leaf (screenshot 122251 empty region).
    const items = [
      mk('big1', 'Lbig', 120, 140, 200, 100),
      mk('big2', 'Lbig', 340, 140, 160, 80),
      mk('short1', 'Lshort', 500, 140, 140, 60),
      mk('small1', 'Lsmall', 120, 400, 120, 50),
      mk('small2', 'Lsmall', 260, 400, 100, 50),
    ]
    const lBig: LayoutPanel = {
      id: 'p-big',
      title: 'Big',
      x: 110,
      y: 130,
      width: 400,
      height: 140,
      memberIds: ['big1', 'big2'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'Lbig',
    }
    const lShort: LayoutPanel = {
      id: 'p-short',
      title: 'Short',
      x: 480,
      y: 130,
      width: 180,
      height: 100,
      memberIds: ['short1'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'Lshort',
    }
    const lSmall: LayoutPanel = {
      id: 'p-small',
      title: 'Small',
      x: 110,
      y: 380,
      width: 280,
      height: 100,
      memberIds: ['small1', 'small2'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'Lsmall',
    }
    const l1: LayoutPanel = {
      id: 'p1',
      title: '1 Biology',
      x: 100,
      y: 100,
      width: 560,
      height: 420,
      memberIds: ['big1', 'big2', 'short1', 'small1', 'small2'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 1,
      folderId: 'L1',
    }
    const r = relayoutPanelContents(items, l1, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 4,
      l2PanelGapPx: 8,
      folders: [
        { id: 'L1', name: '1', parentId: null },
        { id: 'Lbig', name: 'big', parentId: 'L1' },
        { id: 'Lshort', name: 'short', parentId: 'L1' },
        { id: 'Lsmall', name: 'small', parentId: 'L1' },
      ],
      allPanels: [l1, lBig, lShort, lSmall],
    })
    const frames = (r.panels ?? []).filter((p) =>
      ['p-big', 'p-short', 'p-small'].includes(p.id),
    )
    // No frame overlaps
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        const a = frames[i]!
        const b = frames[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(xOl > 1 && yOl > 1).toBe(false)
      }
    }
    const shortF = frames.find((p) => p.id === 'p-short')!
    const smallF = frames.find((p) => p.id === 'p-small')!
    const bigF = frames.find((p) => p.id === 'p-big')!
    // Small cluster should sit up near the short leaf (void under short filled),
    // not far below the tallest stack as a third full-width row.
    expect(smallF.y).toBeLessThan(shortF.y + shortF.height + 80)
    // And overall stack height well under naive 3-row sum of leaf heights
    const spanH =
      Math.max(bigF.y + bigF.height, shortF.y + shortF.height, smallF.y + smallF.height) -
      Math.min(bigF.y, shortF.y, smallF.y)
    expect(spanH).toBeLessThan(
      bigF.height + shortF.height + smallF.height - 20,
    )
  })

  it('L1 hierarchical: L2 chrome footprints do not overlap', () => {
    // Recreate screenshot-style failure: L1 with several L2s that must not paint over each other
    const items = [
      mk('a1', 'l2a', 120, 140, 120, 80),
      mk('a2', 'l2a', 260, 140, 100, 60),
      mk('b1', 'l2b', 120, 240, 140, 70),
      mk('b2', 'l2b', 280, 240, 100, 90),
      mk('c1', 'l2c', 120, 360, 100, 50),
      mk('c2', 'l2c', 240, 360, 100, 50),
      mk('c3', 'l2c', 360, 360, 100, 50),
    ]
    const l2a: LayoutPanel = {
      id: 'p2a',
      title: '1.1 A',
      x: 110,
      y: 130,
      width: 280,
      height: 120,
      memberIds: ['a1', 'a2'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'l2a',
    }
    const l2b: LayoutPanel = {
      id: 'p2b',
      title: '1.2 B',
      x: 110,
      y: 230,
      width: 300,
      height: 140,
      memberIds: ['b1', 'b2'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'l2b',
    }
    const l2c: LayoutPanel = {
      id: 'p2c',
      title: '1.3 C',
      x: 110,
      y: 350,
      width: 380,
      height: 100,
      memberIds: ['c1', 'c2', 'c3'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'l2c',
    }
    const l1: LayoutPanel = {
      id: 'p1',
      title: '1 Biology',
      x: 100,
      y: 100,
      width: 420,
      height: 400,
      memberIds: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'c3'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 1,
      folderId: 'l1',
    }
    const all = [l1, l2a, l2b, l2c]
    const folders = [
      { id: 'l1', name: '1', parentId: null as string | null },
      { id: 'l2a', name: '1.1', parentId: 'l1' },
      { id: 'l2b', name: '1.2', parentId: 'l1' },
      { id: 'l2c', name: '1.3', parentId: 'l1' },
    ]
    const r = relayoutPanelContents(items, l1, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 4,
      l2PanelGapPx: 8,
      panelShape: 'rect',
      folders,
      allPanels: all,
    })
    expect(r.panel.x).toBe(100)
    expect(r.panel.y).toBe(100)
    const kids = (r.panels ?? []).filter((p) =>
      ['p2a', 'p2b', 'p2c'].includes(p.id),
    )
    expect(kids.length).toBe(3)
    // No L2 frame AABB overlaps (allow 1px touch)
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i]!
        const b = kids[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        const overlaps = xOl > 1 && yOl > 1
        expect(overlaps).toBe(false)
      }
    }
  })

  it('L1 hierarchical: block and L2 gaps differ; origin pinned', () => {
    const items = [
      mk('a1', 'l2a', 120, 140),
      mk('a2', 'l2a', 220, 140),
      mk('b1', 'l2b', 120, 240),
      mk('b2', 'l2b', 220, 240),
    ]
    const l2a: LayoutPanel = {
      id: 'p2a',
      title: '1.1',
      x: 110,
      y: 130,
      width: 220,
      height: 100,
      memberIds: ['a1', 'a2'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'l2a',
    }
    const l2b: LayoutPanel = {
      id: 'p2b',
      title: '1.2',
      x: 110,
      y: 230,
      width: 220,
      height: 100,
      memberIds: ['b1', 'b2'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'l2b',
    }
    const l1: LayoutPanel = {
      id: 'p1',
      title: '1 Topic',
      x: 100,
      y: 100,
      width: 300,
      height: 280,
      memberIds: ['a1', 'a2', 'b1', 'b2'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 1,
      folderId: 'l1',
    }
    const all = [l1, l2a, l2b]
    const opts = {
      mode: 'dense' as const,
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      panelShape: 'rect' as const,
      folders,
      allPanels: all,
    }
    const block48 = relayoutPanelContents(items, l1, {
      ...opts,
      blockGapPx: 48,
      l2PanelGapPx: 2,
    })
    const l2_48 = relayoutPanelContents(items, l1, {
      ...opts,
      blockGapPx: 2,
      l2PanelGapPx: 48,
    })
    const mem = (r: ReturnType<typeof relayoutPanelContents>) =>
      r.items.filter((i) => ['a1', 'a2', 'b1', 'b2'].includes(i.id))
    const leafA = (r: ReturnType<typeof relayoutPanelContents>) =>
      r.items.filter((i) => ['a1', 'a2'].includes(i.id))

    expect(block48.panel.x).toBe(100)
    expect(block48.panel.y).toBe(100)
    expect(l2_48.panel.x).toBe(100)
    expect(l2_48.panel.y).toBe(100)
    // Block gap opens card-to-card air inside a leaf
    expect(minNeighborGap(leafA(block48))).toBeGreaterThanOrEqual(40)
    // L2 panel gap opens clearance between leaf clusters (H or V)
    const cA = mem(l2_48).filter((i) => ['a1', 'a2'].includes(i.id))
    const cB = mem(l2_48).filter((i) => ['b1', 'b2'].includes(i.id))
    const aBox = {
      minX: Math.min(...cA.map((c) => c.x)),
      minY: Math.min(...cA.map((c) => c.y)),
      maxX: Math.max(...cA.map((c) => c.x + c.width)),
      maxY: Math.max(...cA.map((c) => c.y + c.height)),
    }
    const bBox = {
      minX: Math.min(...cB.map((c) => c.x)),
      minY: Math.min(...cB.map((c) => c.y)),
      maxX: Math.max(...cB.map((c) => c.x + c.width)),
      maxY: Math.max(...cB.map((c) => c.y + c.height)),
    }
    const xOl = Math.min(aBox.maxX, bBox.maxX) - Math.max(aBox.minX, bBox.minX)
    const yOl = Math.min(aBox.maxY, bBox.maxY) - Math.max(aBox.minY, bBox.minY)
    // Clusters must not overlap
    expect(xOl > 1 && yOl > 1).toBe(false)
    const sep = Math.max(
      clusterGapY(mem(l2_48), ['a1', 'a2'], ['b1', 'b2']),
      Math.max(0, bBox.minX - aBox.maxX, aBox.minX - bBox.maxX),
    )
    expect(sep).toBeGreaterThanOrEqual(20)
  })

  it('L2 leaf: block gap opens air between cards', () => {
    const items = [
      mk('a1', 'l2a', 120, 140),
      mk('a2', 'l2a', 220, 140),
      mk('a3', 'l2a', 120, 200),
      mk('a4', 'l2a', 220, 200),
    ]
    const l2a: LayoutPanel = {
      id: 'p2a',
      title: '1.1',
      x: 110,
      y: 130,
      width: 280,
      height: 220,
      memberIds: ['a1', 'a2', 'a3', 'a4'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'l2a',
    }
    const g0 = relayoutPanelContents(items, l2a, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 0,
      folders,
      allPanels: [l2a],
    })
    const g48 = relayoutPanelContents(items, l2a, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 48,
      folders,
      allPanels: [l2a],
    })
    const m0 = g0.items.filter((i) =>
      ['a1', 'a2', 'a3', 'a4'].includes(i.id),
    )
    const m48 = g48.items.filter((i) =>
      ['a1', 'a2', 'a3', 'a4'].includes(i.id),
    )
    expect(g48.panel.x).toBe(110)
    expect(g48.panel.y).toBe(130)
    expect(minNeighborGap(m48)).toBeGreaterThanOrEqual(40)
    expect(minNeighborGap(m48)).toBeGreaterThan(minNeighborGap(m0))
  })

  it('horizontal neighbors: block gap opens air; no right overflow', () => {
    // Wide panel: three cards fit on one row with gap
    const items = [
      mk('a', 'f', 120, 140, 100, 60),
      mk('b', 'f', 240, 140, 100, 60),
      mk('c', 'f', 360, 140, 100, 60),
    ]
    const wide: LayoutPanel = {
      id: 'p-wide',
      title: 'Wide',
      x: 100,
      y: 100,
      width: 420,
      height: 160,
      memberIds: ['a', 'b', 'c'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'f',
    }
    const foldersRow = [{ id: 'f', name: 'F', parentId: null as string | null }]
    const g0 = relayoutPanelContents(items, wide, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 0,
      folders: foldersRow,
      allPanels: [wide],
    })
    const g48 = relayoutPanelContents(items, wide, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 48,
      folders: foldersRow,
      allPanels: [wide],
    })
    const mem = (r: ReturnType<typeof relayoutPanelContents>) =>
      r.items
        .filter((i) => ['a', 'b', 'c'].includes(i.id))
        .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))

    const m48 = mem(g48)
    const m0 = mem(g0)
    expect(g48.panel.x).toBe(100)
    expect(g48.panel.y).toBe(100)

    // Stay inside original panel content band (no massive right overflow)
    const contentRight = wide.x + wide.width - 4
    for (const c of m48) {
      expect(c.x + c.width).toBeLessThanOrEqual(contentRight + 1)
    }
    // Panel width must not explode past original (+ small chrome pad)
    expect(g48.panel.width).toBeLessThanOrEqual(wide.width + 24)

    // Same row: adjacent horizontal gaps ≥ ~48
    const row0 = m48.filter((c) => Math.abs(c.y - m48[0]!.y) < 8)
    row0.sort((a, b) => a.x - b.x)
    for (let i = 0; i < row0.length - 1; i++) {
      const left = row0[i]!
      const right = row0[i + 1]!
      expect(right.x - (left.x + left.width)).toBeGreaterThanOrEqual(40)
    }
    // Larger block gap → larger bounding span or taller pack (gap recognized)
    const span = (cs: typeof m48) => {
      const minX = Math.min(...cs.map((c) => c.x))
      const maxX = Math.max(...cs.map((c) => c.x + c.width))
      const minY = Math.min(...cs.map((c) => c.y))
      const maxY = Math.max(...cs.map((c) => c.y + c.height))
      return maxX - minX + (maxY - minY)
    }
    expect(span(m48)).toBeGreaterThan(span(m0) + 20)
  })

  it('narrow panel: large block gap wraps instead of overflowing right', () => {
    const items = [
      mk('a', 'f', 120, 140, 100, 60),
      mk('b', 'f', 240, 140, 100, 60),
      mk('c', 'f', 360, 140, 100, 60),
      mk('d', 'f', 120, 220, 100, 60),
      mk('e', 'f', 240, 220, 100, 60),
      mk('f', 'f', 360, 220, 100, 60),
    ]
    const narrow: LayoutPanel = {
      id: 'p-narrow',
      title: 'Narrow',
      x: 100,
      y: 100,
      width: 280,
      height: 200,
      memberIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'f',
    }
    const foldersRow = [{ id: 'f', name: 'F', parentId: null as string | null }]
    const r = relayoutPanelContents(items, narrow, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 48,
      folders: foldersRow,
      allPanels: [narrow],
    })
    const mem = r.items.filter((i) =>
      ['a', 'b', 'c', 'd', 'e', 'f'].includes(i.id),
    )
    const contentRight = narrow.x + narrow.width - 4
    for (const c of mem) {
      expect(c.x + c.width).toBeLessThanOrEqual(contentRight + 1)
    }
    expect(r.panel.x).toBe(100)
    expect(r.panel.width).toBeLessThanOrEqual(narrow.width + 24)
    // Neighbor gaps respected (H or V)
    expect(minNeighborGap(mem)).toBeGreaterThanOrEqual(40)
  })

  it('dense pack: no card overlaps and stays in panel band', () => {
    // Sheet densify (cell free-flow) — assert no overlaps / no overflow
    const items = [
      mk('tall', 'f', 120, 140, 100, 160),
      mk('s1', 'f', 240, 140, 90, 50),
      mk('s2', 'f', 240, 200, 90, 50),
      mk('s3', 'f', 240, 260, 90, 50),
      mk('a', 'f', 120, 280, 80, 120),
      mk('b', 'f', 220, 280, 80, 50),
    ]
    const panel: LayoutPanel = {
      id: 'p-dense',
      title: 'Dense',
      x: 100,
      y: 100,
      width: 320,
      height: 280,
      memberIds: ['tall', 's1', 's2', 's3', 'a', 'b'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
      folderId: 'f',
    }
    const r = relayoutPanelContents(items, panel, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 4,
      folders: [{ id: 'f', name: 'F', parentId: null }],
      allPanels: [panel],
    })
    const mem = r.items.filter((i) => panel.memberIds!.includes(i.id))
    // No pairwise card overlaps
    for (let i = 0; i < mem.length; i++) {
      for (let j = i + 1; j < mem.length; j++) {
        const a = mem[i]!
        const b = mem[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(xOl > 1 && yOl > 1).toBe(false)
      }
    }
    const contentRight = panel.x + panel.width - 4
    for (const c of mem) {
      expect(c.x + c.width).toBeLessThanOrEqual(contentRight + 2)
    }
    expect(r.panel.x).toBe(100)
    expect(r.panel.y).toBe(100)
  })

  it('block gap works without folderIds (member-group path)', () => {
    const items: CanvasItem[] = [
      mk('a', 'orphan', 120, 140),
      mk('b', 'orphan', 220, 140),
      mk('c', 'orphan', 120, 200),
      mk('d', 'orphan', 220, 200),
    ].map(({ folderId: _f, ...rest }) => rest as CanvasItem)
    // strip folderId
    for (const it of items) delete (it as { folderId?: string }).folderId
    const panel: LayoutPanel = {
      id: 'p',
      title: 'No folders',
      x: 100,
      y: 100,
      width: 300,
      height: 240,
      memberIds: ['a', 'b', 'c', 'd'],
      shape: 'rect',
      showTitle: true,
      hierarchyLevel: 2,
    }
    const g48 = relayoutPanelContents(items, panel, {
      mode: 'dense',
      packSeed: 0,
      panelPad: 4,
      grid: 24,
      blockGapPx: 48,
      folders: [],
      allPanels: [panel],
    })
    const mem = g48.items.filter((i) =>
      ['a', 'b', 'c', 'd'].includes(i.id),
    )
    expect(minNeighborGap(mem)).toBeGreaterThanOrEqual(40)
  })
})
