/**
 * Mindmap topic node — circular/radial shapes from Mermaid mindmap syntax,
 * with resize handles when selected (move via drag, size via NodeResizer).
 *
 * Shapes: https://mermaid.js.org/syntax/mindmap.html#different-shapes
 */
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { useCallback, useRef, useState } from 'react'
import { useFlowStore, type FlowNodeData, type NodeShape } from '../../lib/store'

const DEFAULT_SIZE = 96
const ROOT_SIZE = 120

function shapeShellStyle(
  shape: NodeShape,
  fill: string,
  stroke: string,
  strokeW: number,
  selected: boolean,
): React.CSSProperties {
  const base: React.CSSProperties = {
    background: fill,
    border: `${strokeW}px solid ${stroke}`,
    boxShadow: selected
      ? '0 0 0 3px rgba(129, 140, 248, 0.35)'
      : '0 2px 8px rgba(0,0,0,0.35)',
  }

  switch (shape) {
    case 'rectangle':
      return { ...base, borderRadius: 6 }
    case 'rounded':
      return { ...base, borderRadius: 18 }
    case 'circle':
    case 'double-circle':
      return {
        ...base,
        borderRadius: '50%',
        ...(shape === 'double-circle'
          ? {
              boxShadow: selected
                ? `0 0 0 3px ${fill}, 0 0 0 5px ${stroke}, 0 0 0 8px rgba(129, 140, 248, 0.35)`
                : `0 0 0 3px ${fill}, 0 0 0 5px ${stroke}`,
            }
          : {}),
      }
    case 'hexagon':
      return {
        ...base,
        border: 'none',
        background: 'transparent',
        // filled via SVG underlay
      }
    case 'cloud':
    case 'stadium':
    case 'bang':
    case 'asymmetric':
      return {
        ...base,
        border: 'none',
        background: 'transparent',
      }
    default:
      return { ...base, borderRadius: 18 }
  }
}

/**
 * Official Mermaid cloud path (rendering-elements/shapes/cloud.ts).
 * Single continuous outline — not stacked ellipses.
 */
function mermaidCloudPath(w: number, h: number): string {
  const r1 = 0.15 * w
  const r2 = 0.25 * w
  const r3 = 0.35 * w
  const r4 = 0.2 * w
  return `M0 0
    a${r1},${r1} 0 0,1 ${w * 0.25},${-1 * w * 0.1}
    a${r3},${r3} 1 0,1 ${w * 0.4},${-1 * w * 0.1}
    a${r2},${r2} 1 0,1 ${w * 0.35},${w * 0.2}
    a${r1},${r1} 1 0,1 ${w * 0.15},${h * 0.35}
    a${r4},${r4} 1 0,1 ${-1 * w * 0.15},${h * 0.65}
    a${r2},${r1} 1 0,1 ${-1 * w * 0.25},${w * 0.15}
    a${r3},${r3} 1 0,1 ${-1 * w * 0.5},0
    a${r1},${r1} 1 0,1 ${-1 * w * 0.25},${-1 * w * 0.15}
    a${r1},${r1} 1 0,1 ${-1 * w * 0.1},${-1 * h * 0.65}
    a${r4},${r4} 1 0,1 ${w * 0.1},${-1 * h * 0.35}
  H0 V0 Z`
}

/** SVG underlays for shapes that need non-rect CSS. */
function ShapeUnderlay({
  shape,
  fill,
  stroke,
  strokeW,
  w,
  h,
}: {
  shape: NodeShape
  fill: string
  stroke: string
  strokeW: number
  w: number
  h: number
}) {
  if (shape === 'hexagon') {
    return (
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <polygon
          points="50,2 96,25 96,75 50,98 4,75 4,25"
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeW * 1.5}
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (shape === 'bang' || shape === 'asymmetric') {
    // Exploding bubble — Mermaid: id))I am a bang((
    return (
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <polygon
          points="
            50,2 58,22 80,12 70,32 98,40 72,50 95,70 68,65 75,95 50,78
            25,95 32,65 5,70 28,50 2,40 30,32 20,12 42,22
          "
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeW * 1.2}
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (shape === 'cloud') {
    // Official Mermaid cloud path only — never used for flowchart stadium/pill
    const padX = w * 0.08
    const padY = w * 0.12
    const bw = Math.max(40, w - padX * 2)
    const bh = Math.max(28, h - padY * 2)
    const d = mermaidCloudPath(bw, bh)
    const ty = Math.max(padY, w * 0.12)
    return (
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <g transform={`translate(${(w - bw) / 2},${ty})`}>
          <path
            d={d}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinejoin="round"
          />
        </g>
      </svg>
    )
  }
  return null
}

export function MindmapNode({ id, data, selected, width, height }: NodeProps) {
  const nodeData = data as FlowNodeData
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(nodeData.label)
  const [hovered, setHovered] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const updateNodeLabel = useFlowStore((s) => s.updateNodeLabel)
  const pushHistory = useFlowStore((s) => s.pushHistory)

  const isHub = useFlowStore((s) => !s.edges.some((e) => e.target === id))
  const shape = (nodeData.shape ?? 'circle') as NodeShape

  // Prefer measured / style size from resizer; fall back to defaults
  const w =
    typeof width === 'number'
      ? width
      : typeof (data as { width?: number }).width === 'number'
        ? (data as { width: number }).width
        : isHub
          ? ROOT_SIZE
          : DEFAULT_SIZE
  const h =
    typeof height === 'number'
      ? height
      : typeof (data as { height?: number }).height === 'number'
        ? (data as { height: number }).height
        : isHub
          ? ROOT_SIZE
          : DEFAULT_SIZE

  const commitLabel = useCallback(() => {
    const trimmed = draft.trim() || 'Topic'
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
    [commitLabel],
  )

  const fill =
    (typeof nodeData.fillColor === 'string' && nodeData.fillColor) ||
    'var(--node-fill, #27272a)'
  const stroke =
    (typeof nodeData.strokeColor === 'string' && nodeData.strokeColor) ||
    (selected
      ? 'var(--neu-icon-active, #818cf8)'
      : 'var(--node-stroke, #71717a)')
  const text =
    (typeof nodeData.textColor === 'string' && nodeData.textColor) ||
    'var(--node-text, #f4f4f5)'
  const strokeW = selected ? 3 : 2

  const needsUnderlay =
    shape === 'hexagon' ||
    shape === 'bang' ||
    shape === 'asymmetric' ||
    shape === 'cloud'

  const shell = shapeShellStyle(shape, fill, stroke, strokeW, !!selected)

  // Circles keep aspect on resize; squares/clouds freer
  const keepAspect =
    shape === 'circle' ||
    shape === 'double-circle' ||
    shape === 'bang' ||
    shape === 'hexagon'

  return (
    <div
      className="relative flex items-center justify-center select-none"
      data-mindmap-node
      data-shape={shape}
      data-fill={nodeData.fillColor ?? ''}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: w,
        height: h,
        minWidth: 48,
        minHeight: 48,
        cursor: 'pointer',
        ...shell,
      }}
    >
      {/* Resize / move chrome when selected (or hover for discoverability) */}
      <NodeResizer
        minWidth={48}
        minHeight={48}
        isVisible={!!selected || hovered}
        keepAspectRatio={keepAspect}
        onResizeEnd={() => pushHistory()}
        lineStyle={{
          borderColor: 'var(--neu-icon-active, #818cf8)',
          borderWidth: 1,
        }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: 'var(--neu-icon-active, #818cf8)',
          border: '1px solid #1e2028',
        }}
      />

      {needsUnderlay && (
        <ShapeUnderlay
          shape={shape}
          fill={fill}
          stroke={stroke}
          strokeW={strokeW}
          w={w}
          h={h}
        />
      )}

      {/* Center dual-purpose handles — MindmapEdge clips to perimeter */}
      <Handle
        id="center"
        type="source"
        position={Position.Top}
        className="!opacity-0 !w-2 !h-2 !min-w-0 !min-h-0 !border-0"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'all',
        }}
      />
      <Handle
        id="center-target"
        type="target"
        position={Position.Top}
        className="!opacity-0 !w-2 !h-2 !min-w-0 !min-h-0 !border-0"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'all',
        }}
      />

      {/* ::icon kept on data for Mermaid export / Object Settings — not painted on shape */}

      {/* Use most of the shape for text — was 85% + px (wasteful empty ring) */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{
          maxWidth: '94%',
          maxHeight: '94%',
          width: '94%',
          height: '94%',
          padding: shape === 'circle' || shape === 'double-circle' ? 2 : 3,
          boxSizing: 'border-box',
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={handleKeyDown}
            className="w-full max-w-full bg-transparent text-center font-medium outline-none"
            style={{
              color: text,
              fontSize: isHub ? 14 : 12,
              lineHeight: 1.15,
              padding: 0,
            }}
            autoFocus
            aria-label="Topic label"
          />
        ) : (
          <span
            className="break-words text-center font-medium select-none"
            style={{
              color: text,
              fontSize: isHub ? 14 : 12,
              lineHeight: 1.15,
              maxWidth: '100%',
              padding: 0,
            }}
          >
            {nodeData.label}
          </span>
        )}
      </div>
    </div>
  )
}
