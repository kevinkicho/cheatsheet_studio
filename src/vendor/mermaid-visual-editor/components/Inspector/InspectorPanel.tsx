import { useState } from 'react'
import { ObjectSettingsSection } from './ObjectSettingsSection'
import { NodeSettingsSection } from './NodeSettingsSection'
import { DiagramSettingsSection } from './DiagramSettingsSection'
import { ChartSettingsSection } from './ChartSettingsSection'

interface InspectorPanelProps {
  syntax: string
  onCollapse: () => void
}

const NEU_BG = 'var(--neu-bg)'

const iconBtnStyle = (): React.CSSProperties => ({
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
  cursor: 'pointer',
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

export function InspectorPanel({ onCollapse }: InspectorPanelProps) {
  // All sections start collapsed so the panel stays compact
  const [nodeOpen, setNodeOpen] = useState(false)
  const [objectOpen, setObjectOpen] = useState(false)
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  // Auto Layout + Organize Connections live on the left/bottom tool chrome

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
            onClick={onCollapse}
            title="Collapse inspector"
            aria-label="Collapse inspector"
            style={iconBtnStyle()}
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
