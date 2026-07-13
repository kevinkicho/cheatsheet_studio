/**
 * Node Settings — auto-connect toggle, connection ports, bend points, edge color.
 */
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { useFlowStore, type FlowEdgeData, type FlowNodeData } from '../../lib/store'
import {
  DEFAULT_PORT_LAYOUT,
  PORT_COUNT_MAX,
  PORT_COUNT_MIN,
  PORT_RADIUS_MAX,
  PORT_RADIUS_MIN,
  getPortLayout,
} from '../../lib/portLayout'
import {
  liveEndpoints,
  newWaypointId,
  seedWaypointsAlongEdge,
} from '../../lib/edgePath'
import { nodeBoxFromRf, siblingIndexForEdge } from '../../lib/mermaidEdgeRoute'

const NEU_BG = 'var(--neu-bg)'
const TEXT = 'var(--neu-text, #e4e4e7)'
const MUTED = 'var(--neu-text-muted, #a1a1aa)'

function NeuBtn({
  onClick,
  disabled,
  children,
  title,
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: NEU_BG,
        border: 'none',
        borderRadius: 8,
        boxShadow: 'var(--neu-shadow-raised)',
        padding: '5px 10px',
        fontSize: 11,
        fontWeight: 500,
        color: MUTED,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'box-shadow 0.15s',
      }}
    >
      {children}
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        color: MUTED,
        letterSpacing: '0.04em',
        marginBottom: 4,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: NEU_BG,
  borderRadius: 14,
  boxShadow: 'var(--neu-shadow-concave)',
  padding: 14,
}

function selectedNodeIds(): string[] {
  return useFlowStore
    .getState()
    .nodes.filter((n) => n.selected && !n.data.isSubgraph)
    .map((n) => n.id)
}

function selectedEdgeIds(): string[] {
  return useFlowStore
    .getState()
    .edges.filter((e) => e.selected)
    .map((e) => e.id)
}

function nodeBoxFromStore(id: string) {
  const n = useFlowStore.getState().nodes.find((x) => x.id === id)
  if (!n) return null
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
  return nodeBoxFromRf(
    n.position.x,
    n.position.y,
    w,
    h,
    (n.data?.shape as never) ?? 'rectangle',
  )
}

/** Bend points + per-connection color for selected connection(s). */
function EdgeBendPointsPanel() {
  const {
    setEdgeWaypoints,
    removeEdgeWaypoint,
    setSelectedWaypoint,
    selectedWaypoint,
    multiEdgeSpacing,
    updateEdgeType,
    pipeSnapEnabled,
    pipeSnapThreshold,
    setPipeSnapEnabled,
    setPipeSnapThreshold,
  } = useFlowStore(
    useShallow((s) => ({
      setEdgeWaypoints: s.setEdgeWaypoints,
      removeEdgeWaypoint: s.removeEdgeWaypoint,
      setSelectedWaypoint: s.setSelectedWaypoint,
      selectedWaypoint: s.selectedWaypoint,
      multiEdgeSpacing: s.multiEdgeSpacing,
      updateEdgeType: s.updateEdgeType,
      pipeSnapEnabled: s.pipeSnapEnabled,
      pipeSnapThreshold: s.pipeSnapThreshold,
      setPipeSnapEnabled: s.setPipeSnapEnabled,
      setPipeSnapThreshold: s.setPipeSnapThreshold,
    })),
  )

  const selectedEdges = useFlowStore(
    useShallow((s) => s.edges.filter((e) => e.selected)),
  )
  const allEdges = useFlowStore((s) => s.edges)
  const lastEdgeIds = useRef<string[]>([])
  useEffect(() => {
    if (selectedEdges.length > 0) {
      lastEdgeIds.current = selectedEdges.map((e) => e.id)
    }
  }, [selectedEdges])

  const displayEdges =
    selectedEdges.length > 0
      ? selectedEdges
      : allEdges.filter((e) => lastEdgeIds.current.includes(e.id))

  if (displayEdges.length === 0) return null

  const first = displayEdges[0]!
  const data = (first.data ?? {}) as FlowEdgeData
  const count = data.waypoints?.length ?? 0

  const resolveIds = () => {
    const live = selectedEdgeIds()
    return live.length > 0 ? live : lastEdgeIds.current
  }

  const applyCount = (n: number) => {
    const next = Math.max(0, Math.min(12, n))
    for (const edgeId of resolveIds()) {
      const edge = useFlowStore.getState().edges.find((e) => e.id === edgeId)
      if (!edge) continue
      const src = nodeBoxFromStore(edge.source)
      const tgt = nodeBoxFromStore(edge.target)
      if (!src || !tgt) continue
      const centers = new Map(
        useFlowStore.getState().nodes.map((nd) => {
          const w =
            typeof nd.width === 'number'
              ? nd.width
              : typeof nd.style?.width === 'number'
                ? nd.style.width
                : 120
          const h =
            typeof nd.height === 'number'
              ? nd.height
              : typeof nd.style?.height === 'number'
                ? nd.style.height
                : 48
          return [
            nd.id,
            {
              cx: nd.position.x + w / 2,
              cy: nd.position.y + h / 2,
            },
          ] as const
        }),
      )
      const idx = siblingIndexForEdge(
        edge.id,
        edge.source,
        edge.target,
        useFlowStore
          .getState()
          .edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
          })),
        centers,
      )
      const seeded = seedWaypointsAlongEdge(
        src,
        tgt,
        next,
        edge.data?.waypoints,
        edge.data?.mermaidPath,
        idx,
        multiEdgeSpacing,
      )
      setEdgeWaypoints(edgeId, seeded)
    }
  }

  const addOne = () => {
    for (const edgeId of resolveIds()) {
      const edge = useFlowStore.getState().edges.find((e) => e.id === edgeId)
      if (!edge) continue
      const src = nodeBoxFromStore(edge.source)
      const tgt = nodeBoxFromStore(edge.target)
      if (!src || !tgt) continue
      const { start, end } = liveEndpoints(src, tgt)
      const prev = edge.data?.waypoints ?? []
      const mid = {
        id: newWaypointId(),
        x: Math.round((start.x + end.x) / 2),
        y: Math.round((start.y + end.y) / 2),
      }
      // Insert near middle of list
      const insertAt = Math.floor(prev.length / 2)
      const next = [...prev]
      next.splice(insertAt, 0, mid)
      setEdgeWaypoints(edgeId, next)
      setSelectedWaypoint({ edgeId, waypointId: mid.id })
    }
  }

  return (
    <div style={{ ...cardStyle, marginTop: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: TEXT,
          marginBottom: 4,
        }}
      >
        {displayEdges.length === 1
          ? 'Connection'
          : `${displayEdges.length} connections`}
      </div>
      <p
        style={{
          fontSize: 9,
          color: MUTED,
          lineHeight: 1.4,
          margin: '0 0 10px',
        }}
      >
        Color, bend points, shafts, and labels (Yes/No). Select the edge —
        drag labels to reposition, double-click to edit text. Cyan shaft grips
        slide mid-runs; bend dots reshape corners. Snap aligns pipes when
        enabled.
      </p>

      <FieldLabel>Connection color</FieldLabel>
      <div style={{ marginBottom: 12 }} onMouseDown={(e) => e.stopPropagation()}>
        <ColorPicker
          key={`edge-color-${first.id}-${data.strokeColor ?? 'def'}`}
          value={data.strokeColor}
          defaultValue="#a1a1aa"
          onChange={(hex) =>
            resolveIds().forEach((id) =>
              updateEdgeType(id, { strokeColor: hex }),
            )
          }
          compact
          aria-label="Connection color"
        />
      </div>

      <FieldLabel>Pipe snap points</FieldLabel>
      <p
        style={{
          fontSize: 9,
          color: MUTED,
          lineHeight: 1.4,
          margin: '0 0 8px',
        }}
      >
        While dragging bends, stick to node edges, centers, ports, and other
        bends (cyan guides). Turn snap off for free placement.
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <NeuBtn
          title="Toggle CAD-style sticky snap for bend handles"
          onClick={() => setPipeSnapEnabled(!pipeSnapEnabled)}
        >
          {pipeSnapEnabled ? 'Snap: On' : 'Snap: Off'}
        </NeuBtn>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: MUTED,
          }}
        >
          Reach
          <input
            type="range"
            min={4}
            max={32}
            value={pipeSnapThreshold}
            onChange={(e) => setPipeSnapThreshold(Number(e.target.value))}
            style={{ width: 72 }}
            title="Snap distance (flow px)"
          />
          <span style={{ color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
            {pipeSnapThreshold}px
          </span>
        </label>
      </div>

      <FieldLabel>Bend count</FieldLabel>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
        }}
      >
        <NeuBtn
          title="Fewer bend points"
          disabled={count <= 0}
          onClick={() => applyCount(count - 1)}
        >
          −
        </NeuBtn>
        <span
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: TEXT,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
        </span>
        <NeuBtn
          title="More bend points"
          disabled={count >= 12}
          onClick={() => applyCount(count + 1)}
        >
          +
        </NeuBtn>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <NeuBtn title="Add one bend at midpoint" onClick={addOne}>
          + Bend
        </NeuBtn>
        <NeuBtn
          title="Clear all bend points"
          disabled={count === 0}
          onClick={() => resolveIds().forEach((id) => setEdgeWaypoints(id, []))}
        >
          Clear bends
        </NeuBtn>
        {selectedWaypoint && (
          <NeuBtn
            title="Delete selected bend point"
            onClick={() => {
              removeEdgeWaypoint(
                selectedWaypoint.edgeId,
                selectedWaypoint.waypointId,
              )
              setSelectedWaypoint(null)
            }}
          >
            Delete selected
          </NeuBtn>
        )}
      </div>

      {count > 0 && displayEdges.length === 1 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            maxHeight: 120,
            overflow: 'auto',
          }}
        >
          {(data.waypoints ?? []).map((wp, i) => {
            const sel =
              selectedWaypoint?.edgeId === first.id &&
              selectedWaypoint?.waypointId === wp.id
            return (
              <li
                key={wp.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px',
                  marginBottom: 4,
                  borderRadius: 6,
                  background: sel
                    ? 'rgba(56, 189, 248, 0.15)'
                    : 'transparent',
                  fontSize: 10,
                  color: TEXT,
                  cursor: 'pointer',
                }}
                onClick={() =>
                  setSelectedWaypoint({ edgeId: first.id, waypointId: wp.id })
                }
              >
                <span style={{ color: MUTED }}>#{i + 1}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ({Math.round(wp.x)}, {Math.round(wp.y)})
                </span>
                <button
                  type="button"
                  title="Remove this bend"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeEdgeWaypoint(first.id, wp.id)
                  }}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    color: MUTED,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AutoConnectToggle() {
  const autoConnectEdges = useFlowStore((s) => s.autoConnectEdges)
  const setAutoConnectEdges = useFlowStore((s) => s.setAutoConnectEdges)

  return (
    <div
      style={{
        ...cardStyle,
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: TEXT,
            marginBottom: 2,
          }}
        >
          Auto-connect lines
        </div>
        <p
          style={{
            fontSize: 9,
            color: MUTED,
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          {autoConnectEdges
            ? 'On: Auto Layout / direction change rewires links from Mermaid.'
            : 'Off (default): diagram lines stay as-is; you plug extra links with ports. Layout only moves nodes.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setAutoConnectEdges(!autoConnectEdges)}
        style={{
          background: NEU_BG,
          border: 'none',
          borderRadius: 8,
          boxShadow: autoConnectEdges
            ? 'var(--neu-shadow-inset)'
            : 'var(--neu-shadow-raised)',
          padding: '5px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: autoConnectEdges
            ? 'var(--neu-icon-active, #818cf8)'
            : MUTED,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {autoConnectEdges ? 'On' : 'Off'}
      </button>
    </div>
  )
}

export function NodeSettingsSection() {
  const diagramKind = useFlowStore((s) => s.diagramKind)
  const isMindmap = diagramKind === 'mindmap'

  const { updateNodesPortLayout, addNodePort, removeNodePort } = useFlowStore(
    useShallow((s) => ({
      updateNodesPortLayout: s.updateNodesPortLayout,
      addNodePort: s.addNodePort,
      removeNodePort: s.removeNodePort,
    })),
  )

  const selectedNodes = useFlowStore(
    useShallow((s) =>
      s.nodes.filter((n) => n.selected && !n.data.isSubgraph),
    ),
  )
  const selectedEdges = useFlowStore(
    useShallow((s) => s.edges.filter((e) => e.selected)),
  )
  const lastNodeIds = useRef<string[]>([])
  useEffect(() => {
    if (selectedNodes.length > 0) {
      lastNodeIds.current = selectedNodes.map((n) => n.id)
    }
  }, [selectedNodes])

  const resolveIds = () => {
    const live = selectedNodeIds()
    return live.length > 0 ? live : lastNodeIds.current
  }

  const allNodes = useFlowStore((s) => s.nodes)
  const displayNodes =
    selectedNodes.length > 0
      ? selectedNodes
      : allNodes.filter((n) => lastNodeIds.current.includes(n.id))

  const first = displayNodes[0] ?? null
  const data = first ? (first.data as FlowNodeData) : null
  const hasEdgeSel = selectedEdges.length > 0

  // Mind map uses straight radial spokes — no pipe ports / bend points
  if (isMindmap) {
    return (
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          fontSize: 11,
          color: MUTED,
          lineHeight: 1.45,
          padding: '8px 0',
        }}
      >
        Mind map links are straight radial spokes. Use Object Settings for
        hierarchy (parent/children) and link color. Auto Layout rebuilds the
        radial tree.
      </div>
    )
  }

  // Only edges selected → connection color + bend points
  if ((!data || data.isSubgraph) && hasEdgeSel) {
    return (
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <AutoConnectToggle />
        <EdgeBendPointsPanel />
      </div>
    )
  }

  if (!data || data.isSubgraph) {
    return (
      <div onMouseDown={(e) => e.stopPropagation()}>
        <AutoConnectToggle />
        <div
          style={{
            ...cardStyle,
            padding: '20px 14px',
            fontSize: 11,
            color: MUTED,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Select a flowchart shape for connection ports, or a connection for
          color and bend points.
        </div>
      </div>
    )
  }

  const layout = getPortLayout(data)
  const ids = () => resolveIds()

  const resetAll = () =>
    updateNodesPortLayout(ids(), {
      portCount: DEFAULT_PORT_LAYOUT.count,
      portRadius: DEFAULT_PORT_LAYOUT.radius,
      portRotation: DEFAULT_PORT_LAYOUT.rotation,
      portOnPerimeter: DEFAULT_PORT_LAYOUT.onPerimeter,
    })

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <AutoConnectToggle />
      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: TEXT,
                marginBottom: 2,
              }}
            >
              {displayNodes.length === 1
                ? 'Ports on selected shape'
                : `${displayNodes.length} shapes · shared port layout`}
            </div>
            <p
              style={{
                fontSize: 9,
                color: MUTED,
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              Connection ports only (where edges attach). Not related to adding
              shapes from the shape picker. Visible when this shape is selected.
              {layout.onPerimeter
                ? ' On perimeter: even spacing along the outline.'
                : ' Free radial: distance from center.'}
            </p>
          </div>
          <button
            type="button"
            title="Reset all node settings to defaults (4 ports, on perimeter, 0° rotate)"
            onClick={resetAll}
            style={{
              background: NEU_BG,
              border: '1px solid var(--neu-border, #3f3f46)',
              borderRadius: 8,
              boxShadow: 'var(--neu-shadow-raised)',
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 500,
              color: MUTED,
              cursor: 'pointer',
              lineHeight: 1.2,
              flexShrink: 0,
            }}
          >
            Reset
          </button>
        </div>

        <FieldLabel>Port count</FieldLabel>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 10,
          }}
        >
          <NeuBtn
            title="Remove one port"
            disabled={layout.count <= PORT_COUNT_MIN}
            onClick={() => removeNodePort(ids())}
          >
            − Port
          </NeuBtn>
          <span
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 700,
              color: TEXT,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {layout.count}
          </span>
          <NeuBtn
            title="Add one port"
            disabled={layout.count >= PORT_COUNT_MAX}
            onClick={() => addNodePort(ids())}
          >
            + Port
          </NeuBtn>
        </div>

        <label
          style={{
            display: 'block',
            marginBottom: 8,
            opacity: layout.onPerimeter ? 0.45 : 1,
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: MUTED,
              display: 'block',
              marginBottom: 3,
            }}
          >
            Distance from center · {Math.round(layout.radius * 100)}%
            {layout.onPerimeter ? ' (off while on perimeter)' : ''}
          </span>
          <input
            type="range"
            min={PORT_RADIUS_MIN}
            max={PORT_RADIUS_MAX}
            step={0.05}
            value={layout.radius}
            disabled={layout.onPerimeter}
            onChange={(e) =>
              updateNodesPortLayout(ids(), {
                portRadius: Number(e.target.value),
              })
            }
            style={{ width: '100%' }}
            aria-label="Port distance from center"
          />
        </label>

        <label style={{ display: 'block', marginBottom: 8 }}>
          <span
            style={{
              fontSize: 9,
              color: MUTED,
              display: 'block',
              marginBottom: 3,
            }}
          >
            Rotate · {Math.round(layout.rotation)}°
            {layout.onPerimeter ? ' (along perimeter)' : ' (around center)'}
          </span>
          <input
            type="range"
            min={-180}
            max={180}
            step={5}
            value={layout.rotation}
            onChange={(e) =>
              updateNodesPortLayout(ids(), {
                portRotation: Number(e.target.value),
              })
            }
            style={{ width: '100%' }}
            aria-label="Rotate port positions"
          />
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: TEXT,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={layout.onPerimeter}
            onChange={(e) =>
              updateNodesPortLayout(ids(), {
                portOnPerimeter: e.target.checked,
              })
            }
          />
          Snap ports to shape perimeter
        </label>
      </div>

      {/* Also show bend points if an edge is selected alongside nodes */}
      {hasEdgeSel && <EdgeBendPointsPanel />}
    </div>
  )
}
