/**
 * Mermaid mindmap ↔ React Flow nodes/edges + tree ops.
 * Syntax: https://mermaid.js.org/syntax/mindmap.html
 *
 * Colors round-trip via `%% mve-styles: {...}`.
 * Icons via `::icon(fa fa-*)` child lines under a node.
 */
import type { Edge, Node } from '@xyflow/react'
import type { Direction, FlowEdgeData, FlowNodeData, NodeShape } from './store'

export type MindmapParseResult = {
  nodes: Node<FlowNodeData>[]
  edges: Edge<FlowEdgeData>[]
  error?: string
}

type ShapeParse = { idHint?: string; label: string; shape: NodeShape }

/**
 * Official Mermaid mindmap shapes (all of them)
 * https://mermaid.js.org/syntax/mindmap.html#different-shapes
 *
 * | Label           | Syntax           | NodeShape  |
 * |-----------------|------------------|------------|
 * | Default         | plain text       | default    |
 * | Square          | id[text]         | rectangle  |
 * | Rounded square  | id(text)         | rounded    |
 * | Circle          | id((text))       | circle     |
 * | Bang            | id))text((       | bang       |
 * | Cloud           | id)text(         | cloud      |
 * | Hexagon         | id{{text}}       | hexagon    |
 *
 * We keep `default` as shape name `rounded` with plain export, and expose
 * rounded square separately via the same rounded shell + `id(text)` wrap.
 */
export const MINDMAP_SHAPES: { shape: NodeShape; label: string; hint: string }[] =
  [
    { shape: 'rounded', label: 'Default', hint: 'plain / id(text)' },
    { shape: 'rectangle', label: 'Square', hint: 'id[text]' },
    { shape: 'circle', label: 'Circle', hint: 'id((text))' },
    { shape: 'bang', label: 'Bang', hint: 'id))text((' },
    { shape: 'cloud', label: 'Cloud', hint: 'id)text(' },
    { shape: 'hexagon', label: 'Hexagon', hint: 'id{{text}}' },
  ]

/** Common Font Awesome icons supported by Mermaid mindmap `::icon(...)`. */
export const MINDMAP_ICON_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'fa fa-book', label: 'Book' },
  { value: 'fa fa-star', label: 'Star' },
  { value: 'fa fa-heart', label: 'Heart' },
  { value: 'fa fa-lightbulb', label: 'Idea' },
  { value: 'fa fa-user', label: 'User' },
  { value: 'fa fa-cog', label: 'Settings' },
  { value: 'fa fa-check', label: 'Check' },
  { value: 'fa fa-flag', label: 'Flag' },
  { value: 'fa fa-folder', label: 'Folder' },
  { value: 'fa fa-bolt', label: 'Bolt' },
  { value: 'fa fa-globe', label: 'Globe' },
]

const STYLE_LINE_RE = /^%%\s*mve-styles:\s*(.+)\s*$/i
const ICON_LINE_RE = /^::icon\(([^)]+)\)\s*$/i

type StyleBag = {
  fill?: string
  stroke?: string
  color?: string
}

function cleanLabel(s: string): string {
  return s.trim().replace(/<br\s*\/?>/gi, '\n')
}

export function sanitizeMindmapId(id: string): string {
  const s = id.replace(/[^a-zA-Z0-9_]/g, '_')
  return /^[A-Za-z]/.test(s) ? s : `n_${s}`
}

/** Parse a mindmap node line (without leading indent) into id + label + shape. */
export function parseMindmapNodeText(raw: string): ShapeParse | null {
  const t = raw.trim()
  if (!t) return null
  if (t.startsWith('::icon')) return null
  if (t.startsWith('%%')) return null

  let m: RegExpMatchArray | null

  m = t.match(/^([A-Za-z][\w]*)?\(\(\((.+)\)\)\)$/)
  if (m) {
    return {
      idHint: m[1] || undefined,
      label: cleanLabel(m[2]!),
      shape: 'double-circle',
    }
  }

  m = t.match(/^([A-Za-z][\w]*)?\(\((.+)\)\)$/)
  if (m) {
    return {
      idHint: m[1] || undefined,
      label: cleanLabel(m[2]!),
      shape: 'circle',
    }
  }

  m = t.match(/^([A-Za-z][\w]*)?\{\{(.+)\}\}$/)
  if (m) {
    return {
      idHint: m[1] || undefined,
      label: cleanLabel(m[2]!),
      shape: 'hexagon',
    }
  }

  m = t.match(/^([A-Za-z][\w]*)?\[(.+)\]$/)
  if (m) {
    return {
      idHint: m[1] || undefined,
      label: cleanLabel(m[2]!),
      shape: 'rectangle',
    }
  }

  // Bang / explode: id))text((  or  ))text((
  // Official: id))I am a bang((
  m = t.match(/^([A-Za-z][\w]*)?\)\)(.+)\(\($/)
  if (m) {
    return {
      idHint: m[1] || undefined,
      label: cleanLabel(m[2]!),
      shape: 'bang',
    }
  }

  // Cloud: id)text(  or  )text(
  // Official: id)I am a cloud(
  m = t.match(/^([A-Za-z][\w]*)?\)(.+)\($/)
  if (m) {
    return {
      idHint: m[1] || undefined,
      label: cleanLabel(m[2]!),
      shape: 'cloud',
    }
  }

  m = t.match(/^([A-Za-z][\w]*)\((.+)\)$/)
  if (m) {
    return {
      idHint: m[1]!,
      label: cleanLabel(m[2]!),
      shape: 'rounded',
    }
  }

  m = t.match(/^\((.+)\)$/)
  if (m) return { label: cleanLabel(m[1]!), shape: 'rounded' }

  return { label: cleanLabel(t), shape: 'rounded' }
}

export function wrapMindmapLabel(
  id: string,
  label: string,
  shape: NodeShape,
): string {
  const sid = sanitizeMindmapId(id)
  const safe = label.replace(/\n/g, '<br/>').replace(/"/g, "'")
  switch (shape) {
    case 'circle':
      return `${sid}((${safe}))`
    case 'double-circle':
      return `${sid}(((${safe})))`
    case 'hexagon':
      return `${sid}{{${safe}}}`
    case 'rectangle':
      return `${sid}[${safe}]`
    case 'bang':
    case 'asymmetric':
      // Official: id))I am a bang((
      return `${sid}))${safe}((`
    case 'cloud':
    case 'stadium':
      // Official: id)I am a cloud(
      return `${sid})${safe}(`
    case 'rounded':
    default:
      return `${sid}(${safe})`
  }
}

function indentOf(line: string): number {
  const m = line.match(/^(\s*)/)
  return m ? m[1]!.replace(/\t/g, '  ').length : 0
}

function uniqueId(hint: string | undefined, label: string, used: Set<string>): string {
  const base = sanitizeMindmapId(hint || label || 'node').slice(0, 32)
  let id = base
  let n = 2
  while (used.has(id)) {
    id = `${base}_${n++}`
  }
  used.add(id)
  return id
}

function parseStyleBlob(source: string): Map<string, StyleBag> {
  const map = new Map<string, StyleBag>()
  for (const line of source.split(/\r?\n/)) {
    const m = line.trim().match(STYLE_LINE_RE)
    if (!m) continue
    try {
      const obj = JSON.parse(m[1]!) as Record<string, StyleBag>
      for (const [id, st] of Object.entries(obj)) {
        if (st && typeof st === 'object') map.set(id, st)
      }
    } catch {
      /* ignore */
    }
  }
  return map
}

// ─── Tree helpers ────────────────────────────────────────────────────────────

export function mindmapParentOf(
  nodeId: string,
  edges: Edge<FlowEdgeData>[],
): string | null {
  const e = edges.find((x) => x.target === nodeId)
  return e?.source ?? null
}

/**
 * Children of a node in **edge-list order** (stable).
 * Used for promote/demote invertibility — must not reorder by geometry after layout.
 */
export function mindmapChildrenOf(
  nodeId: string,
  edges: Edge<FlowEdgeData>[],
  _nodes?: Node<FlowNodeData>[],
): string[] {
  void _nodes
  return edges.filter((e) => e.source === nodeId).map((e) => e.target)
}

export function mindmapDescendantsOf(
  nodeId: string,
  edges: Edge<FlowEdgeData>[],
): Set<string> {
  const out = new Set<string>()
  const stack = [nodeId]
  while (stack.length) {
    const id = stack.pop()!
    for (const e of edges) {
      if (e.source === id && !out.has(e.target)) {
        out.add(e.target)
        stack.push(e.target)
      }
    }
  }
  return out
}

export function mindmapRoots(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
): Node<FlowNodeData>[] {
  const hasParent = new Set(edges.map((e) => e.target))
  // Keep nodes-array order (stable), not geometric order
  return nodes.filter((n) => !hasParent.has(n.id) && !n.data.isSubgraph)
}

/**
 * Previous sibling under the same parent (edge order).
 * Demote = attach under this node; must invert Promote when promote inserts
 * the node immediately after its former parent among grandparent’s kids.
 */
export function mindmapPreviousSibling(
  nodeId: string,
  edges: Edge<FlowEdgeData>[],
  nodes: Node<FlowNodeData>[],
): string | null {
  const parent = mindmapParentOf(nodeId, edges)
  if (!parent) {
    const roots = mindmapRoots(nodes, edges).map((n) => n.id)
    const i = roots.indexOf(nodeId)
    return i > 0 ? roots[i - 1]! : null
  }
  const kids = mindmapChildrenOf(parent, edges, nodes)
  const i = kids.indexOf(nodeId)
  return i > 0 ? kids[i - 1]! : null
}

/**
 * Radial mindmap layout — equal pie slices by **child count** at every level.
 *
 * Example official mindmap:
 *   root center
 *   3 first-level topics → 3 equal 120° wedges (not a 4-column grid)
 *   each of those with 2 children → 2 equal half-wedges in that block
 *   a branch with 5 children → 5 equal slices, etc.
 *
 * `direction` only rotates the whole map (where the first slice points).
 */
export function applyMindmapTreeLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
  direction: Direction = 'TD',
): Node<FlowNodeData>[] {
  if (nodes.length === 0) return nodes

  const positions = new Map<string, { x: number; y: number }>()
  const roots = mindmapRoots(nodes, edges)

  /** Distance between parent ring and child ring (px). */
  const LEVEL_GAP = 200
  const PAD = 100

  const heading0: Record<Direction, number> = {
    TD: -Math.PI / 2,
    BT: Math.PI / 2,
    LR: 0,
    RL: Math.PI,
  }
  const originAngle = heading0[direction] ?? -Math.PI / 2
  const TWO_PI = Math.PI * 2

  /**
   * Place children of `parentId` evenly in [sectorStart, sectorEnd].
   * Each child gets exactly 1/N of the sector (N = child count).
   * Then recurse: each child’s own kids fill that child’s sub-sector.
   */
  function placeChildrenEvenly(
    parentId: string,
    parentRadius: number,
    sectorStart: number,
    sectorEnd: number,
  ) {
    const kids = mindmapChildrenOf(parentId, edges, nodes)
    const n = kids.length
    if (n === 0) return

    const span = sectorEnd - sectorStart
    // Equal angular width per sibling — 2→½ span, 3→⅓, 5→⅕, never “slots of 4”
    const slice = span / n
    const childRadius = parentRadius + LEVEL_GAP

    kids.forEach((kidId, i) => {
      const a0 = sectorStart + i * slice
      const a1 = a0 + slice
      // Center of this child’s slice
      const angle = a0 + slice / 2
      positions.set(kidId, {
        x: Math.cos(angle) * childRadius,
        y: Math.sin(angle) * childRadius,
      })
      // That child becomes a block: its children share only this slice
      placeChildrenEvenly(kidId, childRadius, a0, a1)
    })
  }

  if (roots.length === 0) {
    return nodes
  }

  if (roots.length === 1) {
    const rootId = roots[0]!.id
    positions.set(rootId, { x: 0, y: 0 })
    // First ring: full 360°, N equal pies (example: 3 topics → 120° each)
    placeChildrenEvenly(rootId, 0, originAngle, originAngle + TWO_PI)
  } else {
    // Multiple roots: treat them as siblings on a full circle around origin
    const n = roots.length
    const slice = TWO_PI / n
    roots.forEach((r, i) => {
      const a0 = originAngle + i * slice
      const a1 = a0 + slice
      const angle = a0 + slice / 2
      // Roots sit on first ring so they don’t stack
      positions.set(r.id, {
        x: Math.cos(angle) * LEVEL_GAP,
        y: Math.sin(angle) * LEVEL_GAP,
      })
      placeChildrenEvenly(r.id, LEVEL_GAP, a0, a1)
    })
  }

  // Disconnected nodes: own ring, equal spacing
  const missing = nodes.filter((n) => !positions.has(n.id) && !n.data.isSubgraph)
  if (missing.length > 0) {
    const n = missing.length
    missing.forEach((node, i) => {
      const angle = originAngle + (TWO_PI * i) / n
      positions.set(node.id, {
        x: Math.cos(angle) * LEVEL_GAP * 3,
        y: Math.sin(angle) * LEVEL_GAP * 3,
      })
    })
  }

  // Normalize into positive canvas space
  let minX = Infinity
  let minY = Infinity
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
  }
  if (!Number.isFinite(minX)) minX = 0
  if (!Number.isFinite(minY)) minY = 0
  const dx = PAD - minX
  const dy = PAD - minY

  const hasParent = new Set(edges.map((e) => e.target))
  return nodes.map((n) => {
    const p = positions.get(n.id)
    const isHub = !hasParent.has(n.id)
    const size = isHub ? 120 : 96
    const keepW =
      typeof n.style?.width === 'number' ? n.style.width : size
    const keepH =
      typeof n.style?.height === 'number' ? n.style.height : size
    const base = {
      ...n,
      type: 'mindmapNode' as const,
      data: {
        ...n.data,
        shape: (n.data.shape || 'circle') as NodeShape,
      },
      style: { ...n.style, width: keepW, height: keepH },
    }
    if (!p) return base
    return {
      ...base,
      // New object so React Flow always sees a position change
      position: { x: Math.round(p.x + dx), y: Math.round(p.y + dy) },
    }
  })
}

export function makeMindmapEdge(
  parentId: string,
  childId: string,
): Edge<FlowEdgeData> {
  return {
    id: `e_${parentId}_${childId}`,
    source: parentId,
    target: childId,
    type: 'mindmapEdge',
    sourceHandle: 'center',
    targetHandle: 'center-target',
    data: { edgeStyle: 'solid', arrowType: 'none' },
  }
}

/** Stamp RF nodes as circular mindmap nodes (size by hub vs leaf). */
export function asMindmapNodes(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
): Node<FlowNodeData>[] {
  const hasParent = new Set(edges.map((e) => e.target))
  return nodes.map((n) => {
    const isHub = !hasParent.has(n.id)
    const size = isHub ? 120 : 96
    return {
      ...n,
      type: 'mindmapNode',
      data: {
        ...n.data,
        shape: n.data.shape || 'circle',
      },
      style: {
        ...n.style,
        // Keep user-resized size if present
        width:
          typeof n.style?.width === 'number' ? n.style.width : size,
        height:
          typeof n.style?.height === 'number' ? n.style.height : size,
      },
    }
  })
}

export function asMindmapEdges(
  edges: Edge<FlowEdgeData>[],
): Edge<FlowEdgeData>[] {
  return edges.map((e) => ({
    ...e,
    type: 'mindmapEdge',
    sourceHandle: 'center',
    targetHandle: 'center-target',
    data: {
      ...(e.data ?? {}),
      arrowType: 'none' as const,
      edgeStyle: e.data?.edgeStyle ?? 'solid',
    },
  }))
}

// ─── Parse / serialize ───────────────────────────────────────────────────────

/**
 * Parse Mermaid mindmap source into a parent→child tree on the RF canvas.
 */
export function parseMermaidMindmap(source: string): MindmapParseResult {
  const raw = source.trim()
  const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim()
  const lines = body.split(/\r?\n/)
  if (!lines[0]?.trim().toLowerCase().startsWith('mindmap')) {
    return { nodes: [], edges: [], error: 'Not a mindmap diagram' }
  }

  const styles = parseStyleBlob(raw)
  type StackEntry = { indent: number; id: string }
  const stack: StackEntry[] = []
  const nodes: Node<FlowNodeData>[] = []
  const edges: Edge<FlowEdgeData>[] = []
  const usedIds = new Set<string>()
  const siblingAtDepth = new Map<number, number>()
  let lastNodeId: string | null = null

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.trim()) continue
    if (STYLE_LINE_RE.test(line.trim())) continue

    const iconM = line.trim().match(ICON_LINE_RE)
    if (iconM) {
      // ::icon is a special child line — applies to its parent in the outline
      const iconIndent = indentOf(line)
      let temp = [...stack]
      while (temp.length > 0 && temp[temp.length - 1]!.indent >= iconIndent) {
        temp.pop()
      }
      const targetId = temp.length > 0 ? temp[temp.length - 1]!.id : lastNodeId
      if (targetId) {
        const idx = nodes.findIndex((n) => n.id === targetId)
        if (idx >= 0) {
          nodes[idx] = {
            ...nodes[idx]!,
            data: { ...nodes[idx]!.data, icon: iconM[1]!.trim() },
          }
        }
      }
      continue
    }

    const parsed = parseMindmapNodeText(line)
    if (!parsed) continue

    const indent = indentOf(line)
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop()
    }

    const depth = stack.length
    const sib = siblingAtDepth.get(depth) ?? 0
    siblingAtDepth.set(depth, sib + 1)
    for (const d of [...siblingAtDepth.keys()]) {
      if (d > depth) siblingAtDepth.delete(d)
    }

    const id = uniqueId(parsed.idHint, parsed.label, usedIds)
    const parent = stack.length > 0 ? stack[stack.length - 1]! : null
    const st =
      styles.get(id) ?? (parsed.idHint ? styles.get(parsed.idHint) : undefined)

    nodes.push({
      id,
      type: 'mindmapNode',
      position: { x: 40 + depth * 200, y: 40 + sib * 88 },
      data: {
        label: parsed.label,
        // Radial mindmap UI uses circles; Mermaid shape still serialized from data
        shape: parsed.shape === 'rectangle' ? 'circle' : parsed.shape || 'circle',
        ...(st?.fill ? { fillColor: st.fill } : {}),
        ...(st?.stroke ? { strokeColor: st.stroke } : {}),
        ...(st?.color ? { textColor: st.color } : {}),
      },
      style: { width: 96, height: 96 },
    })
    lastNodeId = id

    if (parent) {
      edges.push(makeMindmapEdge(parent.id, id))
    }

    stack.push({ indent, id })
  }

  if (nodes.length === 0) {
    return { nodes: [], edges: [], error: 'No mindmap nodes found' }
  }
  return { nodes, edges }
}

/**
 * Serialize RF graph back to Mermaid mindmap indent syntax + style sidecar.
 */
export function serializeMindmap(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
): string {
  if (nodes.length === 0) return ''

  const children = new Map<string, string[]>()
  const hasParent = new Set<string>()
  for (const e of edges) {
    hasParent.add(e.target)
    const list = children.get(e.source) ?? []
    list.push(e.target)
    children.set(e.source, list)
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const roots = mindmapRoots(nodes, edges)

  const lines: string[] = ['mindmap']
  const visited = new Set<string>()
  const styleMap: Record<string, StyleBag> = {}

  function walk(id: string, depth: number) {
    if (visited.has(id)) return
    visited.add(id)
    const n = byId.get(id)
    if (!n) return
    const pad = '  '.repeat(depth + 1)
    const shape = (n.data.shape ?? 'rounded') as NodeShape
    lines.push(`${pad}${wrapMindmapLabel(id, n.data.label || 'Node', shape)}`)

    if (n.data.icon) {
      lines.push(`${pad}  ::icon(${n.data.icon})`)
    }

    const bag: StyleBag = {}
    if (n.data.fillColor) bag.fill = n.data.fillColor
    if (n.data.strokeColor) bag.stroke = n.data.strokeColor
    if (n.data.textColor) bag.color = n.data.textColor
    if (Object.keys(bag).length > 0) styleMap[sanitizeMindmapId(id)] = bag

    const kids = (children.get(id) ?? []).slice().sort((a, b) => {
      const na = byId.get(a)
      const nb = byId.get(b)
      if (!na || !nb) return 0
      return na.position.y - nb.position.y || na.position.x - nb.position.x
    })
    for (const kid of kids) walk(kid, depth + 1)
  }

  for (const r of roots) walk(r.id, 0)
  for (const n of nodes) {
    if (!visited.has(n.id) && !n.data.isSubgraph) walk(n.id, 0)
  }

  if (Object.keys(styleMap).length > 0) {
    lines.push(`%% mve-styles: ${JSON.stringify(styleMap)}`)
  }

  return lines.join('\n')
}
