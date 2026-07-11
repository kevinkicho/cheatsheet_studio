import { describe, expect, it } from 'vitest'
import { transformRgbaPixels } from '@/lib/exportCapture'
import { resolveExportPageIndices } from '@/lib/runSheetExport'

describe('transformRgbaPixels', () => {
  it('leaves color mode unchanged', () => {
    const d = [200, 40, 40, 255]
    transformRgbaPixels(d, 'color')
    expect(d.slice(0, 3)).toEqual([200, 40, 40])
  })

  it('converts to greyscale', () => {
    const d = [255, 0, 0, 255]
    transformRgbaPixels(d, 'greyscale')
    expect(d[0]).toBe(d[1])
    expect(d[1]).toBe(d[2])
    expect(d[0]!).toBeGreaterThan(40)
    expect(d[0]!).toBeLessThan(100)
  })

  it('thresholds black and white', () => {
    const dark = [20, 20, 20, 255]
    transformRgbaPixels(dark, 'bw')
    expect(dark.slice(0, 3)).toEqual([0, 0, 0])

    const light = [240, 240, 240, 255]
    transformRgbaPixels(light, 'bw')
    expect(light.slice(0, 3)).toEqual([255, 255, 255])
  })
})

describe('resolveExportPageIndices', () => {
  it('defaults to all pages', () => {
    expect(resolveExportPageIndices(3)).toEqual([0, 1, 2])
  })

  it('filters and sorts unique valid indices', () => {
    expect(resolveExportPageIndices(4, [2, 0, 2, 9, -1])).toEqual([0, 2])
  })

  it('returns empty when nothing valid selected', () => {
    expect(resolveExportPageIndices(2, [5, 6])).toEqual([])
  })
})
