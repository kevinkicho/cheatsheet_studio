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

const NEU_BG = 'var(--neu-bg)'

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
        background: NEU_BG,
        borderRadius: 16,
        boxShadow: 'var(--neu-shadow-raised)',
        padding: 14,
        minWidth: 300,
        border: '1px solid var(--neu-border, #3f3f46)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--neu-text-muted, #a1a1aa)',
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
                  background: NEU_BG,
                  boxShadow: isActive
                    ? 'var(--neu-shadow-inset)'
                    : 'var(--neu-shadow-raised)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                  color: isActive
                    ? 'var(--neu-icon-active, #818cf8)'
                    : 'var(--neu-icon, #a1a1aa)',
                }}
              >
                <ShapeIcon
                  shape={shape}
                  stroke={
                    isActive
                      ? 'var(--neu-icon-active, #818cf8)'
                      : 'var(--neu-icon, #a1a1aa)'
                  }
                />
              </button>
            )
          })}
        </div>
      ))}
      {!hasNodeSelection && drawingShape && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: 'var(--neu-icon-active, #818cf8)',
            textAlign: 'center',
          }}
        >
          Click &amp; drag on canvas to draw — Esc to cancel
        </div>
      )}
    </PopoverPortal>
  )
}
