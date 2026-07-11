import { describe, expect, it } from 'vitest'
import { layoutItemsInRows } from '@/lib/autoOrganize'
import { DEFAULT_CANVAS, DEFAULT_MARGINS } from '@/types'
import type { CanvasItem } from '@/types'

function card(
  id: string,
  x: number,
  y: number,
  w = 100,
  h = 60,
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
  }
}

describe('layoutItemsInRows (auto-organize)', () => {
  it('returns empty for no items', () => {
    expect(layoutItemsInRows([], DEFAULT_CANVAS)).toEqual([])
  })

  it('places cards inside content box (margins)', () => {
    const items = [card('a', 0, 0), card('b', 50, 0), card('c', 0, 80)]
    const out = layoutItemsInRows(items, DEFAULT_CANVAS, { grid: 24, gap: 16 })
    expect(out).toHaveLength(3)
    for (const it of out) {
      expect(it.x).toBeGreaterThanOrEqual(DEFAULT_MARGINS.left)
      expect(it.y).toBeGreaterThanOrEqual(DEFAULT_MARGINS.top)
      expect(it.autoFit).toBe(false)
    }
  })

  it('packs left-to-right then wraps', () => {
    // Wide cards force wrap inside letter content width
    const wide = 400
    const items = [
      card('a', 0, 0, wide, 50),
      card('b', 0, 0, wide, 50),
      card('c', 0, 0, wide, 50),
    ]
    const out = layoutItemsInRows(items, DEFAULT_CANVAS, { grid: 24, gap: 16 })
    // At least one card should be below the first row
    const ys = new Set(out.map((i) => i.y))
    expect(ys.size).toBeGreaterThan(1)
  })

  it('preserves card pixel sizes', () => {
    const items = [card('a', 0, 0, 123, 77)]
    const out = layoutItemsInRows(items, DEFAULT_CANVAS)
    expect(out[0]!.width).toBe(123)
    expect(out[0]!.height).toBe(77)
  })
})
