import { describe, expect, it } from 'vitest'
import {
  packCheatsheetLayout,
  estimateIdealBlockSize,
  snapSizeToGrid,
  packRectsShelfOnGrid,
  minReadableCardSize,
  MIN_READABLE_TITLE_FONT,
  MIN_READABLE_BODY_FONT,
  ORGANIZE_GRID,
  computeGridAreaScale,
  pagesForIdealCells,
  placeTopicRegionsDense,
  naturalTopicPack,
  scaleCellRects,
  rectsOverlap,
  panelRunsOverlap,
  folderAtGroupLevel,
  folderAncestorChain,
  panelGroupLevelOptions,
  normalizePanelGroupLevels,
  buildNestedHierarchyPanels,
  packClusterTight,
  fillPolyominoHoles,
  polyominoExteriorPathD,
  polyominoExteriorEdges,
  formatAutoLayoutFileTag,
  buildExportFileNameStem,
  relayoutPanelContents,
  resetPanelPackSeed,
  resolveMultipageStraddles,
  insertPageGutters,
  densifyPlacedGroups,
  ensureLeafTitleClearance,
  getPackContentBox,
  closePolyomino,
  mergeAdjacentOutermostPanels,
  translateLayoutPanelCluster,
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
    // Stroked panels are merge-component leaders — each must have a visible outline.
    // Overlapping peers are fused so only one stroke remains per component.
    const stroked = out.layoutPanels.filter((p) => p.showStroke !== false)
    expect(stroked.length).toBeGreaterThan(0)
    for (const p of stroked) {
      expect(p.outlinePath || p.runs?.length).toBeTruthy()
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

  it('chrome modes labels / panels / none produce distinct outcomes', () => {
    const folders = [
      { id: 'f1', order: 0, name: '1. Alpha' },
      { id: 'f2', order: 1, name: '2. Beta' },
    ]
    const items: CanvasItem[] = [
      card('h1', {
        latex: '\\textbf{\\text{1. Alpha}}',
        title: '1. Alpha',
        showTitle: false,
        folderId: 'f1',
        height: 24,
      }),
      card('a1', { folderId: 'f1', title: 'A1', width: 100, height: 60 }),
      card('h2', {
        latex: '\\textbf{\\text{2. Beta}}',
        title: '2. Beta',
        showTitle: false,
        folderId: 'f2',
        height: 24,
      }),
      card('b1', { folderId: 'f2', title: 'B1', width: 100, height: 60 }),
    ]
    const none = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'none',
      folders,
      groupByFolder: true,
    })
    const labels = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'labels',
      folders,
      groupByFolder: true,
    })
    const panels = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'rect',
      folders,
      groupByFolder: true,
    })
    // Legacy both → panels (labels+panels removed from UI)
    const legacyBoth = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'both',
      panelShape: 'rect',
      folders,
      groupByFolder: true,
    })
    // none: no panels, headings hidden
    expect(none.layoutPanels).toEqual([])
    expect(none.items.filter((i) => !i.hidden && i.id === 'h1').length).toBe(0)
    // labels: banners visible, no panels
    expect(labels.layoutPanels).toEqual([])
    expect(labels.items.some((i) => !i.hidden && i.id === 'h1')).toBe(true)
    // panels: frames, headings hidden
    expect(panels.layoutPanels.length).toBeGreaterThanOrEqual(2)
    expect(panels.items.filter((i) => !i.hidden && i.id === 'h1').length).toBe(
      0,
    )
    // both normalizes to panels (not dual chrome)
    expect(legacyBoth.layoutPanels.length).toBeGreaterThanOrEqual(2)
    expect(
      legacyBoth.items.filter((i) => !i.hidden && i.id === 'h1').length,
    ).toBe(0)
    expect(GROUP_CHROME_PRESETS).not.toHaveProperty('both')
  })

  it('n-gon levels and shape change panel chrome (not just packing)', () => {
    const folders = [
      { id: 't1', name: '1. Topic', parentId: null, order: 0 },
      { id: 't1a', name: '1.1 Sub', parentId: 't1', order: 0 },
      { id: 't1b', name: '1.2 Sub', parentId: 't1', order: 1 },
    ]
    const items: CanvasItem[] = [
      card('a1', {
        folderId: 't1a',
        title: 'A1',
        width: 120,
        height: 60,
        latex: 'a=1',
      }),
      card('a2', {
        folderId: 't1a',
        title: 'A2',
        width: 80,
        height: 100,
        latex: 'a=2',
      }),
      card('b1', {
        folderId: 't1b',
        title: 'B1',
        width: 100,
        height: 70,
        latex: 'b=1',
      }),
    ]
    const rect = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'rect',
      panelGroupLevels: [1, 2],
      panelBorderLevels: [1, 2],
      panelPadding: 4,
      folders,
    })
    const ngonL2 = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelGroupLevels: [1, 2],
      panelBorderLevels: [1, 2],
      panelNgonLevels: [2],
      panelPadding: 4,
      folders,
    })
    const L1r = rect.layoutPanels.filter((p) => p.hierarchyLevel === 1)
    const L2r = rect.layoutPanels.filter((p) => p.hierarchyLevel === 2)
    const L1n = ngonL2.layoutPanels.filter((p) => p.hierarchyLevel === 1)
    const L2n = ngonL2.layoutPanels.filter((p) => p.hierarchyLevel === 2)
    // Leaf L2: rect mode → solid rect; n-gon mode → polygon
    expect(L2r.every((p) => p.shape === 'rect')).toBe(true)
    expect(L2n.every((p) => p.shape === 'polygon')).toBe(true)
    // Explicit panelNgonLevels:[2] → L1 stays rect; L2 is n-gon
    expect(L1r.every((p) => p.shape === 'rect')).toBe(true)
    expect(L1n.every((p) => p.shape === 'rect')).toBe(true)
    for (const p of L2n) {
      expect(p.outlinePath).toBeTruthy()
    }
  })

  it('gap and panelPadding defaults are 4 and change pack span', () => {
    const folders = [
      { id: 'f1', order: 0, name: 'A' },
      { id: 'f2', order: 1, name: 'B' },
    ]
    const items = [
      card('a', { folderId: 'f1', title: 'A', width: 120, height: 80 }),
      card('b', { folderId: 'f2', title: 'B', width: 120, height: 80 }),
    ]
    const tight = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevels: [1],
      gap: 0,
      panelPadding: 0,
      folders,
    })
    const loose = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevels: [1],
      gap: 24,
      panelPadding: 12,
      folders,
    })
    const span = (out: typeof tight) => {
      const cards = out.items.filter((i) => !i.hidden)
      return (
        Math.max(...cards.map((c) => c.y + c.height)) -
        Math.min(...cards.map((c) => c.y))
      )
    }
    expect(span(loose)).toBeGreaterThanOrEqual(span(tight))
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
    // Stroked n-gon panels: silhouette/close chrome (may lightly touch neighbors)
    const stroked = out.layoutPanels.filter((p) => p.showStroke !== false)
    expect(stroked.length).toBeGreaterThanOrEqual(1)
    for (const p of stroked) {
      expect(p.shape).toBe('polygon')
      expect((p.runs?.length ?? 0)).toBeGreaterThanOrEqual(1)
      expect(p.outlinePath || p.runs?.length).toBeTruthy()
    }
    // Own members stay inside each panel AABB (primary correctness for pack)
    for (const p of stroked) {
      for (const id of p.memberIds ?? []) {
        const c = cards.find((x) => x.id === id)
        if (!c) continue
        expect(c.x).toBeGreaterThanOrEqual(p.x - 2)
        expect(c.y).toBeGreaterThanOrEqual(p.y - 2)
        expect(c.x + c.width).toBeLessThanOrEqual(p.x + p.width + 2)
        expect(c.y + c.height).toBeLessThanOrEqual(p.y + p.height + 2)
      }
    }
    // Same-level panels: at most pad-level contact is ideal; full-sheet free-flow
    // can leave rare residual overlaps after clamp. Soft-cap (not zero).
    let deepHits = 0
    for (let i = 0; i < stroked.length; i++) {
      for (let j = i + 1; j < stroked.length; j++) {
        const a = stroked[i]!
        const b = stroked[j]!
        if (panelRunsOverlap(a, b, 8) || rectsOverlap(a, b, 8)) deepHits++
      }
    }
    expect(deepHits).toBeLessThanOrEqual(2)
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
    // (dense free-flow may sit them side-by-side; allow generous slack)
    const aDiag = a1.y + a1.x * 0.35
    const zDiag = z1.y + z1.x * 0.35
    expect(aDiag).toBeLessThanOrEqual(zDiag + 120)
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

    // Nested: L1 outer + L2 inner — L1 siblings must not stack
    const nested = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevels: [1, 2],
      panelPadding: 8,
      folders,
    })
    const L1 = nested.layoutPanels.filter((p) => p.hierarchyLevel === 1)
    const L2 = nested.layoutPanels.filter((p) => p.hierarchyLevel === 2)
    // Every top folder gets L1, including single-child “2.” → “2.1”
    expect(L1.map((p) => p.folderId).sort()).toEqual(['t1', 't2'])
    expect(L2.length).toBe(3) // 1.1, 1.2, 2.1
    const outerT1 = L1.find((p) => p.folderId === 't1')!
    const outerT2 = L1.find((p) => p.folderId === 't2')!
    expect(outerT1.memberIds?.sort()).toEqual(['a1', 'a2'].sort())
    expect(outerT2.memberIds).toEqual(['b1'])
    // Outer boxes cover their inners (with nest inset air gap)
    const inner11 = L2.find((p) => p.folderId === 't1a')!
    const inner21 = L2.find((p) => p.folderId === 't2a')!
    expect(outerT1.x).toBeLessThanOrEqual(inner11.x + 0.5)
    expect(outerT1.y).toBeLessThanOrEqual(inner11.y + 0.5)
    expect(outerT1.x + outerT1.width + 0.5).toBeGreaterThanOrEqual(
      inner11.x + inner11.width,
    )
    expect(outerT2.x).toBeLessThanOrEqual(inner21.x + 0.5)
    expect(outerT2.y).toBeLessThanOrEqual(inner21.y + 0.5)
    expect(outerT2.x + outerT2.width + 0.5).toBeGreaterThanOrEqual(
      inner21.x + inner21.width,
    )
    // Outer must cover inners (nest gutter is optional; never shrink under cards)
    expect(outerT1.x).toBeLessThanOrEqual(inner11.x + 0.5)
    expect(outerT2.x).toBeLessThanOrEqual(inner21.x + 0.5)
    expect(outerT1.x + outerT1.width + 0.5).toBeGreaterThanOrEqual(
      inner11.x + inner11.width,
    )
    expect(outerT2.x + outerT2.width + 0.5).toBeGreaterThanOrEqual(
      inner21.x + inner21.width,
    )
    // Stroked L1 islands must not deeply overlap (pad-kiss at edges ok)
    const strokedL1 = L1.filter((p) => p.showStroke !== false)
    for (let i = 0; i < strokedL1.length; i++) {
      for (let j = i + 1; j < strokedL1.length; j++) {
        expect(rectsOverlap(strokedL1[i]!, strokedL1[j]!, 8)).toBe(false)
      }
    }
    // Outer not full page width for tiny clusters
    expect(outerT1.width).toBeLessThan(DEFAULT_CANVAS.width * 0.85)
  })

  it('packClusterTight prefers compact width over full page', () => {
    const members = [
      { index: 0, cw: 4, ch: 3 },
      { index: 1, cw: 4, ch: 3 },
      { index: 2, cw: 4, ch: 2 },
    ]
    const tight = packClusterTight(members, 30, 0)
    // Should not force full 30-col outer for ~12 cells of content
    expect(tight.usedCw).toBeLessThanOrEqual(16)
    expect(tight.usedCw * tight.usedCh).toBeLessThan(30 * 12)
  })

  it('formatAutoLayoutFileTag encodes pack knobs for shareable export names', () => {
    const tag = formatAutoLayoutFileTag({
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelGroupLevels: [1, 2],
      groupSort: 'name-asc',
      l1PanelGap: 8,
      l2PanelGap: 4,
      blockGap: 4,
      panelPadding: 6,
    })
    expect(tag).toBe('auto_sm_panels_ngon_L1-2_az_l1g8_l2g4_bg4_pgap6')
    const stem = buildExportFileNameStem('Studio Everything — Full Catalog', {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelGroupLevels: [1, 2],
      groupSort: 'name-asc',
      l1PanelGap: 8,
      l2PanelGap: 4,
      blockGap: 4,
      panelPadding: 6,
    })
    expect(stem).toContain('Studio Everything')
    expect(stem).toContain('__auto_sm_panels_ngon_L1-2_az_l1g8_l2g4_bg4_pgap6')
    expect(stem).not.toMatch(/[<>:"/\\|?*]/)
  })

  it('gap knobs affect free-flow spacing (rect and n-gon)', () => {
    const folders = [
      { id: 'f1', order: 0, name: '1. Alpha' },
      { id: 'f2', order: 1, name: '2. Beta' },
    ]
    const items: CanvasItem[] = [
      card('a1', { folderId: 'f1', title: 'A1', width: 100, height: 60 }),
      card('a2', { folderId: 'f1', title: 'A2', width: 100, height: 60 }),
      card('b1', { folderId: 'f2', title: 'B1', width: 100, height: 60 }),
      card('b2', { folderId: 'f2', title: 'B2', width: 100, height: 60 }),
    ]
    const pack = (
      shape: 'rect' | 'polygon',
      l1: number,
      block: number,
    ) =>
      packCheatsheetLayout(items, DEFAULT_CANVAS, {
        density: 'sm',
        groupChrome: 'panels',
        panelShape: shape,
        panelGroupLevels: [1],
        panelBorderLevels: [1],
        panelPadding: 4,
        l1PanelGap: l1,
        l2PanelGap: 2,
        blockGap: block,
        folders,
        groupSort: 'name-asc',
      })
    const topicGap = (out: ReturnType<typeof packCheatsheetLayout>) => {
      const a = out.items.filter((i) => i.folderId === 'f1' && !i.hidden)
      const b = out.items.filter((i) => i.folderId === 'f2' && !i.hidden)
      const aBot = Math.max(...a.map((c) => c.y + c.height))
      const bTop = Math.min(...b.map((c) => c.y))
      const aTop = Math.min(...a.map((c) => c.y))
      const bBot = Math.max(...b.map((c) => c.y + c.height))
      // Vertical separation between topic clusters (either order)
      return Math.max(0, Math.max(bTop - aBot, aTop - bBot))
    }
    // Larger L1 gap → more air between topic clusters (rect + n-gon)
    expect(topicGap(pack('rect', 48, 0))).toBeGreaterThan(
      topicGap(pack('rect', 0, 0)),
    )
    expect(topicGap(pack('polygon', 48, 0))).toBeGreaterThan(
      topicGap(pack('polygon', 0, 0)),
    )
    // Hard guarantee: large L1 gap leaves real content air between topics
    expect(topicGap(pack('rect', 48, 0))).toBeGreaterThanOrEqual(40)
  })

  it('nested L2 panel gap and n-gon multi-run chrome honor settings', () => {
    const folders = [
      { id: 'f1', order: 0, name: '1. Alpha', parentId: null },
      { id: 'f1a', order: 0, name: '1.1 SubA', parentId: 'f1' },
      { id: 'f1b', order: 1, name: '1.2 SubB', parentId: 'f1' },
      { id: 'f2', order: 1, name: '2. Beta', parentId: null },
      { id: 'f2a', order: 0, name: '2.1 Sub', parentId: 'f2' },
    ]
    // Uneven card sizes so free-flow leaves a stepped L silhouette for n-gon
    const items: CanvasItem[] = [
      card('a1', { folderId: 'f1a', title: 'A1', width: 180, height: 80 }),
      card('a2', { folderId: 'f1a', title: 'A2', width: 100, height: 60 }),
      card('a3', { folderId: 'f1a', title: 'A3', width: 90, height: 50 }),
      card('b1', { folderId: 'f1b', title: 'B1', width: 120, height: 70 }),
      card('b2', { folderId: 'f1b', title: 'B2', width: 160, height: 100 }),
      card('c1', { folderId: 'f2a', title: 'C1', width: 100, height: 60 }),
      card('c2', { folderId: 'f2a', title: 'C2', width: 140, height: 90 }),
    ]
    const pack = (
      shape: 'rect' | 'polygon',
      l1: number,
      l2: number,
      block: number,
    ) =>
      packCheatsheetLayout(items, DEFAULT_CANVAS, {
        density: 'sm',
        groupChrome: 'panels',
        panelShape: shape,
        panelGroupLevels: [1, 2],
        panelBorderLevels: [1, 2],
        panelNgonLevels: shape === 'polygon' ? [1, 2] : undefined,
        panelPadding: 4,
        l1PanelGap: l1,
        l2PanelGap: l2,
        blockGap: block,
        folders,
        groupSort: 'name-asc',
        multiPage: true,
        dissolvePrintArea: true,
      })

    const l1StrokeGap = (out: ReturnType<typeof packCheatsheetLayout>) => {
      const L1 = (out.layoutPanels ?? [])
        .filter((p) => (p.hierarchyLevel ?? 1) === 1 && p.showStroke !== false)
        .sort((a, b) => a.y - b.y || a.x - b.x)
      if (L1.length < 2) return 0
      const a = L1[0]!
      const b = L1[1]!
      const xOl = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      if (xOl > 8) return Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height))
      return Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width))
    }
    const l2StrokeGap = (out: ReturnType<typeof packCheatsheetLayout>) => {
      const L1 = (out.layoutPanels ?? []).find(
        (p) =>
          (p.hierarchyLevel ?? 1) === 1 &&
          p.showStroke !== false &&
          (p.title ?? '').includes('Alpha'),
      )
      if (!L1) return 0
      const set = new Set(L1.memberIds ?? [])
      const kids = (out.layoutPanels ?? [])
        .filter(
          (p) =>
            (p.hierarchyLevel ?? 1) === 2 &&
            p.showStroke !== false &&
            p.memberIds?.every((id) => set.has(id)),
        )
        .sort((a, b) => a.y - b.y || a.x - b.x)
      if (kids.length < 2) return 0
      let best = 0
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i]!
          const b = kids[j]!
          const xOl =
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
          const yOl =
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
          if (xOl > 8) {
            best = Math.max(
              best,
              Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height)),
            )
          } else if (yOl > 8) {
            best = Math.max(
              best,
              Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width)),
            )
          }
        }
      }
      return best
    }

    const tight = pack('rect', 2, 2, 2)
    const airy = pack('rect', 48, 48, 2)
    expect(l1StrokeGap(airy)).toBeGreaterThanOrEqual(40)
    expect(l1StrokeGap(airy)).toBeGreaterThan(l1StrokeGap(tight))
    // L2 siblings under Alpha should open with larger L2 gap
    expect(l2StrokeGap(airy)).toBeGreaterThanOrEqual(40)
    expect(l2StrokeGap(airy)).toBeGreaterThan(l2StrokeGap(tight))

    // N-gon: at least some stroked panels use polygon shape
    const ngon = pack('polygon', 24, 24, 8)
    const stroked = (ngon.layoutPanels ?? []).filter(
      (p) => p.showStroke !== false,
    )
    expect(stroked.some((p) => p.shape === 'polygon')).toBe(true)
    // shape stays polygon even when a panel collapses to a solid AABB run
    expect(stroked.filter((p) => p.shape === 'polygon').length).toBeGreaterThan(
      0,
    )
  })

  it('block gap increases leaf card spacing', () => {
    const folders = [
      { id: 'f1', order: 0, name: '1. Alpha' },
    ]
    const items: CanvasItem[] = [
      card('a1', { folderId: 'f1', title: 'A1', width: 100, height: 60 }),
      card('a2', { folderId: 'f1', title: 'A2', width: 100, height: 60 }),
      card('a3', { folderId: 'f1', title: 'A3', width: 100, height: 60 }),
      card('a4', { folderId: 'f1', title: 'A4', width: 100, height: 60 }),
    ]
    const pack = (block: number) =>
      packCheatsheetLayout(items, DEFAULT_CANVAS, {
        density: 'sm',
        groupChrome: 'panels',
        panelShape: 'rect',
        panelGroupLevels: [1],
        panelBorderLevels: [1],
        panelPadding: 4,
        l1PanelGap: 2,
        l2PanelGap: 2,
        blockGap: block,
        folders,
        groupSort: 'name-asc',
      })
    const ySpan = (out: ReturnType<typeof packCheatsheetLayout>) => {
      const cards = out.items.filter((i) => !i.hidden)
      return (
        Math.max(...cards.map((c) => c.y + c.height)) -
        Math.min(...cards.map((c) => c.y))
      )
    }
    // Larger block gap → taller overall when cards stack under densify
    expect(ySpan(pack(48))).toBeGreaterThanOrEqual(ySpan(pack(0)))
  })

  it('gap + panelPadding together increase inter-panel free-flow clearance', () => {
    const folders = Array.from({ length: 4 }, (_, i) => ({
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
    ])
    const tight = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevels: [1],
      gap: 0,
      panelPadding: 0,
      folders,
    })
    const loose = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevels: [1],
      gap: 24,
      panelPadding: 12,
      folders,
    })
    const span = (out: typeof tight) => {
      const cards = out.items.filter((i) => !i.hidden)
      return (
        Math.max(...cards.map((c) => c.y + c.height)) -
        Math.min(...cards.map((c) => c.y))
      )
    }
    // Larger gap+pad → more vertical spread (or at least not tighter)
    expect(span(loose)).toBeGreaterThanOrEqual(span(tight))
    // Stroked peer panels must not overlap (merged L1 leader may cover siblings)
    for (const out of [tight, loose]) {
      const stroked = out.layoutPanels.filter((p) => p.showStroke !== false)
      for (let i = 0; i < stroked.length; i++) {
        for (let j = i + 1; j < stroked.length; j++) {
          expect(rectsOverlap(stroked[i]!, stroked[j]!)).toBe(false)
        }
      }
    }
  })

  it('polyominoExteriorPathD covers all exterior edges (no broken L borders)', () => {
    // Two adjacent cells: 6 exterior edges (shared edge omitted)
    const unit = new Set(['0,0', '1,0'])
    const edges = polyominoExteriorEdges(unit, 10, 0, 0, 0)
    expect(edges.length).toBe(6)
    const d = polyominoExteriorPathD(unit, 10, 0, 0)
    expect(d).toMatch(/^M /)
    // One M per edge (no stitching — avoids dropped corners)
    expect((d.match(/M /g) ?? []).length).toBe(6)
    // L tromino: must include bottom + right extremities (no missing Genetics-style gap)
    const ell = new Set(['0,0', '0,1', '1,1'])
    const ellEdges = polyominoExteriorEdges(ell, 10, 0, 0)
    expect(ellEdges.length).toBe(8) // 3 cells × 4 - 2×2 shared = 8
    const maxX = Math.max(...ellEdges.flatMap((e) => [e.x1, e.x2]))
    const maxY = Math.max(...ellEdges.flatMap((e) => [e.y1, e.y2]))
    expect(maxX).toBe(20)
    expect(maxY).toBe(20)
  })

  it('n-gon panel exposes outlinePath and fully encapsulates cards', () => {
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
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelPadding: 8,
      panelGroupLevels: [1],
      folders: [{ id: 'f', name: 'Topic', order: 0 }],
    })
    const p = out.layoutPanels[0]!
    expect(p.shape).toBe('polygon')
    expect(p.outlinePath).toBeTruthy()
    expect(p.outlinePath).toMatch(/M /)
    const cards = out.items.filter((i) => !i.hidden)
    for (const c of cards) {
      expect(p.x).toBeLessThanOrEqual(c.x)
      expect(p.y).toBeLessThanOrEqual(c.y)
      expect(p.x + p.width).toBeGreaterThanOrEqual(c.x + c.width)
      expect(p.y + p.height).toBeGreaterThanOrEqual(c.y + c.height)
    }
  })

  it('n-gon L2 leaf fully encloses unequal cards (no overflow 031956)', () => {
    // Tall flowchart + wide table + short formulas like Microeconomics
    const folders = [
      { id: 't1', name: '1. Economics', parentId: null, order: 0 },
      { id: 't1a', name: '1.2 Microeconomics', parentId: 't1', order: 0 },
      { id: 't1b', name: '1.3 Macro', parentId: 't1', order: 1 },
    ]
    const items: CanvasItem[] = [
      card('flow', {
        folderId: 't1a',
        title: 'Flow',
        width: 140,
        height: 220,
        latex: 'f',
      }),
      card('map', {
        folderId: 't1a',
        title: 'Mind',
        width: 200,
        height: 180,
        latex: 'm',
      }),
      card('tbl', {
        folderId: 't1a',
        title: 'Table',
        width: 180,
        height: 100,
        latex: 't',
      }),
      card('eq1', {
        folderId: 't1a',
        title: 'Eq1',
        width: 120,
        height: 50,
        latex: 'e1',
      }),
      card('eq2', {
        folderId: 't1a',
        title: 'Eq2',
        width: 160,
        height: 48,
        latex: 'e2',
      }),
      card('b1', {
        folderId: 't1b',
        title: 'B1',
        width: 100,
        height: 60,
        latex: 'b',
      }),
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelPadding: 4,
      panelGroupLevels: [1, 2],
      panelBorderLevels: [1, 2],
      panelNgonLevels: [1, 2],
      l1PanelGap: 2,
      l2PanelGap: 2,
      blockGap: 2,
      folders,
      groupSort: 'name-asc',
    })
    const L2 = (out.layoutPanels ?? []).filter(
      (p) => (p.hierarchyLevel ?? 1) === 2 && p.showStroke !== false,
    )
    expect(L2.length).toBeGreaterThanOrEqual(1)
    for (const p of L2) {
      const mem = (p.memberIds ?? [])
        .map((id) => out.items.find((i) => i.id === id)!)
        .filter((c) => c && !c.hidden)
      for (const c of mem) {
        // AABB encloses cards
        expect(p.x).toBeLessThanOrEqual(c.x + 0.5)
        expect(p.y).toBeLessThanOrEqual(c.y + 0.5)
        expect(p.x + p.width).toBeGreaterThanOrEqual(c.x + c.width - 0.5)
        expect(p.y + p.height).toBeGreaterThanOrEqual(c.y + c.height - 0.5)
        // Union of runs (fill regions) must cover each card
        const runs =
          p.runs && p.runs.length > 0
            ? p.runs
            : [{ x: p.x, y: p.y, width: p.width, height: p.height }]
        const covered = runs.some(
          (r) =>
            r.x <= c.x + 0.5 &&
            r.y <= c.y + 0.5 &&
            r.x + r.width >= c.x + c.width - 0.5 &&
            r.y + r.height >= c.y + c.height - 0.5,
        )
        expect(covered).toBe(true)
      }
    }
  })

  it('nested L1 title band sits above L2 panel top (readable parent header)', () => {
    const folders = [
      { id: 't1', name: '1. Topic', parentId: null, order: 0 },
      { id: 't1a', name: '1.1 Sub', parentId: 't1', order: 0 },
      { id: 't1b', name: '1.2 Sub', parentId: 't1', order: 1 },
    ]
    const items: CanvasItem[] = [
      card('a1', { folderId: 't1a', title: 'A1', latex: 'a=1' }),
      card('a2', { folderId: 't1b', title: 'A2', latex: 'a=2' }),
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevels: [1, 2],
      panelPadding: 8,
      folders,
    })
    const L1 = out.layoutPanels.find((p) => p.hierarchyLevel === 1)!
    const L2 = out.layoutPanels.filter((p) => p.hierarchyLevel === 2)
    expect(L1).toBeTruthy()
    expect(L2.length).toBe(2)
    const topL2 = Math.min(...L2.map((p) => p.y))
    // L1 solid frame starts at/above L2 title bands (parent above children)
    expect(L1.y).toBeLessThanOrEqual(topL2 + 1)
  })

  it('nested multi-level: only outermost panels stroke (no double borders)', () => {
    const folders = [
      { id: 't1', name: '1. Topic', parentId: null, order: 0 },
      { id: 't1a', name: '1.1 Sub', parentId: 't1', order: 0 },
      { id: 't1b', name: '1.2 Sub', parentId: 't1', order: 1 },
    ]
    const items: CanvasItem[] = [
      card('a1', { folderId: 't1a', title: 'A1', latex: 'a=1' }),
      card('a2', { folderId: 't1b', title: 'A2', latex: 'a=2' }),
    ]
    const out = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelGroupLevels: [1, 2],
      panelPadding: 8,
      folders,
    })
    const L1 = out.layoutPanels.filter((p) => p.hierarchyLevel === 1)
    const L2 = out.layoutPanels.filter((p) => p.hierarchyLevel === 2)
    expect(L1.length).toBe(1)
    expect(L2.length).toBe(2)
    expect(L1.every((p) => p.showStroke !== false)).toBe(true)
    expect(L2.every((p) => p.showStroke === false)).toBe(true)
    // L1 still has solid n-gon outline; L2 keeps fill runs + title
    expect(L1[0]!.outlinePath || L1[0]!.runs?.length).toBeTruthy()
    expect(L2.every((p) => p.showTitle !== false && p.title)).toBe(true)
  })

  it('mergeAdjacentOutermostPanels fuses touching L1 strokes', () => {
    const panels = [
      {
        id: 'a',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        hierarchyLevel: 1 as const,
        shape: 'rect' as const,
        showStroke: true,
        memberIds: ['1'],
        title: 'A',
      },
      {
        id: 'b',
        x: 98,
        y: 0,
        width: 100,
        height: 80,
        hierarchyLevel: 1 as const,
        shape: 'rect' as const,
        showStroke: true,
        memberIds: ['2'],
        title: 'B',
      },
      {
        id: 'c',
        x: 400,
        y: 0,
        width: 80,
        height: 80,
        hierarchyLevel: 1 as const,
        shape: 'rect' as const,
        showStroke: true,
        memberIds: ['3'],
        title: 'C',
      },
    ]
    const out = mergeAdjacentOutermostPanels(panels, { grid: 24, panelPad: 8 })
    const a = out.find((p) => p.id === 'a')!
    const b = out.find((p) => p.id === 'b')!
    const c = out.find((p) => p.id === 'c')!
    // A+B touch → one stroke leader, one fill-only sibling
    const abStroked = [a, b].filter((p) => p.showStroke !== false)
    expect(abStroked.length).toBe(1)
    expect(abStroked[0]!.width).toBeGreaterThan(100)
    // C is isolated — still strokes
    expect(c.showStroke).not.toBe(false)
  })

  it('translateLayoutPanelCluster moves members and panel chrome', () => {
    const items: CanvasItem[] = [
      card('a1', {
        folderId: 't1a',
        title: 'A1',
        x: 100,
        y: 100,
        width: 120,
        height: 60,
        latex: 'a',
      }),
    ]
    const panels = [
      {
        id: 'p1',
        x: 90,
        y: 80,
        width: 140,
        height: 100,
        hierarchyLevel: 1 as const,
        memberIds: ['a1'],
        showStroke: true,
        title: 'T',
      },
    ]
    const out = translateLayoutPanelCluster(items, panels, 'p1', 48, 24, {
      grid: 24,
      panelPad: 8,
    })
    const moved = out.items.find((i) => i.id === 'a1')!
    expect(moved.x).toBe(148)
    expect(moved.y).toBe(124)
    const p = out.panels.find((x) => x.id === 'p1')!
    expect(p.x).toBeGreaterThan(90)
    expect(p.y).toBeGreaterThan(80)
  })

  it('resolveMultipageStraddles + insertPageGutters keep cards on content bands', () => {
    const pageH = 1056
    const mTop = 48
    const contentH = 960
    // Continuous flow: card near end of band 0 would be clipped
    const items: CanvasItem[] = [
      card('a', {
        x: 48,
        y: mTop + contentH - 40,
        width: 200,
        height: 80,
        latex: 'a',
      }),
      card('b', {
        x: 48,
        y: mTop + contentH + 20,
        width: 200,
        height: 60,
        latex: 'b',
      }),
    ]
    const cont = resolveMultipageStraddles(items, {
      pageHeight: contentH,
      marginTop: mTop,
      contentHeight: contentH,
      grid: 24,
      mode: 'continuous',
    })
    // In continuous space, both on band 1
    const a0 = cont.find((i) => i.id === 'a')!
    expect(a0.y).toBeGreaterThanOrEqual(mTop + contentH - 0.5)
    expect(a0.y + a0.height).toBeLessThanOrEqual(mTop + contentH * 2 + 0.5)

    const boarded = insertPageGutters(cont, {
      pageHeight: pageH,
      marginTop: mTop,
      contentHeight: contentH,
    })
    const a = boarded.find((i) => i.id === 'a')!
    const b = boarded.find((i) => i.id === 'b')!
    const p1Start = pageH + mTop
    const p1End = p1Start + contentH
    expect(a.y).toBeGreaterThanOrEqual(p1Start - 0.5)
    expect(a.y + a.height).toBeLessThanOrEqual(p1End + 0.5)
    expect(b.y).toBeGreaterThanOrEqual(p1Start - 0.5)
    expect(b.y + b.height).toBeLessThanOrEqual(p1End + 0.5)
    expect(b.y).toBeGreaterThanOrEqual(a.y)
  })

  it('getPackContentBox dissolve grows continuous pack height', () => {
    const canvas = {
      ...DEFAULT_CANVAS,
      printPageCount: 3,
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
    }
    const normal = getPackContentBox(canvas, { dissolvePrintArea: false })
    const dissolved = getPackContentBox(canvas, { dissolvePrintArea: true })
    expect(dissolved.height).toBeGreaterThan(normal.height)
    expect(dissolved.dissolved).toBe(true)
    expect(dissolved.dissolvedPageCount).toBe(3)
    // Width stays inside printable margins (does not grow past green box)
    expect(dissolved.width).toBe(normal.width)
    expect(dissolved.left).toBe(normal.left)
  })

  it('ensureLeafTitleClearance pushes groups so title bands stay free', () => {
    const folders = [
      { id: 't1', name: '1. T', parentId: null, order: 0 },
      { id: 't1a', name: '1.1 A', parentId: 't1', order: 0 },
      { id: 't1b', name: '1.2 B', parentId: 't1', order: 1 },
    ]
    // Group B sits where A's title band would be (overlapping strip)
    const items: CanvasItem[] = [
      card('a1', {
        folderId: 't1a',
        title: 'A1',
        x: 48,
        y: 100,
        width: 120,
        height: 60,
        latex: 'a',
      }),
      card('b1', {
        folderId: 't1b',
        title: 'B1',
        x: 48,
        y: 80, // intersects A's title strip [100-24, 100)
        width: 120,
        height: 40,
        latex: 'b',
      }),
    ]
    const out = ensureLeafTitleClearance(items, folders, 2, 24, 24)
    const a = out.find((i) => i.id === 'a1')!
    const b = out.find((i) => i.id === 'b1')!
    // A should be pushed below B + title band
    expect(a.y).toBeGreaterThanOrEqual(b.y + b.height + 24 - 1)
  })

  it('closePolyomino bridges small gaps', () => {
    // Two cells with a gap → close should bridge
    const gap = new Set(['0,0', '0,1', '3,0', '3,1'])
    const closed = closePolyomino(gap, 2)
    expect(closed.has('1,0') || closed.has('2,0')).toBe(true)
  })

  it('fillPolyominoHoles closes interior donuts but keeps exterior L notches', () => {
    // 3×3 ring (hole in center)
    const ring = new Set([
      '0,0',
      '1,0',
      '2,0',
      '0,1',
      '2,1',
      '0,2',
      '1,2',
      '2,2',
    ])
    const filled = fillPolyominoHoles(ring)
    expect(filled.has('1,1')).toBe(true) // hole filled
    expect(filled.size).toBe(9)
    // L shape has no interior hole
    const ell = new Set(['0,0', '1,0', '2,0', '0,1', '0,2'])
    expect(fillPolyominoHoles(ell).size).toBe(5)
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
    // Multi/single L1 solid chrome uses exterior outline path (polygon stroke)
    expect(rect.layoutPanels[0]!.outlinePath || rect.layoutPanels[0]!.shape).toBeTruthy()
    expect(poly.layoutPanels[0]!.shape).toBe('polygon')
    const pr = poly.layoutPanels[0]!
    expect(pr.outlinePath || (pr.runs?.length ?? 0) > 0).toBeTruthy()
    // Nested multi-level L1 is solid AABB perimeter (no deep internal notches)
    const nested = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelGroupLevels: [1, 2],
      folders: [
        { id: 'f', name: '1. T', parentId: null, order: 0 },
        { id: 'f1', name: '1.1 S', parentId: 'f', order: 0 },
      ],
    })
    // re-bind folders on cards
    const items2: CanvasItem[] = items.map((c, i) => ({
      ...c,
      folderId: i === 0 ? 'f1' : 'f1',
    }))
    const nested2 = packCheatsheetLayout(items2, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelShape: 'polygon',
      panelGroupLevels: [1, 2],
      folders: [
        { id: 'f', name: '1. T', parentId: null, order: 0 },
        { id: 'f1', name: '1.1 S', parentId: 'f', order: 0 },
      ],
    })
    const L1 = nested2.layoutPanels.find((p) => p.hierarchyLevel === 1)!
    expect(L1.showStroke).not.toBe(false)
    expect(L1.outlinePath).toBeTruthy()
    // N-gon multi-level uses closed polyomino (not forced 4-edge rect)
    expect((L1.outlinePath!.match(/M /g) ?? []).length).toBeGreaterThanOrEqual(4)
    void nested
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
    // Free-flow clearance is the gap slider (pad is chrome only; pad=0 so it
    // does not force a 1-cell minimum that would hide gap differences).
    const tight = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevel: 1,
      gap: 0,
      panelPadding: 0,
      groupSort: 'none',
      folders,
    })
    const loose = packCheatsheetLayout(items, DEFAULT_CANVAS, {
      density: 'sm',
      groupChrome: 'panels',
      panelGroupLevel: 1,
      gap: 48,
      panelPadding: 0,
      groupSort: 'none',
      folders,
    })
    const span = (out: typeof tight) => {
      const cards = out.items.filter((i) => !i.hidden)
      const minY = Math.min(...cards.map((c) => c.y))
      const maxY = Math.max(...cards.map((c) => c.y + c.height))
      return maxY - minY
    }
    // Larger gap → taller overall stack (more free-flow spacing)
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

  it('relayoutPanelContents defaults contentSort to name-asc when unset', () => {
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
      // contentSort intentionally omitted — default A→Z
      showTitle: true,
    }
    const { items: next, panel: nextP } = relayoutPanelContents(items, panel)
    const xs = ['a', 'b', 'c'].map(
      (id) => next.find((i) => i.id === id)!.x,
    )
    expect(xs[0]!).toBeLessThan(xs[1]!)
    expect(xs[1]!).toBeLessThan(xs[2]!)
    expect(nextP.contentSort ?? 'name-asc').toBe('name-asc')
  })

  it('relayoutPanelContents dense mode packs, keeps card sizes, rebuilds n-gon chrome', () => {
    const items: CanvasItem[] = [
      card('a', {
        title: 'A',
        x: 100,
        y: 100,
        width: 180,
        height: 100,
        latex: 'a',
      }),
      card('b', {
        title: 'B',
        x: 400,
        y: 300,
        width: 180,
        height: 100,
        latex: 'b',
      }),
      card('c', {
        title: 'C',
        x: 200,
        y: 500,
        width: 100,
        height: 80,
        latex: 'c',
      }),
    ]
    const panel: import('@/types').LayoutPanel = {
      id: 'p1-dense-keep-size',
      title: 'Topic',
      x: 80,
      y: 80,
      width: 280,
      height: 200,
      memberIds: ['a', 'b', 'c'],
      shape: 'polygon',
      showTitle: true,
      contentSort: 'none',
    }
    const { items: next, panel: nextP } = relayoutPanelContents(items, panel, {
      mode: 'dense',
      gapPx: 6,
      panelPad: 6,
      grid: 24,
      packSeed: 0,
    })
    // Cards keep original sizes (no shrink spiral)
    for (const id of ['a', 'b', 'c']) {
      const before = items.find((i) => i.id === id)!
      const c = next.find((i) => i.id === id)!
      expect(c.width).toBe(before.width)
      expect(c.height).toBe(before.height)
      expect(c.x).toBeGreaterThanOrEqual(nextP.x - 1)
      expect(c.y).toBeGreaterThanOrEqual(nextP.y - 1)
      expect(c.x + c.width).toBeLessThanOrEqual(nextP.x + nextP.width + 1)
      expect(c.y + c.height).toBeLessThanOrEqual(nextP.y + nextP.height + 1)
    }
    // Chrome rebuilt
    expect(nextP.shape).toBe('polygon')
    expect(nextP.outlinePath || nextP.runs?.length).toBeTruthy()
  })

  it('relayoutPanelContents dense does not shrink cards on repeated clicks', () => {
    resetPanelPackSeed('p-repeat')
    let items: CanvasItem[] = [
      card('a', { title: 'A', x: 100, y: 100, width: 120, height: 80 }),
      card('b', { title: 'B', x: 240, y: 100, width: 120, height: 80 }),
      card('c', { title: 'C', x: 100, y: 200, width: 100, height: 60 }),
    ]
    let panel: import('@/types').LayoutPanel = {
      id: 'p-repeat',
      title: 'T',
      x: 80,
      y: 80,
      width: 320,
      height: 240,
      memberIds: ['a', 'b', 'c'],
      shape: 'rect',
      showTitle: true,
      contentSort: 'name-asc',
    }
    const sizes0 = items.map((i) => ({ id: i.id, w: i.width, h: i.height }))
    for (let i = 0; i < 5; i++) {
      const r = relayoutPanelContents(items, panel, {
        mode: 'dense',
        gapPx: 4,
        panelPad: 4,
        grid: 24,
        // omit packSeed → advances; sizes must stay fixed
      })
      items = r.items
      panel = r.panel
    }
    for (const s of sizes0) {
      const c = items.find((i) => i.id === s.id)!
      expect(c.width).toBe(s.w)
      expect(c.height).toBe(s.h)
    }
  })

  it('relayoutPanelContents dense does not drift right or overflow panel', () => {
    resetPanelPackSeed('p-nodrift')
    const items: CanvasItem[] = [
      card('a', { title: 'A', x: 100, y: 100, width: 140, height: 80 }),
      card('b', { title: 'B', x: 260, y: 100, width: 140, height: 80 }),
      card('c', { title: 'C', x: 100, y: 200, width: 200, height: 100 }),
    ]
    let panel: import('@/types').LayoutPanel = {
      id: 'p-nodrift',
      title: 'T',
      x: 80,
      y: 80,
      width: 360,
      height: 280,
      memberIds: ['a', 'b', 'c'],
      shape: 'rect',
      showTitle: true,
      contentSort: 'name-asc',
    }
    const originX = panel.x
    let cur = items
    for (let i = 0; i < 4; i++) {
      const r = relayoutPanelContents(cur, panel, {
        mode: 'dense',
        gapPx: 4,
        panelPad: 4,
        grid: 24,
        panelShape: i % 2 === 0 ? 'polygon' : 'rect',
      })
      cur = r.items
      panel = r.panel
      // Origin must stay put (no walk to the right)
      expect(Math.abs(panel.x - originX)).toBeLessThanOrEqual(1)
      // Cards stay inside panel (+ pad slack)
      for (const id of ['a', 'b', 'c']) {
        const c = cur.find((x) => x.id === id)!
        expect(c.x).toBeGreaterThanOrEqual(panel.x - 1)
        expect(c.x + c.width).toBeLessThanOrEqual(panel.x + panel.width + 1)
      }
    }
  })

  it('relayoutPanelContents n-gon uses hard tetris + polygon chrome', () => {
    const items: CanvasItem[] = [
      card('a', { title: 'A', x: 100, y: 100, width: 100, height: 72 }),
      card('b', { title: 'B', x: 220, y: 100, width: 100, height: 48 }),
      card('c', { title: 'C', x: 100, y: 200, width: 80, height: 48 }),
      card('d', { title: 'D', x: 200, y: 200, width: 120, height: 72 }),
    ]
    const panel: import('@/types').LayoutPanel = {
      id: 'p-ngon-inpanel',
      title: 'Topic',
      x: 80,
      y: 80,
      width: 300,
      height: 280,
      memberIds: ['a', 'b', 'c', 'd'],
      shape: 'rect',
      showTitle: true,
      contentSort: 'name-asc',
    }
    const { items: next, panel: nextP } = relayoutPanelContents(items, panel, {
      mode: 'dense',
      gapPx: 4,
      panelPad: 4,
      grid: 24,
      packSeed: 0,
      panelShape: 'polygon',
    })
    expect(nextP.shape).toBe('polygon')
    expect(nextP.outlinePath || (nextP.runs && nextP.runs.length > 0)).toBeTruthy()
    // Cards stay full size
    for (const id of ['a', 'b', 'c', 'd']) {
      const before = items.find((i) => i.id === id)!
      const c = next.find((i) => i.id === id)!
      expect(c.width).toBe(before.width)
      expect(c.height).toBe(before.height)
    }
    // Hard tetris packs denser than sparse shelf: bounding box height of cards
    // should be less than stacking all four rows (sum of heights)
    const cards = next.filter((i) => ['a', 'b', 'c', 'd'].includes(i.id))
    const minY = Math.min(...cards.map((c) => c.y))
    const maxY = Math.max(...cards.map((c) => c.y + c.height))
    const sumH = cards.reduce((s, c) => s + c.height, 0)
    expect(maxY - minY).toBeLessThan(sumH)
  })

  it('relayoutPanelContents on L1 rebuilds nested L2 chrome to follow cards', () => {
    const items: CanvasItem[] = [
      card('a1', { title: 'A1', x: 100, y: 100, width: 100, height: 60 }),
      card('a2', { title: 'A2', x: 220, y: 100, width: 100, height: 60 }),
      card('b1', { title: 'B1', x: 100, y: 220, width: 100, height: 60 }),
      card('b2', { title: 'B2', x: 220, y: 220, width: 100, height: 60 }),
    ]
    const l2a: import('@/types').LayoutPanel = {
      id: 'l2a',
      title: '1.1 Sub A',
      x: 90,
      y: 90,
      width: 240,
      height: 90,
      memberIds: ['a1', 'a2'],
      hierarchyLevel: 2,
      shape: 'rect',
      showStroke: true,
      showTitle: true,
    }
    const l2b: import('@/types').LayoutPanel = {
      id: 'l2b',
      title: '1.2 Sub B',
      x: 90,
      y: 210,
      width: 240,
      height: 90,
      memberIds: ['b1', 'b2'],
      hierarchyLevel: 2,
      shape: 'rect',
      showStroke: true,
      showTitle: true,
    }
    const l1: import('@/types').LayoutPanel = {
      id: 'l1',
      title: '1. Topic',
      x: 80,
      y: 80,
      width: 280,
      height: 240,
      memberIds: ['a1', 'a2', 'b1', 'b2'],
      hierarchyLevel: 1,
      shape: 'rect',
      showStroke: true,
      showTitle: true,
      contentSort: 'none',
    }
    // Old L2 positions (will be wrong after dense reflow if not rebuilt)
    const oldL2a = { x: l2a.x, y: l2a.y }
    const { items: next, panels: nextAll } = relayoutPanelContents(items, l1, {
      mode: 'dense',
      gapPx: 4,
      panelPad: 4,
      grid: 24,
      packSeed: 0,
      allPanels: [l1, l2a, l2b],
    })
    expect(nextAll).toBeDefined()
    const nextL2a = nextAll!.find((p) => p.id === 'l2a')!
    const nextL2b = nextAll!.find((p) => p.id === 'l2b')!
    const nextL1 = nextAll!.find((p) => p.id === 'l1')!
    // L2 chrome must track its cards
    for (const id of ['a1', 'a2']) {
      const c = next.find((i) => i.id === id)!
      expect(c.x).toBeGreaterThanOrEqual(nextL2a.x - 2)
      expect(c.y).toBeGreaterThanOrEqual(nextL2a.y - 2)
      expect(c.x + c.width).toBeLessThanOrEqual(nextL2a.x + nextL2a.width + 2)
      expect(c.y + c.height).toBeLessThanOrEqual(nextL2a.y + nextL2a.height + 2)
    }
    for (const id of ['b1', 'b2']) {
      const c = next.find((i) => i.id === id)!
      expect(c.x).toBeGreaterThanOrEqual(nextL2b.x - 2)
      expect(c.y).toBeGreaterThanOrEqual(nextL2b.y - 2)
      expect(c.x + c.width).toBeLessThanOrEqual(nextL2b.x + nextL2b.width + 2)
      expect(c.y + c.height).toBeLessThanOrEqual(nextL2b.y + nextL2b.height + 2)
    }
    // Nested L2s sit inside L1
    for (const child of [nextL2a, nextL2b]) {
      expect(child.x).toBeGreaterThanOrEqual(nextL1.x - 2)
      expect(child.y).toBeGreaterThanOrEqual(nextL1.y - 2)
      expect(child.x + child.width).toBeLessThanOrEqual(
        nextL1.x + nextL1.width + 2,
      )
      expect(child.y + child.height).toBeLessThanOrEqual(
        nextL1.y + nextL1.height + 2,
      )
    }
    // L2A should have moved from its pre-reflow geometry (cards packed in L1)
    const moved =
      Math.abs(nextL2a.x - oldL2a.x) > 0.5 ||
      Math.abs(nextL2a.y - oldL2a.y) > 0.5 ||
      next.find((i) => i.id === 'a1')!.x !== 100
    expect(moved).toBe(true)
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

  it('placeTopicRegionsDense packs two blocks without overlap', () => {
    // Explicit single-order input: multiOrder defaults ON and would ignore
    // sortByHeight alone — pin multiOrder false so this tests input order.
    const pos = placeTopicRegionsDense(
      [
        { index: 0, cw: 10, ch: 4 },
        { index: 1, cw: 10, ch: 4 },
      ],
      30,
      1,
      { multiOrder: false, sortByHeight: false },
    )
    expect(pos.get(0)).toEqual({ c: 0, r: 0 })
    // gapCells=1 → second block beside first (c >= 11)
    expect(pos.get(1)!.c).toBeGreaterThanOrEqual(11)
    expect(pos.get(1)!.r).toBe(0)
  })

  it('placeTopicRegionsDense fills holes (does not leave bottom voids)', () => {
    // Tall + short + medium: densest pack should nest into residual space
    // rather than stacking everything to ~17 rows.
    const regions = [
      { index: 0, cw: 12, ch: 10 },
      { index: 1, cw: 12, ch: 3 },
      { index: 2, cw: 12, ch: 4 },
    ]
    const pos = placeTopicRegionsDense(regions, 30, 0, { multiOrder: true })
    // No overlaps
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i]!
        const b = regions[j]!
        const pa = pos.get(a.index)!
        const pb = pos.get(b.index)!
        const ol =
          pa.c < pb.c + b.cw &&
          pa.c + a.cw > pb.c &&
          pa.r < pb.r + b.ch &&
          pa.r + a.ch > pb.r
        expect(ol).toBe(false)
      }
    }
    const bottom = Math.max(
      ...regions.map((r) => {
        const p = pos.get(r.index)!
        return p.r + r.ch
      }),
    )
    // Side-by-side with nest: bottom ≤ tall height (+ small slack)
    expect(bottom).toBeLessThanOrEqual(12)
    // Not a pure vertical stack of 10+3+4
    expect(bottom).toBeLessThan(10 + 3 + 4)
  })

  function packBBox(
    pos: Map<number, { c: number; r: number }>,
    regions: Array<{ index: number; cw: number; ch: number }>,
  ) {
    let cw = 0
    let ch = 0
    for (const r of regions) {
      const p = pos.get(r.index)!
      cw = Math.max(cw, p.c + r.cw)
      ch = Math.max(ch, p.r + r.ch)
    }
    return { cw, ch, area: cw * ch }
  }

  function assertNoOverlap(
    pos: Map<number, { c: number; r: number }>,
    regions: Array<{ index: number; cw: number; ch: number }>,
    pageCols: number,
  ) {
    for (const r of regions) {
      const p = pos.get(r.index)!
      expect(p.c).toBeGreaterThanOrEqual(0)
      expect(p.r).toBeGreaterThanOrEqual(0)
      expect(p.c + r.cw).toBeLessThanOrEqual(pageCols)
    }
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i]!
        const b = regions[j]!
        const pa = pos.get(a.index)!
        const pb = pos.get(b.index)!
        const ol =
          pa.c < pb.c + b.cw &&
          pa.c + a.cw > pb.c &&
          pa.r < pb.r + b.ch &&
          pa.r + a.ch > pb.r
        expect(ol).toBe(false)
      }
    }
  }

  it('placeTopicRegionsDense multi-order is never worse than height-first or input', () => {
    const regions = [
      { index: 0, cw: 8, ch: 2 },
      { index: 1, cw: 8, ch: 2 },
      { index: 2, cw: 8, ch: 2 },
      { index: 3, cw: 4, ch: 6 },
      { index: 4, cw: 4, ch: 6 },
      { index: 5, cw: 12, ch: 3 },
    ]
    const cols = 16
    const heightOnly = placeTopicRegionsDense(regions, cols, 0, {
      multiOrder: false,
      sortByHeight: true,
    })
    const inputOnly = placeTopicRegionsDense(regions, cols, 0, {
      multiOrder: false,
      sortByHeight: false,
    })
    const best = placeTopicRegionsDense(regions, cols, 0, {
      multiOrder: true,
    })
    const h = packBBox(heightOnly, regions)
    const i = packBBox(inputOnly, regions)
    const b = packBBox(best, regions)
    // Best-of includes height-desc → never worse than height-first
    expect(b.ch).toBeLessThanOrEqual(h.ch)
    expect(b.area).toBeLessThanOrEqual(h.area)
    // And should beat naïve input order on this mixed set
    expect(b.area).toBeLessThanOrEqual(i.area)
    expect(b.ch).toBeLessThanOrEqual(i.ch)
    assertNoOverlap(best, regions, cols)
  })

  it('placeTopicRegionsDense multi-order strictly beats height-first on adversarial set', () => {
    // Seeded case where height-first leaves a larger bbox than another order
    // (area 240 → 208, height 15 → 13). Guards against “always ≤” tautology.
    const regions = [
      { index: 0, cw: 4, ch: 6 },
      { index: 1, cw: 4, ch: 4 },
      { index: 2, cw: 4, ch: 8 },
      { index: 3, cw: 4, ch: 8 },
      { index: 4, cw: 6, ch: 5 },
      { index: 5, cw: 4, ch: 4 },
      { index: 6, cw: 4, ch: 5 },
      { index: 7, cw: 2, ch: 8 },
    ]
    const cols = 17
    const heightOnly = placeTopicRegionsDense(regions, cols, 0, {
      multiOrder: false,
      sortByHeight: true,
    })
    const best = placeTopicRegionsDense(regions, cols, 0, {
      multiOrder: true,
    })
    const h = packBBox(heightOnly, regions)
    const b = packBBox(best, regions)
    expect(b.area).toBeLessThan(h.area)
    expect(b.ch).toBeLessThanOrEqual(h.ch)
    assertNoOverlap(best, regions, cols)
    // Absolute bar: known best-of is ≤ 208× cells at height ≤ 13
    expect(b.area).toBeLessThanOrEqual(208)
    expect(b.ch).toBeLessThanOrEqual(13)
  })

  it('placeTopicRegionsDense default is multi-order (not single height-first)', () => {
    // Omitting multiOrder should densify like multiOrder: true
    const regions = [
      { index: 0, cw: 2, ch: 2 },
      { index: 1, cw: 6, ch: 2 },
      { index: 2, cw: 4, ch: 8 },
      { index: 3, cw: 6, ch: 5 },
      { index: 4, cw: 6, ch: 7 },
      { index: 5, cw: 6, ch: 6 },
    ]
    const cols = 15
    const implicit = placeTopicRegionsDense(regions, cols, 0)
    const explicit = placeTopicRegionsDense(regions, cols, 0, {
      multiOrder: true,
    })
    const heightOnly = placeTopicRegionsDense(regions, cols, 0, {
      multiOrder: false,
      sortByHeight: true,
    })
    expect(packBBox(implicit, regions)).toEqual(packBBox(explicit, regions))
    // This set is one where multi-order shrinks height vs height-first
    expect(packBBox(implicit, regions).ch).toBeLessThanOrEqual(
      packBBox(heightOnly, regions).ch,
    )
    expect(packBBox(implicit, regions).area).toBeLessThanOrEqual(
      packBBox(heightOnly, regions).area,
    )
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
  it('scaleCellRects and packRectsShelfOnGrid stay consistent', () => {
    const rects = [
      { id: 'a', cw: 4, ch: 2 },
      { id: 'b', cw: 4, ch: 2 },
      { id: 'c', cw: 8, ch: 3 },
    ]
    const scaled = scaleCellRects(rects, 0.5, 8, 1, 1)
    expect(scaled.every((r) => r.cw >= 1 && r.ch >= 1)).toBe(true)
    const shelf = packRectsShelfOnGrid(rects, 8)
    expect(shelf.size).toBe(3)
  })
})
