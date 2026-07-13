import { describe, expect, it } from 'vitest'
import {
  mermaidEdgeWaypoints,
  mermaidStyleEdgePath,
  nodeBoxFromRf,
  siblingIndexForEdge,
} from './mermaidEdgeRoute'

describe('mermaidEdgeRoute parallel corridor (Mermaid-like)', () => {
  const input = nodeBoxFromRf(50, 40, 152, 54, 'rectangle')
  const check = nodeBoxFromRf(70, 160, 95, 95, 'diamond')

  it('forward and reverse stay in the same corridor (±spacing)', () => {
    const all = [
      { id: 'fwd', source: 'Input', target: 'Check' },
      { id: 'rev', source: 'Check', target: 'Input' },
    ]
    const centers = new Map([
      ['Input', { cx: input.cx, cy: input.cy }],
      ['Check', { cx: check.cx, cy: check.cy }],
    ])
    const iF = siblingIndexForEdge('fwd', 'Input', 'Check', all, centers)
    const iR = siblingIndexForEdge('rev', 'Check', 'Input', all, centers)
    expect(iF).toBe(-1)
    expect(iR).toBe(1)

    const spacing = 16
    const fwd = mermaidEdgeWaypoints({
      source: input,
      target: check,
      siblingIndex: iF,
      siblingSpacing: spacing,
    })
    const rev = mermaidEdgeWaypoints({
      source: check,
      target: input,
      siblingIndex: iR,
      siblingSpacing: spacing,
    })

    // Both nearly vertical: |Δx| of endpoints small vs |Δy|
    for (const pts of [fwd, rev]) {
      const dx = Math.abs(pts[pts.length - 1]!.x - pts[0]!.x)
      const dy = Math.abs(pts[pts.length - 1]!.y - pts[0]!.y)
      expect(dx).toBeLessThan(dy * 0.45)
    }

    // Lateral separation between corridors ~ 2*spacing (not a huge side loop)
    const fwdMidX = (fwd[0]!.x + fwd[3]!.x) / 2
    const revMidX = (rev[0]!.x + rev[3]!.x) / 2
    const sep = Math.abs(fwdMidX - revMidX)
    expect(sep).toBeGreaterThan(12)
    expect(sep).toBeLessThan(50) // tight Mermaid corridor, not a C-balloon
  })

  it('paths differ so neither is fully hidden', () => {
    const a = mermaidStyleEdgePath({
      source: input,
      target: check,
      siblingIndex: -1,
      siblingSpacing: 16,
    }).path
    const b = mermaidStyleEdgePath({
      source: check,
      target: input,
      siblingIndex: 1,
      siblingSpacing: 16,
    }).path
    expect(a).not.toBe(b)
  })
})
