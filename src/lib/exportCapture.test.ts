import { describe, expect, it } from 'vitest'
import {
  clampRasterScale,
  MAX_SAFE_CANVAS_PIXELS,
  transformRgbaPixels,
} from '@/lib/exportCapture'
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

describe('clampRasterScale', () => {
  it('keeps scale when under budget', () => {
    // letter-ish 816×1056 at 1.25 ≈ 1.35MP
    expect(clampRasterScale(816, 1056, 1.25)).toBeCloseTo(1.25, 5)
  })

  it('reduces scale when over budget', () => {
    const s = clampRasterScale(2000, 2000, 4, 1_000_000)
    expect(s * s * 2000 * 2000).toBeLessThanOrEqual(1_000_000 * 1.01)
    expect(s).toBeLessThan(4)
    expect(s).toBeGreaterThanOrEqual(0.5)
  })

  it('respects MAX_SAFE_CANVAS_PIXELS default', () => {
    const s = clampRasterScale(4000, 4000, 3)
    expect(4000 * 4000 * s * s).toBeLessThanOrEqual(MAX_SAFE_CANVAS_PIXELS * 1.01)
  })
})

describe('downscaleCanvasToBudget', () => {
  it('returns same canvas when under budget', async () => {
    const { downscaleCanvasToBudget } = await import('@/lib/exportCapture')
    // jsdom may lack full canvas — create minimal
    const c = document.createElement('canvas')
    c.width = 100
    c.height = 100
    const out = downscaleCanvasToBudget(c, 1_000_000)
    expect(out.width).toBe(100)
    expect(out.height).toBe(100)
  })
})
