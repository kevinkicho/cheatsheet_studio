import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRID_EXTENT,
  normalizeGridExtent,
  clampGridOpacity,
  GRID_OPACITY_CSS_MAX,
} from '@/types'
import { normalizePrintPageLayout } from '@/lib/printSizes'

describe('type normalizers', () => {
  it('normalizeGridExtent', () => {
    expect(normalizeGridExtent('board')).toBe('board')
    expect(normalizeGridExtent('page')).toBe('page')
    expect(normalizeGridExtent('printable')).toBe('printable')
    expect(normalizeGridExtent(undefined)).toBe(DEFAULT_GRID_EXTENT)
    expect(normalizeGridExtent('nope')).toBe(DEFAULT_GRID_EXTENT)
  })

  it('normalizePrintPageLayout', () => {
    expect(normalizePrintPageLayout('free')).toBe('free')
    expect(normalizePrintPageLayout('horizontal')).toBe('horizontal')
    expect(normalizePrintPageLayout(null)).toBe('vertical')
  })

  it('clampGridOpacity never exceeds soft max', () => {
    expect(clampGridOpacity(GRID_OPACITY_CSS_MAX + 1)).toBe(
      GRID_OPACITY_CSS_MAX,
    )
  })
})
