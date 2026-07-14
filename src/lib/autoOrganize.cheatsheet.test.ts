import { describe, expect, it } from 'vitest'
import {
  packCheatsheetLayout,
  estimateIdealBlockSize,
  allocateAreaOnGrid,
  snapSizeToGrid,
  packRectsOnGrid,
  minReadableCardSize,
  MIN_READABLE_TITLE_FONT,
  MIN_READABLE_BODY_FONT,
  ORGANIZE_GRID,
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
    expect(xs.items[0]!.style?.fontSize).toBeGreaterThanOrEqual(
      MIN_READABLE_BODY_FONT,
    )
    expect(xs.items[0]!.style?.titleFontSize).toBeGreaterThanOrEqual(
      MIN_READABLE_TITLE_FONT,
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

  it('collocates same-folder cards before the next folder', () => {
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
    const maxF1 = Math.max(
      byId.b1!.y + byId.b1!.height,
      byId.b2!.y + byId.b2!.height,
    )
    const minF2 = Math.min(byId.a1!.y, byId.a2!.y)
    expect(maxF1).toBeLessThanOrEqual(minF2 + 2)
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
})
