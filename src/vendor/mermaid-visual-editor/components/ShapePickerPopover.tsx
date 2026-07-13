import type { RefObject } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFlowStore, type NodeShape } from '../lib/store'
import { ShapeIcon, ALL_SHAPES } from './ShapeIcons'
import { PopoverPortal } from './PopoverPortal'

interface ShapePickerPopoverProps {
  onClose: () => void
  /** Trigger button (position anchor). */
  anchorRef: RefObject<HTMLElement | null>
  /** Wrapper that includes trigger + keeps outside-click from fighting toggle. */
  rootRef: RefObject<HTMLElement | null>
}

/**
 * Popover portals to document.body — CSS vars from `.mermaid-visual-editor`
 * do not apply. Use solid studio colors so the panel is never transparent.
 */
const PANEL_BG = '#1e2028'
const PANEL_BORDER = '#3f3f46'
const PANEL_TEXT_MUTED = '#a1a1aa'
const PANEL_ICON = '#a1a1aa'
const PANEL_ICON_ACTIVE = '#818cf8'
const PANEL_SHADOW =
  '0 8px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(63,63,70,0.85)'
const BTN_SHADOW_RAISED =
  '0 1px 2px rgba(0,0,0,0.45), 0 0 0 1px rgba(63,63,70,0.6)'
const BTN_SHADOW_INSET =
  'inset 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1px rgba(63,63,70,0.5)'

export function ShapePickerPopover({
  onClose,
  anchorRef,
  rootRef,
}: ShapePickerPopoverProps) {
  const { drawingShape, setDrawingShape, updateNodeShape } = useFlowStore(
    useShallow((s) => ({
      drawingShape: s.drawingShape,
      setDrawingShape: s.setDrawingShape,
      updateNodeShape: s.updateNodeShape,
    })),
  )

  const selectedNodes = useFlowStore(
    useShallow((s) => s.nodes.filter((n) => n.selected)),
  )
  const hasNodeSelection = selectedNodes.length > 0

  const displayShape: NodeShape =
    selectedNodes.length === 1
      ? selectedNodes[0].data.shape
      : (drawingShape ?? 'rectangle')

  const handleShapeClick = (shape: NodeShape) => {
    // Wire each button to its ALL_SHAPES entry shape id (not position index)
    if (hasNodeSelection) {
      selectedNodes.forEach((n) => updateNodeShape(n.id, shape))
    } else {
      setDrawingShape(shape)
      onClose()
    }
  }

  const rows = [ALL_SHAPES.slice(0, 7), ALL_SHAPES.slice(7)]

  return (
    <PopoverPortal
      anchorRef={anchorRef}
      rootRef={rootRef}
      onClose={onClose}
      align="center"
      maxHeight={280}
      style={{
        background: PANEL_BG,
        borderRadius: 16,
        boxShadow: PANEL_SHADOW,
        padding: 14,
        minWidth: 300,
        border: `1px solid ${PANEL_BORDER}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: PANEL_TEXT_MUTED,
          letterSpacing: '0.08em',
          marginBottom: 10,
          textTransform: 'uppercase',
        }}
      >
        {hasNodeSelection ? 'Change Shape' : 'Draw Shape'}
      </div>
      {rows.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: ri === 0 ? 6 : 0,
          }}
        >
          {row.map(({ shape, label }) => {
            const isActive = hasNodeSelection
              ? selectedNodes.every((n) => n.data.shape === shape)
              : drawingShape === shape ||
                (!drawingShape && displayShape === shape)
            return (
              <button
                key={shape}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => handleShapeClick(shape)}
                style={{
                  width: 36,
                  height: 32,
                  borderRadius: 10,
                  border: 'none',
                  background: PANEL_BG,
                  boxShadow: isActive ? BTN_SHADOW_INSET : BTN_SHADOW_RAISED,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                  color: isActive ? PANEL_ICON_ACTIVE : PANEL_ICON,
                }}
              >
                <ShapeIcon
                  shape={shape}
                  stroke={isActive ? PANEL_ICON_ACTIVE : PANEL_ICON}
                />
              </button>
            )
          })}
        </div>
      ))}
      {hasNodeSelection ? (
        <p
          style={{
            margin: '0 0 10px',
            fontSize: 10,
            color: PANEL_TEXT_MUTED,
            lineHeight: 1.4,
          }}
        >
          Changes the shape of the selected object(s).
        </p>
      ) : null}
    </PopoverPortal>
  )
}
