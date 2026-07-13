import { describe, expect, it } from 'vitest'
import { Position, type Node } from '@xyflow/react'
import {
  angleToPosition,
  clampPortCount,
  computePortPlacements,
  getPortLayout,
  normalizePortHandleId,
  pickFacingPortId,
  reconcileEdgeHandles,
} from './portLayout'
import type { FlowNodeData } from './store'

describe('portLayout', () => {
  it('clamps port count', () => {
    expect(clampPortCount(0)).toBe(1)
    expect(clampPortCount(99)).toBe(16)
    expect(clampPortCount(4.6)).toBe(5)
  })

  it('defaults to 4 ports on perimeter', () => {
    const layout = getPortLayout(undefined)
    expect(layout.count).toBe(4)
    expect(layout.onPerimeter).toBe(true)
  })

  it('perimeter mode spaces ports around a rectangle (4 mid-sides at rot 0)', () => {
    const ports = computePortPlacements(
      { count: 4, radius: 1, rotation: 0, onPerimeter: true },
      'rectangle',
    )
    expect(ports).toHaveLength(4)
    // Start mid-top at t=0, then equal perimeter steps
    expect(ports[0]!.py).toBeCloseTo(0, 1) // top
    expect(ports[0]!.px).toBeCloseTo(0.5, 1)
  })

  it('stadium Start/Done ports sit mid-sides (no spiral tornado)', () => {
    const ports = computePortPlacements(
      { count: 4, radius: 1, rotation: 0, onPerimeter: true },
      'stadium',
    )
    expect(ports).toHaveLength(4)
    expect(ports[0]!.px).toBeCloseTo(0.5, 1)
    expect(ports[0]!.py).toBeCloseTo(0, 1)
    expect(ports[1]!.px).toBeCloseTo(1, 1)
    expect(ports[1]!.py).toBeCloseTo(0.5, 1)
    expect(ports[2]!.px).toBeCloseTo(0.5, 1)
    expect(ports[2]!.py).toBeCloseTo(1, 1)
    expect(ports[3]!.px).toBeCloseTo(0, 1)
    expect(ports[3]!.py).toBeCloseTo(0.5, 1)
  })

  it('free radial places first port near top when rotation=0', () => {
    const ports = computePortPlacements(
      { count: 4, radius: 1, rotation: 0, onPerimeter: false },
      'rectangle',
    )
    expect(ports[0]!.position).toBe(Position.Top)
    expect(ports[0]!.id).toBe('port-0')
  })

  it('maps angles to RF sides', () => {
    expect(angleToPosition(0)).toBe(Position.Right)
    expect(angleToPosition(90)).toBe(Position.Bottom)
    expect(angleToPosition(-90)).toBe(Position.Top)
    expect(angleToPosition(180)).toBe(Position.Left)
  })

  it('normalizes legacy and dual handle ids', () => {
    expect(normalizePortHandleId('port-2-s')).toBe('port-2')
    expect(normalizePortHandleId('port-1-t')).toBe('port-1')
    expect(normalizePortHandleId('top-target')).toBe('port-0')
    expect(normalizePortHandleId(null)).toBe(null)
  })

  it('reconcile keeps valid port index so rotate moves the endpoint', () => {
    const nodes = [
      {
        id: 'a',
        type: 'flowNode',
        position: { x: 0, y: 0 },
        width: 100,
        height: 60,
        data: {
          label: 'A',
          shape: 'rectangle',
          portCount: 5,
          portRotation: 40,
        },
      },
      {
        id: 'b',
        type: 'flowNode',
        position: { x: 200, y: 0 },
        width: 100,
        height: 60,
        data: { label: 'B', shape: 'rectangle', portCount: 4 },
      },
    ] as Node<FlowNodeData>[]

    const edges = reconcileEdgeHandles(nodes, [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        sourceHandle: 'port-2',
        targetHandle: 'port-0',
      },
    ])
    expect(edges[0]!.sourceHandle).toBe('port-2')
    expect(edges[0]!.targetHandle).toBe('port-0')
  })

  it('reconcile never force-facing on manualConnect edges', () => {
    const nodes = [
      {
        id: 'a',
        type: 'flowNode',
        position: { x: 0, y: 0 },
        width: 100,
        height: 60,
        data: { label: 'A', shape: 'rectangle', portCount: 4 },
      },
      {
        id: 'b',
        type: 'flowNode',
        position: { x: 0, y: 200 },
        width: 100,
        height: 60,
        data: { label: 'B', shape: 'rectangle', portCount: 4 },
      },
    ] as Node<FlowNodeData>[]

    // Left→left plug (port-3), even though facing would prefer bottom/top
    const edges = reconcileEdgeHandles(
      nodes,
      [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          sourceHandle: 'port-3',
          targetHandle: 'port-3',
          data: { manualConnect: true },
        },
      ],
      { forceFacing: true },
    )
    expect(edges[0]!.sourceHandle).toBe('port-3')
    expect(edges[0]!.targetHandle).toBe('port-3')
    expect(edges[0]!.source).toBe('a')
    expect(edges[0]!.target).toBe('b')
  })

  it('pickFacingPortId prefers port toward neighbor', () => {
    const a = {
      id: 'a',
      type: 'flowNode',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: {
        label: 'A',
        shape: 'diamond',
        portCount: 4,
        portOnPerimeter: false,
        portRotation: 0,
      },
    } as Node<FlowNodeData>
    const b = {
      id: 'b',
      type: 'flowNode',
      position: { x: 0, y: 200 },
      width: 100,
      height: 100,
      data: { label: 'B', shape: 'rectangle', portOnPerimeter: false },
    } as Node<FlowNodeData>
    // b is below a → bottom-ish port
    expect(pickFacingPortId(a, b)).toMatch(/^port-\d+$/)
  })
})
