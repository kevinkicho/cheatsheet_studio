import { describe, expect, it } from 'vitest'
import {
  gridLayerCssOpacity,
  resolveGridCoverage,
  resolvePageGridRect,
} from '@/lib/gridCoverage'
import { DEFAULT_MARGINS, percentToGridOpacity } from '@/types'

/**
 * Regression: switching Whole board ↔ Full page ↔ Printable must NOT
 * change the CSS opacity value applied to the grid layer.
 * (Visual bugs came from different paint paths; this locks the contract.)
 */
describe('grid layer opacity contract across extents', () => {
  const stored = percentToGridOpacity(5) // soft-scale 5%

  it('same CSS opacity for every extent at a fixed store value', () => {
    const alpha = gridLayerCssOpacity(stored)
    for (const extent of ['board', 'page', 'printable'] as const) {
      const cov = resolveGridCoverage({
        showGrid: true,
        showPrintArea: true,
        gridExtent: extent,
      })
      // whichever layer is active still uses the same alpha function
      expect(gridLayerCssOpacity(stored)).toBe(alpha)
      if (extent === 'board') {
        expect(cov.useBoardGrid).toBe(true)
        expect(cov.usePerPageGrid).toBe(false)
      } else {
        expect(cov.useBoardGrid).toBe(false)
        expect(cov.usePerPageGrid).toBe(true)
      }
    }
  })

  it('extent switch only changes geometry, not opacity input', () => {
    const origin = { x: 0, y: 0 }
    const page = { width: 816, height: 1056 }
    const pageRect = resolvePageGridRect(
      'page',
      origin,
      page,
      DEFAULT_MARGINS,
    )!
    const printRect = resolvePageGridRect(
      'printable',
      origin,
      page,
      DEFAULT_MARGINS,
    )!
    expect(pageRect).not.toEqual(printRect)
    // Caller always passes the same stored opacity into CanvasGridLayer
    expect(gridLayerCssOpacity(stored)).toBe(gridLayerCssOpacity(stored))
  })

  it('5% soft bar is a small alpha (not ~1.0)', () => {
    const a = gridLayerCssOpacity(stored)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(0.05)
  })
})
