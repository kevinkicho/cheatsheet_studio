import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useCallback, useState } from 'react'
import { useFlowStore, type FlowEdgeData } from '../../lib/store'

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  markerStart,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

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
    [commitLabel]
  )

  const edgeData = data as FlowEdgeData | undefined
  const edgeStyle = edgeData?.edgeStyle ?? 'solid'
  const strokeColor = edgeData?.strokeColor ?? 'var(--edge-stroke, #a1a1aa)'
  const displayLabel = label as string | undefined

  // Edge visual style
  let strokeDasharray: string | undefined
  let strokeWidth = 2
  if (edgeStyle === 'dashed') strokeDasharray = '7 4'
  if (edgeStyle === 'thick') strokeWidth = 4

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          strokeDasharray,
          strokeWidth,
          stroke: strokeColor,
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
