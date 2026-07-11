import { describe, expect, it } from 'vitest'
import {
  autoPrintPageOrigins,
  clampPrintPageCount,
  computePrintPageOrigins,
  multiPageLayoutBounds,
  normalizePrintPageLayout,
  PRINT_PAGE_STACK_GAP,
  resolvePagePixels,
} from '@/lib/printSizes'

const letter = resolvePagePixels('letter', 'portrait')

describe('print page count', () => {
  it('clamps to 1–20', () => {
    expect(clampPrintPageCount(0)).toBe(1)
    expect(clampPrintPageCount(-3)).toBe(1)
    expect(clampPrintPageCount(99)).toBe(20)
    expect(clampPrintPageCount(3.7)).toBe(4)
    expect(clampPrintPageCount(NaN)).toBe(1)
  })
})

describe('print page layout origins', () => {
  it('vertical stacks pages with gap', () => {
    const o = autoPrintPageOrigins(letter, 3, 'vertical')
    expect(o).toHaveLength(3)
    expect(o[0]).toEqual({ x: 0, y: 0 })
    expect(o[1]).toEqual({
      x: 0,
      y: letter.height + PRINT_PAGE_STACK_GAP,
    })
    expect(o[2]!.y).toBe(2 * (letter.height + PRINT_PAGE_STACK_GAP))
  })

  it('horizontal places pages in a row', () => {
    const o = autoPrintPageOrigins(letter, 3, 'horizontal')
    expect(o[0]).toEqual({ x: 0, y: 0 })
    expect(o[1]).toEqual({ x: letter.width + PRINT_PAGE_STACK_GAP, y: 0 })
    expect(o[2]!.y).toBe(0)
  })

  it('grid packs near-square', () => {
    const o = autoPrintPageOrigins(letter, 4, 'grid')
    expect(o).toHaveLength(4)
    // 2×2 for 4 pages
    expect(o[0]).toEqual({ x: 0, y: 0 })
    expect(o[1]!.x).toBeGreaterThan(0)
    expect(o[1]!.y).toBe(0)
    expect(o[2]!.x).toBe(0)
    expect(o[2]!.y).toBeGreaterThan(0)
  })

  it('free mode uses stored positions with vertical fallback', () => {
    const o = computePrintPageOrigins(letter, 3, 'free', [
      { x: 50, y: 60 },
      // missing [1], [2]
    ])
    expect(o[0]).toEqual({ x: 50, y: 60 })
    expect(o[1]).toEqual({ x: 0, y: letter.height + PRINT_PAGE_STACK_GAP })
  })

  it('normalizes unknown layout to vertical', () => {
    expect(normalizePrintPageLayout('nope')).toBe('vertical')
    expect(normalizePrintPageLayout('horizontal')).toBe('horizontal')
  })
})

describe('multiPageLayoutBounds — fit-all-pages uses full layout', () => {
  it('vertical bounds taller than one page', () => {
    const b = multiPageLayoutBounds(letter, 3, 'vertical')
    expect(b.width).toBe(letter.width)
    expect(b.height).toBeGreaterThan(letter.height * 2)
    expect(b.minX).toBe(0)
    expect(b.minY).toBe(0)
  })

  it('horizontal bounds wider than one page', () => {
    const b = multiPageLayoutBounds(letter, 3, 'horizontal')
    expect(b.height).toBe(letter.height)
    expect(b.width).toBeGreaterThan(letter.width * 2)
  })

  it('free mode includes custom positions in bounds', () => {
    const b = multiPageLayoutBounds(letter, 2, 'free', [
      { x: 0, y: 0 },
      { x: 500, y: 800 },
    ])
    expect(b.maxX).toBe(500 + letter.width)
    expect(b.maxY).toBe(800 + letter.height)
  })

  it('single page bounds match page size', () => {
    const b = multiPageLayoutBounds(letter, 1, 'vertical')
    expect(b.width).toBe(letter.width)
    expect(b.height).toBe(letter.height)
  })
})
