import { useState } from 'react'
import { useFlowStore } from '../../lib/store'
import { serialize } from '../../lib/serializer'
import { layoutWithMermaid } from '../../lib/layoutFromMermaid'
import { ObjectSettingsSection } from './ObjectSettingsSection'
import { NodeSettingsSection } from './NodeSettingsSection'
import { DiagramSettingsSection } from './DiagramSettingsSection'

interface InspectorPanelProps {
  syntax: string
  onCollapse: () => void
}

const NEU_BG = 'var(--neu-bg)'

// Tree/hierarchy icon — clearly communicates "arrange into a layout"
function IconAutoLayout() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* Root node */}
      <rect x="9" y="1" width="6" height="4" rx="1" />
      {/* Left child */}
      <rect x="2" y="16" width="6" height="4" rx="1" />
      {/* Right child */}
      <rect x="16" y="16" width="6" height="4" rx="1" />
      {/* Trunk */}
      <line x1="12" y1="5" x2="12" y2="11" />
      {/* Branch */}
      <line x1="5" y1="11" x2="19" y2="11" />
      {/* Left leg */}
      <line x1="5" y1="11" x2="5" y2="16" />
      {/* Right leg */}
      <line x1="19" y1="11" x2="19" y2="16" />
    </svg>
  )
}

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
  const nodesLength = useFlowStore((s) => s.nodes.length)

  const handleAutoLayout = () => {
    const { nodes, edges, direction, diagramKind, layoutMindmap, theme, look, curveStyle } =
      useFlowStore.getState()
    if (nodes.length === 0) return
    // Mindmap: equal radial pie layout
    const sourceLooksMindmap = /^\s*mindmap\b/im.test(syntax)
    if (diagramKind === 'mindmap' || sourceLooksMindmap) {
      layoutMindmap({ fit: true })
      return
    }
    // Flowchart: exact Mermaid engine layout (nodes + edge paths = sheet card)
    const mermaidSrc =
      syntax.trim() ||
      serialize(nodes, edges, { direction, theme, look, curveStyle })
    void layoutWithMermaid(mermaidSrc, nodes, edges).then((laid) => {
      useFlowStore.getState().importDiagram(laid.nodes, laid.edges, {
        direction,
        theme,
        look,
        curveStyle,
        diagramKind: 'flowchart',
      })
      useFlowStore.setState((s) => ({ layoutEpoch: s.layoutEpoch + 1 }))
    })
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
          {/* Auto Layout */}
          <button
            onClick={handleAutoLayout}
            disabled={nodesLength === 0}
            title="Auto-arrange nodes into a hierarchy"
            aria-label="Auto Layout"
            style={{
              background: NEU_BG,
              border: 'none',
              borderRadius: 10,
              boxShadow: 'var(--neu-shadow-raised)',
              height: 28,
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              cursor: nodesLength === 0 ? 'not-allowed' : 'pointer',
              opacity: nodesLength === 0 ? 0.4 : 1,
              color: 'var(--neu-icon, #a1a1aa)',
              fontSize: 11,
              fontWeight: 500,
              transition: 'box-shadow 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <IconAutoLayout />
            Auto Layout
          </button>

          {/* Collapse */}
          <button
            onClick={onCollapse}
            title="Collapse inspector"
            aria-label="Collapse inspector"
            style={{
              background: NEU_BG,
              border: 'none',
              borderRadius: 10,
              boxShadow: 'var(--neu-shadow-raised)',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--neu-icon, #a1a1aa)',
              fontSize: 14,
              transition: 'box-shadow 0.15s',
            }}
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
      </div>
    </div>
  )
}
