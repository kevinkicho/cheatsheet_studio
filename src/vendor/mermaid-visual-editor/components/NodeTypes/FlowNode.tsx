import type { CSSProperties, ReactNode } from 'react'
import {
  Handle,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFlowStore, type FlowNodeData, type NodeShape } from '../../lib/store'
import {
  computePortPlacements,
  getPortLayout,
  type PortPlacement,
} from '../../lib/portLayout'
import { mindmapLabelLayout } from '../../lib/mindmap'
import { fitLabelFontPx } from '../../lib/fitNodeLabel'

// ─── SVG shape paths (viewBox 0 0 200 100, preserveAspectRatio="none") ────────
// All points are in the 200×100 coordinate space so they stretch with the node.

function SvgHexagon({
  fill,
  stroke,
  sw,
}: {
  fill: string
  stroke: string
  sw: number
}) {
  return (
    <polygon
      points="50,2 150,2 198,50 150,98 50,98 2,50"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
    />
  )
}

function SvgParallelogram({
  fill,
  stroke,
  sw,
}: {
  fill: string
  stroke: string
  sw: number
}) {
  return (
    <polygon
      points="28,2 198,2 172,98 2,98"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
    />
  )
}

function SvgParallelogramAlt({
  fill,
  stroke,
  sw,
}: {
  fill: string
  stroke: string
  sw: number
}) {
  return (
    <polygon
      points="2,2 172,2 198,98 28,98"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
    />
  )
}

function SvgTrapezoid({
  fill,
  stroke,
  sw,
}: {
  fill: string
  stroke: string
  sw: number
}) {
  // Wider at top
  return (
    <polygon
      points="2,2 198,2 175,98 25,98"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
    />
  )
}

function SvgTrapezoidAlt({
  fill,
  stroke,
  sw,
}: {
  fill: string
  stroke: string
  sw: number
}) {
  // Wider at bottom
  return (
    <polygon
      points="25,2 175,2 198,98 2,98"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
    />
  )
}

function SvgAsymmetric({
  fill,
  stroke,
  sw,
}: {
  fill: string
  stroke: string
  sw: number
}) {
  return (
    <polygon
      points="2,2 178,2 198,50 178,98 2,98"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
    />
  )
}

function SvgCylinder({
  fill,
  stroke,
  sw,
}: {
  fill: string
  stroke: string
  sw: number
}) {
  // Database cylinder: rect body + ellipse caps. viewBox="0 0 200 120"
  return (
    <>
      <rect x={sw} y={18} width={200 - sw * 2} height={84} fill={fill} stroke={stroke} strokeWidth={sw} />
      {/* Top cap */}
      <ellipse cx={100} cy={18} rx={100 - sw} ry={16} fill={fill} stroke={stroke} strokeWidth={sw} />
      {/* Bottom cap outline only */}
      <ellipse cx={100} cy={102} rx={100 - sw} ry={16} fill={fill} stroke={stroke} strokeWidth={sw} />
    </>
  )
}

function SvgDiamond({
  fill,
  stroke,
  sw,
}: {
  fill: string
  stroke: string
  sw: number
}) {
  // Vertices at cardinal midpoints of 200×100 viewBox — aligns with React Flow handles
  return (
    <polygon
      points="100,2 198,50 100,98 2,50"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
    />
  )
}

// ─── Shape → SVG renderer map ─────────────────────────────────────────────────
type SvgShapeRenderer = (props: { fill: string; stroke: string; sw: number }) => ReactNode

const SVG_RENDERERS: Partial<Record<NodeShape, SvgShapeRenderer>> = {
  diamond: SvgDiamond,
  hexagon: SvgHexagon,
  parallelogram: SvgParallelogram,
  'parallelogram-alt': SvgParallelogramAlt,
  trapezoid: SvgTrapezoid,
  'trapezoid-alt': SvgTrapezoidAlt,
  asymmetric: SvgAsymmetric,
  cylinder: SvgCylinder,
}

const IS_SVG_SHAPE = new Set<NodeShape>(Object.keys(SVG_RENDERERS) as NodeShape[])

// ─── Radial / perimeter connection ports ─────────────────────────────────────
// One Handle per port (id = port-N). ConnectionMode.Loose = source+target.
// Center with calc() — avoid transform (breaks RF connection-line origin).
const PORT_SIZE_SEL = 10

function NodeHandles({
  selected,
  ports,
  mindmapCenter,
}: {
  selected: boolean
  ports: PortPlacement[]
  /** Mind map: center dual handles for straight radial spokes */
  mindmapCenter?: boolean
}) {
  // Ports must stay hit-testable when not selected so you can drop a wire
  // onto another node without selecting it first. Only the chrome is hidden.
  // Larger hit target when unselected so the port the user aims at is used
  // (not a different face via auto snap).
  const size = selected ? PORT_SIZE_SEL : 16
  const half = size / 2
  if (mindmapCenter) {
    // Large center hit targets — MindmapEdge draws from geometric centers
    const hit = selected ? 28 : 40
    const centerStyle: CSSProperties = {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: hit,
      height: hit,
      minWidth: hit,
      minHeight: hit,
      borderRadius: '50%',
      background: selected ? 'rgba(56, 189, 248, 0.35)' : 'transparent',
      border: selected ? '2px solid #38bdf8' : '2px solid transparent',
      opacity: selected ? 1 : 0.01,
      zIndex: 5,
      pointerEvents: 'auto',
      cursor: 'crosshair',
    }
    return (
      <>
        <Handle
          id="center"
          type="source"
          position={Position.Top}
          className="!border-0"
          isConnectable
          title="Connect"
          style={centerStyle}
        />
        <Handle
          id="center-target"
          type="target"
          position={Position.Top}
          className="!border-0"
          isConnectable
          title="Connect"
          style={{ ...centerStyle, zIndex: 4 }}
        />
      </>
    )
  }
  return (
    <>
      {ports.map((p) => (
        <Handle
          key={p.id}
          id={p.id}
          type="source"
          position={p.position}
          className="flow-port"
          isConnectable
          title={`Port ${p.index + 1}`}
          style={
            {
              ['--port-left' as string]: `calc(${p.left} - ${half}px)`,
              ['--port-top' as string]: `calc(${p.top} - ${half}px)`,
              width: size,
              height: size,
              minWidth: size,
              minHeight: size,
              maxWidth: size,
              maxHeight: size,
              borderRadius: '50%',
              background: selected ? '#38bdf8' : 'transparent',
              border: selected ? '2px solid #fff' : '2px solid transparent',
              opacity: selected ? 1 : 0.01,
              zIndex: selected ? 4 : 3,
              pointerEvents: 'auto',
              cursor: 'crosshair',
            } as CSSProperties
          }
        />
      ))}
    </>
  )
}

// ─── Inline label editor ──────────────────────────────────────────────────────
interface LabelProps {
  value: string
  editing: boolean
  draft: string
  setDraft: (v: string) => void
  onCommit: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  color?: string
  /**
   * Mind maps: allow multi-line wrap inside auto-sized circles.
   * Flowcharts: single-line (Mermaid layout sizes boxes for one line).
   */
  allowWrap?: boolean
}

function NodeLabel({
  value,
  editing,
  draft,
  setDraft,
  onCommit,
  onKeyDown,
  inputRef,
  color,
  allowWrap = false,
}: LabelProps) {
  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        className="w-full max-w-full bg-transparent border-none outline-none text-center text-[inherit] leading-tight"
        style={{ fontSize: 'inherit', padding: 0, margin: 0 }}
        autoFocus
        aria-label="Node label"
      />
    )
  }
  return (
    <span
      className={
        allowWrap
          ? 'select-none text-center font-medium leading-tight whitespace-pre-wrap'
          : 'select-none text-center font-medium leading-tight whitespace-nowrap'
      }
      style={{
        color: color || 'var(--node-text, #f4f4f5)',
        fontFamily: 'var(--node-font, trebuchet ms, verdana, arial, sans-serif)',
        // Inherit mindmap/flowchart size from the node shell
        fontSize: 'inherit',
        maxWidth: '100%',
        // Use almost the full label box — avoid wasteful inner pad
        padding: 0,
        lineHeight: 1.15,
        // Pre-wrapped at spaces only (displayLabel already has \n) — never mid-word
        wordBreak: allowWrap ? 'normal' : undefined,
        overflowWrap: allowWrap ? 'normal' : undefined,
      }}
    >
      {value}
    </span>
  )
}

/**
 * Mermaid mindmap `::icon(fa fa-*)` is kept on node data for serialize / Object
 * Settings only — do not paint a floating chip on the shape (reads as junk UI).
 */
function IconBadge(_props: { icon?: string }) {
  return null
}

// ─── Main FlowNode component ──────────────────────────────────────────────────
export function FlowNode({ id, data, selected, width, height }: NodeProps) {
  const nodeData = data as FlowNodeData
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(nodeData.label)
  const inputRef = useRef<HTMLInputElement>(null)
  const updateNodeLabel = useFlowStore((s) => s.updateNodeLabel)
  const pushHistory = useFlowStore((s) => s.pushHistory)
  const look = useFlowStore((s) => s.look)
  const handDrawn = look === 'handDrawn'
  const isMindmap = useFlowStore((s) => s.diagramKind === 'mindmap')
  const updateNodeInternals = useUpdateNodeInternals()

  // Measured RF box (preferred) or style size from layout/import
  const boxW =
    typeof width === 'number' && width > 0
      ? width
      : typeof (data as { width?: number }).width === 'number'
        ? (data as { width: number }).width
        : 120
  const boxH =
    typeof height === 'number' && height > 0
      ? height
      : typeof (data as { height?: number }).height === 'number'
        ? (data as { height: number }).height
        : 48

  // Scale type to the shape so short labels fill Mermaid-sized boxes
  // (fixed 16px left large empty rings — screenshot 021358).
  const fontSizePx = useMemo(() => {
    const label = String(nodeData.label ?? '')
    if (isMindmap) {
      const layout = mindmapLabelLayout(label, boxW, boxH)
      return fitLabelFontPx(label, boxW, boxH, {
        lines: layout.lines,
        padX: layout.pad,
        padY: layout.pad,
        minPx: layout.minPx,
        maxPx: layout.maxPx,
      })
    }
    const side = Math.min(boxW, boxH)
    return fitLabelFontPx(label, boxW, boxH, {
      padX: 8,
      padY: 6,
      minPx: 13,
      maxPx: Math.max(32, Math.floor(side * 0.4)),
    })
  }, [nodeData.label, boxW, boxH, isMindmap])
  const fontSize = `${fontSizePx}px`

  const commitLabel = useCallback(() => {
    const trimmed = draft.trim() || 'Node'
    updateNodeLabel(id, trimmed)
    setEditing(false)
  }, [draft, id, updateNodeLabel])

  const handleDoubleClick = useCallback(() => {
    setDraft(nodeData.label)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }, [nodeData.label])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') commitLabel()
      if (e.key === 'Escape') setEditing(false)
    },
    [commitLabel]
  )

  // Map mindmap-only shapes if they leak onto a flowchart node
  const rawShape = (nodeData.shape ?? 'rectangle') as NodeShape
  const shape: NodeShape =
    rawShape === 'bang'
      ? 'asymmetric'
      : rawShape === 'cloud'
        ? 'stadium'
        : rawShape
  // Prefer explicit inspector colors (hex); fall back to studio CSS vars
  const fillColor =
    (typeof nodeData.fillColor === 'string' && nodeData.fillColor) ||
    'var(--node-fill, #27272a)'
  const strokeColor =
    (typeof nodeData.strokeColor === 'string' && nodeData.strokeColor) ||
    (selected
      ? 'var(--neu-icon-active, #818cf8)'
      : 'var(--node-stroke, #71717a)')
  const textColor =
    (typeof nodeData.textColor === 'string' && nodeData.textColor) ||
    'var(--node-text, #f4f4f5)'
  // Match Mermaid flowchart stroke weight; selection uses ring (no size jump)
  const strokeWidth = 1.5
  const selectRing = selected
    ? '0 0 0 2px var(--neu-icon-active, #818cf8)'
    : undefined

  const ports = useMemo(
    () => computePortPlacements(getPortLayout(nodeData), shape),
    // port layout fields + shape
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      shape,
      nodeData.portCount,
      nodeData.portRadius,
      nodeData.portRotation,
      nodeData.portOnPerimeter,
    ],
  )

  // When ports move (rotate / count / radius), force RF to remeasure handles
  // so edges and connection previews follow the dots.
  useEffect(() => {
    updateNodeInternals(id)
  }, [
    id,
    updateNodeInternals,
    ports,
    nodeData.portCount,
    nodeData.portRadius,
    nodeData.portRotation,
    nodeData.portOnPerimeter,
  ])

  // Mindmap only: same line breaks as MindmapNode / card SVG (spaces only).
  // Flowchart: never force wrap — Mermaid/layout boxes assume single-line labels.
  const displayLabel = isMindmap
    ? mindmapLabelLayout(String(nodeData.label ?? ''), boxW, boxH).lines.join(
        '\n',
      )
    : nodeData.label

  const labelProps: LabelProps = {
    value: displayLabel,
    editing,
    draft,
    setDraft,
    onCommit: commitLabel,
    onKeyDown: handleKeyDown,
    inputRef,
    color: textColor,
    allowWrap: isMindmap,
  }

  const handDrawnClass = handDrawn ? 'rf-hand-drawn' : ''

  // ── Subgraph container ─────────────────────────────────────────────────────
  if (nodeData.isSubgraph) {
    return (
      <div
        className={`relative w-full h-full rounded-xl cursor-pointer ${handDrawnClass}`}
        style={{
          border: `2px dashed ${strokeColor}`,
          backgroundColor: nodeData.fillColor
            ? nodeData.fillColor
            : 'rgba(39, 39, 42, 0.45)',
          boxShadow: selectRing,
        }}
        onDoubleClick={handleDoubleClick}
      >
        <NodeResizer minWidth={200} minHeight={120} isVisible={!!selected} />
        <div
          className={`absolute top-2 left-3 text-xs font-semibold ${editing ? '' : 'select-none pointer-events-none'}`}
          style={{ color: 'var(--neu-text-muted, #a1a1aa)' }}
        >
          <NodeLabel {...labelProps} color={textColor} />
        </div>
        <NodeHandles
          selected={!!selected}
          ports={ports}
          mindmapCenter={isMindmap}
        />
      </div>
    )
  }

  // ── SVG-backed shapes ──────────────────────────────────────────────────────
  if (IS_SVG_SHAPE.has(shape)) {
    const Renderer = SVG_RENDERERS[shape]!
    const isCylinder = shape === 'cylinder'
    return (
      <div
        key={`svg-${shape}`}
        className={`relative cursor-pointer select-none ${handDrawnClass}`}
        data-shape={shape}
        data-fill={nodeData.fillColor ?? ''}
        style={{
          width: '100%',
          height: '100%',
          // No minWidth — Mermaid layout sets exact node box (stadiums ~60px)
          minWidth: 0,
          minHeight: 0,
          boxShadow: selectRing,
          borderRadius: 4,
          fontSize,
          fontFamily:
            'var(--node-font, trebuchet ms, verdana, arial, sans-serif)',
        }}
        onDoubleClick={handleDoubleClick}
      >
        <IconBadge icon={nodeData.icon} />
        <NodeResizer
          minWidth={80}
          minHeight={isCylinder ? 60 : 54}
          isVisible={!!selected}
          onResizeEnd={() => pushHistory()}
        />
        <svg
          className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
          viewBox={isCylinder ? '0 0 200 120' : '0 0 200 100'}
          preserveAspectRatio="none"
        >
          <Renderer fill={fillColor} stroke={strokeColor} sw={strokeWidth} />
        </svg>
        <div
          className="relative z-10 flex items-center justify-center w-full h-full pointer-events-none"
          style={{
            height: '100%',
            // Minimal inset — font scales to box (fitLabelFontPx)
            padding:
              shape === 'diamond' || shape === 'hexagon'
                ? '8% 12%'
                : '3px 6px',
            boxSizing: 'border-box',
          }}
        >
          <NodeLabel {...labelProps} />
        </div>
        <NodeHandles
          selected={!!selected}
          ports={ports}
          mindmapCenter={isMindmap}
        />
      </div>
    )
  }

  // ── CSS-based shapes — metrics close to Mermaid flowchart cards ───────────
  const baseStyle: React.CSSProperties = {
    backgroundColor: fillColor,
    border: `${strokeWidth}px solid ${strokeColor}`,
    boxSizing: 'border-box',
    fontFamily: handDrawn
      ? '"Segoe Print", "Comic Sans MS", "Chalkboard SE", cursive'
      : 'var(--node-font, trebuchet ms, verdana, arial, sans-serif)',
    fontSize,
  }

  let extraStyle: React.CSSProperties = {}
  let extraClass = ''

  switch (shape) {
    case 'rounded':
      extraStyle = { borderRadius: 8 }
      break
    case 'stadium':
      // Pill (Start/Done) — size from layout box; tight pad so text fills pill
      extraStyle = {
        borderRadius: 9999,
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 2,
        paddingBottom: 2,
      }
      break
    case 'subroutine':
      extraStyle = {
        borderRadius: 4,
        outline: `2px solid ${strokeColor}`,
        outlineOffset: 3,
      }
      break
    case 'circle':
      extraStyle = { borderRadius: '50%' }
      extraClass = '!min-w-[80px] !min-h-[80px] !aspect-square'
      break
    case 'double-circle':
      extraStyle = {
        borderRadius: '50%',
        boxShadow: selected
          ? `0 0 0 3px ${fillColor}, 0 0 0 5px ${strokeColor}, 0 0 0 7px var(--neu-icon-active, #818cf8)`
          : `0 0 0 3px ${fillColor}, 0 0 0 5px ${strokeColor}`,
      }
      extraClass = '!min-w-[80px] !min-h-[80px] !aspect-square'
      break
    case 'rectangle':
    default:
      // Mermaid default node — slight rounding; size from layout box
      extraStyle = { borderRadius: 5 }
  }

  if (selected && shape !== 'double-circle') {
    extraStyle = {
      ...extraStyle,
      boxShadow: selectRing,
    }
  }

  const isCircleShape = shape === 'circle' || shape === 'double-circle'

  return (
    <div
      key={`css-${shape}`}
      className={`relative flex h-full w-full cursor-pointer select-none items-center justify-center ${extraClass} ${handDrawnClass}`}
      data-shape={shape}
      data-fill={nodeData.fillColor ?? ''}
      style={{
        ...baseStyle,
        ...extraStyle,
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        // overflow visible so mid-side ports aren't clipped into a weird ring
        overflow: 'visible',
        // Bare minimum chrome pad — type size does the “fill”
        paddingLeft: shape === 'stadium' || isCircleShape ? 3 : 4,
        paddingRight: shape === 'stadium' || isCircleShape ? 3 : 4,
        paddingTop: shape === 'stadium' || isCircleShape ? 1 : 2,
        paddingBottom: shape === 'stadium' || isCircleShape ? 1 : 2,
        boxSizing: 'border-box',
      }}
      onDoubleClick={handleDoubleClick}
    >
      <IconBadge icon={nodeData.icon} />
      <NodeResizer
        // Allow Mermaid stadium sizes (~60×39); don't force min 80×40
        minWidth={isCircleShape ? 80 : 36}
        minHeight={isCircleShape ? 80 : 28}
        isVisible={!!selected}
        onResizeEnd={() => pushHistory()}
      />
      <NodeHandles
        selected={!!selected}
        ports={ports}
        mindmapCenter={isMindmap}
      />
      <NodeLabel {...labelProps} />
    </div>
  )
}
