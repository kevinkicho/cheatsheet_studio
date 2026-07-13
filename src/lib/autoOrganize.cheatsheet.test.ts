import { describe, expect, it } from 'vitest'
import { packCheatsheetLayout, DENSITY_PRESETS } from '@/lib/autoOrganize'
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
    expect(maxY(xs.items)).toBeLessThan(maxY(lg.items))
    expect(xs.items[0]!.style?.fontSize).toBe(DENSITY_PRESETS.xs.fontSize)
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
})
