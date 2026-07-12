import { describe, expect, it } from 'vitest'
import {
  applyMindmapTreeLayout,
  makeMindmapEdge,
  mindmapChildrenOf,
  mindmapDescendantsOf,
  mindmapParentOf,
  mindmapPreviousSibling,
  parseMermaidMindmap,
  parseMindmapNodeText,
  serializeMindmap,
  wrapMindmapLabel,
} from './mindmap'
import { MERMAID_MINDMAP_EXAMPLE } from '@/lib/mermaidTemplates'
import type { FlowEdgeData, FlowNodeData } from './store'
import type { Edge, Node } from '@xyflow/react'

describe('mindmap parse/serialize', () => {
  it('parses node shapes and optional ids', () => {
    expect(parseMindmapNodeText('root((mindmap))')).toEqual({
      idHint: 'root',
      label: 'mindmap',
      shape: 'circle',
    })
    expect(parseMindmapNodeText('Origins')).toEqual({
      label: 'Origins',
      shape: 'rounded',
    })
    expect(parseMindmapNodeText('::icon(fa fa-book)')).toBeNull()
  })

  it('imports official mindmap example into nodes with icon on Origins', () => {
    const result = parseMermaidMindmap(MERMAID_MINDMAP_EXAMPLE)
    expect(result.error).toBeUndefined()
    expect(result.nodes.length).toBeGreaterThan(5)
    const root = result.nodes[0]!
    expect(root.data.label).toBe('mindmap')
    expect(root.data.shape).toBe('circle')
    expect(result.edges.length).toBe(result.nodes.length - 1)
    const origins = result.nodes.find((n) => n.data.label === 'Origins')
    expect(origins?.data.icon).toBe('fa fa-book')
  })

  it('round-trips labels, shapes, icons, and fill colors', () => {
    const parsed = parseMermaidMindmap(MERMAID_MINDMAP_EXAMPLE)
    parsed.nodes[0] = {
      ...parsed.nodes[0]!,
      data: {
        ...parsed.nodes[0]!.data,
        fillColor: '#ef4444',
        strokeColor: '#f59e0b',
        textColor: '#ffffff',
      },
    }
    const out = serializeMindmap(parsed.nodes, parsed.edges)
    expect(out).toMatch(/^mindmap\b/m)
    expect(out).toContain('((mindmap))')
    expect(out).toContain('::icon(fa fa-book)')
    expect(out).toContain('%% mve-styles:')
    expect(out).toContain('#ef4444')

    const again = parseMermaidMindmap(out)
    const colored = again.nodes.find((n) => n.data.fillColor === '#ef4444')
    expect(colored).toBeTruthy()
    expect(colored!.data.strokeColor).toBe('#f59e0b')
    const origins = again.nodes.find((n) => n.data.label === 'Origins')
    expect(origins?.data.icon).toBe('fa fa-book')
  })

  it('wrapMindmapLabel includes stable id and bang/cloud', () => {
    expect(wrapMindmapLabel('root', 'mindmap', 'circle')).toBe(
      'root((mindmap))',
    )
    expect(wrapMindmapLabel('x', 'Boom', 'bang')).toBe('x))Boom((')
    expect(wrapMindmapLabel('c', 'Sky', 'cloud')).toBe('c)Sky(')
    expect(wrapMindmapLabel('s', 'Box', 'rectangle')).toBe('s[Box]')
  })

  it('parses official Mermaid bang and cloud examples', () => {
    // https://mermaid.js.org/syntax/mindmap.html — Bang / Cloud
    expect(parseMindmapNodeText('id))I am a bang((')).toEqual({
      idHint: 'id',
      label: 'I am a bang',
      shape: 'bang',
    })
    expect(parseMindmapNodeText('id)I am a cloud(')).toEqual({
      idHint: 'id',
      label: 'I am a cloud',
      shape: 'cloud',
    })
    expect(wrapMindmapLabel('id', 'I am a bang', 'bang')).toBe(
      'id))I am a bang((',
    )
    expect(wrapMindmapLabel('id', 'I am a cloud', 'cloud')).toBe(
      'id)I am a cloud(',
    )

    const bangSrc = 'mindmap\n    id))I am a bang(('
    const bang = parseMermaidMindmap(bangSrc)
    expect(bang.error).toBeUndefined()
    expect(bang.nodes[0]!.data.shape).toBe('bang')
    expect(bang.nodes[0]!.data.label).toBe('I am a bang')
    expect(serializeMindmap(bang.nodes, bang.edges)).toContain(
      'id))I am a bang((',
    )

    const cloudSrc = 'mindmap\n    id)I am a cloud('
    const cloud = parseMermaidMindmap(cloudSrc)
    expect(cloud.error).toBeUndefined()
    expect(cloud.nodes[0]!.data.shape).toBe('cloud')
    expect(cloud.nodes[0]!.data.label).toBe('I am a cloud')
    expect(serializeMindmap(cloud.nodes, cloud.edges)).toContain(
      'id)I am a cloud(',
    )
  })

  it('exposes all official mindmap shapes in MINDMAP_SHAPES', async () => {
    const { MINDMAP_SHAPES } = await import('./mindmap')
    const ids = MINDMAP_SHAPES.map((s) => s.shape)
    expect(ids).toContain('bang')
    expect(ids).toContain('cloud')
    expect(ids).toContain('circle')
    expect(ids).toContain('rectangle')
    expect(ids).toContain('hexagon')
    expect(ids).toContain('rounded')
  })

  it('tree helpers: parent, children, descendants', () => {
    const nodes: Node<FlowNodeData>[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rounded' } },
      { id: 'b', position: { x: 0, y: 80 }, data: { label: 'B', shape: 'rounded' } },
      { id: 'c', position: { x: 0, y: 160 }, data: { label: 'C', shape: 'rounded' } },
    ]
    const edges: Edge<FlowEdgeData>[] = [
      makeMindmapEdge('a', 'b'),
      makeMindmapEdge('b', 'c'),
    ]
    expect(mindmapParentOf('b', edges)).toBe('a')
    expect(mindmapChildrenOf('a', edges, nodes)).toEqual(['b'])
    expect([...mindmapDescendantsOf('a', edges)].sort()).toEqual(['b', 'c'])
  })

  it('promote then demote restores parent (edge-order invertibility)', () => {
    // Root → A → B,C   promote C → Root → A,C (C after A)  demote C → under A again
    const nodes: Node<FlowNodeData>[] = [
      { id: 'root', position: { x: 0, y: 0 }, data: { label: 'R', shape: 'circle' } },
      { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rounded' } },
      { id: 'b', position: { x: 0, y: 0 }, data: { label: 'B', shape: 'rounded' } },
      { id: 'c', position: { x: 0, y: 0 }, data: { label: 'C', shape: 'rounded' } },
    ]
    let edges: Edge<FlowEdgeData>[] = [
      makeMindmapEdge('root', 'a'),
      makeMindmapEdge('a', 'b'),
      makeMindmapEdge('a', 'c'),
    ]
    // promote C
    const parent = mindmapParentOf('c', edges)!
    const grand = mindmapParentOf(parent, edges)!
    edges = edges.filter((e) => !(e.target === 'c' && e.source === parent))
    const newEdge = makeMindmapEdge(grand, 'c')
    const idx = edges.findIndex(
      (e) => e.source === grand && e.target === parent,
    )
    edges = [
      ...edges.slice(0, idx + 1),
      newEdge,
      ...edges.slice(idx + 1),
    ]
    expect(mindmapParentOf('c', edges)).toBe('root')
    expect(mindmapChildrenOf('root', edges)).toEqual(['a', 'c'])

    // demote C — previous sibling under root is A
    const prev = mindmapPreviousSibling('c', edges, nodes)
    expect(prev).toBe('a')
    edges = edges.filter((e) => e.target !== 'c')
    edges.push(makeMindmapEdge(prev!, 'c'))
    expect(mindmapParentOf('c', edges)).toBe('a')
    expect(mindmapChildrenOf('a', edges)).toEqual(['b', 'c'])
  })

  it('applyMindmapTreeLayout moves nodes', () => {
    const nodes: Node<FlowNodeData>[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rounded' } },
      { id: 'b', position: { x: 0, y: 0 }, data: { label: 'B', shape: 'rounded' } },
    ]
    const edges = [makeMindmapEdge('a', 'b')]
    const laid = applyMindmapTreeLayout(nodes, edges, 'LR')
    expect(laid[0]!.position.x).not.toBe(laid[1]!.position.x)
  })

  it('places N root children evenly around center (not a 4-grid)', () => {
    // root + 3 children like Origins / Research / Tools
    const nodes: Node<FlowNodeData>[] = [
      { id: 'root', position: { x: 0, y: 0 }, data: { label: 'root', shape: 'circle' } },
      { id: 'c1', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rounded' } },
      { id: 'c2', position: { x: 0, y: 0 }, data: { label: 'B', shape: 'rounded' } },
      { id: 'c3', position: { x: 0, y: 0 }, data: { label: 'C', shape: 'rounded' } },
    ]
    const edges = [
      makeMindmapEdge('root', 'c1'),
      makeMindmapEdge('root', 'c2'),
      makeMindmapEdge('root', 'c3'),
    ]
    const laid = applyMindmapTreeLayout(nodes, edges, 'TD')
    const byId = Object.fromEntries(laid.map((n) => [n.id, n.position]))
    const root = byId.root!
    const kids = [byId.c1!, byId.c2!, byId.c3!]

    // All children same ring distance from root
    const dists = kids.map((p) =>
      Math.hypot(p.x - root.x, p.y - root.y),
    )
    const mean = dists.reduce((a, b) => a + b, 0) / dists.length
    for (const d of dists) {
      expect(Math.abs(d - mean)).toBeLessThan(2)
    }

    // Exact 120° gaps for 3 equal slices
    const angles = kids
      .map((p) => Math.atan2(p.y - root.y, p.x - root.x))
      .sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]!
      const b = angles[(i + 1) % angles.length]!
      let g = b - a
      if (g < 0) g += Math.PI * 2
      gaps.push(g)
    }
    for (const g of gaps) {
      // allow tiny error from integer position rounding
      expect(g).toBeCloseTo((Math.PI * 2) / 3, 2)
    }
  })

  it('places 5 root children at 72° each', () => {
    const nodes: Node<FlowNodeData>[] = [
      { id: 'root', position: { x: 0, y: 0 }, data: { label: 'r', shape: 'circle' } },
      ...[1, 2, 3, 4, 5].map((i) => ({
        id: `c${i}`,
        position: { x: 0, y: 0 },
        data: { label: `C${i}`, shape: 'rounded' as const },
      })),
    ]
    const edges = [1, 2, 3, 4, 5].map((i) => makeMindmapEdge('root', `c${i}`))
    const laid = applyMindmapTreeLayout(nodes, edges, 'TD')
    const root = laid.find((n) => n.id === 'root')!
    const angles = laid
      .filter((n) => n.id !== 'root')
      .map((n) =>
        Math.atan2(n.position.y - root.position.y, n.position.x - root.position.x),
      )
      .sort((a, b) => a - b)
    for (let i = 0; i < angles.length; i++) {
      let g = angles[(i + 1) % angles.length]! - angles[i]!
      if (g < 0) g += Math.PI * 2
      expect(g).toBeCloseTo((Math.PI * 2) / 5, 2)
    }
  })

  it('places 2 children of a branch in that branch sector', () => {
    const nodes: Node<FlowNodeData>[] = [
      { id: 'root', position: { x: 0, y: 0 }, data: { label: 'root', shape: 'circle' } },
      { id: 'o', position: { x: 0, y: 0 }, data: { label: 'Origins', shape: 'rounded' } },
      { id: 'r', position: { x: 0, y: 0 }, data: { label: 'Research', shape: 'rounded' } },
      { id: 't', position: { x: 0, y: 0 }, data: { label: 'Tools', shape: 'rounded' } },
      { id: 'o1', position: { x: 0, y: 0 }, data: { label: 'Long history', shape: 'rounded' } },
      { id: 'o2', position: { x: 0, y: 0 }, data: { label: 'Popularisation', shape: 'rounded' } },
    ]
    const edges = [
      makeMindmapEdge('root', 'o'),
      makeMindmapEdge('root', 'r'),
      makeMindmapEdge('root', 't'),
      makeMindmapEdge('o', 'o1'),
      makeMindmapEdge('o', 'o2'),
    ]
    const laid = applyMindmapTreeLayout(nodes, edges, 'TD')
    const p = Object.fromEntries(laid.map((n) => [n.id, n.position]))
    // Second-level pair farther from root than their parent
    const dO = Math.hypot(p.o!.x - p.root!.x, p.o!.y - p.root!.y)
    const dO1 = Math.hypot(p.o1!.x - p.root!.x, p.o1!.y - p.root!.y)
    const dO2 = Math.hypot(p.o2!.x - p.root!.x, p.o2!.y - p.root!.y)
    expect(dO1).toBeGreaterThan(dO)
    expect(dO2).toBeGreaterThan(dO)
    // The two kids are distinct (not piled on one slot)
    expect(Math.hypot(p.o1!.x - p.o2!.x, p.o1!.y - p.o2!.y)).toBeGreaterThan(40)
  })

  it('official example: 3 top-level topics around root', () => {
    const parsed = parseMermaidMindmap(MERMAID_MINDMAP_EXAMPLE)
    const laid = applyMindmapTreeLayout(parsed.nodes, parsed.edges, 'TD')
    const root = laid.find((n) => n.data.label === 'mindmap')!
    const top = ['Origins', 'Research', 'Tools'].map(
      (label) => laid.find((n) => n.data.label === label)!,
    )
    const angles = top
      .map((n) =>
        Math.atan2(n.position.y - root.position.y, n.position.x - root.position.x),
      )
      .sort((a, b) => a - b)
    // Three distinct directions
    expect(new Set(angles.map((a) => a.toFixed(2))).size).toBe(3)
  })
})

