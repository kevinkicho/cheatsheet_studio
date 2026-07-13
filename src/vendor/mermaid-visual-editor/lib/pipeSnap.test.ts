import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from './store'
import {
  collectPipeSnapTargets,
  snapPipePoint,
} from './pipeSnap'

describe('pipeSnap', () => {
  const nodes = [
    {
      id: 'a',
      type: 'flowNode',
      position: { x: 0, y: 0 },
      width: 100,
      height: 40,
      data: { label: 'A', shape: 'rectangle', portCount: 4 },
    },
    {
      id: 'b',
      type: 'flowNode',
      position: { x: 0, y: 120 },
      width: 100,
      height: 40,
      data: { label: 'B', shape: 'rectangle', portCount: 4 },
    },
  ] as Node<FlowNodeData>[]

  const edges = [
    {
      id: 'e1',
      source: 'a',
      target: 'b',
      data: {
        waypoints: [{ id: 'wp1', x: 50, y: 80 }],
      },
    },
  ] as Edge<FlowEdgeData>[]

  it('collects node edges, centers, and bend points', () => {
    const t = collectPipeSnapTargets(nodes, edges)
    const xs = new Set(t.map((p) => p.x).filter((v) => v != null))
    const ys = new Set(t.map((p) => p.y).filter((v) => v != null))
    expect(xs.has(0)).toBe(true) // left
    expect(xs.has(50)).toBe(true) // center
    expect(xs.has(100)).toBe(true) // right
    expect(ys.has(0)).toBe(true)
    expect(ys.has(20)).toBe(true) // mid height of a
    expect(ys.has(80)).toBe(true) // waypoint
  })

  it('snaps independently on X and Y within threshold', () => {
    const targets = collectPipeSnapTargets(nodes, edges)
    const r = snapPipePoint(52, 81, targets, 10)
    expect(r.snappedX).toBe(true)
    expect(r.snappedY).toBe(true)
    expect(r.x).toBe(50)
    expect(r.y).toBe(80)
    expect(r.guides.some((g) => g.axis === 'x')).toBe(true)
    expect(r.guides.some((g) => g.axis === 'y')).toBe(true)
  })

  it('does not snap when outside threshold', () => {
    const targets = collectPipeSnapTargets(nodes, edges)
    const r = snapPipePoint(70, 90, targets, 4)
    expect(r.snappedX).toBe(false)
    expect(r.snappedY).toBe(false)
    expect(r.x).toBe(70)
    expect(r.y).toBe(90)
  })
})
