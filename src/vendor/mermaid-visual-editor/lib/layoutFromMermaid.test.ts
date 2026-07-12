import { describe, expect, it } from 'vitest'
import {
  applyMermaidBoxesToNodes,
  applyMermaidEdgesToRf,
  mermaidEdgeIdToPair,
  mermaidSvgIdToNodeId,
  parseMermaidNodeBoxes,
  pathEndpoints,
  translateSvgPath,
} from './layoutFromMermaid'
import type { Edge, Node } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from './store'

describe('layoutFromMermaid', () => {
  it('parses ids with render-id prefix (Mermaid 11)', () => {
    expect(mermaidSvgIdToNodeId('dump1-flowchart-Start-0')).toBe('Start')
    expect(mermaidSvgIdToNodeId('flowchart-Start-0')).toBe('Start')
    expect(mermaidSvgIdToNodeId('abc-flowchart-Collect_input-12')).toBe(
      'Collect_input',
    )
  })

  it('parses edge ids L_source_target_index', () => {
    expect(mermaidEdgeIdToPair('layout-dump-L_Start_Input_0')).toEqual({
      source: 'Start',
      target: 'Input',
      index: 0,
    })
    expect(
      mermaidEdgeIdToPair('x-L_Check_Process_0', new Set(['Check', 'Process'])),
    ).toEqual({ source: 'Check', target: 'Process', index: 0 })
    expect(
      mermaidEdgeIdToPair('x-L_A_B_C_1', new Set(['A', 'B_C', 'A_B', 'C'])),
    ).toEqual({ source: 'A', target: 'B_C', index: 1 })
  })

  it('translates absolute SVG paths', () => {
    const d = 'M10,20L10,40C10,50,10,60,10,70'
    expect(translateSvgPath(d, 5, -3)).toBe('M15,17L15,37C15,47 15,57 15,67')
    expect(pathEndpoints(d)).toEqual({
      startX: 10,
      startY: 20,
      endX: 10,
      endY: 70,
    })
  })

  it('parses rect and polygon from Mermaid-like SVG (mounted measure)', () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400">
  <g class="nodes">
    <g class="node default" id="dump1-flowchart-Start-0" transform="translate(100, 40)">
      <rect class="basic label-container" x="-40" y="-20" width="80" height="40" rx="20"/>
    </g>
    <g class="node default" id="dump1-flowchart-Input-1" transform="translate(100, 120)">
      <rect class="basic label-container" x="-50" y="-18" width="100" height="36"/>
    </g>
    <g class="node default" id="dump1-flowchart-Check-3" transform="translate(100, 200)">
      <polygon points="0,-30 40,0 0,30 -40,0"/>
    </g>
  </g>
</svg>`
    const boxes = parseMermaidNodeBoxes(svg)
    expect(boxes.map((b) => b.id).sort()).toEqual(
      ['Check', 'Input', 'Start'].sort(),
    )
    const start = boxes.find((b) => b.id === 'Start')!
    expect(start.width).toBe(80)
    expect(start.height).toBe(40)
    // translate(100,40) + rect(-40,-20) → (60, 20)
    expect(start.x).toBe(60)
    expect(start.y).toBe(20)
    expect(start.cx).toBe(100)
    expect(start.cy).toBe(40)
  })

  it('maps mermaid boxes onto RF nodes', () => {
    const nodes = [
      {
        id: 'Start',
        type: 'flowNode',
        position: { x: 0, y: 0 },
        data: { label: 'Start', shape: 'stadium' },
      },
      {
        id: 'Input',
        type: 'flowNode',
        position: { x: 0, y: 0 },
        data: { label: 'Collect input', shape: 'rectangle' },
      },
    ] as Node<FlowNodeData>[]

    const laid = applyMermaidBoxesToNodes(nodes, [
      { id: 'Start', x: 60, y: 20, width: 80, height: 40, cx: 100, cy: 40 },
      { id: 'Input', x: 50, y: 100, width: 100, height: 40, cx: 100, cy: 120 },
    ])
    expect(laid[0]!.style?.width).toBe(80)
    expect(laid[0]!.width).toBe(80)
    expect(laid[1]!.position.y).toBe(100 - 20 + 32)
  })

  it('maps mermaid edge paths onto RF edges with offset', () => {
    const boxes = [
      { id: 'Start', x: 60, y: 20, width: 80, height: 40, cx: 100, cy: 40 },
      { id: 'Input', x: 50, y: 100, width: 100, height: 40, cx: 100, cy: 120 },
    ]
    const edges = [
      {
        id: 'e1',
        source: 'Start',
        target: 'Input',
        type: 'flowEdge',
        data: { edgeStyle: 'solid' },
      },
    ] as Edge<FlowEdgeData>[]

    const laid = applyMermaidEdgesToRf(
      edges,
      [
        {
          source: 'Start',
          target: 'Input',
          index: 0,
          d: 'M100,60L100,100',
          startX: 100,
          startY: 60,
          endX: 100,
          endY: 100,
          label: 'go',
          labelX: 110,
          labelY: 80,
        },
      ],
      boxes,
      { minX: 50, minY: 20, pad: 32 },
    )
    // dx = -50+32 = -18, dy = -20+32 = 12
    expect(laid[0]!.data?.mermaidPath).toBe('M82,72L82,112')
    expect(laid[0]!.data?.mermaidLabelX).toBe(110 - 18)
    expect(laid[0]!.data?.mermaidLabelY).toBe(80 + 12)
    expect(laid[0]!.label).toBe('go')
    // Start bottom (port-2) → Input top (port-0)
    expect(laid[0]!.sourceHandle).toBe('port-2')
    expect(laid[0]!.targetHandle).toBe('port-0')
  })
})
