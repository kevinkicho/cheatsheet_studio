import type { ReactNode } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFlowStore } from '../lib/store'

const NEU_BG = 'var(--neu-bg)'

function ZoomBtn({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void
  title: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        background: NEU_BG,
        border: 'none',
        borderRadius: 10,
        boxShadow: 'var(--neu-shadow-raised)',
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: 'var(--neu-icon, #a1a1aa)',
        fontSize: 16,
        fontWeight: 500,
        transition: 'box-shadow 0.15s',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

const IconUndo = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 14 4 9 9 4" />
    <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
  </svg>
)

const IconRedo = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 14 20 9 15 4" />
    <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
  </svg>
)

/** Maximize / fit-all nodes into view */
const IconFit = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
)

export function ZoomControls() {
  const { zoomIn, zoomOut, fitView, getZoom } = useReactFlow()
  const [zoom, setZoom] = useState(100)
  const { undo, redo } = useFlowStore(
    useShallow((s) => ({ undo: s.undo, redo: s.redo })),
  )
  const pastLength = useFlowStore((s) => s.past.length)
  const futureLength = useFlowStore((s) => s.future.length)
  const nodeCount = useFlowStore((s) => s.nodes.length)

  const refreshZoom = () => {
    setZoom(Math.round(getZoom() * 100))
  }

  useEffect(() => {
    refreshZoom()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial zoom only
  }, [])

  const handleZoomIn = () => {
    zoomIn({ duration: 200 })
    window.setTimeout(refreshZoom, 220)
  }

  const handleZoomOut = () => {
    zoomOut({ duration: 200 })
    window.setTimeout(refreshZoom, 220)
  }

  /** Frame every node/edge in the viewport (padding so chrome doesn’t clip). */
  const handleFit = () => {
    void fitView({
      duration: 300,
      padding: 0.18,
      maxZoom: 1.5,
      minZoom: 0.15,
    })
    window.setTimeout(refreshZoom, 320)
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: NEU_BG,
        borderRadius: 50,
        boxShadow: 'var(--neu-shadow-raised)',
        padding: '6px 10px',
        pointerEvents: 'auto',
        zIndex: 10,
      }}
    >
      <ZoomBtn onClick={undo} title="Undo (Ctrl+Z)" disabled={pastLength === 0}>
        <IconUndo />
      </ZoomBtn>
      <ZoomBtn
        onClick={redo}
        title="Redo (Ctrl+Shift+Z)"
        disabled={futureLength === 0}
      >
        <IconRedo />
      </ZoomBtn>

      <div
        style={{
          width: 1,
          height: 16,
          background: 'var(--neu-border, #3f3f46)',
          margin: '0 2px',
          flexShrink: 0,
        }}
      />

      <ZoomBtn onClick={handleZoomOut} title="Zoom out">
        −
      </ZoomBtn>

      <span
        title="Current zoom"
        style={{
          background: NEU_BG,
          borderRadius: 8,
          boxShadow: 'var(--neu-shadow-concave)',
          padding: '4px 8px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--neu-icon, #a1a1aa)',
          minWidth: 40,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          userSelect: 'none',
        }}
      >
        {zoom}%
      </span>

      <ZoomBtn onClick={handleZoomIn} title="Zoom in">
        +
      </ZoomBtn>

      <div
        style={{
          width: 1,
          height: 16,
          background: 'var(--neu-border, #3f3f46)',
          margin: '0 2px',
          flexShrink: 0,
        }}
      />

      <ZoomBtn
        onClick={handleFit}
        title="Zoom fit — show all elements"
        disabled={nodeCount === 0}
      >
        <IconFit />
      </ZoomBtn>
    </div>
  )
}
