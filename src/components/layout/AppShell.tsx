import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'
import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import type { LibraryItem } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore } from '@/stores/uiStore'
import { TopBar } from './TopBar'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { BottomLibraryPanel } from './BottomLibraryPanel'
import { CanvasDragPreview } from '@/components/canvas/CanvasDragPreview'
import { MainCanvas } from '@/components/canvas/MainCanvas'
import { useSheetSync } from '@/hooks/useSheetSync'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { FullLibraryView } from '@/pages/FullLibraryView'
import { SheetsView } from '@/pages/SheetsView'

export function AppShell() {
  const view = useUiStore((s) => s.view)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const bottomOpen = useUiStore((s) => s.bottomOpen)
  const setLeftOpen = useUiStore((s) => s.setLeftOpen)
  const setRightOpen = useUiStore((s) => s.setRightOpen)
  const setBottomOpen = useUiStore((s) => s.setBottomOpen)
  const addFromLibrary = useCanvasStore((s) => s.addFromLibrary)

  const [activeLib, setActiveLib] = useState<LibraryItem | null>(null)

  useSheetSync()
  useKeyboardShortcuts()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  const onDragStart = (event: DragStartEvent) => {
    const lib = event.active.data.current?.libraryItem as LibraryItem | undefined
    if (lib) setActiveLib(lib)
  }

  const onDragEnd = (event: DragEndEvent) => {
    setActiveLib(null)
    const lib = event.active.data.current?.libraryItem as LibraryItem | undefined
    if (!lib) return

    const overId = event.over?.id
    if (overId !== 'main-canvas') return

    const surface = document.getElementById('main-canvas-surface')
    if (!surface) {
      addFromLibrary(lib, 120, 120)
      return
    }

    const rect = surface.getBoundingClientRect()
    const zoom = Number(surface.dataset.zoom || useUiStore.getState().canvasZoom || 1)
    const translated = event.active.rect.current.translated
    const clientX = translated
      ? translated.left + translated.width / 2
      : rect.left + 120
    const clientY = translated
      ? translated.top + translated.height / 2
      : rect.top + 120

    // Convert screen coords → canvas coords (undo CSS scale).
    const x = Math.max(0, Math.round((clientX - rect.left) / zoom - 40))
    const y = Math.max(0, Math.round((clientY - rect.top) / zoom - 20))
    addFromLibrary(lib, x, y)
  }

  const workspace = useMemo(
    () => (
      <PanelGroup direction="vertical" autoSaveId="cheatsheet-v">
        <Panel defaultSize={bottomOpen ? 68 : 96} minSize={30}>
          <PanelGroup direction="horizontal" autoSaveId="cheatsheet-h">
            {/* Left (Properties) — thin strip when minimized */}
            {leftOpen ? (
              <>
                <Panel defaultSize={18} minSize={12} maxSize={32} order={1}>
                  <LeftSidebar />
                </Panel>
                <PanelResizeHandle className="group relative w-1.5 bg-zinc-900 transition hover:bg-indigo-500/50">
                  <button
                    type="button"
                    title="Minimize properties"
                    onClick={() => setLeftOpen(false)}
                    className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 p-0.5 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-zinc-200"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                </PanelResizeHandle>
              </>
            ) : (
              <Panel defaultSize={3} minSize={3} maxSize={4} order={1}>
                <button
                  type="button"
                  onClick={() => setLeftOpen(true)}
                  title="Expand properties"
                  className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-950 text-[10px] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span
                    className="origin-center rotate-180 text-[9px] uppercase tracking-wide"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    Properties
                  </span>
                </button>
              </Panel>
            )}

            <Panel minSize={30} order={2}>
              <MainCanvas />
            </Panel>

            {/* Right (Tools) — thin strip when minimized */}
            {rightOpen ? (
              <>
                <PanelResizeHandle className="group relative w-1.5 bg-zinc-900 transition hover:bg-indigo-500/50">
                  <button
                    type="button"
                    title="Minimize tools"
                    onClick={() => setRightOpen(false)}
                    className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 p-0.5 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-zinc-200"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </PanelResizeHandle>
                <Panel defaultSize={20} minSize={14} maxSize={36} order={3}>
                  <RightSidebar />
                </Panel>
              </>
            ) : (
              <Panel defaultSize={3} minSize={3} maxSize={4} order={3}>
                <button
                  type="button"
                  onClick={() => setRightOpen(true)}
                  title="Expand tools"
                  className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-950 text-[10px] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span
                    className="text-[9px] uppercase tracking-wide"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    Tools
                  </span>
                </button>
              </Panel>
            )}
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="group relative h-1.5 bg-zinc-900 hover:bg-indigo-500/50">
          <button
            type="button"
            onClick={() => setBottomOpen(!bottomOpen)}
            className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-zinc-200"
          >
            <ChevronUp
              className={`h-3 w-3 transition ${bottomOpen ? 'rotate-180' : ''}`}
            />
            Library
          </button>
        </PanelResizeHandle>

        <Panel
          defaultSize={bottomOpen ? 32 : 4}
          minSize={bottomOpen ? 16 : 4}
          maxSize={bottomOpen ? 55 : 8}
          collapsible
          collapsedSize={4}
          onCollapse={() => setBottomOpen(false)}
          onExpand={() => setBottomOpen(true)}
        >
          {bottomOpen ? (
            <BottomLibraryPanel />
          ) : (
            <button
              type="button"
              onClick={() => setBottomOpen(true)}
              className="flex h-full w-full items-center justify-center gap-2 bg-zinc-950 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Expand library
            </button>
          )}
        </Panel>
      </PanelGroup>
    ),
    [
      leftOpen,
      rightOpen,
      bottomOpen,
      setLeftOpen,
      setRightOpen,
      setBottomOpen,
    ],
  )

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
        <TopBar />
        {/* overflow only on content so topbar dropdowns are not clipped */}
        <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
          {view === 'workspace' && workspace}
          {view === 'library' && <FullLibraryView />}
          {view === 'sheets' && <SheetsView />}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeLib ? (
          <div className="opacity-95">
            <CanvasDragPreview item={activeLib} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
