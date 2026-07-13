/**
 * Edge path = ports/nodes this edge is wired to, drawn as a curved "pipe"
 * (orthogonal smooth-step). Same math as processFlow card paint.
 *
 * React Flow 12 EdgeProps:
 *  - source / target, sourceHandleId / targetHandleId
 *  - sourceX/Y, targetX/Y (measured handle centers)
 *  - sourcePosition / targetPosition
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
  type InternalNode,
  Position,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  resolveEdgeMarkers,
  useFlowStore,
  type FlowEdgeData,
  type FlowNodeData,
  type NodeShape,
} from '../../lib/store'
import {
  nodeBoxFromRf,
  siblingIndexForEdge,
  type NodeBox,
  type Pt,
} from '../../lib/mermaidEdgeRoute'
import { buildEdgePath } from '../../lib/edgePath'
import {
  normalizePortHandleId,
  portFlowPoint,
} from '../../lib/portLayout'
import {
  collectPipeSnapTargets,
  diagramBounds,
  snapPipePoint,
  type PipeSnapGuide,
} from '../../lib/pipeSnap'
import {
  cornersToWaypoints,
  extractElbowsFromPath,
  moveShaft,
  polylineFromEdge,
  shaftsFromCorners,
  type PipeShaft,
} from '../../lib/pipeShafts'
import {
  clearLiveEdgePaint,
  setLiveEdgePaint,
} from '../../lib/liveEdgePaint'

function solidStroke(color: string | undefined, fallback: string): string {
  if (!color || color.startsWith('var(')) return fallback
  return color
}

function readNodeBox(
  node:
    | {
        internals?: { positionAbsolute?: { x: number; y: number } }
        position?: { x: number; y: number }
        measured?: { width?: number; height?: number }
        width?: number | null
        height?: number | null
        data?: FlowNodeData
      }
    | undefined,
  fallbackW = 120,
  fallbackH = 48,
): NodeBox | null {
  if (!node) return null
  const abs = node.internals?.positionAbsolute ?? node.position
  if (!abs) return null
  const w =
    node.measured?.width ??
    (typeof node.width === 'number' ? node.width : undefined) ??
    fallbackW
  const h =
    node.measured?.height ??
    (typeof node.height === 'number' ? node.height : undefined) ??
    fallbackH
  return nodeBoxFromRf(
    abs.x,
    abs.y,
    w,
    h,
    (node.data?.shape ?? 'rectangle') as NodeShape,
  )
}

function layoutPortCenter(
  node: InternalNode | undefined,
  storeNode:
    | {
        position: { x: number; y: number }
        width?: number | null
        height?: number | null
        style?: { width?: number | string; height?: number | string }
        data?: FlowNodeData
      }
    | undefined,
  handleId: string | null | undefined,
): Pt | null {
  const portId = normalizePortHandleId(handleId)
  if (!portId) return null
  const box =
    readNodeBox(node as never) || readNodeBox(storeNode as never)
  if (!box) return null
  const data = (node?.data as FlowNodeData | undefined) ?? storeNode?.data
  return portFlowPoint(box, box.shape ?? data?.shape, data, portId)
}

export function FlowEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
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
  const curveStyle = useFlowStore((s) => s.curveStyle)
  const chartEdgeColor = useFlowStore((s) => s.chartEdgeColor)
  const multiEdgeSpacing = useFlowStore((s) => s.multiEdgeSpacing)
  const pipeSnapEnabled = useFlowStore((s) => s.pipeSnapEnabled)
  const pipeSnapThreshold = useFlowStore((s) => s.pipeSnapThreshold)
  const updateEdgeWaypoint = useFlowStore((s) => s.updateEdgeWaypoint)
  const setEdgeWaypointsLive = useFlowStore((s) => s.setEdgeWaypointsLive)
  const updateEdgeLabelOffsetLive = useFlowStore(
    (s) => s.updateEdgeLabelOffsetLive,
  )
  const setSelectedWaypoint = useFlowStore((s) => s.setSelectedWaypoint)
  const selectedWaypoint = useFlowStore((s) => s.selectedWaypoint)
  const pushHistory = useFlowStore((s) => s.pushHistory)
  const { screenToFlowPosition, getZoom } = useReactFlow()
  const [snapGuides, setSnapGuides] = useState<PipeSnapGuide[]>([])
  const dragShaft = useRef<{
    index: number
    axis: 'h' | 'v'
    corners: { x: number; y: number }[]
  } | null>(null)
  const dragLabel = useRef<{
    startClientX: number
    startClientY: number
    origOffX: number
    origOffY: number
  } | null>(null)
  const [draggingLabel, setDraggingLabel] = useState(false)

  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const storeSource = useFlowStore((s) => s.nodes.find((n) => n.id === source))
  const storeTarget = useFlowStore((s) => s.nodes.find((n) => n.id === target))
  const storeEdge = useFlowStore((s) => s.edges.find((e) => e.id === id))
  const allEdges = useFlowStore((s) => s.edges)
  const allNodes = useFlowStore((s) => s.nodes)

  const waypoints = edgeData?.waypoints ?? []
  const manual = edgeData?.manualConnect === true

  const rawSrcHandle =
    sourceHandleId ?? storeEdge?.sourceHandle ?? null
  const rawTgtHandle =
    targetHandleId ?? storeEdge?.targetHandle ?? null
  const hasPortHandles = Boolean(
    normalizePortHandleId(rawSrcHandle) || normalizePortHandleId(rawTgtHandle),
  )

  const rfStartOk = Number.isFinite(sourceX) && Number.isFinite(sourceY)
  const rfEndOk = Number.isFinite(targetX) && Number.isFinite(targetY)

  const edgeRefs = useMemo(
    () =>
      allEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    [allEdges],
  )

  const pairCount = useMemo(() => {
    return edgeRefs.filter(
      (e) =>
        (e.source === source && e.target === target) ||
        (e.source === target && e.target === source),
    ).length
  }, [edgeRefs, source, target])

  const siblingIndex = useMemo(() => {
    const centers = new Map<string, { cx: number; cy: number }>()
    for (const n of allNodes) {
      const w =
        typeof n.width === 'number'
          ? n.width
          : typeof n.style?.width === 'number'
            ? n.style.width
            : 120
      const h =
        typeof n.height === 'number'
          ? n.height
          : typeof n.style?.height === 'number'
            ? n.style.height
            : 48
      centers.set(n.id, {
        cx: n.position.x + w / 2,
        cy: n.position.y + h / 2,
      })
    }
    return siblingIndexForEdge(id, source, target, edgeRefs, centers)
  }, [id, source, target, edgeRefs, allNodes])

  const routed = useMemo(() => {
    const sBox =
      readNodeBox(sourceNode as never) || readNodeBox(storeSource as never)
    const tBox =
      readNodeBox(targetNode as never) || readNodeBox(storeTarget as never)
    if (!sBox || !tBox) return { path: '', labelX: 0, labelY: 0 }

    let startPt: Pt | null = null
    let endPt: Pt | null = null
    if (hasPortHandles) {
      startPt = layoutPortCenter(
        sourceNode as InternalNode | undefined,
        storeSource,
        rawSrcHandle,
      )
      endPt = layoutPortCenter(
        targetNode as InternalNode | undefined,
        storeTarget,
        rawTgtHandle,
      )
      if (!startPt && rfStartOk) startPt = { x: sourceX, y: sourceY }
      if (!endPt && rfEndOk) endPt = { x: targetX, y: targetY }
    } else if (manual && rfStartOk && rfEndOk) {
      startPt = { x: sourceX, y: sourceY }
      endPt = { x: targetX, y: targetY }
    }

    // Shared pipe router with processFlow card (always curved smooth-step)
    return buildEdgePath({
      source: sBox,
      target: tBox,
      waypoints,
      siblingIndex,
      siblingSpacing: multiEdgeSpacing,
      curveStyle,
      isMultiEdge: pairCount > 1,
      manualConnect: manual,
      sourceHandle: rawSrcHandle,
      targetHandle: rawTgtHandle,
      sourceData: storeSource?.data,
      targetData: storeTarget?.data,
      startPt,
      endPt,
      sourcePosition: sourcePosition as Position | undefined,
      targetPosition: targetPosition as Position | undefined,
    })
  }, [
    sourceNode,
    targetNode,
    storeSource,
    storeTarget,
    waypoints,
    siblingIndex,
    multiEdgeSpacing,
    curveStyle,
    pairCount,
    hasPortHandles,
    manual,
    rawSrcHandle,
    rawTgtHandle,
    rfStartOk,
    rfEndOk,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  ])

  const edgePath = routed.path
  const labelOffX = Number(edgeData?.labelOffsetX) || 0
  const labelOffY = Number(edgeData?.labelOffsetY) || 0
  const labelX = routed.labelX + labelOffX
  const labelY = routed.labelY + labelOffY

  // Publish exact paint so canvas processFlow capture matches the editor
  useEffect(() => {
    if (!edgePath) {
      clearLiveEdgePaint(id)
      return
    }
    setLiveEdgePaint(id, { path: edgePath, labelX, labelY })
    return () => clearLiveEdgePaint(id)
  }, [id, edgePath, labelX, labelY])

  // Orthogonal elbows for shaft handles (ports fixed at start/end)
  const pipeCorners = useMemo(() => {
    if (!edgePath) return [] as { x: number; y: number }[]
    const startPt =
      'start' in routed && routed.start
        ? routed.start
        : null
    const endPt =
      'end' in routed && routed.end ? routed.end : null
    if (waypoints.length > 0 && startPt && endPt) {
      return polylineFromEdge(startPt, endPt, waypoints)
    }
    return extractElbowsFromPath(edgePath)
  }, [edgePath, waypoints, routed])

  const pipeShafts = useMemo(
    () => (selected ? shaftsFromCorners(pipeCorners) : ([] as PipeShaft[])),
    [selected, pipeCorners],
  )

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState((label as string) ?? '')
  const updateEdgeLabel = useFlowStore((s) => s.updateEdgeLabel)
  const dragWp = useRef<string | null>(null)
  const snapTargetsRef = useRef(
    null as ReturnType<typeof collectPipeSnapTargets> | null,
  )

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
  const strokeColor = solidStroke(
    selected
      ? '#818cf8'
      : edgeData?.strokeColor || chartEdgeColor || '#a1a1aa',
    selected ? '#818cf8' : '#a1a1aa',
  )
  const displayLabel = label as string | undefined
  const { start, end } = resolveEdgeMarkers(edgeData)

  let strokeDasharray: string | undefined
  let strokeWidth = selected ? 2.25 : 1.5
  if (edgeStyle === 'dashed') strokeDasharray = '7 4'
  if (edgeStyle === 'thick') strokeWidth = selected ? 3.5 : 3

  const markerStartId =
    start !== 'none' ? `flow-mk-${id}-start-${start}` : undefined
  const markerEndId = end !== 'none' ? `flow-mk-${id}-end-${end}` : undefined

  if (!edgePath) return null

  return (
    <>
      <defs>
        {start === 'arrow' && (
          <marker
            id={markerStartId}
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M10,0 L0,5 L10,10 z" fill={strokeColor} />
          </marker>
        )}
        {end === 'arrow' && (
          <marker
            id={markerEndId}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={strokeColor} />
          </marker>
        )}
        {(['start', 'end'] as const).map((side) => {
          const kind = side === 'start' ? start : end
          if (kind !== 'circle' && kind !== 'cross') return null
          const mid = side === 'start' ? 3 : 9
          const mkId = side === 'start' ? markerStartId! : markerEndId!
          return (
            <marker
              key={`${side}-${kind}`}
              id={mkId}
              viewBox="0 0 12 12"
              refX={mid}
              refY="6"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              {kind === 'circle' ? (
                <circle
                  cx="6"
                  cy="6"
                  r="3.5"
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="1.5"
                />
              ) : (
                <g stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round">
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
        markerStart={markerStartId ? `url(#${markerStartId})` : undefined}
        markerEnd={markerEndId ? `url(#${markerEndId})` : undefined}
        interactionWidth={24}
        style={{
          strokeDasharray,
          strokeWidth,
          stroke: strokeColor,
        }}
      />

      {selected &&
        waypoints.length > 0 &&
        waypoints.map((wp) => {
          const isSel =
            selectedWaypoint?.edgeId === id &&
            selectedWaypoint?.waypointId === wp.id
          return (
            <EdgeLabelRenderer key={wp.id}>
              <div
                className="nodrag nopan"
                role="button"
                tabIndex={0}
                title="Bend point — drag to reshape (snaps to edges/ports/centers); Delete to remove"
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${wp.x}px,${wp.y}px)`,
                  width: isSel ? 12 : 10,
                  height: isSel ? 12 : 10,
                  borderRadius: '50%',
                  background: isSel ? '#38bdf8' : '#818cf8',
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
                  cursor: 'grab',
                  zIndex: 20,
                  pointerEvents: 'all',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  dragWp.current = wp.id
                  setSelectedWaypoint({ edgeId: id, waypointId: wp.id })
                  // Rebuild sticky targets once per drag (nodes + ports + other bends)
                  snapTargetsRef.current = pipeSnapEnabled
                    ? collectPipeSnapTargets(allNodes, allEdges, {
                        excludeEdgeId: id,
                        excludeWaypointId: wp.id,
                      })
                    : []
                  const bounds = diagramBounds(allNodes)
                  const el = e.currentTarget
                  el.setPointerCapture(e.pointerId)
                  const onMove = (ev: PointerEvent) => {
                    if (dragWp.current !== wp.id) return
                    const flow = screenToFlowPosition({
                      x: ev.clientX,
                      y: ev.clientY,
                    })
                    if (
                      pipeSnapEnabled &&
                      snapTargetsRef.current &&
                      snapTargetsRef.current.length > 0
                    ) {
                      const sn = snapPipePoint(
                        flow.x,
                        flow.y,
                        snapTargetsRef.current,
                        pipeSnapThreshold,
                        bounds,
                      )
                      updateEdgeWaypoint(id, wp.id, { x: sn.x, y: sn.y })
                      setSnapGuides(sn.guides)
                    } else {
                      updateEdgeWaypoint(id, wp.id, {
                        x: Math.round(flow.x),
                        y: Math.round(flow.y),
                      })
                      setSnapGuides([])
                    }
                  }
                  const onUp = (ev: PointerEvent) => {
                    dragWp.current = null
                    snapTargetsRef.current = null
                    setSnapGuides([])
                    try {
                      el.releasePointerCapture(ev.pointerId)
                    } catch {
                      /* already released */
                    }
                    window.removeEventListener('pointermove', onMove)
                    window.removeEventListener('pointerup', onUp)
                    window.removeEventListener('pointercancel', onUp)
                    pushHistory()
                  }
                  window.addEventListener('pointermove', onMove)
                  window.addEventListener('pointerup', onUp)
                  window.addEventListener('pointercancel', onUp)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedWaypoint({ edgeId: id, waypointId: wp.id })
                }}
              />
            </EdgeLabelRenderer>
          )
        })}

      {/* CAD-style alignment guides while a bend/shaft snaps */}
      {snapGuides.map((g, i) =>
        g.axis === 'x' ? (
          <EdgeLabelRenderer key={`sg-x-${i}-${g.at}`}>
            <div
              className="nodrag nopan pointer-events-none"
              style={{
                position: 'absolute',
                left: g.at,
                top: g.from,
                width: 0,
                height: Math.max(1, g.to - g.from),
                borderLeft: '1px dashed #38bdf8',
                opacity: 0.85,
                zIndex: 25,
                transform: 'translateX(-0.5px)',
              }}
            />
          </EdgeLabelRenderer>
        ) : (
          <EdgeLabelRenderer key={`sg-y-${i}-${g.at}`}>
            <div
              className="nodrag nopan pointer-events-none"
              style={{
                position: 'absolute',
                left: g.from,
                top: g.at,
                width: Math.max(1, g.to - g.from),
                height: 0,
                borderTop: '1px dashed #38bdf8',
                opacity: 0.85,
                zIndex: 25,
                transform: 'translateY(-0.5px)',
              }}
            />
          </EdgeLabelRenderer>
        ),
      )}

      {/* Movable orthogonal shafts (interior runs) */}
      {selected &&
        pipeShafts.map((sh) => (
          <EdgeLabelRenderer key={`shaft-${id}-${sh.index}-${sh.axis}`}>
            <div
              className="nodrag nopan"
              role="button"
              tabIndex={0}
              title={
                sh.axis === 'v'
                  ? 'Vertical shaft — drag left/right (snaps to align)'
                  : 'Horizontal shaft — drag up/down (snaps to align)'
              }
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${sh.midX}px,${sh.midY}px)`,
                width: sh.axis === 'v' ? 10 : Math.min(28, sh.length * 0.35),
                height: sh.axis === 'h' ? 10 : Math.min(28, sh.length * 0.35),
                borderRadius: 4,
                background: 'rgba(56, 189, 248, 0.35)',
                border: '1px solid #38bdf8',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                cursor: sh.axis === 'v' ? 'ew-resize' : 'ns-resize',
                zIndex: 19,
                pointerEvents: 'all',
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                // Ensure waypoints exist so shaft edits persist
                let corners = pipeCorners
                let liveWps = waypoints
                if (waypoints.length === 0 && corners.length >= 2) {
                  liveWps = cornersToWaypoints(corners)
                  setEdgeWaypointsLive(id, liveWps)
                  corners = polylineFromEdge(
                    corners[0]!,
                    corners[corners.length - 1]!,
                    liveWps,
                  )
                }
                dragShaft.current = {
                  index: sh.index,
                  axis: sh.axis,
                  corners: corners.map((p) => ({ ...p })),
                }
                snapTargetsRef.current = pipeSnapEnabled
                  ? collectPipeSnapTargets(allNodes, allEdges, {
                      excludeEdgeId: id,
                    })
                  : []
                const bounds = diagramBounds(allNodes)
                const el = e.currentTarget
                el.setPointerCapture(e.pointerId)
                const onMove = (ev: PointerEvent) => {
                  const st = dragShaft.current
                  if (!st) return
                  const flow = screenToFlowPosition({
                    x: ev.clientX,
                    y: ev.clientY,
                  })
                  let value = st.axis === 'v' ? flow.x : flow.y
                  if (
                    pipeSnapEnabled &&
                    snapTargetsRef.current &&
                    snapTargetsRef.current.length > 0
                  ) {
                    const sn = snapPipePoint(
                      st.axis === 'v' ? value : st.corners[st.index]!.x,
                      st.axis === 'h' ? value : st.corners[st.index]!.y,
                      snapTargetsRef.current,
                      pipeSnapThreshold,
                      bounds,
                    )
                    value = st.axis === 'v' ? sn.x : sn.y
                    setSnapGuides(sn.guides)
                  } else {
                    setSnapGuides([])
                  }
                  const nextCorners = moveShaft(
                    st.corners,
                    st.index,
                    st.axis,
                    value,
                  )
                  st.corners = nextCorners
                  const prevWps =
                    useFlowStore.getState().edges.find((ed) => ed.id === id)
                      ?.data?.waypoints ?? liveWps
                  const wps = cornersToWaypoints(nextCorners, prevWps)
                  setEdgeWaypointsLive(id, wps)
                }
                const onUp = (ev: PointerEvent) => {
                  dragShaft.current = null
                  snapTargetsRef.current = null
                  setSnapGuides([])
                  try {
                    el.releasePointerCapture(ev.pointerId)
                  } catch {
                    /* already released */
                  }
                  window.removeEventListener('pointermove', onMove)
                  window.removeEventListener('pointerup', onUp)
                  window.removeEventListener('pointercancel', onUp)
                  pushHistory()
                }
                window.addEventListener('pointermove', onMove)
                window.addEventListener('pointerup', onUp)
                window.addEventListener('pointercancel', onUp)
              }}
            />
          </EdgeLabelRenderer>
        ))}

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            zIndex: selected || draggingLabel ? 16 : 9,
            cursor: editing
              ? 'text'
              : draggingLabel
                ? 'grabbing'
                : displayLabel
                  ? 'grab'
                  : 'default',
            userSelect: 'none',
            touchAction: 'none',
          }}
          className="nodrag nopan"
          title={
            displayLabel
              ? 'Drag to move label · double-click to edit text'
              : undefined
          }
          onDoubleClick={(e) => {
            e.stopPropagation()
            setDraft((label as string) ?? '')
            setEditing(true)
          }}
          onPointerDown={(e) => {
            if (editing || !displayLabel) return
            // Only primary button / touch
            if (e.button !== 0) return
            e.stopPropagation()
            e.preventDefault()
            setDraggingLabel(true)
            dragLabel.current = {
              startClientX: e.clientX,
              startClientY: e.clientY,
              origOffX: labelOffX,
              origOffY: labelOffY,
            }
            const el = e.currentTarget
            el.setPointerCapture(e.pointerId)
            const onMove = (ev: PointerEvent) => {
              const st = dragLabel.current
              if (!st) return
              const z = getZoom() || 1
              const dx = (ev.clientX - st.startClientX) / z
              const dy = (ev.clientY - st.startClientY) / z
              updateEdgeLabelOffsetLive(id, {
                labelOffsetX: Math.round(st.origOffX + dx),
                labelOffsetY: Math.round(st.origOffY + dy),
              })
            }
            const onUp = () => {
              dragLabel.current = null
              setDraggingLabel(false)
              try {
                el.releasePointerCapture(e.pointerId)
              } catch {
                /* already released */
              }
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
              window.removeEventListener('pointercancel', onUp)
              pushHistory()
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
            window.addEventListener('pointercancel', onUp)
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
              className="select-none rounded border px-2 py-0.5 text-xs shadow-sm"
              style={{
                background: 'var(--neu-surface, #1e2028)',
                borderColor: selected
                  ? 'var(--neu-icon-active, #818cf8)'
                  : 'var(--neu-border, #3f3f46)',
                color: 'var(--neu-text, #e4e4e7)',
              }}
            >
              {displayLabel}
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
