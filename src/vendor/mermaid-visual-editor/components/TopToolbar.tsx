import type { ReactNode, Ref } from 'react'
import { useState, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFlowStore } from '../lib/store'
import { ShapePickerPopover } from './ShapePickerPopover'
import { SettingsPopover } from './SettingsPopover'
import { ImportModal } from './ImportModal'

interface TopToolbarProps {
  inspectorOpen: boolean
  onToggleInspector: () => void
  onOpenPalette?: () => void
  syntax: string
}

const NEU_BG = 'var(--neu-bg)'

function NeuIconBtn({
  onClick,
  disabled,
  active,
  title,
  children,
  buttonRef,
}: {
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  title?: string
  children: ReactNode
  buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        background: NEU_BG,
        border: 'none',
        borderRadius: 12,
        boxShadow: active
          ? 'var(--neu-shadow-inset)'
          : 'var(--neu-shadow-raised)',
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: active
          ? 'var(--neu-icon-active, #818cf8)'
          : 'var(--neu-icon, #a1a1aa)',
        fontSize: 16,
        transition: 'box-shadow 0.15s, color 0.15s',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 20,
        background: 'var(--neu-border, #3f3f46)',
        margin: '0 4px',
        flexShrink: 0,
      }}
    />
  )
}

const IconLayers = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
)

const IconPointer = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
  </svg>
)

const IconHand = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 11V6a2 2 0 0 0-4 0" />
    <path d="M14 10V4a2 2 0 0 0-4 0v2" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
)

const IconCube = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const IconCopy = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const IconSettings = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

export function TopToolbar({
  inspectorOpen,
  onToggleInspector,
  onOpenPalette,
  syntax,
}: TopToolbarProps) {
  const [shapePickerOpen, setShapePickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const { setInteractionMode, addSubgraph } = useFlowStore(
    useShallow((s) => ({
      setInteractionMode: s.setInteractionMode,
      addSubgraph: s.addSubgraph,
    })),
  )

  const drawingShape = useFlowStore((s) => s.drawingShape)
  const interactionMode = useFlowStore((s) => s.interactionMode)

  const shapeRootRef = useRef<HTMLDivElement>(null)
  const shapeBtnRef = useRef<HTMLButtonElement>(null)
  const settingsRootRef = useRef<HTMLDivElement>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)

  const selectActive = !drawingShape && interactionMode === 'select'
  const panActive = !drawingShape && interactionMode === 'pan'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(syntax)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'auto',
      }}
    >
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}

      <div
        style={{
          background: NEU_BG,
          borderRadius: 50,
          boxShadow: 'var(--neu-shadow-raised)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <NeuIconBtn
          onClick={onToggleInspector}
          active={inspectorOpen}
          title="Toggle Inspector panel"
        >
          <IconLayers />
        </NeuIconBtn>

        <NeuIconBtn
          onClick={() => setInteractionMode('select')}
          active={selectActive}
          title="Select mode (V)"
        >
          <IconPointer />
        </NeuIconBtn>

        <NeuIconBtn
          onClick={() => setInteractionMode('pan')}
          active={panActive}
          title="Pan mode (H)"
        >
          <IconHand />
        </NeuIconBtn>

        <div ref={shapeRootRef} style={{ position: 'relative' }}>
          <NeuIconBtn
            buttonRef={shapeBtnRef}
            onClick={() => {
              setShapePickerOpen((v) => !v)
              setSettingsOpen(false)
            }}
            active={shapePickerOpen || !!drawingShape}
            title="Shape picker"
          >
            <IconCube />
          </NeuIconBtn>
          {shapePickerOpen && (
            <ShapePickerPopover
              onClose={() => setShapePickerOpen(false)}
              anchorRef={shapeBtnRef}
              rootRef={shapeRootRef}
            />
          )}
        </div>

        <NeuIconBtn
          onClick={() => addSubgraph()}
          title="Add group / subgraph"
        >
          ⬡
        </NeuIconBtn>

        <Divider />

        <NeuIconBtn
          onClick={() => setImportOpen(true)}
          title="Import Mermaid syntax"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </NeuIconBtn>

        <NeuIconBtn
          onClick={handleCopy}
          active={copied}
          title="Copy Mermaid syntax"
        >
          <IconCopy />
        </NeuIconBtn>

        {onOpenPalette && (
          <>
            <Divider />
            <NeuIconBtn onClick={onOpenPalette} title="Command palette (⌘K)">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </NeuIconBtn>
          </>
        )}

        <div ref={settingsRootRef} style={{ position: 'relative' }}>
          <NeuIconBtn
            buttonRef={settingsBtnRef}
            onClick={() => {
              setSettingsOpen((v) => !v)
              setShapePickerOpen(false)
            }}
            active={settingsOpen}
            title="File & settings"
          >
            <IconSettings />
          </NeuIconBtn>
          {settingsOpen && (
            <SettingsPopover
              onClose={() => setSettingsOpen(false)}
              anchorRef={settingsBtnRef}
              rootRef={settingsRootRef}
            />
          )}
        </div>
      </div>

      {drawingShape && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#4F46E5',
            color: 'white',
            fontSize: 11,
            fontWeight: 500,
            padding: '5px 12px',
            borderRadius: 50,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(79,70,229,0.4)',
            zIndex: 30,
          }}
        >
          Drawing: {drawingShape} — drag on canvas — Esc to cancel
        </div>
      )}
    </div>
  )
}
