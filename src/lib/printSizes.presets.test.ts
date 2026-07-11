import { describe, expect, it } from 'vitest'
import {
  formatPageSizeLabel,
  getPrintPageSize,
  getPrintPreset,
  PRINT_SIZE_PRESETS,
  resolvePagePixels,
} from '@/lib/printSizes'

describe('print size presets', () => {
  it('includes letter and a4', () => {
    const ids = PRINT_SIZE_PRESETS.map((p) => p.id)
    expect(ids).toContain('letter')
    expect(ids).toContain('a4')
  })

  it('resolvePagePixels swaps for landscape', () => {
    const p = resolvePagePixels('letter', 'portrait')
    const l = resolvePagePixels('letter', 'landscape')
    expect(l.width).toBe(p.height)
    expect(l.height).toBe(p.width)
  })

  it('custom size respects minimums', () => {
    expect(resolvePagePixels('custom', 'portrait', 50, 50)).toEqual({
      width: 200,
      height: 200,
    })
    expect(resolvePagePixels('custom', 'portrait', 900, 1200)).toEqual({
      width: 900,
      height: 1200,
    })
  })

  it('formatPageSizeLabel', () => {
    expect(formatPageSizeLabel('letter', 'portrait')).toBe('Letter')
    expect(formatPageSizeLabel('letter', 'landscape')).toBe('Letter Landscape')
    expect(formatPageSizeLabel('custom', 'portrait')).toBe('Custom')
    expect(formatPageSizeLabel('a4', 'portrait')).toBe('A4')
  })

  it('getPrintPageSize matches resolvePagePixels', () => {
    expect(getPrintPageSize('a4', 'landscape')).toEqual(
      resolvePagePixels('a4', 'landscape'),
    )
  })

  it('getPrintPreset returns undefined for custom', () => {
    expect(getPrintPreset('custom')).toBeUndefined()
    expect(getPrintPreset('letter')?.shortLabel).toBe('Letter')
  })
})
