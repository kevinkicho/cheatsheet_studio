/**
 * Layout React Flow nodes + edges using Mermaid's own flowchart engine.
 *
 * Mermaid 11 flowchart geometry (from live SVG):
 *  - Each `g.node` has `transform="translate(cx, cy)"` where (cx, cy) is the
 *    node **center** (dagre layout center).
 *  - Local `getBBox()` is relative to that center (typically −w/2, −h/2).
 *  - Absolute top-left = (cx + bb.x, cy + bb.y); size = (bb.width, bb.height).
 *  - Edges: `path.flowchart-link` with absolute `d` and ids
 *    `{renderId}-L_{source}_{target}_{index}`.
 *
 * We render with the same studio-dark pipeline as sheet cards, measure in a
 * real DOM host, then map positions/sizes/paths onto RF.
 */
import type { Edge, Node } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from './store'
import { renderMermaidSvg } from '@/lib/mermaidTheme'

export type MermaidLayoutBox = {
  id: string
  x: number
  y: number
  width: number
  height: number
  /** Center (Mermaid translate) — useful for port facing */
  cx: number
  cy: number
}

export type MermaidEdgeGeom = {
  source: string
  target: string
  index: number
  /** Absolute SVG path `d` (Mermaid coords) */
  d: string
  label?: string
  labelX?: number
  labelY?: number
  /** First / last points of the path (Mermaid coords) */
  startX: number
  startY: number
  endX: number
  endY: number
}

export type MermaidLayoutResult = {
  nodes: Node<FlowNodeData>[]
  edges: Edge<FlowEdgeData>[]
}

const LAYOUT_PAD = 32

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

/**
 * Mermaid 11 ids: `{renderId}-flowchart-{NodeId}-{index}`
 * e.g. layout-mmd-abc-flowchart-Start-0 → Start
 */
export function mermaidSvgIdToNodeId(rawId: string): string | null {
  if (!rawId) return null
  const m = rawId.match(/flowchart-(.+)-(\d+)$/)
  if (m) return m[1]!
  return null
}

/**
 * Edge path ids: `{renderId}-L_{source}_{target}_{index}`
 * Node ids may contain underscores — split knowing both ends are node ids
 * when possible; otherwise split on last two underscores.
 */
export function mermaidEdgeIdToPair(
  rawId: string,
  knownIds?: Set<string>,
): { source: string; target: string; index: number } | null {
  if (!rawId) return null
  const lIdx = rawId.lastIndexOf('-L_')
  const rest =
    lIdx >= 0
      ? rawId.slice(lIdx + 3)
      : rawId.startsWith('L_')
        ? rawId.slice(2)
        : null
  if (!rest) return null

  const lastUs = rest.lastIndexOf('_')
  if (lastUs <= 0) return null
  const index = Number(rest.slice(lastUs + 1))
  if (!Number.isFinite(index)) return null
  const mid = rest.slice(0, lastUs)

  if (knownIds && knownIds.size > 0) {
    // Try every split of mid into source_target where both are known
    for (const src of knownIds) {
      if (mid === src) continue
      const prefix = src + '_'
      if (mid.startsWith(prefix)) {
        const tgt = mid.slice(prefix.length)
        if (knownIds.has(tgt)) {
          return { source: src, target: tgt, index }
        }
      }
    }
  }

  // Fallback: first underscore split (works when ids have no underscores)
  const firstUs = mid.indexOf('_')
  if (firstUs <= 0) return null
  return {
    source: mid.slice(0, firstUs),
    target: mid.slice(firstUs + 1),
    index,
  }
}

function indexBoxes(boxes: MermaidLayoutBox[]): Map<string, MermaidLayoutBox> {
  const byId = new Map<string, MermaidLayoutBox>()
  for (const b of boxes) {
    byId.set(b.id, b)
    byId.set(sanitizeId(b.id), b)
    byId.set(b.id.replace(/\s+/g, '_'), b)
    byId.set(b.id.replace(/_/g, ' '), b)
  }
  return byId
}

/** Parse translate(tx, ty) from an SVG transform attribute. */
export function parseTranslate(
  transform: string | null | undefined,
): { tx: number; ty: number } | null {
  if (!transform) return null
  const m = transform.match(
    /translate\(\s*([-\d.]+)(?:[,\s]+([-\d.]+))?\s*\)/,
  )
  if (!m) return null
  return { tx: Number(m[1]), ty: Number(m[2] ?? 0) }
}

/**
 * Read first and last absolute points from a Mermaid edge path `d`.
 * Mermaid flowchart edges use absolute M/L/C.
 */
export function pathEndpoints(
  d: string,
): { startX: number; startY: number; endX: number; endY: number } | null {
  const nums = [...d.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map((m) =>
    Number(m[0]),
  )
  if (nums.length < 4) return null
  return {
    startX: nums[0]!,
    startY: nums[1]!,
    endX: nums[nums.length - 2]!,
    endY: nums[nums.length - 1]!,
  }
}

/**
 * Offset an absolute SVG path by (dx, dy). Handles M/L/C/Q/S/T/H/V/A and Z.
 * Relative commands (lowercase) are left unchanged (Mermaid uses absolute).
 */
export function translateSvgPath(d: string, dx: number, dy: number): string {
  if (!d || (dx === 0 && dy === 0)) return d
  const segs = d.match(/[A-Za-z][^A-Za-z]*/g)
  if (!segs) return d

  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return '0'
    const r = Math.round(n * 1000) / 1000
    return String(r)
  }

  return segs
    .map((seg) => {
      const cmd = seg[0]!
      if (cmd === 'Z' || cmd === 'z') return cmd
      const nums = [...seg.slice(1).matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map(
        (m) => Number(m[0]),
      )
      if (nums.length === 0) return seg

      // relative → keep
      if (cmd === cmd.toLowerCase() && cmd !== 'z') {
        return seg
      }

      const out: number[] = []
      if (cmd === 'H') {
        for (const n of nums) out.push(n + dx)
      } else if (cmd === 'V') {
        for (const n of nums) out.push(n + dy)
      } else if (cmd === 'A') {
        for (let i = 0; i + 6 < nums.length; i += 7) {
          out.push(
            nums[i]!,
            nums[i + 1]!,
            nums[i + 2]!,
            nums[i + 3]!,
            nums[i + 4]!,
            nums[i + 5]! + dx,
            nums[i + 6]! + dy,
          )
        }
      } else {
        // M L T Q S C — pairs of x,y
        for (let i = 0; i + 1 < nums.length; i += 2) {
          out.push(nums[i]! + dx, nums[i + 1]! + dy)
        }
      }
      // Compact: "M1,2L3,4" style
      let body = ''
      for (let i = 0; i < out.length; i++) {
        if (i > 0) body += i % 2 === 0 ? ' ' : ','
        body += fmt(out[i]!)
      }
      return cmd + body
    })
    .join('')
}

/**
 * Measure node groups from a Mermaid SVG already in the document.
 * Prefer center translate + local getBBox (Mermaid's own coordinate system).
 * Avoid screen CTM — offscreen / clipped hosts corrupt it.
 */
export function measureMermaidNodesInDom(root: ParentNode): MermaidLayoutBox[] {
  const boxes: MermaidLayoutBox[] = []
  const seen = new Set<string>()
  const groups = root.querySelectorAll('g.node')

  groups.forEach((g) => {
    const rawId = g.getAttribute('id') || ''
    const id =
      g.getAttribute('data-id') ||
      g.getAttribute('data-node-id') ||
      mermaidSvgIdToNodeId(rawId) ||
      ''
    if (!id) return
    const key = sanitizeId(id)
    if (seen.has(key)) return

    const tr = parseTranslate(g.getAttribute('transform'))
    const tx = tr?.tx ?? 0
    const ty = tr?.ty ?? 0
    const gEl = g as unknown as SVGGraphicsElement

    let width = 0
    let height = 0
    let x = 0
    let y = 0
    let cx = tx
    let cy = ty

    // 1) Local getBBox + translate (authoritative in real browsers)
    try {
      if (typeof gEl.getBBox === 'function') {
        const bb = gEl.getBBox()
        if (bb && bb.width > 4 && bb.height > 4) {
          // Mermaid places center at translate; bbox origin is local
          x = tx + bb.x
          y = ty + bb.y
          width = bb.width
          height = bb.height
          cx = tx
          cy = ty
        }
      }
    } catch {
      /* fall through */
    }

    // 2) Shape geometry fallbacks (rect / polygon / path / FO)
    if (width < 4 || height < 4) {
      const rect = g.querySelector(
        'rect.basic, rect.label-container, rect:not([width="0"])',
      )
      if (rect) {
        const rw = Number(rect.getAttribute('width') || 0)
        const rh = Number(rect.getAttribute('height') || 0)
        if (rw > 4 && rh > 4) {
          const rx = Number(rect.getAttribute('x') || 0)
          const ry = Number(rect.getAttribute('y') || 0)
          x = tx + rx
          y = ty + ry
          width = rw
          height = rh
        }
      }
    }

    if (width < 4 || height < 4) {
      const poly = g.querySelector('polygon')
      if (poly) {
        const pts = (poly.getAttribute('points') || '')
          .trim()
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => Number.isFinite(n))
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (let i = 0; i + 1 < pts.length; i += 2) {
          minX = Math.min(minX, pts[i]!)
          maxX = Math.max(maxX, pts[i]!)
          minY = Math.min(minY, pts[i + 1]!)
          maxY = Math.max(maxY, pts[i + 1]!)
        }
        if (Number.isFinite(minX)) {
          x = tx + minX
          y = ty + minY
          width = maxX - minX
          height = maxY - minY
        }
      }
    }

    if (width < 4 || height < 4) {
      const path = g.querySelector('path')
      if (path) {
        try {
          const pbb = (path as unknown as SVGGraphicsElement).getBBox()
          if (pbb && pbb.width > 4 && pbb.height > 4) {
            x = tx + pbb.x
            y = ty + pbb.y
            width = pbb.width
            height = pbb.height
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (width < 4 || height < 4) {
      // Stadium / FO-only: translate is center
      const fo = g.querySelector('foreignObject')
      const foW = fo ? Number(fo.getAttribute('width') || 0) : 0
      const foH = fo ? Number(fo.getAttribute('height') || 0) : 0
      if (foW > 2 && foH > 2) {
        width = foW + 24
        height = foH + 16
        x = tx - width / 2
        y = ty - height / 2
      }
    }

    if (width < 4 || height < 4) return
    seen.add(key)
    boxes.push({
      id,
      x,
      y,
      width,
      height,
      cx,
      cy,
    })
  })

  return boxes
}

/**
 * Extract flowchart edge paths + labels from a mounted Mermaid SVG.
 */
export function measureMermaidEdgesInDom(
  root: ParentNode,
  knownNodeIds?: Set<string>,
): MermaidEdgeGeom[] {
  const edges: MermaidEdgeGeom[] = []
  const pathEls = root.querySelectorAll(
    'path.flowchart-link, .edgePaths path.flowchart-link, .edgePath path',
  )

  pathEls.forEach((p) => {
    const rawId = p.getAttribute('id') || ''
    const d = p.getAttribute('d') || ''
    if (!d) return
    const pair = mermaidEdgeIdToPair(rawId, knownNodeIds)
    if (!pair) return
    const ends = pathEndpoints(d)
    if (!ends) return
    edges.push({
      source: pair.source,
      target: pair.target,
      index: pair.index,
      d,
      ...ends,
    })
  })

  // Edge labels: g.edgeLabel with translate(x, y)
  const labels: { x: number; y: number; text: string }[] = []
  root.querySelectorAll('g.edgeLabel').forEach((g) => {
    const text = (g.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text) return
    const tr = parseTranslate(g.getAttribute('transform'))
    if (!tr) return
    labels.push({ x: tr.tx, y: tr.ty, text })
  })

  // Assign each label to nearest edge midpoint
  for (const lab of labels) {
    let best: MermaidEdgeGeom | null = null
    let bestDist = Infinity
    for (const e of edges) {
      if (e.label) continue
      const mx = (e.startX + e.endX) / 2
      const my = (e.startY + e.endY) / 2
      const dist = Math.hypot(lab.x - mx, lab.y - my)
      if (dist < bestDist) {
        bestDist = dist
        best = e
      }
    }
    if (best && bestDist < 120) {
      best.label = lab.text
      best.labelX = lab.x
      best.labelY = lab.y
    }
  }

  return edges
}

/** Parse from SVG string by mounting into a properly sized offscreen host. */
export function parseMermaidNodeBoxes(svgMarkup: string): MermaidLayoutBox[] {
  if (typeof document === 'undefined') return []
  const host = document.createElement('div')
  host.setAttribute('data-mermaid-layout-measure', 'true')
  // Large enough that getBBox / layout aren't clipped; offscreen for the user
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:2000px;height:2000px;overflow:visible;opacity:0;pointer-events:none;z-index:-1'
  host.innerHTML = svgMarkup
  document.body.appendChild(host)
  try {
    return measureMermaidNodesInDom(host)
  } finally {
    host.remove()
  }
}

export function parseMermaidLayout(svgMarkup: string): {
  boxes: MermaidLayoutBox[]
  edgeGeoms: MermaidEdgeGeom[]
} {
  if (typeof document === 'undefined') return { boxes: [], edgeGeoms: [] }
  const host = document.createElement('div')
  host.setAttribute('data-mermaid-layout-measure', 'true')
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:2000px;height:2000px;overflow:visible;opacity:0;pointer-events:none;z-index:-1'
  host.innerHTML = svgMarkup
  document.body.appendChild(host)
  try {
    const boxes = measureMermaidNodesInDom(host)
    const known = new Set(boxes.map((b) => b.id))
    const edgeGeoms = measureMermaidEdgesInDom(host, known)
    return { boxes, edgeGeoms }
  } finally {
    host.remove()
  }
}

/** Map compass attachment of a point relative to a box → RF port id (4-port default). */
function sidePortId(
  box: MermaidLayoutBox,
  px: number,
  py: number,
): string {
  const dx = px - box.cx
  const dy = py - box.cy
  // Prefer dominant axis
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? 'port-1' : 'port-3' // right / left
  }
  return dy >= 0 ? 'port-2' : 'port-0' // bottom / top
}

export function applyMermaidBoxesToNodes(
  nodes: Node<FlowNodeData>[],
  boxes: MermaidLayoutBox[],
  origin?: { minX: number; minY: number; pad?: number },
): Node<FlowNodeData>[] {
  if (boxes.length === 0) return nodes

  const byId = indexBoxes(boxes)

  let minX = origin?.minX
  let minY = origin?.minY
  if (minX === undefined || minY === undefined) {
    minX = Infinity
    minY = Infinity
    for (const b of boxes) {
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
    }
  }
  if (!Number.isFinite(minX)) minX = 0
  if (!Number.isFinite(minY)) minY = 0
  const pad = origin?.pad ?? LAYOUT_PAD

  let matched = 0
  const next = nodes.map((n) => {
    if (n.data?.isSubgraph) return n
    const label = (n.data?.label as string) || ''
    const box =
      byId.get(n.id) ||
      byId.get(sanitizeId(n.id)) ||
      byId.get(n.id.replace(/\s+/g, '_')) ||
      byId.get(label) ||
      byId.get(sanitizeId(label)) ||
      byId.get(label.replace(/\s+/g, '_'))

    if (!box) return n
    matched++
    const w = Math.max(32, Math.round(box.width))
    const h = Math.max(28, Math.round(box.height))
    return {
      ...n,
      position: {
        x: Math.round(box.x - minX + pad),
        y: Math.round(box.y - minY + pad),
      },
      style: {
        ...n.style,
        width: w,
        height: h,
      },
      width: w,
      height: h,
      // Mermaid connects mid-side — 4 perimeter ports (T/R/B/L)
      data: {
        ...n.data,
        portCount: 4,
        portOnPerimeter: true,
        portRadius: 1,
        portRotation: 0,
      },
    }
  })

  if (matched < nodes.filter((n) => !n.data?.isSubgraph).length) {
    console.warn('[layoutFromMermaid] partial node match', {
      matched,
      total: nodes.length,
      rfIds: nodes.map((n) => n.id),
      boxIds: boxes.map((b) => b.id),
    })
  }

  return next
}

export function applyMermaidEdgesToRf(
  edges: Edge<FlowEdgeData>[],
  edgeGeoms: MermaidEdgeGeom[],
  boxes: MermaidLayoutBox[],
  origin: { minX: number; minY: number; pad?: number },
): Edge<FlowEdgeData>[] {
  if (edgeGeoms.length === 0) return edges

  const pad = origin.pad ?? LAYOUT_PAD
  const dx = -origin.minX + pad
  const dy = -origin.minY + pad
  const byId = indexBoxes(boxes)

  // Bucket geoms by source→target (preserve order for multi-edges)
  const buckets = new Map<string, MermaidEdgeGeom[]>()
  for (const g of edgeGeoms) {
    const key = `${sanitizeId(g.source)}\0${sanitizeId(g.target)}`
    const list = buckets.get(key) ?? []
    list.push(g)
    buckets.set(key, list)
  }
  // Also try raw ids
  for (const g of edgeGeoms) {
    const key = `${g.source}\0${g.target}`
    if (!buckets.has(key)) buckets.set(key, [g])
  }

  const used = new Set<MermaidEdgeGeom>()

  return edges.map((e) => {
    const keys = [
      `${sanitizeId(e.source)}\0${sanitizeId(e.target)}`,
      `${e.source}\0${e.target}`,
    ]
    let geom: MermaidEdgeGeom | undefined
    for (const key of keys) {
      const list = buckets.get(key)
      if (!list) continue
      geom = list.find((g) => !used.has(g))
      if (geom) break
    }
    if (!geom) return e
    used.add(geom)

    const path = translateSvgPath(geom.d, dx, dy)
    const srcBox =
      byId.get(e.source) || byId.get(sanitizeId(e.source))
    const tgtBox =
      byId.get(e.target) || byId.get(sanitizeId(e.target))

    const sourceHandle = srcBox
      ? sidePortId(srcBox, geom.startX, geom.startY)
      : e.sourceHandle
    const targetHandle = tgtBox
      ? sidePortId(tgtBox, geom.endX, geom.endY)
      : e.targetHandle

    const labelX =
      geom.labelX !== undefined ? geom.labelX + dx : undefined
    const labelY =
      geom.labelY !== undefined ? geom.labelY + dy : undefined

    return {
      ...e,
      sourceHandle: sourceHandle ?? e.sourceHandle,
      targetHandle: targetHandle ?? e.targetHandle,
      label: geom.label ?? e.label,
      data: {
        ...(e.data ?? {}),
        mermaidPath: path,
        mermaidLabelX: labelX,
        mermaidLabelY: labelY,
      } as FlowEdgeData,
    }
  })
}

function layoutOrigin(boxes: MermaidLayoutBox[]): {
  minX: number
  minY: number
  pad: number
} {
  let minX = Infinity
  let minY = Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
  }
  if (!Number.isFinite(minX)) minX = 0
  if (!Number.isFinite(minY)) minY = 0
  return { minX, minY, pad: LAYOUT_PAD }
}

/**
 * Render with studio Mermaid (same as sheet card) and place RF nodes + edges
 * on those coordinates / paths.
 */
export async function layoutWithMermaid(
  source: string,
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
): Promise<MermaidLayoutResult> {
  const text = source.trim()
  if (!text || nodes.length === 0) return { nodes, edges }
  if (typeof document === 'undefined') return { nodes, edges }

  try {
    const id = `layout-mmd-${Date.now().toString(36)}`
    const { svg } = await renderMermaidSvg({
      id,
      source: text,
      theme: 'dark',
      studioDark: true,
    })
    const { boxes, edgeGeoms } = parseMermaidLayout(svg)
    if (boxes.length === 0) {
      console.warn('[layoutFromMermaid] no boxes from Mermaid SVG')
      return { nodes, edges }
    }
    const origin = layoutOrigin(boxes)
    const laidNodes = applyMermaidBoxesToNodes(nodes, boxes, origin)
    const laidEdges = applyMermaidEdgesToRf(edges, edgeGeoms, boxes, origin)
    return { nodes: laidNodes, edges: laidEdges }
  } catch (e) {
    console.warn('[layoutFromMermaid] failed', e)
    return { nodes, edges }
  }
}

/**
 * Nodes-only layout (backward compatible). Prefer layoutWithMermaid when edges
 * are available so edge paths match the sheet card.
 */
export async function layoutNodesWithMermaid(
  source: string,
  nodes: Node<FlowNodeData>[],
): Promise<Node<FlowNodeData>[]> {
  const { nodes: next } = await layoutWithMermaid(source, nodes, [])
  return next
}
