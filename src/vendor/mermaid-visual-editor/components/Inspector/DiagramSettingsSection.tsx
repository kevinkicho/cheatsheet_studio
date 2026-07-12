/**
 * Diagram Settings — flowchart + mindmap.
 *
 * Mindmap method map:
 * | UI                    | Store method              |
 * |-----------------------|---------------------------|
 * | Direction chips       | setDirection + layoutMindmap |
 * | Auto layout           | layoutMindmap             |
 * | + Child               | addMindmapChild + layout  |
 * | + Sibling / root      | addMindmapSibling + layout|
 */
import { useShallow } from 'zustand/react/shallow'
import {
  useFlowStore,
  type Direction,
  type Theme,
  type CurveStyle,
} from '../../lib/store'
import { applyDagreLayout } from '../../lib/layout'
import { DIRECTIONS, THEMES, CURVE_STYLES } from '../ShapeIcons'

const NEU_BG = 'var(--neu-bg)'
const TEXT = 'var(--neu-text, #e4e4e7)'
const MUTED = 'var(--neu-text-muted, #a1a1aa)'

function NeuBtn({
  onClick,
  active,
  children,
  title,
  disabled,
}: {
  onClick?: () => void
  active?: boolean
  children: React.ReactNode
  title?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: NEU_BG,
        border: 'none',
        borderRadius: 8,
        boxShadow: active
          ? 'var(--neu-shadow-inset)'
          : 'var(--neu-shadow-raised)',
        padding: '5px 10px',
        fontSize: 11,
        fontWeight: 500,
        color: active ? 'var(--neu-icon-active, #818cf8)' : MUTED,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'box-shadow 0.15s',
      }}
    >
      {children}
    </button>
  )
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: MUTED,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 10,
}

const subLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: MUTED,
  marginBottom: 6,
}

const selectStyle: React.CSSProperties = {
  background: NEU_BG,
  boxShadow: 'var(--neu-shadow-concave)',
  border: 'none',
  borderRadius: 8,
  padding: '5px 8px',
  fontSize: 11,
  color: TEXT,
  outline: 'none',
  cursor: 'pointer',
  width: '100%',
}

function withMindmapRelayout(fn: () => void) {
  fn()
  queueMicrotask(() =>
    useFlowStore.getState().layoutMindmap({ fit: false }),
  )
}

export function DiagramSettingsSection() {
  const {
    direction,
    theme,
    look,
    curveStyle,
    diagramKind,
    setDirection,
    setTheme,
    setLook,
    setCurveStyle,
    setNodes,
    layoutMindmap,
    addMindmapChild,
    addMindmapSibling,
  } = useFlowStore(
    useShallow((s) => ({
      direction: s.direction,
      theme: s.theme,
      look: s.look,
      curveStyle: s.curveStyle,
      diagramKind: s.diagramKind,
      setDirection: s.setDirection,
      setTheme: s.setTheme,
      setLook: s.setLook,
      setCurveStyle: s.setCurveStyle,
      setNodes: s.setNodes,
      layoutMindmap: s.layoutMindmap,
      addMindmapChild: s.addMindmapChild,
      addMindmapSibling: s.addMindmapSibling,
    })),
  )

  const nodesLength = useFlowStore((s) => s.nodes.length)
  const isMindmap = diagramKind === 'mindmap'

  const handleDirectionChange = (dir: Direction) => {
    setDirection(dir)
    if (isMindmap) {
      // Re-layout radial heading; keep zoom (user can Auto layout to fit)
      queueMicrotask(() => layoutMindmap({ fit: false }))
      return
    }
    const { nodes, edges } = useFlowStore.getState()
    if (nodes.length > 0) setNodes(applyDagreLayout(nodes, edges, dir))
  }

  return (
    <div onMouseDown={(e) => e.stopPropagation()}>
      <div style={sectionLabelStyle}>
        Diagram Settings{isMindmap ? ' · Mind map' : ''}
      </div>

      <div
        style={{
          background: NEU_BG,
          borderRadius: 14,
          boxShadow: 'var(--neu-shadow-concave)',
          padding: '14px',
        }}
      >
        <div style={subLabelStyle}>
          {isMindmap
            ? 'Radial heading → setDirection + layoutMindmap'
            : 'Layout Direction'}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          {DIRECTIONS.map(({ value, label, title }) => (
            <NeuBtn
              key={value}
              onClick={() => handleDirectionChange(value)}
              active={direction === value}
              title={title}
            >
              {label}
            </NeuBtn>
          ))}
        </div>

        {isMindmap ? (
          <>
            <div style={subLabelStyle}>Mind map actions</div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 12,
              }}
            >
              <NeuBtn
                onClick={() => layoutMindmap({ fit: true })}
                disabled={nodesLength === 0}
                title="Radial auto-layout and fit view"
              >
                ⟳ Auto layout
              </NeuBtn>
              <NeuBtn
                onClick={() =>
                  withMindmapRelayout(() => addMindmapChild())
                }
                title="addMindmapChild + layoutMindmap"
              >
                + Child
              </NeuBtn>
              <NeuBtn
                onClick={() =>
                  withMindmapRelayout(() => addMindmapSibling())
                }
                title="addMindmapSibling + layoutMindmap"
              >
                + Sibling / root
              </NeuBtn>
            </div>
            <p
              style={{
                fontSize: 10,
                color: MUTED,
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              <strong>layoutMindmap</strong> places N children evenly around
              each hub (3 → 120°, 2 → 180°). Spokes use shortest rim-to-rim
              paths. Object Settings maps label, colors, icon, reparent,
              promote/demote.
            </p>
          </>
        ) : (
          <>
            <div style={subLabelStyle}>Theme</div>
            <div style={{ marginBottom: 10 }}>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as Theme)}
                style={selectStyle}
                aria-label="Theme"
              >
                {THEMES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div style={subLabelStyle}>Curve Style</div>
            <div style={{ marginBottom: 10 }}>
              <select
                value={curveStyle}
                onChange={(e) =>
                  setCurveStyle(e.target.value as CurveStyle)
                }
                style={selectStyle}
                aria-label="Curve Style"
              >
                {CURVE_STYLES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <NeuBtn
              onClick={() =>
                setLook(look === 'handDrawn' ? 'classic' : 'handDrawn')
              }
              active={look === 'handDrawn'}
              title="Toggle hand-drawn look"
            >
              ✏ Hand-drawn {look === 'handDrawn' ? 'On' : 'Off'}
            </NeuBtn>
          </>
        )}
      </div>
    </div>
  )
}
