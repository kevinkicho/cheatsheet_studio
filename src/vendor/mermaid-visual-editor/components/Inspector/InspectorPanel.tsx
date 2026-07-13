import { useState } from 'react'
import { useFlowStore } from '../../lib/store'
import { serialize } from '../../lib/serializer'
import { cleanFlowchartLayout } from '../../lib/layout'
import { layoutWithMermaid } from '../../lib/layoutFromMermaid'
import { ObjectSettingsSection } from './ObjectSettingsSection'
import { NodeSettingsSection } from './NodeSettingsSection'
import { DiagramSettingsSection } from './DiagramSettingsSection'
import { ChartSettingsSection } from './ChartSettingsSection'

interface InspectorPanelProps {
  syntax: string
  onCollapse: () => void
}

const NEU_BG = 'var(--neu-bg)'

// Tree/hierarchy icon — full node re-layout
function IconAutoLayout() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="4" rx="1" />
      <rect x="2" y="16" width="6" height="4" rx="1" />
      <rect x="16" y="16" width="6" height="4" rx="1" />
      <line x1="12" y1="5" x2="12" y2="11" />
      <line x1="5" y1="11" x2="19" y2="11" />
      <line x1="5" y1="11" x2="5" y2="16" />
      <line x1="19" y1="11" x2="19" y2="16" />
    </svg>
  )
}

/** Fan / uncross multi-edge icon — fix connections only */
function IconOrganizeEdges() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M7.5 8 L10.5 15.5" />
      <path d="M16.5 8 L13.5 15.5" />
    </svg>
  )
}

const iconBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: NEU_BG,
  border: 'none',
  borderRadius: 10,
  boxShadow: 'var(--neu-shadow-raised)',
  width: 28,
  height: 28,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  color: 'var(--neu-text, #e4e4e7)',
  flexShrink: 0,
})

function AccordionSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 0 8px',
          color: 'var(--neu-text, #e4e4e7)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        <span>{title}</span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--neu-text-muted, #a1a1aa)',
            transition: 'transform 0.15s',
            display: 'inline-block',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >
          ▾
        </span>
      </button>
      <div
        style={{
          height: 1,
          background: 'var(--neu-border, #3f3f46)',
          marginBottom: open ? 10 : 0,
        }}
      />
      {open && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  )
}

export function InspectorPanel({ syntax, onCollapse }: InspectorPanelProps) {
  // All sections start collapsed so the panel stays compact
  const [nodeOpen, setNodeOpen] = useState(false)
  const [objectOpen, setObjectOpen] = useState(false)
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  const nodesLength = useFlowStore((s) => s.nodes.length)

  /**
   * Auto Layout — move nodes into a clean hierarchy (Mermaid, else dagre).
   * Overwrites free-form positions.
   */
  const handleAutoLayout = () => {
    const {
      nodes,
      edges,
      direction,
      diagramKind,
      layoutMindmap,
      theme,
      look,
      curveStyle,
      autoConnectEdges,
    } = useFlowStore.getState()
    if (nodes.length === 0) return
    const sourceLooksMindmap = /^\s*mindmap\b/im.test(syntax)
    if (diagramKind === 'mindmap' || sourceLooksMindmap) {
      layoutMindmap({ fit: true })
      return
    }

    const mermaidSrc =
      syntax.trim() ||
      serialize(nodes, edges, { direction, theme, look, curveStyle })

    // Preserve user-plugged edges when auto-connect is off
    const edgesAfterLayout = (laidEdges: typeof edges) =>
      autoConnectEdges ? laidEdges : edges

    const applyClean = (n = nodes, e = edges) => {
      const cleaned = cleanFlowchartLayout(n, e, direction)
      useFlowStore.getState().importDiagram(cleaned.nodes, cleaned.edges, {
        direction,
        theme,
        look,
        curveStyle,
        diagramKind: 'flowchart',
      })
      useFlowStore.setState((s) => ({ layoutEpoch: s.layoutEpoch + 1 }))
    }

    // Prefer mermaid-measured sizes, then dagre ranks for a clean stack
    void layoutWithMermaid(mermaidSrc, nodes, edges)
      .then((laid) => {
        const n = laid.nodes.length ? laid.nodes : nodes
        const e = autoConnectEdges ? edgesAfterLayout(laid.edges) : edges
        applyClean(n, e)
      })
      .catch(() => {
        applyClean()
      })
  }

  /**
   * Organize connections — keep node positions; reset edge routing
   * (clear frozen Mermaid paths + bend waypoints so live multi-edge arcs apply).
   */
  const handleOrganizeConnections = () => {
    const { nodes, edges, diagramKind, layoutMindmap, pushHistory } =
      useFlowStore.getState()
    if (nodes.length === 0) return

    // Mind map: re-layout tree without forcing a zoom fit
    if (diagramKind === 'mindmap') {
      layoutMindmap({ fit: false })
      return
    }

    let changed = false
    const cleaned = edges.map((e) => {
      const d = e.data
      if (!d) return e
      const hasFrozen =
        Boolean(d.mermaidPath) ||
        Boolean(d.mermaidLabelX != null) ||
        Boolean(d.mermaidLabelY != null) ||
        (d.waypoints != null && d.waypoints.length > 0)
      if (!hasFrozen) return e
      changed = true
      const {
        mermaidPath: _p,
        mermaidLabelX: _x,
        mermaidLabelY: _y,
        waypoints: _w,
        ...rest
      } = d
      return { ...e, data: rest as typeof d }
    })

    if (!changed) {
      // Still force a soft re-render of multi-edge routing by rewriting edges array
      pushHistory()
      useFlowStore.setState({ edges: edges.map((e) => ({ ...e })) })
      return
    }

    pushHistory()
    useFlowStore.setState({ edges: cleaned })
  }

  return (
    <div
      data-testid="mermaid-inspector-panel"
      className="nopan nodrag"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: 280,
        maxWidth: '100%',
        height: '100%',
        background: NEU_BG,
        boxShadow: 'var(--neu-shadow-raised)',
        borderLeft: '1px solid var(--neu-border, #3f3f46)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px 10px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--neu-text, #e4e4e7)',
            letterSpacing: '-0.01em',
          }}
        >
          Inspector
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={handleOrganizeConnections}
            disabled={nodesLength === 0}
            title="Organize connections — keep nodes, reset edge routes & bend points"
            aria-label="Organize connections"
            style={iconBtnStyle(nodesLength === 0)}
          >
            <IconOrganizeEdges />
          </button>
          <button
            type="button"
            onClick={handleAutoLayout}
            disabled={nodesLength === 0}
            title="Auto Layout — rearrange all nodes (Mermaid / dagre)"
            aria-label="Auto Layout"
            style={iconBtnStyle(nodesLength === 0)}
          >
            <IconAutoLayout />
          </button>

          <button
            type="button"
            onClick={onCollapse}
            title="Collapse inspector"
            aria-label="Collapse inspector"
            style={iconBtnStyle(false)}
          >
            ×
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px' }}>
        <AccordionSection
          title="Node Settings"
          open={nodeOpen}
          onToggle={() => setNodeOpen((v) => !v)}
        >
          <NodeSettingsSection />
        </AccordionSection>
        <div style={{ height: 8 }} />
        <AccordionSection
          title="Object Settings"
          open={objectOpen}
          onToggle={() => setObjectOpen((v) => !v)}
        >
          <ObjectSettingsSection />
        </AccordionSection>
        <div style={{ height: 8 }} />
        <AccordionSection
          title="Diagram Settings"
          open={diagramOpen}
          onToggle={() => setDiagramOpen((v) => !v)}
        >
          <DiagramSettingsSection />
        </AccordionSection>
        <div style={{ height: 8 }} />
        <AccordionSection
          title="Chart Settings"
          open={chartOpen}
          onToggle={() => setChartOpen((v) => !v)}
        >
          <ChartSettingsSection />
        </AccordionSection>
      </div>
    </div>
  )
}
