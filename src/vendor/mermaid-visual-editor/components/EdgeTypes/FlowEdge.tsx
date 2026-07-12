import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  MarkerType,
  type EdgeProps,
} from '@xyflow/react'
import { useCallback, useState } from 'react'
import {
  resolveEdgeMarkers,
  useFlowStore,
  type EdgeMarkerKind,
  type FlowEdgeData,
} from '../../lib/store'

function markerAttr(
  kind: EdgeMarkerKind,
  edgeId: string,
  side: 'start' | 'end',
  color: string,
): string | { type: MarkerType; width: number; height: number; color: string } | undefined {
  if (kind === 'none') return undefined
  if (kind === 'arrow') {
    return {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color,
    }
  }
  // circle / cross — custom SVG marker defined below
  return `url(#${edgeId}-${side}-${kind})`
}

/** Midpoint of an absolute SVG path (average of coordinate pairs). */
function pathCentroid(d: string): { x: number; y: number } | null {
  const nums = [...d.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map((m) =>
    Number(m[0]),
  )
  if (nums.length < 4) return null
  let sx = 0
  let sy = 0
  let n = 0
  for (let i = 0; i + 1 < nums.length; i += 2) {
    sx += nums[i]!
    sy += nums[i + 1]!
    n++
  }
  if (n === 0) return null
  return { x: sx / n, y: sy / n }
}

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as FlowEdgeData | undefined
  const mermaidPath = edgeData?.mermaidPath

  // Prefer Mermaid's own edge geometry (matches sheet card). Fall back to
  // smooth-step which tracks rank/file better than pure bezier.
  const [smoothPath, smoothLabelX, smoothLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: 12,
  })

  const edgePath = mermaidPath || smoothPath
  let labelX = smoothLabelX
  let labelY = smoothLabelY
  if (
    typeof edgeData?.mermaidLabelX === 'number' &&
    typeof edgeData?.mermaidLabelY === 'number'
  ) {
    labelX = edgeData.mermaidLabelX
    labelY = edgeData.mermaidLabelY
  } else if (mermaidPath) {
    const c = pathCentroid(mermaidPath)
    if (c) {
      labelX = c.x
      labelY = c.y
    }
  }

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState((label as string) ?? '')
  const updateEdgeLabel = useFlowStore((s) => s.updateEdgeLabel)

  const commitLabel = useCallback(() => {
    updateEdgeLabel(id, draft.trim())
    setEditing(false)
  }, [draft, id, updateEdgeLabel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') commitLabel()
      if (e.key === 'Escape') setEditing(false)
    },
    [commitLabel],
  )

  const edgeStyle = edgeData?.edgeStyle ?? 'solid'
  const strokeColor = edgeData?.strokeColor ?? 'var(--edge-stroke, #a1a1aa)'
  const displayLabel = label as string | undefined
  const { start, end } = resolveEdgeMarkers(edgeData)

  let strokeDasharray: string | undefined
  // Match Mermaid edge weight on sheet cards
  let strokeWidth = selected ? 2 : 1.5
  if (edgeStyle === 'dashed') strokeDasharray = '7 4'
  if (edgeStyle === 'thick') strokeWidth = selected ? 3.5 : 3

  const stroke = selected
    ? 'var(--neu-icon-active, #818cf8)'
    : strokeColor

  const markerStart = markerAttr(start, id, 'start', stroke)
  const markerEnd = markerAttr(end, id, 'end', stroke)

  return (
    <>
      {/* Custom circle / cross markers (RF only ships arrow types) */}
      <defs>
        {(['start', 'end'] as const).map((side) => {
          const kind = side === 'start' ? start : end
          if (kind !== 'circle' && kind !== 'cross') return null
          const mid = side === 'start' ? 2 : 10
          return (
            <marker
              key={`${side}-${kind}`}
              id={`${id}-${side}-${kind}`}
              markerWidth="12"
              markerHeight="12"
              refX={mid}
              refY="6"
              orient="auto"
              markerUnits="strokeWidth"
            >
              {kind === 'circle' ? (
                <circle
                  cx="6"
                  cy="6"
                  r="3.5"
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.5"
                />
              ) : (
                <g stroke={stroke} strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="2" x2="10" y2="10" />
                  <line x1="10" y1="2" x2="2" y2="10" />
                </g>
              )}
            </marker>
          )
        })}
      </defs>

      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerStart as never}
        markerEnd={markerEnd as never}
        interactionWidth={18}
        style={{
          strokeDasharray,
          strokeWidth,
          stroke,
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onDoubleClick={(e) => {
            e.stopPropagation()
            setDraft((label as string) ?? '')
            setEditing(true)
          }}
        >
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={handleKeyDown}
              placeholder="label…"
              className="w-28 rounded border border-indigo-400/70 px-2 py-0.5 text-center text-xs shadow-sm outline-none"
              style={{
                background: 'var(--neu-surface, #1e2028)',
                color: 'var(--neu-text, #e4e4e7)',
              }}
            />
          ) : displayLabel ? (
            <span
              className="cursor-pointer rounded border px-2 py-0.5 text-xs shadow-sm"
              style={{
                background: 'var(--neu-surface, #1e2028)',
                borderColor: 'var(--neu-border, #3f3f46)',
                color: 'var(--neu-text, #e4e4e7)',
              }}
            >
              {displayLabel}
            </span>
          ) : (
            <span
              className="cursor-pointer select-none rounded px-1 py-0.5 text-xs"
              style={{ color: 'var(--neu-text-muted, #a1a1aa)' }}
            >
              ✎
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
