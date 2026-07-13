import { describe, expect, it } from 'vitest'
import {
  buildEdgePath,
  oppositeBowArc,
  simpleStraightPath,
  facePairForEdge,
} from './edgePath'
import { Position } from '@xyflow/react'
import {
  intersectDiamond,
  nodeBoxFromRf,
} from './mermaidEdgeRoute'

function onDiamond(
  box: ReturnType<typeof nodeBoxFromRf>,
  p: { x: number; y: number },
) {
  const hw = box.width / 2
  const hh = box.height / 2
  const t = Math.abs(p.x - box.cx) / hw + Math.abs(p.y - box.cy) / hh
  return Math.abs(t - 1) < 0.08
}

describe('flowchart smooth-step edges', () => {
  const a = nodeBoxFromRf(40, 20, 100, 40, 'rectangle')
  const b = nodeBoxFromRf(50, 140, 80, 80, 'diamond')

  it('single edge is smooth-step (not raw diagonal only) and hits diamond', () => {
    const r = buildEdgePath({
      source: a,
      target: b,
      isMultiEdge: false,
      siblingIndex: 0,
    })
    expect(r.path).toMatch(/^M/)
    expect(r.path).not.toContain('A')
    expect(onDiamond(b, r.end)).toBe(true)
    // Starts on bottom face of rect
    expect(r.start.y).toBeGreaterThan(a.cy)
  })

  it('forward multi stays center faces; reverse multi is same-side U-turn', () => {
    const fwd = buildEdgePath({
      source: a,
      target: b,
      siblingIndex: -1,
      isMultiEdge: true,
      siblingSpacing: 14,
    })
    const rev = buildEdgePath({
      source: b,
      target: a,
      siblingIndex: 1,
      isMultiEdge: true,
      siblingSpacing: 14,
    })
    expect(fwd.path).not.toBe(rev.path)
    // Forward: bottom of a → top of b (centered under stack)
    const fwdFaces = facePairForEdge(a, b, -1, true)
    expect(fwdFaces.sourcePos).toBe(Position.Bottom)
    expect(fwdFaces.targetPos).toBe(Position.Top)
    expect(fwdFaces.reverseLoop).toBe(false)
    // Reverse: same side U-turn
    const revFaces = facePairForEdge(b, a, 1, true)
    expect(revFaces.reverseLoop).toBe(true)
    expect(revFaces.sourcePos).toBe(revFaces.targetPos)
    expect(
      revFaces.sourcePos === Position.Right ||
        revFaces.sourcePos === Position.Left,
    ).toBe(true)
  })

  it('manual port handles pin ends and use curved pipe (smooth-step)', () => {
    const plugged = buildEdgePath({
      source: a,
      target: b,
      siblingIndex: 0,
      isMultiEdge: false,
      manualConnect: true,
      sourceHandle: 'port-3',
      targetHandle: 'port-1',
      sourceData: {
        label: 'A',
        shape: 'rectangle',
        portCount: 4,
        portOnPerimeter: true,
      },
      targetData: {
        label: 'B',
        shape: 'diamond',
        portCount: 4,
        portOnPerimeter: true,
      },
    })
    // Pipe path (smooth-step), not a single straight segment only
    expect(plugged.path).toMatch(/^M/)
    expect(plugged.start.x).toBeLessThan(a.cx)
  })

  it('auto edges with port handles still pin ends (not face re-pick)', () => {
    // Left of a → left of b (not bottom→top which facePair would choose)
    const start = { x: a.cx - a.width / 2, y: a.cy }
    const end = { x: b.cx - b.width / 2, y: b.cy }
    const r = buildEdgePath({
      source: a,
      target: b,
      isMultiEdge: false,
      startPt: start,
      endPt: end,
      sourceHandle: 'port-3',
      targetHandle: 'port-3',
      manualConnect: false,
    })
    expect(r.start.x).toBeCloseTo(start.x, 5)
    expect(r.start.y).toBeCloseTo(start.y, 5)
    expect(r.end.x).toBeCloseTo(end.x, 5)
    expect(r.end.y).toBeCloseTo(end.y, 5)
  })

  it('adding multi pair does not reshape a locked forward plug', () => {
    const base = {
      source: a,
      target: b,
      manualConnect: true as const,
      sourceHandle: 'port-2',
      targetHandle: 'port-0',
      sourceData: {
        label: 'A',
        shape: 'rectangle' as const,
        portCount: 4,
        portOnPerimeter: true,
      },
      targetData: {
        label: 'B',
        shape: 'diamond' as const,
        portCount: 4,
        portOnPerimeter: true,
      },
    }
    const alone = buildEdgePath({ ...base, isMultiEdge: false, siblingIndex: 0 })
    const withPair = buildEdgePath({
      ...base,
      isMultiEdge: true,
      siblingIndex: -1,
    })
    expect(withPair.path).toBe(alone.path)
    expect(withPair.start).toEqual(alone.start)
    expect(withPair.end).toEqual(alone.end)
  })

  it('oppositeBowArc still works for tests', () => {
    const L = oppositeBowArc({ x: 100, y: 40 }, { x: 100, y: 200 }, -1, 14)
    const R = oppositeBowArc({ x: 100, y: 40 }, { x: 100, y: 200 }, 1, 14)
    expect(L.path).not.toBe(R.path)
    expect(L.path).toContain('Q')
  })

  it('simpleStraightPath', () => {
    expect(simpleStraightPath({ x: 0, y: 0 }, { x: 3, y: 4 }).path).toBe(
      'M0,0 L3,4',
    )
  })

  it('intersect diamond tip', () => {
    const d = nodeBoxFromRf(0, 0, 100, 100, 'diamond')
    const tip = intersectDiamond(d, { x: 50, y: -100 })
    expect(tip.y).toBeCloseTo(0, 0)
    expect(tip.x).toBeCloseTo(50, 0)
  })
})
