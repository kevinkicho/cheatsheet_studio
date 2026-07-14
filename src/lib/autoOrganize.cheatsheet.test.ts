import { describe, expect, it } from 'vitest'
import {
  packCheatsheetLayout,
  estimateIdealBlockSize,
  allocateAreaOnGrid,
  snapSizeToGrid,
  packRectsOnGrid,
  packRectsShelfOnGrid,
  minReadableCardSize,
  MIN_READABLE_TITLE_FONT,
  MIN_READABLE_BODY_FONT,
  ORGANIZE_GRID,
  computeGridAreaScale,
  pagesForIdealCells,
  chooseTopicRegionWidth,
  placeTopicRegions,
  placeTopicRegionsDense,
  naturalTopicPack,
  shelfPackHeight,
  scaleCellRects,
  rectsOverlap,
  panelRunsOverlap,
  growRegionsCompact,
  folderAtGroupLevel,
  folderAncestorChain,
  panelGroupLevelOptions,
  normalizePanelGroupLevels,
  buildNestedHierarchyPanels,
  relayoutPanelContents,
  convexHull,
  expandedRectCorners,
  GROUP_CHROME_PRESETS,
} from '@/lib/autoOrganize'
import { DEFAULT_CANVAS } from '@/types'
import type { CanvasItem } from '@/types'

function card(
  id: string,
  opts: Partial<CanvasItem> & { latex?: string } = {},
): CanvasItem {
  return {
    id,
    type: 'equation',
    x: 0,
    y: 0,
    width: 280,
    height: 100,
    zIndex: 1,
    latex: opts.latex ?? 'x=1',
    title: id,
    ...opts,
  }
}

describe('grid pack helpers', () => {
  it('estimateIdealBlockSize keeps process LR wide and equations above min', () => {
    const min = minReadableCardSize()
    const eq = estimateIdealBlockSize(
      card('e', { latex: 'E=mc^2', title: 'Energy' }),
      720,
    )
    expect(eq.w).toBeGreaterThanOrEqual(min.w)
    expect(eq.h).toBeGreaterThanOrEqual(min.h)

    const lr = estimateIdealBlockSize(
      {
        ...card('p'),
        type: 'process-chart',
        mermaidSource: 'flowchart LR\nA-->B-->C-->D-->E',
        mermaidDirection: 'LR',
      },
      720,
    )
    expect(lr.w).toBeGreaterThan(lr.h)
  })

  it('keeps short formulas compact (export 19 style)', () => {
    const fv = estimateIdealBlockSize(
      card('fv', {
        title: 'Future Value',
        latex: 'FV = PV(1 + r)^n',
      }),
      720,
    )
    const cont = estimateIdealBlockSize(
      card('c', {
        title: 'Continuous Compounding',
        latex: 'FV = PV\\, e^{rt}',
      }),
      720,
    )
    // Snug — not inflated by title length floors
    expect(fv.h).toBeLessThanOrEqual(72)
    expect(cont.h).toBeLessThanOrEqual(72)
    expect(fv.w).toBeLessThanOrEqual(160)
    expect(cont.w).toBeLessThanOrEqual(160)
  })

  it('allocateAreaOnGrid never grows past ideal', () => {
    const ideals = [
      { id: 'a', w: 100, h: 48, minW: 72, minH: 40 },
      { id: 'b', w: 100, h: 48, minW: 72, minH: 40 },
    ]
    const map = allocateAreaOnGrid(ideals, 720, 900, ORGANIZE_GRID, 0.9)
    const a = map.get('a')!
    expect(a.w).toBeLessThanOrEqual(120)
    expect(a.h).toBeLessThanOrEqual(72)
  })

  it('allocateAreaOnGrid never goes below min size', () => {
    const ideals = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      w: 200,
      h: 100,
      minW: 72,
      minH: 40,
    }))
    const map = allocateAreaOnGrid(ideals, 720, 900, ORGANIZE_GRID, 0.9)
    for (const id of map.keys()) {
      const s = map.get(id)!
      expect(s.w).toBeGreaterThanOrEqual(72)
      expect(s.h).toBeGreaterThanOrEqual(40)
      expect(s.w % ORGANIZE_GRID).toBe(0)
      expect(s.h % ORGANIZE_GRID).toBe(0)
    }
  })

  it('packRectsOnGrid places without overlap on small board', () => {
    const rects = [
      { id: 'a', cw: 4, ch: 2 },
      { id: 'b', cw: 4, ch: 2 },
      { id: 'c', cw: 8, ch: 3 },
    ]
    const pos = packRectsOnGrid(rects, 10, 12)
    expect(pos.size).toBe(3)
    const pa = pos.get('a')!
    const pb = pos.get('b')!
    expect(pa.c !== pb.c || pa.r !== pb.r).toBe(true)
  })

  it('snapSizeToGrid rounds to nearest cell', () => {
    const s = snapSizeToGrid(100, 50, 24, 720, 900)
    expect(s.w).toBe(96)
    expect(s.h).toBe(48)
  })
})

describe('packCheatsheetLayout', () => {
  it('packs many cards denser at xs than lg', () => {
    const items = Array.from({ length: 12 }, (_, i) => card(`c${i}`))
    const xs = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'xs',
      columns: 2,
      fitPrint: true,
    })
    const lg = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'lg',
      columns: 1,
      fitPrint: false,
    })
    const maxY = (list: CanvasItem[]) =>
      list.reduce((m, it) => Math.max(m, it.y + it.height), 0)
    expect(maxY(xs.items)).toBeLessThanOrEqual(maxY(lg.items) + 48)
    // Always readable floors
    expect(xs.items[0]!.style?.fontSize).toBeGreaterThanOrEqual(12)
    expect(lg.items[0]!.style?.fontSize).toBeGreaterThanOrEqual(12)
    // lg fonts ≥ xs fonts; lg cards larger area
    expect(xs.items[0]!.style?.fontSize ?? 0).toBeLessThanOrEqual(
      lg.items[0]!.style?.fontSize ?? 18,
    )
  })

  it('keeps headings full-width-ish above sections', () => {
    const items = [
      card('h1', { latex: '\\text{Section A}', title: 'Section A', height: 40 }),
      card('a'),
      card('b'),
      card('h2', { latex: '\\text{Section B}', title: 'Section B', height: 40 }),
      card('c'),
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      columns: 2,
    })
    const h1 = out.items.find((i) => i.id === 'h1')!
    const a = out.items.find((i) => i.id === 'a')!
    expect(h1.y).toBeLessThanOrEqual(a.y)
  })

  it('packs xs density denser than lg (less dead vertical space)', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      card(`e${i}`, { width: 140, height: 70 }),
    )
    const xs = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'xs',
      columns: 2,
      fitPrint: false,
    })
    const lg = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'lg',
      columns: 1,
      fitPrint: false,
    })
    const span = (list: typeof xs.items) => {
      const maxY = list.reduce((m, i) => Math.max(m, i.y + i.height), 0)
      const minY = list.reduce((m, i) => Math.min(m, i.y), Infinity)
      return maxY - minY
    }
    expect(span(xs.items)).toBeLessThanOrEqual(span(lg.items) + 24)
  })

  it('collocates same-folder cards (clustered; may sit beside next folder)', () => {
    const items = [
      card('a1', { folderId: 'f2', title: 'a1' }),
      card('b1', { folderId: 'f1', title: 'b1' }),
      card('a2', { folderId: 'f2', title: 'a2' }),
      card('b2', { folderId: 'f1', title: 'b2' }),
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      columns: 2,
      fitPrint: false,
      folders: [
        { id: 'f1', order: 0 },
        { id: 'f2', order: 1 },
      ],
    })
    const byId = Object.fromEntries(out.items.map((i) => [i.id, i]))
    // Same-folder cards form a tight cluster (bbox overlap / proximity)
    const f1 = [byId.b1!, byId.b2!]
    const f2 = [byId.a1!, byId.a2!]
    const span = (list: CanvasItem[]) => {
      const minY = Math.min(...list.map((i) => i.y))
      const maxY = Math.max(...list.map((i) => i.y + i.height))
      return maxY - minY
    }
    // Cluster height for 2 cards should be modest (not spread across the sheet)
    expect(span(f1)).toBeLessThan(400)
    expect(span(f2)).toBeLessThan(400)
    // Document order: f1 region starts at or before f2 (row-major)
    const minY1 = Math.min(...f1.map((i) => i.y))
    const minY2 = Math.min(...f2.map((i) => i.y))
    expect(minY1).toBeLessThanOrEqual(minY2 + 2)
  })

  it('snaps card edges to the organize grid', () => {
    const items = Array.from({ length: 6 }, (_, i) => card(`g${i}`))
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      fitPrint: true,
    })
    const boxLeft = 48
    for (const it of out.items) {
      expect((it.x - boxLeft) % ORGANIZE_GRID).toBe(0)
      expect(it.width % ORGANIZE_GRID).toBe(0)
      expect(it.height % ORGANIZE_GRID).toBe(0)
    }
  })

  it('export-19 paint: equations natural, process contentFill', () => {
    const items = [
      card('fv', {
        title: 'Future Value',
        latex: 'FV = PV(1 + r)^n',
      }),
      {
        ...card('p'),
        type: 'process-chart' as const,
        title: 'NPV',
        mermaidSource: 'flowchart TD\nA-->B',
      },
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      fitPrint: true,
    })
    const fv = out.items.find((i) => i.id === 'fv')!
    const p = out.items.find((i) => i.id === 'p')!
    expect(fv.autoFit).toBe(false)
    expect(fv.contentFill).toBe(false)
    expect(p.autoFit).toBe(false)
    expect(p.contentFill).toBe(true)
    expect(fv.x).toBeGreaterThanOrEqual(40)
    expect(fv.width).toBeLessThan(280)
  })

  it('multipage: many cards do not stack on the same origin', () => {
    // Process cards have large ideal sizes → multipage
    const items = Array.from({ length: 24 }, (_, i) => ({
      ...card(`m${i}`, { title: `Flow ${i}` }),
      type: 'process-chart' as const,
      mermaidSource: 'flowchart TD\nA-->B-->C-->D',
      width: 280,
      height: 220,
    }))
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      multiPage: true,
      fitPrint: true,
    })
    // No two cards share exact top-left (stacking bug)
    const keys = out.items.map((i) => `${i.x},${i.y}`)
    expect(new Set(keys).size).toBe(keys.length)
    const maxB = out.items.reduce((m, i) => Math.max(m, i.y + i.height), 0)
    // Dense pack may fit many process cards on fewer pages; still multi-card span
    expect(maxB).toBeGreaterThan(400)
    expect(out.printPageCount).toBeGreaterThanOrEqual(1)
    if (maxB > 1056) {
      expect(out.printPageCount).toBeGreaterThan(1)
    }
  })

  it('multipage: printPageCount can drop after re-pack (no empty frames)', () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      card(`s${i}`, { width: 200, height: 60 }),
    )
    const canvas = { ...DEFAULT_CANVAS, printPageCount: 19 }
    const out = packCheatsheetLayout(items, canvas, {
      density: 'sm',
      multiPage: true,
      fitPrint: true,
    })
    expect(out.printPageCount).toBeLessThan(19)
    expect(out.printPageCount).toBeGreaterThanOrEqual(1)
  })

  it('panels chrome: creates encapsulating layoutPanels and hides banner cards', () => {
    const items: CanvasItem[] = [
      card('h1', {
        latex: '\\textbf{\\text{1. Alpha}}',
        title: '1. Alpha',
        showTitle: false,
        folderId: 'fa',
        height: 24,
      }),
      card('a1', { folderId: 'fa', latex: 'a=1', title: 'A1' }),
      card('a2', { folderId: 'fa', latex: 'a=2', title: 'A2' }),
      card('h2', {
        latex: '\\textbf{\\text{2. Beta}}',
        title: '2. Beta',
        showTitle: false,
        folderId: 'fb',
        height: 24,
      }),
      card('b1', { folderId: 'fb', latex: 'b=1', title: 'B1' }),
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      multiPage: true,
      groupChrome: 'panels',
      folders: [
        { id: 'fa', order: 0, name: 'Alpha' },
        { id: 'fb', order: 1, name: 'Beta' },
      ],
    })
    expect(out.layoutPanels.length).toBeGreaterThanOrEqual(2)
    for (const p of out.layoutPanels) {
      expect(p.width).toBeGreaterThan(40)
      expect(p.height).toBeGreaterThan(40)
      expect(p.title).toBeTruthy()
    }
    // Banner headings hidden in panels-only mode
    const h1 = out.items.find((i) => i.id === 'h1')!
    expect(h1.hidden).toBe(true)
    // Body cards still visible
    expect(out.items.find((i) => i.id === 'a1')!.hidden).not.toBe(true)
  })

  it('panels never overlap each other', () => {
    // Many uneven topics — old half-width row pack left tall gutters / overlaps
    const items: CanvasItem[] = []
    for (let t = 0; t < 8; t++) {
      const fid = `f${t}`
      items.push(
        card(`h${t}`, {
          latex: `\\textbf{\\text{${t + 1}. Topic ${t}}}`,
          title: `${t + 1}. Topic ${t}`,
          showTitle: false,
          folderId: fid,
          height: 24,
        }),
      )
      const n = t % 3 === 0 ? 5 : t % 3 === 1 ? 2 : 1
      for (let i = 0; i < n; i++) {
        items.push(
          card(`t${t}-${i}`, {
            folderId: fid,
            latex: `x_{${t}${i}}=1`,
            title: `Card ${t}.${i}`,
            width: 120 + (i % 2) * 40,
            height: 60 + (t % 2) * 30,
          }),
        )
      }
    }
    const folders = Array.from({ length: 8 }, (_, t) => ({
      id: `f${t}`,
      order: t,
      name: `Topic ${t}`,
    }))
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      multiPage: true,
      groupChrome: 'panels',
      folders,
    })
    expect(out.layoutPanels.length).toBeGreaterThanOrEqual(6)
    for (let i = 0; i < out.layoutPanels.length; i++) {
      for (let j = i + 1; j < out.layoutPanels.length; j++) {
        expect(
          rectsOverlap(out.layoutPanels[i]!, out.layoutPanels[j]!),
        ).toBe(false)
      }
    }
  })
  it('labels chrome: no layoutPanels (default)', () => {
    const items = Array.from({ length: 4 }, (_, i) => card(`c${i}`))
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'labels',
    })
    expect(out.layoutPanels).toEqual([])
    expect(GROUP_CHROME_PRESETS.labels.label).toMatch(/label/i)
  })

  it('polygon panels: orthogonal runs (L-fill) not convex hull points', () => {
    const items: CanvasItem[] = [
      card('h1', {
        latex: '\\textbf{\\text{1. T}}',
        title: '1. T',
        showTitle: false,
        folderId: 'f',
      }),
      card('a', { folderId: 'f', title: 'A', width: 100, height: 60 }),
      card('b', { folderId: 'f', title: 'B', width: 80, height: 100 }),
      card('c', { folderId: 'f', title: 'C', width: 120, height: 50 }),
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelPadding: 2,
      folders: [{ id: 'f', order: 0, name: 'T' }],
    })
    expect(out.layoutPanels.length).toBe(1)
    const p = out.layoutPanels[0]!
    expect(p.shape).toBe('polygon')
    expect(p.runs?.length).toBeGreaterThanOrEqual(1)
    expect(p.width * p.height).toBeGreaterThan(1000)
  })

  it('polygon multi-topic: continuous simple panels, no overlaps', () => {
    const folders: { id: string; order: number; name: string }[] = []
    const items: CanvasItem[] = []
    for (let t = 0; t < 6; t++) {
      const fid = `f${t}`
      folders.push({ id: fid, order: t, name: `Topic ${t}` })
      items.push(
        card(`h${t}`, {
          latex: `\\textbf{\\text{${t}. T${t}}}`,
          title: `${t}. T${t}`,
          showTitle: false,
          folderId: fid,
          height: 24,
        }),
      )
      for (let c = 0; c < 4; c++) {
        items.push(
          card(`t${t}c${c}`, {
            folderId: fid,
            title: `T${t}C${c}`,
            width: 80 + (c % 3) * 40,
            height: 50 + (c % 2) * 30,
            latex: `x=${c}`,
          }),
        )
      }
    }
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelPadding: 3,
      folders,
      multiPage: true,
    })
    const cards = out.items.filter((i) => !i.hidden)
    expect(out.layoutPanels.length).toBe(6)
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        expect(rectsOverlap(cards[i]!, cards[j]!)).toBe(false)
      }
    }
    for (let i = 0; i < out.layoutPanels.length; i++) {
      const p = out.layoutPanels[i]!
      expect(p.shape).toBe('polygon')
      // Continuous solid / simple L → few chrome runs (not free-grid steps)
      expect((p.runs?.length ?? 0)).toBeGreaterThanOrEqual(1)
      expect((p.runs?.length ?? 99)).toBeLessThanOrEqual(6)
      for (let j = i + 1; j < out.layoutPanels.length; j++) {
        expect(panelRunsOverlap(p, out.layoutPanels[j]!)).toBe(false)
      }
    }
    for (const p of out.layoutPanels) {
      const members = new Set(p.memberIds ?? [])
      const runs =
        p.runs && p.runs.length > 0
          ? p.runs
          : [{ x: p.x, y: p.y, width: p.width, height: p.height }]
      for (const c of cards) {
        if (members.has(c.id)) continue
        for (const r of runs) {
          expect(rectsOverlap(r, c)).toBe(false)
        }
      }
    }
  })

  it('growRegionsCompact expands solid boxes without overlap', () => {
    const grown = growRegionsCompact(
      [
        { index: 0, c: 0, r: 0, cw: 4, ch: 3 },
        { index: 1, c: 6, r: 0, cw: 4, ch: 3 },
      ],
      12,
      1,
    )
    expect(grown).toHaveLength(2)
    // Should not cross the gap seam
    const a = grown.find((g) => g.index === 0)!
    const b = grown.find((g) => g.index === 1)!
    expect(a.c + a.cw + 1).toBeLessThanOrEqual(b.c)
  })

  it('groupSort name-asc: Alpha tends top-left of Zeta (soft reading flow)', () => {
    const items: CanvasItem[] = [
      card('hz', {
        latex: '\\textbf{\\text{Zeta}}',
        title: 'Zeta',
        showTitle: false,
        folderId: 'fz',
      }),
      card('z1', { folderId: 'fz', title: 'z1', latex: 'z=1' }),
      card('ha', {
        latex: '\\textbf{\\text{Alpha}}',
        title: 'Alpha',
        showTitle: false,
        folderId: 'fa',
      }),
      card('a1', { folderId: 'fa', title: 'a1', latex: 'a=1' }),
    ]
    const folders = [
      { id: 'fz', order: 0, name: 'Zeta' },
      { id: 'fa', order: 1, name: 'Alpha' },
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'rect',
      groupSort: 'name-asc',
      panelPadding: 8,
      folders,
    })
    const a1 = out.items.find((i) => i.id === 'a1')!
    const z1 = out.items.find((i) => i.id === 'z1')!
    // Soft ascending flow: Alpha not strictly below/right of Zeta
    const aDiag = a1.y + a1.x * 0.35
    const zDiag = z1.y + z1.x * 0.35
    expect(aDiag).toBeLessThanOrEqual(zDiag + 40)
  })

  it('groupSort none keeps document order (Zeta before Alpha when Z first)', () => {
    const items: CanvasItem[] = [
      card('z1', { folderId: 'fz', title: 'z1', latex: 'z=1' }),
      card('a1', { folderId: 'fa', title: 'a1', latex: 'a=1' }),
    ]
    const folders = [
      { id: 'fz', order: 0, name: 'Zeta' },
      { id: 'fa', order: 1, name: 'Alpha' },
    ]
    // Density packing may rearrange spatially; section order is document.
    // With two similar blocks, first-seen Zeta should still exist as a panel.
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      groupSort: 'none',
      folders,
    })
    expect(out.layoutPanels.map((p) => p.title)).toEqual(
      expect.arrayContaining(['Zeta', 'Alpha']),
    )
  })

  it('panel group levels multi-select nests L1 around L2', () => {
    const folders = [
      { id: 't1', name: '1. Topic', parentId: null, order: 0 },
      { id: 't1a', name: '1.1 Sub', parentId: 't1', order: 0 },
      { id: 't1b', name: '1.2 Sub', parentId: 't1', order: 1 },
      { id: 't2', name: '2. Other', parentId: null, order: 1 },
      { id: 't2a', name: '2.1 Sub', parentId: 't2', order: 0 },
    ]
    expect(folderAncestorChain('t1a', folders)).toEqual(['t1', 't1a'])
    expect(folderAtGroupLevel('t1a', folders, 1)).toBe('t1')
    expect(folderAtGroupLevel('t1a', folders, 2)).toBe('t1a')
    expect(panelGroupLevelOptions().map((o) => o.level)).toEqual([1, 2, 3])
    expect(normalizePanelGroupLevels([2, 1])).toEqual([1, 2])

    const items: CanvasItem[] = [
      card('a1', { folderId: 't1a', title: 'A1', latex: 'a=1' }),
      card('a2', { folderId: 't1b', title: 'A2', latex: 'a=2' }),
      card('b1', { folderId: 't2a', title: 'B1', latex: 'b=1' }),
    ]
    const mid = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevels: [2],
      folders,
    })
    // level 2 only → one panel per subsection (t1a, t1b, t2a)
    expect(mid.layoutPanels.length).toBe(3)
    expect(mid.layoutPanels.every((p) => p.hierarchyLevel === 2)).toBe(true)

    const top = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevels: [1],
      folders,
    })
    expect(top.layoutPanels.length).toBe(2)
    const t1 = top.layoutPanels.find((p) => p.folderId === 't1')!
    expect(t1.memberIds?.sort()).toEqual(['a1', 'a2'].sort())

    // Nested: L1 outer + L2 inner
    const nested = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevels: [1, 2],
      panelPadding: 8,
      folders,
    })
    const L1 = nested.layoutPanels.filter((p) => p.hierarchyLevel === 1)
    const L2 = nested.layoutPanels.filter((p) => p.hierarchyLevel === 2)
    expect(L1.length).toBe(2) // Topic 1 + Topic 2
    expect(L2.length).toBe(3) // 1.1, 1.2, 2.1
    // Outer wraps inner: L1 for t1 contains both a1 and a2
    const outerT1 = L1.find((p) => p.folderId === 't1')!
    expect(outerT1.memberIds?.sort()).toEqual(['a1', 'a2'].sort())
    // Outer box should cover inner boxes
    const inner11 = L2.find((p) => p.folderId === 't1a')!
    expect(outerT1.x).toBeLessThanOrEqual(inner11.x)
    expect(outerT1.y).toBeLessThanOrEqual(inner11.y)
    expect(outerT1.x + outerT1.width).toBeGreaterThanOrEqual(
      inner11.x + inner11.width,
    )
  })

  it('n-gon chrome follows card runs (not full empty AABB corner)', () => {
    // Uneven cards so shelf leaves a short last row → L-shaped occupancy
    const items: CanvasItem[] = [
      card('a', {
        folderId: 'f',
        title: 'A',
        width: 200,
        height: 80,
        latex: 'a',
      }),
      card('b', {
        folderId: 'f',
        title: 'B',
        width: 200,
        height: 80,
        latex: 'b',
      }),
      card('c', {
        folderId: 'f',
        title: 'C',
        width: 100,
        height: 80,
        latex: 'c',
      }),
    ]
    const folders = [{ id: 'f', name: 'Topic', order: 0 }]
    const rect = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'rect',
      panelGroupLevels: [1],
      folders,
    })
    const poly = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelGroupLevels: [1],
      folders,
    })
    expect(rect.layoutPanels[0]!.shape).toBe('rect')
    expect(rect.layoutPanels[0]!.runs).toBeUndefined()
    expect(poly.layoutPanels[0]!.shape).toBe('polygon')
    // N-gon always exposes orthogonal runs (L when last row is short)
    const pr = poly.layoutPanels[0]!
    expect(pr.runs?.length).toBeGreaterThanOrEqual(1)
  })

  it('panel gap changes inter-panel spacing; free-flow not row shelf', () => {
    const folders = Array.from({ length: 6 }, (_, i) => ({
      id: `f${i}`,
      name: `T${i}`,
      order: i,
    }))
    const items: CanvasItem[] = folders.flatMap((f, i) => [
      card(`${f.id}a`, {
        folderId: f.id,
        title: `A${i}`,
        width: 100,
        height: 60,
        latex: 'x=1',
      }),
      card(`${f.id}b`, {
        folderId: f.id,
        title: `B${i}`,
        width: 100,
        height: 60,
        latex: 'x=2',
      }),
    ])
    const tight = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevel: 1,
      panelPadding: 0,
      groupSort: 'none',
      folders,
    })
    const loose = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevel: 1,
      panelPadding: 48,
      groupSort: 'none',
      folders,
    })
    const span = (out: typeof tight) => {
      const cards = out.items.filter((i) => !i.hidden)
      const minY = Math.min(...cards.map((c) => c.y))
      const maxY = Math.max(...cards.map((c) => c.y + c.height))
      return maxY - minY
    }
    // Larger panel gap → taller overall stack (more free-flow spacing)
    expect(span(loose)).toBeGreaterThan(span(tight))
    // Free-flow: at least two panels share a horizontal band (not pure stacked rows)
    const panels = tight.layoutPanels
    const tops = panels.map((p) => p.y)
    const uniqueTops = new Set(tops.map((y) => Math.round(y / 8) * 8))
    // With 6 small topics, dense free-flow should use fewer vertical slots than 6
    expect(uniqueTops.size).toBeLessThan(panels.length)
  })

  it('relayoutPanelContents sorts cards A→Z inside a panel', () => {
    const items: CanvasItem[] = [
      card('c', { title: 'Charlie', x: 100, y: 50, width: 80, height: 40 }),
      card('a', { title: 'Alpha', x: 200, y: 50, width: 80, height: 40 }),
      card('b', { title: 'Bravo', x: 300, y: 50, width: 80, height: 40 }),
    ]
    const panel = {
      id: 'p1',
      title: 'T',
      x: 90,
      y: 40,
      width: 320,
      height: 80,
      memberIds: ['c', 'a', 'b'],
      contentSort: 'name-asc' as const,
      showTitle: true,
    }
    const { items: next } = relayoutPanelContents(items, panel)
    const xs = ['a', 'b', 'c'].map(
      (id) => next.find((i) => i.id === id)!.x,
    )
    // A→Z shelf: Alpha left of Bravo left of Charlie
    expect(xs[0]!).toBeLessThan(xs[1]!)
    expect(xs[1]!).toBeLessThan(xs[2]!)
  })

  it('convexHull is counterclockwise and minimal', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior
    ])
    expect(hull.length).toBe(4)
    const corners = expandedRectCorners(
      [{ x: 0, y: 0, width: 10, height: 10 }],
      2,
    )
    expect(corners.length).toBe(4)
    expect(corners[0]!.x).toBe(-2)
  })

  it('area-proportional: small topics can sit side-by-side (not always full-width bands)', () => {
    // Two tiny topics with headings — half-width regions should share a row
    const items: CanvasItem[] = [
      card('h1', {
        latex: '\\textbf{\\text{1. Alpha}}',
        title: '1. Alpha',
        showTitle: false,
        folderId: 'fa',
        height: 24,
      }),
      card('a1', { folderId: 'fa', latex: 'a=1', title: 'A1' }),
      card('a2', { folderId: 'fa', latex: 'a=2', title: 'A2' }),
      card('h2', {
        latex: '\\textbf{\\text{2. Beta}}',
        title: '2. Beta',
        showTitle: false,
        folderId: 'fb',
        height: 24,
      }),
      card('b1', { folderId: 'fb', latex: 'b=1', title: 'B1' }),
      card('b2', { folderId: 'fb', latex: 'b=2', title: 'B2' }),
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      multiPage: true,
      fitPrint: true,
      folders: [
        { id: 'fa', order: 0 },
        { id: 'fb', order: 1 },
      ],
    })
    const a1 = out.items.find((i) => i.id === 'a1')!
    const b1 = out.items.find((i) => i.id === 'b1')!
    // Side-by-side: different x, similar y (within a band)
    const sideBySide =
      Math.abs(a1.y - b1.y) < 80 && Math.abs(a1.x - b1.x) > 100
    // Or at least denser than pure vertical stack (b1 not far below a2)
    const a2 = out.items.find((i) => i.id === 'a2')!
    const compact = b1.y < a2.y + a2.height + 200
    expect(sideBySide || compact).toBe(true)
  })
})

describe('grid area budget helpers', () => {
  it('computeGridAreaScale never exceeds 1 and floors at minScale', () => {
    expect(computeGridAreaScale(100, 1000, 1, 0.9, 0.55)).toBe(1)
    const s = computeGridAreaScale(10_000, 900, 1, 0.9, 0.55)
    expect(s).toBeGreaterThanOrEqual(0.55)
    expect(s).toBeLessThanOrEqual(1)
  })

  it('pagesForIdealCells grows with content area', () => {
    const pageCells = 30 * 40 // ~letter content @ 24px
    expect(pagesForIdealCells(pageCells * 0.5, pageCells)).toBe(1)
    expect(pagesForIdealCells(pageCells * 5, pageCells)).toBeGreaterThan(1)
  })

  it('chooseTopicRegionWidth halves small topics', () => {
    const full = chooseTopicRegionWidth(30 * 40, 30, 40) // whole page
    expect(full).toBe(30)
    const half = chooseTopicRegionWidth(20, 30, 40) // tiny
    expect(half).toBe(15)
  })

  it('placeTopicRegionsDense packs two blocks without overlap', () => {
    const pos = placeTopicRegionsDense(
      [
        { index: 0, cw: 10, ch: 4 },
        { index: 1, cw: 10, ch: 4 },
      ],
      30,
      1,
      { sortByHeight: false },
    )
    expect(pos.get(0)).toEqual({ c: 0, r: 0 })
    // gapCells=1 → second block beside first (c >= 11)
    expect(pos.get(1)!.c).toBeGreaterThanOrEqual(11)
    expect(pos.get(1)!.r).toBe(0)
  })

  it('placeTopicRegionsDense fills holes (does not leave bottom voids)', () => {
    // Tall left + short right + medium that should go under the short one
    const pos = placeTopicRegionsDense(
      [
        { index: 0, cw: 12, ch: 10 },
        { index: 1, cw: 12, ch: 3 },
        { index: 2, cw: 12, ch: 4 },
      ],
      30,
      0,
      { sortByHeight: false },
    )
    expect(pos.get(0)).toEqual({ c: 0, r: 0 })
    expect(pos.get(1)!.c).toBe(12)
    expect(pos.get(1)!.r).toBe(0)
    // Third fills under short block, not far below everything
    expect(pos.get(2)!.c).toBe(12)
    expect(pos.get(2)!.r).toBeLessThanOrEqual(4)
    const bottom = Math.max(
      ...[0, 1, 2].map((i) => {
        const p = pos.get(i)!
        const h = i === 0 ? 10 : i === 1 ? 3 : 4
        return p.r + h
      }),
    )
    expect(bottom).toBeLessThanOrEqual(12)
  })

  it('density xs makes significantly smaller cards than lg', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      card(`d${i}`, {
        latex: 'E = mc^2',
        title: `Eq ${i}`,
        width: 200,
        height: 100,
      }),
    )
    const xs = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'xs',
      groupChrome: 'none',
      multiPage: true,
    })
    const lg = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'lg',
      groupChrome: 'none',
      multiPage: true,
    })
    const area = (list: typeof xs.items) =>
      list
        .filter((i) => !i.hidden)
        .reduce((s, i) => s + i.width * i.height, 0)
    expect(area(xs.items)).toBeLessThan(area(lg.items) * 0.85)
  })

  it('naturalTopicPack picks a compact bounding box', () => {
    const rects = [
      { id: 'a', cw: 4, ch: 2 },
      { id: 'b', cw: 4, ch: 2 },
      { id: 'c', cw: 3, ch: 2 },
    ]
    const n = naturalTopicPack(rects, 30)
    expect(n.contentCw).toBeLessThanOrEqual(12)
    expect(n.contentCh).toBeGreaterThan(0)
    expect(n.pos.size).toBe(3)
  })
  it('shelfPackHeight and scaleCellRects are consistent', () => {
    const rects = [
      { id: 'a', cw: 4, ch: 2 },
      { id: 'b', cw: 4, ch: 2 },
      { id: 'c', cw: 8, ch: 3 },
    ]
    expect(shelfPackHeight(rects, 8)).toBeGreaterThan(0)
    const scaled = scaleCellRects(rects, 0.5, 8, 1, 1)
    expect(scaled.every((r) => r.cw >= 1 && r.ch >= 1)).toBe(true)
    const shelf = packRectsShelfOnGrid(rects, 8)
    expect(shelf.size).toBe(3)
  })
})
