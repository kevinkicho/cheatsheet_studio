/**
 * Free-form process diagram snapshot — editor is source of truth.
 *
 * Mermaid source alone re-layouts on render (loses free positions / editor
 * edge routing). Cards and export paint this snapshot with the same geometry
 * as the interactive editor (node boxes + Mermaid-style edge clip/basis).
 */
import type { Edge, Node } from '@xyflow/react'
import type {
  CurveStyle,
  Direction,
  EdgeMarkerKind,
  EdgeStyle,
  FlowEdgeData,
  FlowNodeData,
  NodeShape,
} from '@/vendor/mermaid-visual-editor/lib/store'
import { resolveEdgeMarkers } from '@/vendor/mermaid-visual-editor/lib/store'
import {
  nodeBoxFromRf,
  siblingIndexForEdge,
} from '@/vendor/mermaid-visual-editor/lib/mermaidEdgeRoute'
import {
  buildEdgePath,
  samplePathPoints,
} from '@/vendor/mermaid-visual-editor/lib/edgePath'
import { getLiveEdgePaint } from '@/vendor/mermaid-visual-editor/lib/liveEdgePaint'
import {
  MINDMAP_FONT_SIZE,
  mindmapLabelLayout,
  straightMindmapPath,
} from '@/vendor/mermaid-visual-editor/lib/mindmap'
import { fitLabelFontPx } from '@/vendor/mermaid-visual-editor/lib/fitNodeLabel'

export const PROCESS_FLOW_VERSION = 1 as const

export type ProcessFlowNodeSnap = {
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string
  shape: NodeShape
  fillColor?: string
  strokeColor?: string
  textColor?: string
}

export type ProcessFlowEdgeSnap = {
  id: string
  source: string
  target: string
  label?: string
  edgeStyle?: EdgeStyle
  startMarker?: EdgeMarkerKind
  endMarker?: EdgeMarkerKind
  strokeColor?: string
  /** Exact path from Mermaid layout or live router (editor truth). */
  path?: string
  labelX?: number
  labelY?: number
  /** User bend points along the edge (same space as nodes). */
  waypoints?: { id: string; x: number; y: number }[]
  /** Port ids when user plugged the connection. */
  sourceHandle?: string | null
  targetHandle?: string | null
  /** Path should anchor to ports (not auto face-attach). */
  manualConnect?: boolean
  /** Label drag offset from auto mid-path (flow units). */
  labelOffsetX?: number
  labelOffsetY?: number
}

export type ProcessFlowSnapshot = {
  v: typeof PROCESS_FLOW_VERSION
  direction: Direction
  curveStyle: CurveStyle
  /** Match editor multi-edge U-turn spacing */
  multiEdgeSpacing?: number
  /**
   * Which Process chip produced this snapshot. Optional for older cards;
   * mind maps and flowcharts both paint via ProcessFlowView.
   */
  diagramKind?: 'flowchart' | 'mindmap'
  nodes: ProcessFlowNodeSnap[]
  edges: ProcessFlowEdgeSnap[]
  /** Content bounding box (for viewBox) */
  width: number
  height: number
}

const PAD = 24
const STUDIO = {
  fill: '#27272a',
  stroke: '#71717a',
  text: '#f4f4f5',
  edge: '#a1a1aa',
  labelBg: '#3f3f46',
  bg: '#12141a',
} as const

/** Coerce RF style/size fields (number or "220px") to positive px. */
function asPx(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

/**
 * Resolve node box after free-transform resize.
 *
 * RF exposes size in three places that can disagree after NodeResizer:
 * - `style.width/height` — sometimes lags or stays square
 * - `width/height` — RF node props (what MindmapNode paints)
 * - `measured` — DOM measure (can lag one frame)
 *
 * Screenshot 015231: editor showed tall ellipse "New topic", canvas stayed
 * circle — capture preferred stale square `style` over live non-square dims.
 *
 * Strategy:
 * - If style and live (node|measured) disagree on **aspect ratio**, use live
 *   (matches editor paint for circle→ellipse morphs).
 * - If aspects agree, use the **larger area** (uniform enlarge over stale small).
 */
function nodeSize(n: Node<FlowNodeData>): { w: number; h: number } {
  const measured = (
    n as Node<FlowNodeData> & {
      measured?: { width?: number; height?: number }
    }
  ).measured
  const styleW = asPx(n.style?.width)
  const styleH = asPx(n.style?.height)
  const nodeW = asPx(n.width)
  const nodeH = asPx(n.height)
  const measuredW = asPx(measured?.width)
  const measuredH = asPx(measured?.height)

  // Live size = what the interactive editor paints (NodeProps width/height)
  const liveW = nodeW ?? measuredW
  const liveH = nodeH ?? measuredH
  const styleOk = styleW != null && styleH != null
  const liveOk = liveW != null && liveH != null

  let w: number
  let h: number
  if (styleOk && liveOk) {
    const styleAspect = styleW! / Math.max(1e-6, styleH!)
    const liveAspect = liveW! / Math.max(1e-6, liveH!)
    const aspectDiff = Math.abs(Math.log(styleAspect / liveAspect))
    if (aspectDiff > 0.05) {
      // Free morph (ellipse vs square) — trust live RF dimensions
      w = liveW!
      h = liveH!
    } else if (styleW! * styleH! >= liveW! * liveH!) {
      // Same aspect; prefer larger box (uniform scale-up)
      w = styleW!
      h = styleH!
    } else {
      w = liveW!
      h = liveH!
    }
  } else if (liveOk) {
    w = liveW!
    h = liveH!
  } else if (styleOk) {
    w = styleW!
    h = styleH!
  } else {
    w = liveW ?? styleW ?? measuredW ?? 140
    h = liveH ?? styleH ?? measuredH ?? 48
  }
  return { w: Math.max(32, w), h: Math.max(28, h) }
}

/** Capture RF store graph as a portable snapshot (flowchart). */
export function captureProcessFlow(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
  opts: {
    direction?: Direction
    curveStyle?: CurveStyle
    multiEdgeSpacing?: number
    diagramKind?: 'flowchart' | 'mindmap'
  } = {},
): ProcessFlowSnapshot | null {
  const plain = nodes.filter((n) => !n.data?.isSubgraph)
  if (plain.length === 0) return null

  const snaps: ProcessFlowNodeSnap[] = plain.map((n) => {
    const { w, h } = nodeSize(n)
    return {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: w,
      height: h,
      label: String(n.data?.label ?? n.id),
      shape: (n.data?.shape ?? 'rectangle') as NodeShape,
      fillColor:
        typeof n.data?.fillColor === 'string' ? n.data.fillColor : undefined,
      strokeColor:
        typeof n.data?.strokeColor === 'string' ? n.data.strokeColor : undefined,
      textColor:
        typeof n.data?.textColor === 'string' ? n.data.textColor : undefined,
    }
  })

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of snaps) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 200
    maxY = 200
  }

  // Normalize to origin + pad for stable viewBox
  const ox = minX - PAD
  const oy = minY - PAD
  const normalized = snaps.map((n) => ({
    ...n,
    x: n.x - ox,
    y: n.y - oy,
  }))

  // Precompute live routes so snapshot matches editor (incl. Mermaid paths)
  const centers = new Map(
    normalized.map((n) => [
      n.id,
      { cx: n.x + n.width / 2, cy: n.y + n.height / 2 },
    ]),
  )
  const edgeRefs = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }))

  const byId = new Map(plain.map((n) => [n.id, n]))

  const edgeSnaps: ProcessFlowEdgeSnap[] = edges.map((e) => {
    const { start, end } = resolveEdgeMarkers(e.data)
    const sn = normalized.find((n) => n.id === e.source)
    const tn = normalized.find((n) => n.id === e.target)
    const srcNode = byId.get(e.source)
    const tgtNode = byId.get(e.target)

    // Prefer the exact path FlowEdge is painting (editor truth).
    // Fall back to buildEdgePath when the editor is not mounted.
    let path: string | undefined
    let labelX: number | undefined
    let labelY: number | undefined
    const wps = e.data?.waypoints
    // Waypoints must live in the same space as normalized nodes (subtract ox/oy)
    const shiftedWps = (wps ?? []).map((w) => ({
      ...w,
      x: w.x - ox,
      y: w.y - oy,
    }))

    const live = getLiveEdgePaint(e.id)
    if (live?.path) {
      // Live paint is in absolute RF flow coords — shift into snapshot space
      path = shiftSvgPath(live.path, -ox, -oy)
      labelX = live.labelX - ox
      labelY = live.labelY - oy
    } else if (sn && tn) {
      const isMindmapEdge =
        opts.diagramKind === 'mindmap' || e.type === 'mindmapEdge'
      if (isMindmapEdge) {
        // Straight radial spoke (same as MindmapEdge editor)
        const routed = straightMindmapPath(sn, tn)
        path = routed.path
        labelX = routed.labelX
        labelY = routed.labelY
      } else {
        const siblingIndex = siblingIndexForEdge(
          e.id,
          e.source,
          e.target,
          edgeRefs,
          centers,
        )
        const pairCount = edgeRefs.filter(
          (x) =>
            (x.source === e.source && x.target === e.target) ||
            (x.source === e.target && x.target === e.source),
        ).length
        const manual = e.data?.manualConnect === true
        const routed = buildEdgePath({
          source: nodeBoxFromRf(sn.x, sn.y, sn.width, sn.height, sn.shape),
          target: nodeBoxFromRf(tn.x, tn.y, tn.width, tn.height, tn.shape),
          waypoints: shiftedWps.length > 0 ? shiftedWps : undefined,
          siblingIndex,
          siblingSpacing: opts.multiEdgeSpacing ?? 14,
          curveStyle: opts.curveStyle ?? 'basis',
          isMultiEdge: pairCount > 1,
          manualConnect: manual,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
          sourceData: srcNode?.data,
          targetData: tgtNode?.data,
        })
        path = routed.path
        const offX = Number(e.data?.labelOffsetX) || 0
        const offY = Number(e.data?.labelOffsetY) || 0
        labelX = routed.labelX + offX
        labelY = routed.labelY + offY
      }
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
      edgeStyle: e.data?.edgeStyle,
      startMarker: start,
      endMarker: end,
      strokeColor: e.data?.strokeColor,
      path,
      labelX,
      labelY,
      waypoints: shiftedWps.length > 0 ? shiftedWps : undefined,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      manualConnect: e.data?.manualConnect === true ? true : undefined,
      labelOffsetX: Number(e.data?.labelOffsetX) || undefined,
      labelOffsetY: Number(e.data?.labelOffsetY) || undefined,
    }
  })

  // Expand bounds so reverse U-turn pipes aren't clipped on the card
  let contentMinX = minX - ox
  let contentMinY = minY - oy
  let contentMaxX = maxX - ox
  let contentMaxY = maxY - oy
  for (const e of edgeSnaps) {
    if (!e.path) continue
    for (const p of samplePathPoints(e.path)) {
      contentMinX = Math.min(contentMinX, p.x)
      contentMinY = Math.min(contentMinY, p.y)
      contentMaxX = Math.max(contentMaxX, p.x)
      contentMaxY = Math.max(contentMaxY, p.y)
    }
  }
  const edgePad = 16
  contentMinX -= edgePad
  contentMinY -= edgePad
  contentMaxX += edgePad
  contentMaxY += edgePad

  // Shift so content stays in positive viewBox
  const shiftX = contentMinX < 0 ? -contentMinX : 0
  const shiftY = contentMinY < 0 ? -contentMinY : 0
  const finalNodes =
    shiftX || shiftY
      ? normalized.map((n) => ({
          ...n,
          x: n.x + shiftX,
          y: n.y + shiftY,
        }))
      : normalized
  const finalEdges =
    shiftX || shiftY
      ? edgeSnaps.map((e) => ({
          ...e,
          path: e.path
            ? shiftSvgPath(e.path, shiftX, shiftY)
            : e.path,
          labelX:
            e.labelX != null ? e.labelX + shiftX : e.labelX,
          labelY:
            e.labelY != null ? e.labelY + shiftY : e.labelY,
          waypoints: e.waypoints?.map((w) => ({
            ...w,
            x: w.x + shiftX,
            y: w.y + shiftY,
          })),
          // offsets are relative — keep as-is
          labelOffsetX: e.labelOffsetX,
          labelOffsetY: e.labelOffsetY,
        }))
      : edgeSnaps

  return {
    v: PROCESS_FLOW_VERSION,
    direction: opts.direction ?? 'TD',
    curveStyle: opts.curveStyle ?? 'basis',
    multiEdgeSpacing: opts.multiEdgeSpacing ?? 14,
    diagramKind: opts.diagramKind,
    nodes: finalNodes,
    edges: finalEdges,
    width: Math.ceil(contentMaxX - contentMinX + shiftX),
    height: Math.ceil(contentMaxY - contentMinY + shiftY),
  }
}

/** Translate an SVG path by (dx, dy) — numbers only (our pipe paths). */
function shiftSvgPath(d: string, dx: number, dy: number): string {
  if (!dx && !dy) return d
  let out = ''
  const re = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi
  let m: RegExpExecArray | null
  let coordIndex = 0
  let last = 0
  while ((m = re.exec(d))) {
    const n = Number(m[0])
    const isX = coordIndex % 2 === 0
    const next = isX ? n + dx : n + dy
    out += d.slice(last, m.index) + (Math.round(next * 10) / 10).toString()
    last = m.index + m[0].length
    coordIndex++
  }
  out += d.slice(last)
  return out
}

export function isProcessFlowSnapshot(v: unknown): v is ProcessFlowSnapshot {
  if (!v || typeof v !== 'object') return false
  const o = v as ProcessFlowSnapshot
  return (
    o.v === 1 &&
    Array.isArray(o.nodes) &&
    Array.isArray(o.edges) &&
    typeof o.width === 'number' &&
    typeof o.height === 'number'
  )
}

/**
 * Restore free-form snapshot into React Flow nodes/edges so the interactive
 * editor matches the canvas card (positions, sizes, edge paths, markers).
 */
export function processFlowToRf(snap: ProcessFlowSnapshot): {
  nodes: Node<FlowNodeData>[]
  edges: Edge<FlowEdgeData>[]
} {
  const nodes: Node<FlowNodeData>[] = snap.nodes.map((n) => ({
    id: n.id,
    type: 'flowNode',
    position: { x: n.x, y: n.y },
    width: n.width,
    height: n.height,
    style: { width: n.width, height: n.height },
    data: {
      label: n.label,
      shape: n.shape,
      fillColor: n.fillColor,
      strokeColor: n.strokeColor,
      textColor: n.textColor,
      portCount: 4,
      portOnPerimeter: true,
      portRadius: 1,
      portRotation: 0,
    },
  }))

  const isMm = snap.diagramKind === 'mindmap'
  const edges: Edge<FlowEdgeData>[] = snap.edges.map((e) => {
    const { start, end } = resolveEdgeMarkers({
      startMarker: e.startMarker,
      endMarker: e.endMarker ?? (isMm ? 'none' : 'arrow'),
      edgeStyle: e.edgeStyle,
    })
    if (isMm) {
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: 'center',
        targetHandle: 'center-target',
        type: 'mindmapEdge',
        label: e.label,
        reconnectable: false,
        data: {
          edgeStyle: e.edgeStyle ?? 'solid',
          startMarker: 'none',
          endMarker: 'none',
          strokeColor: e.strokeColor,
        },
      }
    }
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      // Prefer null over undefined so RF keeps the handle id on restore
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      type: 'flowEdge',
      label: e.label,
      reconnectable: true,
      data: {
        edgeStyle: e.edgeStyle ?? 'solid',
        startMarker: start,
        endMarker: end,
        strokeColor: e.strokeColor,
        // Paths are rebuilt live from positions; keep waypoints + plug flag
        waypoints: e.waypoints,
        manualConnect: e.manualConnect === true ? true : undefined,
        labelOffsetX: e.labelOffsetX,
        labelOffsetY: e.labelOffsetY,
      },
    }
  })

  return { nodes, edges }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shapePath(
  shape: NodeShape,
  x: number,
  y: number,
  w: number,
  h: number,
): { d?: string; rect?: boolean; rx?: number } {
  const cx = x + w / 2
  const cy = y + h / 2
  switch (shape) {
    case 'diamond':
      return {
        d: `M${cx},${y} L${x + w},${cy} L${cx},${y + h} L${x},${cy} Z`,
      }
    case 'stadium':
    case 'rounded':
      return { rect: true, rx: Math.min(h / 2, w / 2, shape === 'stadium' ? 999 : 8) }
    case 'circle':
    case 'double-circle': {
      // True ellipse when w≠h (free-transform morph). Do NOT force min(w,h)
      // square — that made canvas paint a circle after user stretched to oval.
      const rx = Math.max(1, w / 2)
      const ry = Math.max(1, h / 2)
      return {
        d: `M${cx},${y} A${rx},${ry} 0 1 1 ${cx - 0.01},${y} Z`,
      }
    }
    case 'hexagon': {
      const inset = w * 0.2
      return {
        d: `M${x + inset},${y} L${x + w - inset},${y} L${x + w},${cy} L${x + w - inset},${y + h} L${x + inset},${y + h} L${x},${cy} Z`,
      }
    }
    case 'bang':
    case 'asymmetric': {
      // Star-ish explode (matches mindmap bang underlay proportions)
      const pts = [
        [0.5, 0.02],
        [0.58, 0.22],
        [0.8, 0.12],
        [0.7, 0.32],
        [0.98, 0.4],
        [0.72, 0.5],
        [0.95, 0.7],
        [0.68, 0.65],
        [0.75, 0.95],
        [0.5, 0.78],
        [0.25, 0.95],
        [0.32, 0.65],
        [0.05, 0.7],
        [0.28, 0.5],
        [0.02, 0.4],
        [0.3, 0.32],
        [0.2, 0.12],
        [0.42, 0.22],
      ]
      const d = pts
        .map(
          ([px, py], i) =>
            `${i === 0 ? 'M' : 'L'}${x + px! * w},${y + py! * h}`,
        )
        .join(' ')
      return { d: `${d} Z` }
    }
    case 'cloud': {
      // Soft cloud silhouette (card-side approximation of Mermaid cloud)
      const r = Math.min(w, h) * 0.18
      return {
        d:
          `M${x + r},${y + h * 0.55}` +
          ` a${r},${r} 0 0 1 ${r * 0.9},${-r * 1.1}` +
          ` a${r * 1.2},${r * 1.2} 0 0 1 ${w * 0.35},${-r * 0.4}` +
          ` a${r * 1.1},${r * 1.1} 0 0 1 ${w * 0.28},${r * 0.9}` +
          ` a${r * 0.9},${r * 0.9} 0 0 1 ${-r * 0.2},${h * 0.35}` +
          ` a${r * 1.1},${r * 0.9} 0 0 1 ${-w * 0.35},${r * 0.15}` +
          ` a${r},${r} 0 0 1 ${-w * 0.28},${-r * 0.2}` +
          ` a${r * 0.85},${r * 0.85} 0 0 1 ${-r * 0.3},${-h * 0.25} Z`,
      }
    }
    default:
      return { rect: true, rx: 5 }
  }
}

function markerEndId(edgeId: string, kind: EdgeMarkerKind): string | null {
  if (kind === 'none') return null
  return `pf-m-${edgeId}-end-${kind}`
}

/**
 * Render snapshot to a standalone SVG string (sheet cards + print export).
 * Geometry matches interactive editor (routeFlowchartEdge).
 */
export function processFlowToSvg(
  snap: ProcessFlowSnapshot,
  opts?: { preserveAspect?: 'meet' | 'none'; multiEdgeSpacing?: number },
): string {
  const preserveAspect = opts?.preserveAspect ?? 'meet'
  const byId = new Map(snap.nodes.map((n) => [n.id, n]))
  const allEdges = snap.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }))

  const defs: string[] = []
  const edgeEls: string[] = []
  const labelEls: string[] = []

  const nodeCenters = new Map(
    snap.nodes.map((n) => [
      n.id,
      { cx: n.x + n.width / 2, cy: n.y + n.height / 2 },
    ]),
  )

  for (const e of snap.edges) {
    const sn = byId.get(e.source)
    const tn = byId.get(e.target)
    if (!sn || !tn) continue

    // Always prefer baked path from capture (editor truth). Rebuild only if missing.
    let path = e.path
    let labelX = e.labelX
    let labelY = e.labelY
    if (!path) {
      if (snap.diagramKind === 'mindmap') {
        const routed = straightMindmapPath(sn, tn)
        path = routed.path
        labelX = routed.labelX
        labelY = routed.labelY
      } else {
        const siblingIndex = siblingIndexForEdge(
          e.id,
          e.source,
          e.target,
          allEdges,
          nodeCenters,
        )
        const pairCount = allEdges.filter(
          (x) =>
            (x.source === e.source && x.target === e.target) ||
            (x.source === e.target && x.target === e.source),
        ).length
        const spacing =
          opts?.multiEdgeSpacing ?? snap.multiEdgeSpacing ?? 14
        const routed = buildEdgePath({
          source: nodeBoxFromRf(sn.x, sn.y, sn.width, sn.height, sn.shape),
          target: nodeBoxFromRf(tn.x, tn.y, tn.width, tn.height, tn.shape),
          waypoints: e.waypoints,
          siblingIndex,
          siblingSpacing: spacing,
          curveStyle: snap.curveStyle ?? 'basis',
          isMultiEdge: pairCount > 1,
          manualConnect: e.manualConnect === true,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })
        path = routed.path
        labelX = routed.labelX
        labelY = routed.labelY
      }
    }

    const stroke = e.strokeColor || STUDIO.edge
    const { start, end } = resolveEdgeMarkers({
      startMarker: e.startMarker,
      endMarker: e.endMarker,
      edgeStyle: e.edgeStyle,
    })
    let dash = ''
    let sw = 1.5
    if (e.edgeStyle === 'dashed') dash = ' stroke-dasharray="7 4"'
    if (e.edgeStyle === 'thick') sw = 3

    const mid = markerEndId(e.id, end)
    if (end === 'arrow') {
      defs.push(
        `<marker id="${mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${stroke}"/></marker>`,
      )
    } else if (end === 'circle') {
      defs.push(
        `<marker id="${mid}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto"><circle cx="6" cy="6" r="3.5" fill="none" stroke="${stroke}" stroke-width="1.5"/></marker>`,
      )
    } else if (end === 'cross') {
      defs.push(
        `<marker id="${mid}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto"><g stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></g></marker>`,
      )
    }

    // Mindmap spokes: slightly thicker so they match the interactive editor
    if (snap.diagramKind === 'mindmap') sw = Math.max(sw, 2.25)
    const markerAttr = mid ? ` marker-end="url(#${mid})"` : ''
    edgeEls.push(
      `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash}${markerAttr}/>`,
    )

    if (e.label && labelX != null && labelY != null) {
      labelEls.push(
        `<g transform="translate(${labelX},${labelY})">` +
          `<rect x="${-Math.max(14, e.label.length * 4)}" y="-9" width="${Math.max(28, e.label.length * 8)}" height="18" rx="4" fill="${STUDIO.labelBg}" stroke="${STUDIO.stroke}" stroke-width="0.75"/>` +
          `<text text-anchor="middle" dominant-baseline="central" fill="${STUDIO.text}" font-family="trebuchet ms,verdana,arial,sans-serif" font-size="12">${esc(e.label)}</text>` +
          `</g>`,
      )
    }
    void start
  }

  const isMm = snap.diagramKind === 'mindmap'
  const nodeEls: string[] = []
  for (const n of snap.nodes) {
    const fill = n.fillColor || STUDIO.fill
    const stroke = n.strokeColor || STUDIO.stroke
    const text = n.textColor || STUDIO.text
    const sp = shapePath(n.shape, n.x, n.y, n.width, n.height)
    if (sp.d) {
      nodeEls.push(
        `<path d="${sp.d}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
      )
    } else {
      nodeEls.push(
        `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${sp.rx ?? 5}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
      )
    }
    const cx = n.x + n.width / 2
    const cy = n.y + n.height / 2
    // Same layout as MindmapNode (mindmapLabelLayout) so canvas === editor paint
    let lines: string[]
    let nodeFont: number
    if (isMm) {
      const layout = mindmapLabelLayout(n.label, n.width, n.height)
      lines = layout.lines
      nodeFont = fitLabelFontPx(n.label, n.width, n.height, {
        lines,
        padX: layout.pad,
        padY: layout.pad,
        minPx: layout.minPx,
        maxPx: layout.maxPx,
      })
    } else {
      lines = [n.label]
      const boxSide = Math.min(n.width, n.height)
      nodeFont = fitLabelFontPx(n.label, n.width, n.height, {
        lines,
        padX: 8,
        padY: 6,
        minPx: 13,
        maxPx: Math.max(32, Math.floor(boxSide * 0.4)),
      })
    }
    const lineH = nodeFont * 1.15
    const startY = cy - ((lines.length - 1) * lineH) / 2
    lines.forEach((line, i) => {
      nodeEls.push(
        `<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle" dominant-baseline="central" fill="${text}" font-family="trebuchet ms,verdana,arial,sans-serif" font-size="${nodeFont}" font-weight="500">${esc(line)}</text>`,
      )
    })
  }
  void MINDMAP_FONT_SIZE

  const w = Math.max(40, snap.width)
  const h = Math.max(40, snap.height)
  // meet = uniform scale (even horizontal/vertical); none = stretch with card
  const par = preserveAspect === 'none' ? 'none' : 'xMidYMid meet'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" ` +
    `preserveAspectRatio="${par}" style="display:block;width:100%;height:100%;background:transparent">` +
    `<defs>${defs.join('')}</defs>` +
    `<g class="edges">${edgeEls.join('')}</g>` +
    `<g class="labels">${labelEls.join('')}</g>` +
    `<g class="nodes">${nodeEls.join('')}</g>` +
    `</svg>`
  )
}
