import { describe, expect, it } from 'vitest'
import {
  getExportPageRects,
  itemIntersectsPage,
  itemsForPage,
  sanitizeExportFilename,
  sanitizePdfFilename,
} from '@/lib/exportPdf'
import { DEFAULT_CANVAS } from '@/types'
import type { CanvasItem } from '@/types'

function item(
  partial: Partial<CanvasItem> & Pick<CanvasItem, 'id' | 'x' | 'y'>,
): CanvasItem {
  return {
    type: 'equation',
    width: 100,
    height: 50,
    zIndex: 1,
    latex: 'x',
    ...partial,
  }
}

describe('exportPdf helpers', () => {
  it('sanitizePdfFilename cleans illegal chars', () => {
    expect(sanitizePdfFilename('My Sheet/A:B')).toBe('My Sheet_A_B.pdf')
    expect(sanitizePdfFilename('')).toBe('cheatsheet.pdf')
  })

  it('sanitizeExportFilename supports png/jpeg and page suffixes', () => {
    expect(sanitizeExportFilename('Demo', 'png')).toBe('Demo.png')
    expect(sanitizeExportFilename('Demo', 'jpeg', 2)).toBe('Demo-p2.jpeg')
    expect(sanitizeExportFilename('a/b', 'pdf')).toBe('a_b.pdf')
  })

  it('getExportPageRects returns one page by default', () => {
    const pages = getExportPageRects(DEFAULT_CANVAS)
    expect(pages).toHaveLength(1)
    expect(pages[0]!.x).toBe(0)
    expect(pages[0]!.y).toBe(0)
    expect(pages[0]!.width).toBeGreaterThan(100)
  })

  it('getExportPageRects stacks multi-page vertical', () => {
    const pages = getExportPageRects({
      ...DEFAULT_CANVAS,
      printPageCount: 3,
      printPageLayout: 'vertical',
    })
    expect(pages).toHaveLength(3)
    expect(pages[1]!.y).toBeGreaterThan(pages[0]!.y)
    expect(pages[2]!.y).toBeGreaterThan(pages[1]!.y)
  })

  it('itemIntersectsPage detects overlap and hidden', () => {
    const page = { index: 0, x: 0, y: 0, width: 200, height: 200 }
    expect(
      itemIntersectsPage({ x: 10, y: 10, width: 50, height: 50 }, page),
    ).toBe(true)
    expect(
      itemIntersectsPage({ x: 300, y: 300, width: 50, height: 50 }, page),
    ).toBe(false)
    expect(
      itemIntersectsPage(
        { x: 10, y: 10, width: 50, height: 50, hidden: true },
        page,
      ),
    ).toBe(false)
  })

  it('itemsForPage returns relative coords sorted by zIndex', () => {
    const page = { index: 0, x: 100, y: 50, width: 500, height: 700 }
    const list = itemsForPage(
      [
        item({ id: 'a', x: 120, y: 80, zIndex: 2 }),
        item({ id: 'b', x: 150, y: 100, zIndex: 1 }),
        item({ id: 'c', x: 900, y: 900, zIndex: 9 }),
      ],
      page,
    )
    expect(list.map((i) => i.id)).toEqual(['b', 'a'])
    expect(list[0]!.exportX).toBe(50)
    expect(list[0]!.exportY).toBe(50)
  })

  it('items far from print origin are excluded (common blank-PDF cause)', () => {
    const pages = getExportPageRects(DEFAULT_CANVAS)
    const page = pages[0]!
    // Free board placement well outside Letter frame at (0,0)
    const list = itemsForPage(
      [item({ id: 'far', x: 1800, y: 1400, width: 200, height: 100 })],
      page,
    )
    expect(list).toHaveLength(0)
    expect(
      itemsForPage(
        [item({ id: 'on', x: 60, y: 60, width: 200, height: 100 })],
        page,
      ),
    ).toHaveLength(1)
  })
})
