import { describe, expect, it } from 'vitest'
import {
  getContentBox,
  getPrintAwareSnapOrigin,
  snapToGridValue,
} from '@/lib/autoOrganize'
import { DEFAULT_CANVAS, DEFAULT_MARGINS } from '@/types'

describe('snapToGridValue with origin', () => {
  it('snaps to multiples of grid from 0', () => {
    expect(snapToGridValue(23, 24)).toBe(24)
    // Math.round half-up: 12/24 = 0.5 → 1 → 24
    expect(snapToGridValue(12, 24)).toBe(24)
    expect(snapToGridValue(11, 24)).toBe(0)
    // 36/24 = 1.5 → 2 → 48
    expect(snapToGridValue(36, 24)).toBe(48)
    expect(snapToGridValue(48, 24)).toBe(48)
  })

  it('snaps relative to content origin (print-aware)', () => {
    // Content starts at margin 48; grid 24 → lines at 48, 72, 96…
    expect(snapToGridValue(50, 24, 48)).toBe(48)
    expect(snapToGridValue(60, 24, 48)).toBe(72)
  })
})

describe('getContentBox / print-aware snap origin', () => {
  it('content box is page inset by margins at origin', () => {
    const box = getContentBox(DEFAULT_CANVAS)
    expect(box.left).toBe(DEFAULT_MARGINS.left)
    expect(box.top).toBe(DEFAULT_MARGINS.top)
  })

  it('snap origin is (0,0) when print frame hidden or board extent', () => {
    const canvas = {
      ...DEFAULT_CANVAS,
      showPrintArea: false,
      gridExtent: 'page' as const,
    }
    expect(getPrintAwareSnapOrigin(100, 100, canvas)).toEqual({
      ox: 0,
      oy: 0,
    })
  })

  it('snap origin uses page frame for gridExtent page', () => {
    const canvas = {
      ...DEFAULT_CANVAS,
      showPrintArea: true,
      gridExtent: 'page' as const,
      printPageCount: 1,
    }
    // Point inside page → origin at page top-left (0,0)
    expect(getPrintAwareSnapOrigin(10, 10, canvas)).toEqual({ ox: 0, oy: 0 })
  })

  it('snap origin uses content box for gridExtent printable', () => {
    const canvas = {
      ...DEFAULT_CANVAS,
      showPrintArea: true,
      gridExtent: 'printable' as const,
      printPageCount: 1,
    }
    const inside = getPrintAwareSnapOrigin(100, 100, canvas)
    expect(inside.ox).toBe(DEFAULT_MARGINS.left)
    expect(inside.oy).toBe(DEFAULT_MARGINS.top)
  })
})
