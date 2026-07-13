/**
 * Chart Settings — canvas chrome for the interactive flowchart/mindmap editor.
 * Canvas background is always transparent (card fill is set in Item properties).
 * Grid, connection color, multi-edge spacing, node look, import/copy Mermaid.
 */
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { useFlowStore } from '../../lib/store'
import { serialize } from '../../lib/serializer'
import { serializeMindmap } from '../../lib/mindmap'
import { ImportModal } from '../ImportModal'

const NEU_BG = 'var(--neu-bg)'
const TEXT = 'var(--neu-text, #e4e4e7)'
const MUTED = 'var(--neu-text-muted, #a1a1aa)'

const subLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: MUTED,
  marginBottom: 6,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

function currentMermaidSyntax(): string {
  const { nodes, edges, direction, theme, look, curveStyle, diagramKind } =
    useFlowStore.getState()
  if (diagramKind === 'mindmap') return serializeMindmap(nodes, edges)
  return serialize(nodes, edges, { direction, theme, look, curveStyle })
}

export function ChartSettingsSection() {
  const [importOpen, setImportOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const {
    chartShowGrid,
    chartGridColor,
    multiEdgeSpacing,
    look,
    setChartShowGrid,
    setChartGridColor,
    setMultiEdgeSpacing,
    setLook,
  } = useFlowStore(
    useShallow((s) => ({
      chartShowGrid: s.chartShowGrid,
      chartGridColor: s.chartGridColor,
      multiEdgeSpacing: s.multiEdgeSpacing,
      look: s.look,
      setChartShowGrid: s.setChartShowGrid,
      setChartGridColor: s.setChartGridColor,
      setMultiEdgeSpacing: s.setMultiEdgeSpacing,
      setLook: s.setLook,
    })),
  )

  const handleCopy = async () => {
    const syntax = currentMermaidSyntax()
    try {
      await navigator.clipboard.writeText(syntax)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <div onMouseDown={(e) => e.stopPropagation()}>
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}

      <div
        style={{
          background: NEU_BG,
          borderRadius: 14,
          boxShadow: 'var(--neu-shadow-concave)',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Mermaid import / copy */}
        <div>
          <div style={subLabelStyle}>Mermaid</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              style={{
                background: NEU_BG,
                border: 'none',
                borderRadius: 8,
                boxShadow: 'var(--neu-shadow-raised)',
                padding: '8px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: TEXT,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Import Mermaid syntax…
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              style={{
                background: NEU_BG,
                border: 'none',
                borderRadius: 8,
                boxShadow: copied
                  ? 'var(--neu-shadow-inset)'
                  : 'var(--neu-shadow-raised)',
                padding: '8px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: copied
                  ? 'var(--neu-icon-active, #818cf8)'
                  : TEXT,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {copied ? 'Copied!' : 'Copy Mermaid syntax'}
            </button>
          </div>
        </div>

        {/* Grid */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span style={{ ...subLabelStyle, marginBottom: 0 }}>Dot grid</span>
            <button
              type="button"
              onClick={() => setChartShowGrid(!chartShowGrid)}
              style={{
                background: NEU_BG,
                border: 'none',
                borderRadius: 8,
                boxShadow: chartShowGrid
                  ? 'var(--neu-shadow-inset)'
                  : 'var(--neu-shadow-raised)',
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: chartShowGrid
                  ? 'var(--neu-icon-active, #818cf8)'
                  : MUTED,
                cursor: 'pointer',
              }}
            >
              {chartShowGrid ? 'On' : 'Off'}
            </button>
          </div>
          {chartShowGrid && (
            <ColorPicker
              value={chartGridColor}
              defaultValue="#2a2d36"
              onChange={setChartGridColor}
              compact
              aria-label="Grid dot color"
            />
          )}
        </div>

        {/* Multi-edge spacing */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 6,
            }}
          >
            <span style={{ ...subLabelStyle, marginBottom: 0 }}>
              Multi-edge gap
            </span>
            <span style={{ fontSize: 11, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
              {multiEdgeSpacing}px
            </span>
          </div>
          <input
            type="range"
            min={8}
            max={48}
            step={1}
            value={multiEdgeSpacing}
            onChange={(e) => setMultiEdgeSpacing(Number(e.target.value))}
            aria-label="Spacing between parallel connections"
            style={{ width: '100%', accentColor: '#818cf8' }}
          />
          <p style={{ fontSize: 10, color: MUTED, margin: '4px 0 0' }}>
            Lateral gap for reverse pairs (e.g. No next to the forward line).
          </p>
        </div>

        {/* Look */}
        <div>
          <div style={subLabelStyle}>Node look</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(
              [
                { id: 'classic' as const, label: 'Classic' },
                { id: 'handDrawn' as const, label: 'Hand-drawn' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLook(opt.id)}
                style={{
                  flex: 1,
                  background: NEU_BG,
                  border: 'none',
                  borderRadius: 8,
                  boxShadow:
                    look === opt.id
                      ? 'var(--neu-shadow-inset)'
                      : 'var(--neu-shadow-raised)',
                  padding: '6px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  color:
                    look === opt.id
                      ? 'var(--neu-icon-active, #818cf8)'
                      : MUTED,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
