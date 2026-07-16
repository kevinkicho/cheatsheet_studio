import { describe, it, expect } from 'vitest'
import { fitLabelFontPx } from './fitNodeLabel'

describe('fitLabelFontPx', () => {
  it('scales up short labels in large boxes (021358 style)', () => {
    // Mermaid-sized box ~160×48 with short word — fixed 16px left empty rings
    const px = fitLabelFontPx('Gametes', 160, 48, {
      padX: 8,
      padY: 6,
      maxPx: 32,
    })
    expect(px).toBeGreaterThanOrEqual(20)
    expect(px).toBeLessThanOrEqual(32)
  })

  it('shrinks long labels to stay inside width', () => {
    const px = fitLabelFontPx(
      'Very long process step name here',
      120,
      40,
      { padX: 8, padY: 6 },
    )
    expect(px).toBeLessThanOrEqual(16)
    expect(px).toBeGreaterThanOrEqual(11)
  })

  it('respects min/max clamps', () => {
    const tiny = fitLabelFontPx('Hi', 20, 16, {
      minPx: 10,
      maxPx: 12,
      padX: 2,
      padY: 2,
    })
    expect(tiny).toBeGreaterThanOrEqual(10)
    expect(tiny).toBeLessThanOrEqual(12)
  })

  it('multi-line uses height budget', () => {
    const single = fitLabelFontPx('Topic', 100, 100, {
      lines: ['Topic'],
      padX: 8,
      padY: 8,
    })
    const multi = fitLabelFontPx('A\nB\nC', 100, 100, {
      lines: ['A', 'B', 'C'],
      padX: 8,
      padY: 8,
    })
    expect(multi).toBeLessThan(single)
  })

  it('enlarged box can grow past the old 32px ceiling when maxPx allows', () => {
    const big = fitLabelFontPx('Hi', 200, 200, {
      padX: 12,
      padY: 12,
      maxPx: Math.floor(200 * 0.48),
    })
    expect(big).toBeGreaterThan(32)
  })
})
