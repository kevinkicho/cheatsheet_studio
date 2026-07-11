import { describe, expect, it } from 'vitest'
import {
  resizeFreePagePositions,
  computePrintPageOrigins,
  PRINT_PAGE_STACK_GAP,
  resolvePagePixels,
} from '@/lib/printSizes'

const page = resolvePagePixels('letter', 'portrait')

describe('resizeFreePagePositions', () => {
  it('grows array continuing below last page', () => {
    const next = resizeFreePagePositions(
      [{ x: 10, y: 20 }],
      page,
      3,
    )
    expect(next).toHaveLength(3)
    expect(next[0]).toEqual({ x: 10, y: 20 })
    expect(next[1]!.x).toBe(10)
    expect(next[1]!.y).toBe(20 + page.height + PRINT_PAGE_STACK_GAP)
    expect(next[2]!.y).toBe(
      next[1]!.y + page.height + PRINT_PAGE_STACK_GAP,
    )
  })

  it('trims when page count shrinks', () => {
    const next = resizeFreePagePositions(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      page,
      2,
    )
    expect(next).toHaveLength(2)
  })

  it('rounds finite coordinates', () => {
    const next = resizeFreePagePositions(
      [{ x: 1.7, y: 2.2 }],
      page,
      1,
    )
    expect(next[0]).toEqual({ x: 2, y: 2 })
  })
})

describe('computePrintPageOrigins free vs auto consistency', () => {
  it('free with empty positions equals vertical stack', () => {
    const free = computePrintPageOrigins(page, 3, 'free', [])
    const vert = computePrintPageOrigins(page, 3, 'vertical')
    expect(free).toEqual(vert)
  })
})
