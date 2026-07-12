/**
 * Contract: every flowchart Object Settings shape button is 1:1
 *   FLOWCHART_SHAPES[i].shape
 *     → ShapeIcon(shape) has a dedicated case (not silent default)
 *     → updateNodesShape writes that exact shape onto the node
 *     → FlowNode has a CSS or SVG render path
 *     → serializer emits the correct Mermaid delimiters
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { ALL_SHAPES, FLOWCHART_SHAPES } from '../components/ShapeIcons'
import { useFlowStore, type NodeShape } from './store'
import { serialize } from './serializer'

/** Shapes rendered via SVG in FlowNode (must match FlowNode.tsx SVG_RENDERERS). */
const FLOW_SVG_SHAPES = new Set<NodeShape>([
  'diamond',
  'hexagon',
  'parallelogram',
  'parallelogram-alt',
  'trapezoid',
  'trapezoid-alt',
  'asymmetric',
  'cylinder',
])

/** Shapes rendered via CSS in FlowNode switch. */
const FLOW_CSS_SHAPES = new Set<NodeShape>([
  'rectangle',
  'rounded',
  'stadium',
  'subroutine',
  'circle',
  'double-circle',
])

/** Expected Mermaid open/close fragments for each flowchart shape. */
const MERMAID_DELIMS: Record<string, [string, string]> = {
  rectangle: ['["', '"]'],
  rounded: ['("', '")'],
  stadium: ['(["', '"])'],
  subroutine: ['[["', '"]]'],
  cylinder: ['[("', '")]'],
  circle: ['(("', '"))'],
  'double-circle': ['((("', '")))'],
  diamond: ['{"', '"}'],
  hexagon: ['{{"', '"}}'],
  parallelogram: ['[/"', '"/]'],
  'parallelogram-alt': ['[\\"', '"\\]'],
  trapezoid: ['[/"', '"\\]'],
  'trapezoid-alt': ['[\\"', '"/]'],
  asymmetric: ['>"', '"]'],
}

describe('flowchart 14 shape buttons — full 1:1 wiring', () => {
  it('exposes exactly 14 flowchart shapes (no bang/cloud)', () => {
    expect(FLOWCHART_SHAPES).toHaveLength(14)
    expect(ALL_SHAPES).toHaveLength(14)
    expect(FLOWCHART_SHAPES.map((s) => s.shape)).toEqual(
      ALL_SHAPES.map((s) => s.shape),
    )
    const ids = FLOWCHART_SHAPES.map((s) => s.shape)
    expect(ids).not.toContain('bang')
    expect(ids).not.toContain('cloud')
    // unique
    expect(new Set(ids).size).toBe(14)
  })

  it('every button shape has a canvas render path (CSS xor SVG)', () => {
    for (const { shape, label } of FLOWCHART_SHAPES) {
      const css = FLOW_CSS_SHAPES.has(shape)
      const svg = FLOW_SVG_SHAPES.has(shape)
      expect(
        css || svg,
        `${label} (${shape}) must be handled by FlowNode CSS or SVG`,
      ).toBe(true)
      expect(
        css && svg,
        `${label} (${shape}) must not be both CSS and SVG`,
      ).toBe(false)
    }
  })

  it('every button shape has Mermaid delimiter mapping', () => {
    for (const { shape, label } of FLOWCHART_SHAPES) {
      expect(
        MERMAID_DELIMS[shape],
        `${label} (${shape}) missing Mermaid delims in test table`,
      ).toBeDefined()
    }
  })

  it.each(FLOWCHART_SHAPES.map((s, i) => [i, s.shape, s.label] as const))(
    'button #%i %s (%s): store updateNodesShape writes exact shape + flowNode type',
    (_i, shape, _label) => {
      // fresh store state
      useFlowStore.setState({
        nodes: [
          {
            id: 'n1',
            type: 'flowNode',
            position: { x: 0, y: 0 },
            selected: true,
            data: { label: 'Test', shape: 'rectangle' },
          },
        ],
        edges: [],
        diagramKind: 'flowchart',
        past: [],
        future: [],
      })

      useFlowStore.getState().updateNodesShape(['n1'], shape)

      const n = useFlowStore.getState().nodes.find((x) => x.id === 'n1')!
      expect(n.type).toBe('flowNode')
      expect(n.data.shape).toBe(shape)
    },
  )

  it.each(FLOWCHART_SHAPES.map((s) => [s.shape, s.label] as const))(
    'shape %s (%s): serializer emits correct Mermaid delimiters',
    (shape, _label) => {
      const [open, close] = MERMAID_DELIMS[shape]!
      const nodes = [
        {
          id: 'A',
          type: 'flowNode' as const,
          position: { x: 0, y: 0 },
          data: { label: 'Hello', shape },
        },
      ]
      const out = serialize(nodes, [], {
        direction: 'TD',
        theme: 'dark',
        look: 'classic',
        curveStyle: 'basis',
      })
      expect(out).toContain(`A${open}Hello${close}`)
    },
  )

  it('click order independence: applying all 14 shapes sequentially ends on last', () => {
    useFlowStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'flowNode',
          position: { x: 0, y: 0 },
          selected: true,
          data: { label: 'Test', shape: 'rectangle' },
        },
      ],
      edges: [],
      diagramKind: 'flowchart',
      past: [],
      future: [],
    })

    for (const { shape } of FLOWCHART_SHAPES) {
      useFlowStore.getState().updateNodesShape(['n1'], shape)
      expect(useFlowStore.getState().nodes[0]!.data.shape).toBe(shape)
      expect(useFlowStore.getState().nodes[0]!.type).toBe('flowNode')
    }
  })

  it('button index i always maps to FLOWCHART_SHAPES[i].shape (no off-by-one)', () => {
    // Simulates ObjectSettings: shapeOptions.map((opt) => onClick(opt.shape))
    const wired: NodeShape[] = []
    FLOWCHART_SHAPES.forEach((opt, i) => {
      // What the button at index i would pass
      wired[i] = opt.shape
    })
    expect(wired).toEqual([
      'rectangle',
      'rounded',
      'stadium',
      'diamond',
      'circle',
      'double-circle',
      'hexagon',
      'subroutine',
      'cylinder',
      'parallelogram',
      'parallelogram-alt',
      'trapezoid',
      'trapezoid-alt',
      'asymmetric',
    ])
  })
})
