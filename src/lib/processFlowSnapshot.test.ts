import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type {
  FlowEdgeData,
  FlowNodeData,
} from '@/vendor/mermaid-visual-editor/lib/store'
import {
  captureProcessFlow,
  isProcessFlowSnapshot,
  processFlowToRf,
  processFlowToSvg,
} from './processFlowSnapshot'

describe('processFlowSnapshot', () => {
  const nodes = [
    {
      id: 'Start',
      type: 'flowNode',
      position: { x: 100, y: 0 },
      width: 60,
      height: 40,
      data: { label: 'Start', shape: 'stadium' },
    },
    {
      id: 'Done',
      type: 'flowNode',
      position: { x: 90, y: 120 },
      width: 80,
      height: 40,
      data: { label: 'Done', shape: 'stadium' },
    },
  ] as Node<FlowNodeData>[]

  const edges = [
    {
      id: 'e1',
      source: 'Start',
      target: 'Done',
      type: 'flowEdge',
      data: { edgeStyle: 'solid', endMarker: 'arrow' },
    },
  ] as Edge<FlowEdgeData>[]

  it('captures normalized snapshot', () => {
    const snap = captureProcessFlow(nodes, edges, { direction: 'TD' })
    expect(snap).not.toBeNull()
    expect(isProcessFlowSnapshot(snap)).toBe(true)
    expect(snap!.nodes).toHaveLength(2)
    expect(snap!.edges).toHaveLength(1)
    // Normalized near pad origin
    expect(snap!.nodes[0]!.x).toBeGreaterThanOrEqual(0)
    expect(snap!.width).toBeGreaterThan(40)
  })

  it('renders SVG with edges and labels', () => {
    const snap = captureProcessFlow(nodes, edges)!
    const svg = processFlowToSvg(snap)
    expect(svg).toContain('<svg')
    expect(svg).toContain('Start')
    expect(svg).toContain('Done')
    expect(svg).toContain('<path')
  })

  it('round-trips snapshot into RF nodes with arrow markers', () => {
    const snap = captureProcessFlow(nodes, edges)!
    const rf = processFlowToRf(snap)
    expect(rf.nodes).toHaveLength(2)
    expect(rf.edges).toHaveLength(1)
    expect(rf.edges[0]!.data?.endMarker).toBe('arrow')
    expect(rf.nodes[0]!.position.x).toBe(snap.nodes[0]!.x)
  })

  it('multi reverse edge (No) is a U-turn, not a crossed diagonal', () => {
    const n2 = [
      {
        id: 'Collect',
        type: 'flowNode',
        position: { x: 40, y: 0 },
        width: 120,
        height: 48,
        data: { label: 'Collect', shape: 'rectangle' },
      },
      {
        id: 'Valid',
        type: 'flowNode',
        position: { x: 50, y: 120 },
        width: 100,
        height: 80,
        data: { label: 'Valid?', shape: 'diamond' },
      },
    ] as Node<FlowNodeData>[]
    const e2 = [
      {
        id: 'fwd',
        source: 'Collect',
        target: 'Valid',
        type: 'flowEdge',
        sourceHandle: 'port-2',
        targetHandle: 'port-0',
        data: { edgeStyle: 'solid', endMarker: 'arrow' },
      },
      {
        id: 'rev',
        source: 'Valid',
        target: 'Collect',
        type: 'flowEdge',
        label: 'No',
        sourceHandle: 'port-1',
        targetHandle: 'port-1',
        data: { edgeStyle: 'solid', endMarker: 'arrow' },
      },
    ] as Edge<FlowEdgeData>[]
    const snap = captureProcessFlow(n2, e2)!
    const svg = processFlowToSvg(snap)
    const revPath = snap.edges.find((e) => e.id === 'rev')?.path ?? ''
    // Reverse multi should not collapse to a short straight (port-to-port only)
    expect(revPath).not.toMatch(/^M[\d.,-]+ L[\d.,-]+$/)
    expect(svg).toContain('No')
    // Baked path must be painted into the SVG (card = editor capture)
    expect(svg).toContain(revPath.slice(0, 20))
    expect((svg.match(/<path d="/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

