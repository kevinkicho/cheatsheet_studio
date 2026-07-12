/**
 * Node Settings — connection ports (count, distance, rotation, perimeter).
 * Shown when a flowchart shape (not group / mindmap) is selected.
 */
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFlowStore, type FlowNodeData } from '../../lib/store'
import {
  DEFAULT_PORT_LAYOUT,
  PORT_COUNT_MAX,
  PORT_COUNT_MIN,
  PORT_RADIUS_MAX,
  PORT_RADIUS_MIN,
  getPortLayout,
} from '../../lib/portLayout'

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

function selectedNodeIds(): string[] {
  return useFlowStore
    .getState()
    .nodes.filter((n) => n.selected && !n.data.isSubgraph)
    .map((n) => n.id)
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
        Connection ports apply to flowchart shapes. Mind map topics use the
        center handle — edit hierarchy under Object Settings.
      </div>
    )
  }

  if (!data || data.isSubgraph) {
    return (
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: NEU_BG,
          borderRadius: 14,
          boxShadow: 'var(--neu-shadow-concave)',
          padding: '20px 14px',
          fontSize: 11,
          color: MUTED,
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        Select a flowchart shape to edit its connection ports (dots on the
        perimeter).
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
      <div
        style={{
          background: NEU_BG,
          borderRadius: 14,
          boxShadow: 'var(--neu-shadow-concave)',
          padding: 14,
        }}
      >
        {/* Header row: title + top-right Reset */}
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
              {layout.onPerimeter
                ? 'On perimeter: dots are spaced evenly along the shape outline (perimeter ÷ count). Rotate shifts them along the path.'
                : 'Free radial: dots sit on a circle around the center. Distance moves them in/out from the border.'}
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
            {layout.onPerimeter
              ? ' (along perimeter)'
              : ' (around center)'}
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
    </div>
  )
}
