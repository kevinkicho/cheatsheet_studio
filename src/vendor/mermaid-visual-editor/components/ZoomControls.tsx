import type { CSSProperties, ReactNode } from 'react'
import { useOnViewportChange, useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { fitViewPaddingForChrome } from '../lib/chromeLayout'
import { useFlowStore } from '../lib/store'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 2.5

const NEU_BG = '#12141a'

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

function clampZoomPct(n: number) {
  return Math.min(Math.round(MAX_ZOOM * 100), Math.max(Math.round(MIN_ZOOM * 100), n))
}

export function ZoomControls() {
  const { zoomIn, zoomOut, fitView, getZoom, zoomTo } = useReactFlow()
  const [zoom, setZoom] = useState(100)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('100')
  const inputRef = useRef<HTMLInputElement>(null)
  const { undo, redo } = useFlowStore(
    useShallow((s) => ({ undo: s.undo, redo: s.redo })),
  )
  const pastLength = useFlowStore((s) => s.past.length)
  const futureLength = useFlowStore((s) => s.future.length)
  const nodeCount = useFlowStore((s) => s.nodes.length)
  const chromeLayout = useFlowStore((s) => s.chromeLayout)
  const vertical = chromeLayout === 'vertical'

  const refreshZoom = () => {
    setZoom(Math.round(getZoom() * 100))
  }

  useEffect(() => {
    refreshZoom()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial zoom only
  }, [])

  useOnViewportChange({
    onChange: ({ zoom: z }) => {
      if (!editing) setZoom(Math.round(z * 100))
    },
    onEnd: ({ zoom: z }) => {
      if (!editing) setZoom(Math.round(z * 100))
    },
  })

  useEffect(() => {
    if (editing) {
      setDraft(String(zoom))
      window.setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [editing, zoom])

  const handleZoomIn = () => {
    zoomIn({ duration: 200 })
    window.setTimeout(refreshZoom, 220)
  }

  const handleZoomOut = () => {
    zoomOut({ duration: 200 })
    window.setTimeout(refreshZoom, 220)
  }

  const commitZoomDraft = () => {
    setEditing(false)
    const raw = draft.replace(/%/g, '').trim()
    const n = Number(raw)
    if (!Number.isFinite(n)) {
      refreshZoom()
      return
    }
    const pct = clampZoomPct(n)
    setZoom(pct)
    void zoomTo(pct / 100, { duration: 200 })
  }

  /** Frame every node, padding clears floating chrome (orientation-aware). */
  const handleFit = () => {
    void fitView({
      duration: 300,
      padding: fitViewPaddingForChrome(chromeLayout),
      maxZoom: MAX_ZOOM,
      minZoom: MIN_ZOOM,
    })
    window.setTimeout(refreshZoom, 320)
  }

  const barStyle: CSSProperties = vertical
    ? {
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        background: NEU_BG,
        borderRadius: 50,
        boxShadow: 'var(--neu-shadow-raised)',
        padding: '10px 6px',
        pointerEvents: 'auto',
        zIndex: 10,
      }
    : {
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        background: NEU_BG,
        borderRadius: 50,
        boxShadow: 'var(--neu-shadow-raised)',
        padding: '6px 10px',
        pointerEvents: 'auto',
        zIndex: 10,
      }

  const dividerStyle: CSSProperties = vertical
    ? {
        width: 16,
        height: 1,
        background: 'var(--neu-border, #3f3f46)',
        margin: '2px 0',
        flexShrink: 0,
      }
    : {
        width: 1,
        height: 16,
        background: 'var(--neu-border, #3f3f46)',
        margin: '0 2px',
        flexShrink: 0,
      }

  return (
    <div style={barStyle} data-chrome-bar="zoom" data-chrome-layout={chromeLayout}>
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

      <div style={dividerStyle} />

      <ZoomBtn onClick={handleZoomOut} title="Zoom out">
        −
      </ZoomBtn>

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label="Zoom percent"
          title="Type zoom % and press Enter"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitZoomDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitZoomDraft()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setEditing(false)
              refreshZoom()
            }
            e.stopPropagation()
          }}
          style={{
            background: NEU_BG,
            border: '1px solid var(--neu-border, #3f3f46)',
            borderRadius: 8,
            boxShadow: 'var(--neu-shadow-inset)',
            padding: vertical ? '4px 2px' : '4px 6px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--neu-icon-active, #818cf8)',
            width: vertical ? 40 : 48,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
            outline: 'none',
          }}
        />
      ) : (
        <button
          type="button"
          title="Click to type zoom %"
          onClick={() => setEditing(true)}
          style={{
            background: NEU_BG,
            border: 'none',
            borderRadius: 8,
            boxShadow: 'var(--neu-shadow-concave)',
            padding: vertical ? '4px 2px' : '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--neu-icon, #a1a1aa)',
            minWidth: vertical ? 36 : 40,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
            cursor: 'text',
            fontFamily: 'inherit',
          }}
        >
          {zoom}%
        </button>
      )}

      <ZoomBtn onClick={handleZoomIn} title="Zoom in">
        +
      </ZoomBtn>

      <div style={dividerStyle} />

      <ZoomBtn
        onClick={handleFit}
        title="Zoom fit — show all elements (clears tool chrome)"
        disabled={nodeCount === 0}
      >
        <IconFit />
      </ZoomBtn>
    </div>
  )
}
