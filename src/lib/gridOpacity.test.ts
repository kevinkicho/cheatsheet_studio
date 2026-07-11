import { describe, expect, it } from 'vitest'
import {
  clampGridOpacity,
  DEFAULT_GRID_OPACITY,
  GRID_OPACITY_CSS_MAX,
  gridOpacityToPercent,
  percentToGridOpacity,
} from '@/types'
import { gridLayerCssOpacity } from '@/lib/gridCoverage'

describe('grid opacity mapping (soft range 0–100% → α 0–max)', () => {
  it('maps full bar travel onto 0…GRID_OPACITY_CSS_MAX (not 0…1)', () => {
    expect(percentToGridOpacity(0)).toBe(0)
    expect(percentToGridOpacity(100)).toBeCloseTo(GRID_OPACITY_CSS_MAX, 5)
    expect(percentToGridOpacity(50)).toBeCloseTo(GRID_OPACITY_CSS_MAX / 2, 5)
  })

  it('does not crush useful range into ~0–30% of the bar', () => {
    // At 50% of the bar we should be mid soft-alpha, not already maxed
    const mid = percentToGridOpacity(50)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(GRID_OPACITY_CSS_MAX)
    expect(mid).toBeCloseTo(GRID_OPACITY_CSS_MAX * 0.5, 5)

    // 25% of bar is still well below max (old 1:1 bug maxed by ~30%)
    const q = percentToGridOpacity(25)
    expect(q).toBeLessThan(GRID_OPACITY_CSS_MAX * 0.9)
  })

  it('round-trips percent ↔ alpha without drift', () => {
    for (const pct of [0, 5, 10, 25, 33, 50, 75, 100]) {
      const alpha = percentToGridOpacity(pct)
      const back = gridOpacityToPercent(alpha)
      expect(back).toBe(pct)
    }
  })

  it('clamps stored alpha to [0, GRID_OPACITY_CSS_MAX]', () => {
    expect(clampGridOpacity(-1)).toBe(0)
    expect(clampGridOpacity(1)).toBe(GRID_OPACITY_CSS_MAX)
    expect(clampGridOpacity(0.99)).toBe(GRID_OPACITY_CSS_MAX)
    expect(clampGridOpacity(NaN)).toBe(DEFAULT_GRID_OPACITY)
    expect(clampGridOpacity(undefined)).toBe(DEFAULT_GRID_OPACITY)
  })

  it('layer CSS opacity matches stored opacity for every extent path', () => {
    // Board / page / printable must feed the same value into CSS opacity
    const samples = [0, 0.05, 0.09, 0.15, GRID_OPACITY_CSS_MAX]
    for (const a of samples) {
      expect(gridLayerCssOpacity(a)).toBe(clampGridOpacity(a))
    }
  })

  it('5% of soft bar is NOT α 0.05 when max is 0.3 (documents soft scale)', () => {
    // Guards against accidentally switching back to 1:1 percent→alpha
    const a = percentToGridOpacity(5)
    expect(a).toBeCloseTo(0.05 * (GRID_OPACITY_CSS_MAX / 1), 5)
    // With max 0.3: 5% → 0.015
    expect(a).toBeCloseTo(GRID_OPACITY_CSS_MAX * 0.05, 5)
    expect(a).not.toBeCloseTo(0.05, 3)
  })
})
