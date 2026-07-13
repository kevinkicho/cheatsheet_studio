import { describe, expect, it } from 'vitest'
import {
  moveShaft,
  shaftsFromCorners,
  simplifyOrthogonalCorners,
  orthogonalPipePath,
  longestSegmentMidpoint,
  labelAnchorFromPath,
} from './pipeShafts'

describe('pipeShafts', () => {
  const corners = [
    { x: 50, y: 0 },
    { x: 50, y: 40 },
    { x: 120, y: 40 },
    { x: 120, y: 100 },
    { x: 50, y: 100 },
    { x: 50, y: 140 },
  ]

  it('finds interior vertical and horizontal shafts', () => {
    const shafts = shaftsFromCorners(corners)
    expect(shafts.length).toBeGreaterThanOrEqual(2)
    expect(shafts.some((s) => s.axis === 'h')).toBe(true)
    expect(shafts.some((s) => s.axis === 'v')).toBe(true)
  })

  it('moves a vertical shaft on X only', () => {
    const shafts = shaftsFromCorners(corners)
    const v = shafts.find((s) => s.axis === 'v')!
    const next = moveShaft(corners, v.index, 'v', 200)
    expect(next[v.index]!.x).toBe(200)
    expect(next[v.index + 1]!.x).toBe(200)
    expect(next[v.index]!.y).toBe(corners[v.index]!.y)
  })

  it('builds orthogonal path', () => {
    const r = orthogonalPipePath([
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 80, y: 50 },
    ])
    expect(r.path).toMatch(/^M/)
    expect(r.path).toContain('L')
  })

  it('simplifies colinear points', () => {
    const s = simplifyOrthogonalCorners([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 0, y: 20 },
      { x: 30, y: 20 },
    ])
    expect(s.length).toBeLessThan(4)
  })

  it('places label at mid of longest shaft (reverse No vertical, not top stub)', () => {
    // Collect right ← top stub ← long vertical ← bottom stub ← Valid right
    const reverseNo = [
      { x: 200, y: 180 }, // Valid right port
      { x: 280, y: 180 }, // out
      { x: 280, y: 40 }, // long exterior vertical
      { x: 200, y: 40 }, // top horizontal into Collect
      { x: 180, y: 40 }, // Collect right
    ]
    const mid = longestSegmentMidpoint(reverseNo)
    // Mid of long vertical at x=280, y=(180+40)/2=110
    expect(mid.x).toBe(280)
    expect(mid.y).toBe(110)
  })

  it('orthogonalPipePath uses longest-shaft label, not middle vertex', () => {
    const r = orthogonalPipePath([
      { x: 200, y: 180 },
      { x: 280, y: 180 },
      { x: 280, y: 40 },
      { x: 180, y: 40 },
    ])
    expect(r.labelX).toBe(280)
    expect(r.labelY).toBe(110)
  })

  it('labelAnchorFromPath recovers longest shaft mid from SVG d', () => {
    const d = 'M200,180 L280,180 L280,40 L180,40'
    const a = labelAnchorFromPath(d)
    expect(a.x).toBe(280)
    expect(a.y).toBe(110)
  })
})
