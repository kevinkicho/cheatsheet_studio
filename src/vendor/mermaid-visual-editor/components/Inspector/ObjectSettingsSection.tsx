/**
 * Object Settings — flowchart + mindmap.
 *
 * Mindmap method map (inspector → store):
 * | UI control              | Store method                          |
 * |-------------------------|----------------------------------------|
 * | Label                   | updateNodesLabel                      |
 * | Mermaid shape (export)  | updateNodesShape                      |
 * | Icon                    | updateNodesIcon                       |
 * | Fill / Border / Text    | updateNodesStyle                      |
 * | Reset colors            | updateNodesStyle(undefined…)          |
 * | + Child                 | addMindmapChild → layoutMindmap       |
 * | + Sibling / Root        | addMindmapSibling → layoutMindmap     |
 * | ↑ Promote               | promoteMindmapNodes → layoutMindmap   |
 * | ↓ Demote                | demoteMindmapNodes → layoutMindmap    |
 * | Parent topic            | reparentMindmapNodes → layoutMindmap  |
 * | Delete tree             | deleteMindmapSubtree                  |
 * | Edge line / color       | updateEdgeType                        |
 */
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  useFlowStore,
  type EdgeMarkerKind,
  type EdgeStyle,
  type FlowEdgeData,
  type FlowNodeData,
  type NodeShape,
  resolveEdgeMarkers,
} from '../../lib/store'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { FLOWCHART_SHAPES, ShapeIcon } from '../ShapeIcons'
import {
  MINDMAP_ICON_PRESETS,
  MINDMAP_SHAPES,
  mindmapChildrenOf,
  mindmapParentOf,
} from '../../lib/mindmap'


const NEU_BG = 'var(--neu-bg)'
const TEXT = 'var(--neu-text, #e4e4e7)'
const MUTED = 'var(--neu-text-muted, #a1a1aa)'

function NeuBtn({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick?: () => void
  active?: boolean
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

type ColorChannel = 'fill' | 'border' | 'text'

const COLOR_CHANNELS: {
  id: ColorChannel
  label: string
  defaultVal: string
}[] = [
  { id: 'fill', label: 'Fill', defaultVal: '#27272a' },
  { id: 'border', label: 'Border', defaultVal: '#71717a' },
  { id: 'text', label: 'Text', defaultVal: '#f4f4f5' },
]

/**
 * One shared palette for Fill / Border / Text — chip selects the channel,
 * then a single ColorPicker (native + defaults + recent) applies it.
 */
function NodeColorPalette({
  fill,
  border,
  text,
  onFill,
  onBorder,
  onText,
  onReset,
}: {
  fill?: string
  border?: string
  text?: string
  onFill: (hex: string) => void
  onBorder: (hex: string) => void
  onText: (hex: string) => void
  onReset: () => void
}) {
  const [channel, setChannel] = useState<ColorChannel>('fill')
  const values: Record<ColorChannel, string | undefined> = {
    fill,
    border,
    text,
  }
  const defaults: Record<ColorChannel, string> = {
    fill: '#27272a',
    border: '#71717a',
    text: '#f4f4f5',
  }
  const apply: Record<ColorChannel, (hex: string) => void> = {
    fill: onFill,
    border: onBorder,
    text: onText,
  }
  const active = channel
  const current = values[active]
  const defaultVal = defaults[active]

  return (
    <div
      style={{ minWidth: 0, marginBottom: 10 }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <FieldLabel>Colors</FieldLabel>
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        {COLOR_CHANNELS.map(({ id, label, defaultVal: d }) => {
          const v = values[id]
          const swatch = v || d
          const isOn = channel === id
          return (
            <button
              key={id}
              type="button"
              title={`${label}${v ? `: ${v}` : ' (default)'}`}
              aria-pressed={isOn}
              onClick={() => setChannel(id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: NEU_BG,
                border: isOn
                  ? '1px solid var(--neu-icon-active, #818cf8)'
                  : '1px solid var(--neu-border, #3f3f46)',
                borderRadius: 8,
                boxShadow: isOn
                  ? 'var(--neu-shadow-inset)'
                  : 'var(--neu-shadow-raised)',
                padding: '4px 8px',
                fontSize: 10,
                fontWeight: 600,
                color: isOn
                  ? 'var(--neu-icon-active, #818cf8)'
                  : MUTED,
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: swatch,
                  border: '1px solid rgba(255,255,255,0.15)',
                  flexShrink: 0,
                }}
              />
              {label}
            </button>
          )
        })}
      </div>
      <ColorPicker
        key={`palette-${active}-${current ?? 'def'}`}
        value={current}
        defaultValue={defaultVal}
        onChange={(hex) => apply[active](hex)}
        aria-label={`${COLOR_CHANNELS.find((c) => c.id === active)?.label} color`}
        compact
        endAction={
          <button
            type="button"
            title="Reset fill, border, and text to defaults"
            onClick={onReset}
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
            }}
          >
            Reset
          </button>
        }
      />
    </div>
  )
}

function LabeledColor({
  value,
  defaultVal,
  onChange,
  label,
}: {
  value?: string
  defaultVal: string
  onChange: (color: string) => void
  label: string
}) {
  return (
    <div
      style={{ minWidth: 0 }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <FieldLabel>{label}</FieldLabel>
      <ColorPicker
        value={value}
        defaultValue={defaultVal}
        onChange={onChange}
        aria-label={label}
        compact
      />
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: NEU_BG,
  boxShadow: 'var(--neu-shadow-concave)',
  border: 'none',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 12,
  color: TEXT,
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: MUTED,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 10,
}

const EDGE_STYLES: { style: EdgeStyle; label: string; glyph: string }[] = [
  { style: 'solid', label: 'Solid', glyph: '─' },
  { style: 'dashed', label: 'Dashed', glyph: '╌' },
  { style: 'thick', label: 'Thick', glyph: '━' },
]

/** Per-side marker chips (start and end independently). */
const MARKER_KINDS: { kind: EdgeMarkerKind; label: string; glyph: string }[] = [
  { kind: 'none', label: 'None (plain connection)', glyph: '─' },
  { kind: 'arrow', label: 'Arrow', glyph: '▶' },
  { kind: 'circle', label: 'Circle', glyph: '○' },
  { kind: 'cross', label: 'Cross', glyph: '✕' },
]

function selectedNodeIds(): string[] {
  return useFlowStore
    .getState()
    .nodes.filter((n) => n.selected)
    .map((n) => n.id)
}

function selectedEdgeIds(): string[] {
  return useFlowStore
    .getState()
    .edges.filter((e) => e.selected)
    .map((e) => e.id)
}

function nodeDataOf(n: { data: FlowNodeData }): FlowNodeData {
  return n.data
}

/**
 * Hierarchy mutation then radial re-layout **without** fitView (keeps zoom).
 */
function withMindmapRelayout(fn: () => void) {
  fn()
  queueMicrotask(() => {
    useFlowStore.getState().layoutMindmap({ fit: false })
  })
}

export function ObjectSettingsSection() {
  const diagramKind = useFlowStore((s) => s.diagramKind)
  const isMindmap = diagramKind === 'mindmap'

  const {
    updateNodesStyle,
    updateNodesShape,
    updateNodesLabel,
    updateNodesIcon,
    updateEdgeType,
    updateEdgeLabel,
    addMindmapChild,
    addMindmapSibling,
    reparentMindmapNodes,
    promoteMindmapNodes,
    demoteMindmapNodes,
    deleteMindmapSubtree,
    layoutMindmap,
  } = useFlowStore(
    useShallow((s) => ({
      updateNodesStyle: s.updateNodesStyle,
      updateNodesShape: s.updateNodesShape,
      updateNodesLabel: s.updateNodesLabel,
      updateNodesIcon: s.updateNodesIcon,
      updateEdgeType: s.updateEdgeType,
      updateEdgeLabel: s.updateEdgeLabel,
      addMindmapChild: s.addMindmapChild,
      addMindmapSibling: s.addMindmapSibling,
      reparentMindmapNodes: s.reparentMindmapNodes,
      promoteMindmapNodes: s.promoteMindmapNodes,
      demoteMindmapNodes: s.demoteMindmapNodes,
      deleteMindmapSubtree: s.deleteMindmapSubtree,
      layoutMindmap: s.layoutMindmap,
    })),
  )

  const selectedNodes = useFlowStore(
    useShallow((s) => s.nodes.filter((n) => n.selected)),
  )
  const selectedEdges = useFlowStore(
    useShallow((s) => s.edges.filter((e) => e.selected)),
  )
  const allNodes = useFlowStore((s) => s.nodes)
  const allEdges = useFlowStore((s) => s.edges)

  const lastNodeIds = useRef<string[]>([])
  const lastEdgeIds = useRef<string[]>([])
  useEffect(() => {
    if (selectedNodes.length > 0) {
      lastNodeIds.current = selectedNodes.map((n) => n.id)
    }
  }, [selectedNodes])
  useEffect(() => {
    if (selectedEdges.length > 0) {
      lastEdgeIds.current = selectedEdges.map((e) => e.id)
    }
  }, [selectedEdges])

  const resolveNodeIds = () => {
    const live = selectedNodeIds()
    return live.length > 0 ? live : lastNodeIds.current
  }
  const resolveEdgeIds = () => {
    const live = selectedEdgeIds()
    return live.length > 0 ? live : lastEdgeIds.current
  }

  const displayNodes =
    selectedNodes.length > 0
      ? selectedNodes
      : allNodes.filter((n) => lastNodeIds.current.includes(n.id))
  const displayEdges =
    selectedEdges.length > 0
      ? selectedEdges
      : allEdges.filter((e) => lastEdgeIds.current.includes(e.id))

  const firstNode = displayNodes[0] ?? null
  const firstNodeData = firstNode ? nodeDataOf(firstNode) : null
  const firstEdge = displayEdges[0] ?? null
  const firstEdgeData = firstEdge
    ? (firstEdge.data as FlowEdgeData | undefined)
    : undefined

  const activeShape: NodeShape = firstNodeData?.shape ?? (isMindmap ? 'circle' : 'rounded')
  const activeEdgeStyle: EdgeStyle = firstEdgeData?.edgeStyle ?? 'solid'
  const activeMarkers = resolveEdgeMarkers(
    isMindmap
      ? { startMarker: 'none', endMarker: 'none' }
      : firstEdgeData,
  )
  const edgeLabel =
    firstEdge && typeof firstEdge.label === 'string' ? firstEdge.label : ''

  const selectionKey = [
    ...displayNodes.map((n) => n.id),
    firstNodeData?.fillColor ?? '',
    firstNodeData?.strokeColor ?? '',
    firstNodeData?.textColor ?? '',
    firstNodeData?.icon ?? '',
    firstNodeData?.label ?? '',
  ].join('|')

  // Flowchart: only flowchart shapes (never bang/cloud). Mindmap: official mindmap set.
  const shapeOptions = isMindmap ? MINDMAP_SHAPES : FLOWCHART_SHAPES

  const currentParentId = firstNode
    ? mindmapParentOf(firstNode.id, allEdges)
    : null
  const childCount = firstNode
    ? mindmapChildrenOf(firstNode.id, allEdges, allNodes).length
    : 0

  const parentOptions = allNodes.filter(
    (n) => !displayNodes.some((s) => s.id === n.id) && !n.data.isSubgraph,
  )

  // ── Mindmap-bound handlers (explicit method wiring) ─────────────────────
  const mm = {
    setLabel: (label: string) => updateNodesLabel(resolveNodeIds(), label),
    setShape: (shape: NodeShape) => updateNodesShape(resolveNodeIds(), shape),
    setIcon: (icon: string | undefined) =>
      updateNodesIcon(resolveNodeIds(), icon),
    setFill: (c: string) =>
      updateNodesStyle(resolveNodeIds(), { fillColor: c }),
    setBorder: (c: string) =>
      updateNodesStyle(resolveNodeIds(), { strokeColor: c }),
    setText: (c: string) =>
      updateNodesStyle(resolveNodeIds(), { textColor: c }),
    resetColors: () =>
      updateNodesStyle(resolveNodeIds(), {
        fillColor: undefined,
        strokeColor: undefined,
        textColor: undefined,
      }),
    addChild: () =>
      withMindmapRelayout(() => addMindmapChild(resolveNodeIds()[0])),
    addSibling: () =>
      withMindmapRelayout(() => addMindmapSibling(resolveNodeIds()[0])),
    addRoot: () => withMindmapRelayout(() => addMindmapSibling(undefined)),
    promote: () =>
      withMindmapRelayout(() => promoteMindmapNodes(resolveNodeIds())),
    demote: () =>
      withMindmapRelayout(() => demoteMindmapNodes(resolveNodeIds())),
    reparent: (parentId: string | null) =>
      withMindmapRelayout(() =>
        reparentMindmapNodes(resolveNodeIds(), parentId),
      ),
    deleteTree: () => {
      if (
        !window.confirm('Delete selected topic(s) and all descendants?')
      ) {
        return
      }
      deleteMindmapSubtree(resolveNodeIds())
      queueMicrotask(() => layoutMindmap({ fit: false }))
    },
    setEdgeStyle: (style: EdgeStyle) =>
      resolveEdgeIds().forEach((id) =>
        updateEdgeType(id, { edgeStyle: style, arrowType: 'none' }),
      ),
    setEdgeColor: (color: string) =>
      resolveEdgeIds().forEach((id) =>
        updateEdgeType(id, { strokeColor: color }),
      ),
    /** Explicit Auto layout — may re-fit viewport */
    layout: () => layoutMindmap({ fit: true }),
  }

  if (!firstNodeData && !firstEdge) {
    return (
      <div onMouseDown={(e) => e.stopPropagation()}>
        <div style={sectionLabelStyle}>
          Object Settings{isMindmap ? ' · Mind map' : ''}
        </div>
        <div
          style={{
            background: NEU_BG,
            borderRadius: 14,
            boxShadow: 'var(--neu-shadow-concave)',
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 24, opacity: 0.3 }}>
            {isMindmap ? '◎' : '◻'}
          </div>
          <div
            style={{
              fontSize: 12,
              color: MUTED,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            {isMindmap
              ? 'Select a circular topic to edit colors, icon, hierarchy'
              : 'Select a node or edge to edit its properties'}
          </div>
          {isMindmap && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                marginTop: 4,
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <NeuBtn title="addMindmapSibling + layoutMindmap" onClick={mm.addRoot}>
                + Root topic
              </NeuBtn>
              <NeuBtn title="layoutMindmap" onClick={mm.layout}>
                ⟳ Auto layout
              </NeuBtn>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={sectionLabelStyle}>
        Object Settings{isMindmap ? ' · Mind map' : ''}
      </div>

      {firstNodeData && (
        <div
          style={{
            background: NEU_BG,
            borderRadius: 14,
            boxShadow: 'var(--neu-shadow-concave)',
            padding: 14,
            marginBottom: firstEdge ? 10 : 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: TEXT,
              marginBottom: 4,
            }}
          >
            {displayNodes.length === 1
              ? isMindmap
                ? `Topic · ${childCount} child${childCount === 1 ? '' : 'ren'}`
                : '1 node selected'
              : `${displayNodes.length} selected`}
          </div>
          {isMindmap && (
            <div
              style={{
                fontSize: 9,
                color: MUTED,
                marginBottom: 12,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              id: {firstNode?.id}
              {currentParentId ? ` · parent: ${currentParentId}` : ' · root'}
            </div>
          )}

          {/* Label → updateNodesLabel */}
          <FieldLabel>Label</FieldLabel>
          <input
            key={`${selectionKey}-label`}
            type="text"
            defaultValue={firstNodeData.label}
            onBlur={(e) => {
              const next = e.target.value.trim() || (isMindmap ? 'Topic' : 'Node')
              if (isMindmap) mm.setLabel(next)
              else updateNodesLabel(resolveNodeIds(), next)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            style={{ ...inputStyle, marginBottom: 12 }}
            aria-label="Node label"
          />

          {/* Shape → updateNodesShape (Mermaid export; canvas stays circular for mindmap) */}
          {!firstNodeData.isSubgraph && (
            <>
              <FieldLabel>
                {isMindmap ? 'Mind map shape' : 'Shape'}
              </FieldLabel>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(shapeOptions.length, 7)}, 1fr)`,
                  gap: 4,
                  marginBottom: 12,
                }}
              >
                {shapeOptions.map((opt) => {
                  const shape = opt.shape
                  const label = opt.label
                  const hint =
                    'hint' in opt && typeof opt.hint === 'string'
                      ? opt.hint
                      : label
                  const active = activeShape === shape
                  return (
                    <button
                      key={shape}
                      type="button"
                      title={isMindmap ? `${label} · ${hint}` : label}
                      aria-label={label}
                      aria-pressed={active}
                      data-testid={
                        isMindmap
                          ? `mindmap-shape-${shape}`
                          : `flowchart-shape-${shape}`
                      }
                      onClick={() => {
                        // Explicit shape id from the button — never infer by index
                        const ids = resolveNodeIds()
                        if (ids.length === 0) return
                        if (isMindmap) {
                          mm.setShape(shape)
                        } else {
                          updateNodesShape(ids, shape)
                        }
                      }}
                      style={{
                        background: NEU_BG,
                        border: active
                          ? '1px solid var(--neu-icon-active, #818cf8)'
                          : '1px solid transparent',
                        borderRadius: 8,
                        boxShadow: active
                          ? 'var(--neu-shadow-inset)'
                          : 'var(--neu-shadow-raised)',
                        padding: '6px 2px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: active
                          ? 'var(--neu-icon-active, #818cf8)'
                          : MUTED,
                      }}
                    >
                      <ShapeIcon
                        shape={shape}
                        stroke={
                          active
                            ? 'var(--neu-icon-active, #818cf8)'
                            : 'currentColor'
                        }
                        fill="transparent"
                      />
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Icon → updateNodesIcon */}
          {isMindmap && (
            <>
              <FieldLabel>Icon</FieldLabel>
              <select
                key={`${selectionKey}-icon`}
                value={firstNodeData.icon ?? ''}
                onChange={(e) => mm.setIcon(e.target.value || undefined)}
                style={{ ...selectStyle, marginBottom: 8 }}
                aria-label="Mind map icon"
              >
                {MINDMAP_ICON_PRESETS.map((p) => (
                  <option key={p.value || 'none'} value={p.value}>
                    {p.label}
                    {p.value ? ` · ${p.value}` : ''}
                  </option>
                ))}
              </select>
              <input
                type="text"
                key={`${selectionKey}-icon-custom`}
                placeholder="Custom: fa fa-tag"
                defaultValue={
                  firstNodeData.icon &&
                  !MINDMAP_ICON_PRESETS.some(
                    (p) => p.value === firstNodeData.icon,
                  )
                    ? firstNodeData.icon
                    : ''
                }
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v) mm.setIcon(v)
                }}
                style={{ ...inputStyle, marginBottom: 12, fontSize: 11 }}
                aria-label="Custom icon class"
              />
            </>
          )}

          {/* Single palette: Fill | Border | Text → updateNodesStyle */}
          <NodeColorPalette
            key={`colors-${firstNode?.id}`}
            fill={firstNodeData.fillColor}
            border={firstNodeData.strokeColor}
            text={firstNodeData.textColor}
            onFill={(c) =>
              isMindmap
                ? mm.setFill(c)
                : updateNodesStyle(resolveNodeIds(), { fillColor: c })
            }
            onBorder={(c) =>
              isMindmap
                ? mm.setBorder(c)
                : updateNodesStyle(resolveNodeIds(), { strokeColor: c })
            }
            onText={(c) =>
              isMindmap
                ? mm.setText(c)
                : updateNodesStyle(resolveNodeIds(), { textColor: c })
            }
            onReset={() =>
              isMindmap
                ? mm.resetColors()
                : updateNodesStyle(resolveNodeIds(), {
                    fillColor: undefined,
                    strokeColor: undefined,
                    textColor: undefined,
                  })
            }
          />

          {/* Hierarchy → add/promote/demote/reparent/delete + layoutMindmap */}
          {isMindmap && (
            <div style={{ marginTop: 14 }}>
              <FieldLabel>Hierarchy</FieldLabel>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                <NeuBtn title="addMindmapChild + layoutMindmap" onClick={mm.addChild}>
                  + Child
                </NeuBtn>
                <NeuBtn
                  title="addMindmapSibling + layoutMindmap"
                  onClick={mm.addSibling}
                >
                  + Sibling
                </NeuBtn>
                <NeuBtn
                  title="promoteMindmapNodes + layoutMindmap"
                  onClick={mm.promote}
                >
                  ↑ Promote
                </NeuBtn>
                <NeuBtn
                  title="demoteMindmapNodes + layoutMindmap"
                  onClick={mm.demote}
                >
                  ↓ Demote
                </NeuBtn>
                <NeuBtn
                  title="deleteMindmapSubtree + layoutMindmap"
                  onClick={mm.deleteTree}
                >
                  Delete tree
                </NeuBtn>
                <NeuBtn title="layoutMindmap" onClick={mm.layout}>
                  ⟳ Layout
                </NeuBtn>
              </div>

              <FieldLabel>Parent topic</FieldLabel>
              <select
                key={`${selectionKey}-parent`}
                value={currentParentId ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  mm.reparent(v === '' ? null : v)
                }}
                style={selectStyle}
                aria-label="Parent topic"
              >
                <option value="">— Root (no parent) —</option>
                {parentOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data.label || n.id}
                  </option>
                ))}
              </select>
              <p
                style={{
                  fontSize: 9,
                  color: MUTED,
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                Tab = child · Enter = sibling · Shift+Tab = promote · hierarchy
                actions re-run radial Auto layout
              </p>
            </div>
          )}
        </div>
      )}

      {firstEdge && (
        <div
          style={{
            background: NEU_BG,
            borderRadius: 14,
            boxShadow: 'var(--neu-shadow-concave)',
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: TEXT,
              marginBottom: 12,
            }}
          >
            {displayEdges.length === 1
              ? isMindmap
                ? '1 radial link'
                : '1 edge selected'
              : `${displayEdges.length} edges selected`}
          </div>

          {!isMindmap && (
            <>
              <FieldLabel>Label</FieldLabel>
              <input
                key={`${selectionKey}-edge-label`}
                type="text"
                defaultValue={edgeLabel}
                placeholder="Optional edge label"
                onBlur={(e) => {
                  const next = e.target.value.trim()
                  resolveEdgeIds().forEach((id) => updateEdgeLabel(id, next))
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                style={{ ...inputStyle, marginBottom: 12 }}
                aria-label="Edge label"
              />
            </>
          )}

          <FieldLabel>{isMindmap ? 'Link style' : 'Line style'}</FieldLabel>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {EDGE_STYLES.map(({ style, label, glyph }) => (
              <NeuBtn
                key={style}
                onClick={() =>
                  isMindmap
                    ? mm.setEdgeStyle(style)
                    : resolveEdgeIds().forEach((id) =>
                        updateEdgeType(id, { edgeStyle: style }),
                      )
                }
                active={activeEdgeStyle === style}
                title={label}
              >
                {glyph} {label}
              </NeuBtn>
            ))}
          </div>

          {!isMindmap && (
            <>
              <FieldLabel>Start marker (source)</FieldLabel>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginBottom: 10,
                  flexWrap: 'wrap',
                }}
              >
                {MARKER_KINDS.map(({ kind, label, glyph }) => (
                  <NeuBtn
                    key={`start-${kind}`}
                    onClick={() =>
                      resolveEdgeIds().forEach((id) =>
                        updateEdgeType(id, { startMarker: kind }),
                      )
                    }
                    active={activeMarkers.start === kind}
                    title={label}
                  >
                    {glyph}
                  </NeuBtn>
                ))}
              </div>
              <FieldLabel>End marker (target)</FieldLabel>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginBottom: 12,
                  flexWrap: 'wrap',
                }}
              >
                {MARKER_KINDS.map(({ kind, label, glyph }) => (
                  <NeuBtn
                    key={`end-${kind}`}
                    onClick={() =>
                      resolveEdgeIds().forEach((id) =>
                        updateEdgeType(id, { endMarker: kind }),
                      )
                    }
                    active={activeMarkers.end === kind}
                    title={label}
                  >
                    {glyph}
                  </NeuBtn>
                ))}
              </div>
              <p
                style={{
                  fontSize: 9,
                  color: MUTED,
                  lineHeight: 1.4,
                  margin: '0 0 10px',
                }}
              >
                ─ = no arrow (plain line). Set both ends to ─ for a connection
                with no markers. Each side is independent.
              </p>
            </>
          )}

          <LabeledColor
            key={`edge-${firstEdge.id}-${firstEdgeData?.strokeColor ?? 'def'}`}
            value={firstEdgeData?.strokeColor}
            defaultVal="#a1a1aa"
            label={isMindmap ? 'Link color' : 'Edge color'}
            onChange={(color) =>
              isMindmap
                ? mm.setEdgeColor(color)
                : resolveEdgeIds().forEach((id) =>
                    updateEdgeType(id, { strokeColor: color }),
                  )
            }
          />
        </div>
      )}
    </div>
  )
}
