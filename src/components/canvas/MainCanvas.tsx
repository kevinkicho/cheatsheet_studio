import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  Focus,
  Grid3x3,
  LayoutGrid,
  Magnet,
  Maximize2,
  Minus,
  Plus,
  Scan,
} from 'lucide-react'
import { formatPageSizeLabel, getPrintPageSize } from '@/lib/printSizes'
import { DEFAULT_MARGINS } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/stores/uiStore'
import { CanvasItemView } from './CanvasItemView'

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
}

/**
 * Apply a new zoom level while keeping a viewport-relative anchor fixed
 * (default: center of the visible viewport).
 */
function applyZoomAtAnchor(
  viewport: HTMLElement,
  oldZoom: number,
  newZoom: number,
  setCanvasZoom: (z: number) => void,
  anchor?: { clientX: number; clientY: number },
) {
  const next = clampZoom(newZoom)
  if (next === oldZoom) return

  const rect = viewport.getBoundingClientRect()
  // Anchor in viewport client coords (default = visual center)
  const anchorClientX = anchor
    ? anchor.clientX - rect.left
    : viewport.clientWidth / 2
  const anchorClientY = anchor
    ? anchor.clientY - rect.top
    : viewport.clientHeight / 2

  // Canvas-space point currently under the anchor
  const canvasX = (viewport.scrollLeft + anchorClientX) / oldZoom
  const canvasY = (viewport.scrollTop + anchorClientY) / oldZoom

  setCanvasZoom(next)

  // After layout updates scaled spacer size, restore scroll so that point stays under anchor
  requestAnimationFrame(() => {
    viewport.scrollLeft = canvasX * next - anchorClientX
    viewport.scrollTop = canvasY * next - anchorClientY
  })
}

export function MainCanvas() {
  const items = useCanvasStore((s) => s.items)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const select = useCanvasStore((s) => s.select)
  const canvas = useCanvasStore((s) => s.canvas)
  const autoOrganize = useCanvasStore((s) => s.autoOrganize)
  const toggleGrid = useCanvasStore((s) => s.toggleGrid)
  const toggleSnapToGrid = useCanvasStore((s) => s.toggleSnapToGrid)
  const setCanvas = useCanvasStore((s) => s.setCanvas)
  const zoom = useUiStore((s) => s.canvasZoom)
  const setCanvasZoom = useUiStore((s) => s.setCanvasZoom)
  const margins = { ...DEFAULT_MARGINS, ...canvas.margins }
  const printPage = getPrintPageSize(
    canvas.printSizeId ?? 'letter',
    canvas.orientation ?? 'portrait',
  )
  const gridSpacing = Math.max(4, Math.min(128, canvas.gridSpacing ?? 24))
  const gridOpacity = Math.min(1, Math.max(0.05, canvas.gridOpacity ?? 0.1))

  const viewportRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const [isPanning, setIsPanning] = useState(false)
  const panRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
    didMove: boolean
  } | null>(null)

  const { setNodeRef, isOver } = useDroppable({
    id: 'main-canvas',
    data: { type: 'canvas' },
  })

  /** True when the event started on empty board (not a card / control). */
  const isBackgroundTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null
    if (!el) return false
    if (el.closest('[data-canvas-item]')) return false
    if (el.closest('button, input, textarea, a, [role="button"]')) return false
    return true
  }

  const onViewportPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Left button only; ignore if starting on a card
    if (e.button !== 0) return
    if (!isBackgroundTarget(e.target)) return
    const vp = viewportRef.current
    if (!vp) return

    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
      didMove: false,
    }
    vp.setPointerCapture(e.pointerId)
    setIsPanning(true)
  }

  const onViewportPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    const vp = viewportRef.current
    if (!pan || !vp || pan.pointerId !== e.pointerId) return

    const dx = e.clientX - pan.startX
    const dy = e.clientY - pan.startY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      pan.didMove = true
    }

    // Grab-and-drag: move the board with the cursor (map-style pan)
    vp.scrollLeft = pan.scrollLeft - dx
    vp.scrollTop = pan.scrollTop - dy
  }

  const endPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    const vp = viewportRef.current
    if (!pan || pan.pointerId !== e.pointerId) return

    try {
      vp?.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }

    // Brief flag so click handler can skip deselect after a drag-pan
    if (pan.didMove) {
      ;(vp as HTMLElement & { __didPan?: boolean }).__didPan = true
      window.setTimeout(() => {
        if (vp) {
          ;(vp as HTMLElement & { __didPan?: boolean }).__didPan = false
        }
      }, 0)
    }

    panRef.current = null
    setIsPanning(false)
  }

  const onViewportClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const vp = viewportRef.current as
      | (HTMLElement & { __didPan?: boolean })
      | null
    if (vp?.__didPan) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (!isBackgroundTarget(e.target)) return
    select(null)
  }

  /** Zoom in/out/reset from the center of what's on screen. */
  const zoomFromViewportCenter = useCallback(
    (nextZoom: number) => {
      const vp = viewportRef.current
      if (!vp) {
        setCanvasZoom(clampZoom(nextZoom))
        return
      }
      applyZoomAtAnchor(vp, zoomRef.current, nextZoom, setCanvasZoom)
    },
    [setCanvasZoom],
  )

  const handleZoomIn = useCallback(() => {
    zoomFromViewportCenter(zoomRef.current + ZOOM_STEP)
  }, [zoomFromViewportCenter])

  const handleZoomOut = useCallback(() => {
    zoomFromViewportCenter(zoomRef.current - ZOOM_STEP)
  }, [zoomFromViewportCenter])

  const handleZoomReset = useCallback(() => {
    zoomFromViewportCenter(1)
  }, [zoomFromViewportCenter])

  /**
   * Fit the *print page* when the frame is on; otherwise the free workspace.
   * Never use full free-board size while Letter/A4 frame is visible (that
   * incorrectly zoomed out to ~30%).
   */
  const zoomFitViewport = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const pad = 32
    const availW = Math.max(vp.clientWidth - pad, 80)
    const availH = Math.max(vp.clientHeight - pad, 80)
    const showPrint = canvas.showPrintArea !== false
    const fitW = showPrint ? printPage.width : canvas.width
    const fitH = showPrint ? printPage.height : canvas.height
    const scale = Math.min(availW / fitW, availH / fitH, 2)
    setCanvasZoom(scale)
    requestAnimationFrame(() => {
      if (viewportRef.current) {
        // Print page lives at origin
        viewportRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
      }
    })
  }, [
    canvas.width,
    canvas.height,
    canvas.showPrintArea,
    printPage.width,
    printPage.height,
    setCanvasZoom,
  ])

  /**
   * Fit the bounding box of placed cards. If none, fall back to print page
   * (when frame is on) or the free workspace.
   */
  const zoomFitContent = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return

    const pad = 48
    const availW = Math.max(vp.clientWidth - pad, 80)
    const availH = Math.max(vp.clientHeight - pad, 80)

    if (items.length === 0) {
      // No cards: fit print page if visible, else workspace
      zoomFitViewport()
      return
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const it of items) {
      if (!Number.isFinite(it.x) || !Number.isFinite(it.y)) continue
      minX = Math.min(minX, it.x)
      minY = Math.min(minY, it.y)
      maxX = Math.max(maxX, it.x + it.width)
      maxY = Math.max(maxY, it.y + it.height)
    }

    if (!Number.isFinite(minX)) {
      zoomFitViewport()
      return
    }

    const contentW = Math.max(maxX - minX, 40)
    const contentH = Math.max(maxY - minY, 40)
    const scale = Math.min(availW / contentW, availH / contentH, 2)
    setCanvasZoom(scale)

    requestAnimationFrame(() => {
      const el = viewportRef.current
      if (!el) return
      const left = Math.max(
        0,
        minX * scale - (el.clientWidth - contentW * scale) / 2,
      )
      const top = Math.max(
        0,
        minY * scale - (el.clientHeight - contentH * scale) / 2,
      )
      el.scrollTo({ left, top, behavior: 'smooth' })
    })
  }, [items, setCanvasZoom, zoomFitViewport])

  // Default zoom is 100%. Fit print page / content only via toolbar buttons
  // (auto fit-to-letter was landing at ~40–45% and felt like a zoom-out on drop).

  // Ctrl/Cmd + wheel: zoom around viewport center (same as toolbar)
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.08 : 0.08
      applyZoomAtAnchor(
        vp,
        zoomRef.current,
        zoomRef.current + delta,
        setCanvasZoom,
        // Use pointer as anchor for wheel — feels natural; falls back to center if desired
        // User asked for viewport center for controller; for wheel, center is more consistent with request
      )
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [setCanvasZoom])

  // Tunable grid: opacity + spacing (works on dark boards)
  // Major lines every 2 cells (48px when spacing=24) → lines up with 0.5″ margins
  const buildGridStyle = (spacing: number, opacity: number) => {
    const minor = Math.min(1, opacity)
    const major = Math.min(1, opacity * 1.8)
    const majorSize = spacing * 2
    return {
      backgroundImage: `
        linear-gradient(to right, rgba(165, 180, 252, ${minor}) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(165, 180, 252, ${minor}) 1px, transparent 1px),
        linear-gradient(to right, rgba(199, 210, 254, ${major}) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(199, 210, 254, ${major}) 1px, transparent 1px)
      `,
      backgroundSize: `${spacing}px ${spacing}px, ${spacing}px ${spacing}px, ${majorSize}px ${majorSize}px, ${majorSize}px ${majorSize}px`,
    } as const
  }

  const gridStyle = canvas.showGrid
    ? buildGridStyle(gridSpacing, gridOpacity)
    : undefined

  const showPrint = canvas.showPrintArea !== false

  return (
    <div className="relative h-full w-full">
      <div
        ref={viewportRef}
        className={`relative h-full w-full overflow-auto ${
          isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'
        } ${isOver ? 'ring-2 ring-inset ring-indigo-500/40' : ''}`}
        style={{ background: canvas.background }}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onClick={onViewportClick}
      >
        {/* Spacer = full free workspace × zoom (min 100% of viewport) */}
        <div
          className="relative"
          style={{
            width: Math.max(canvas.width * zoom, 1),
            height: Math.max(canvas.height * zoom, 1),
            minWidth: '100%',
            minHeight: '100%',
          }}
        >
          <div
            ref={setNodeRef}
            id="main-canvas-surface"
            data-zoom={zoom}
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: canvas.width,
              height: canvas.height,
              transform: `scale(${zoom})`,
              background: canvas.background,
            }}
          >
            {/*
              Single grid layer only — painted once on the workspace surface
              so it aligns with snap/auto-organize and does not double up.
            */}
            {canvas.showGrid && gridStyle && (
              <div
                className="pointer-events-none absolute inset-0 z-0"
                style={gridStyle}
                aria-hidden
              />
            )}

            {/* Print page frame at origin — overlay only; does not own the grid */}
            {showPrint && (
              <>
                <div
                  className="pointer-events-none absolute z-[1] box-border border-2 border-dashed border-indigo-400/50"
                  style={{
                    left: 0,
                    top: 0,
                    width: printPage.width,
                    height: printPage.height,
                    // Light wash so the frame reads; grid still shows through
                    background: 'rgba(15, 17, 21, 0.15)',
                  }}
                />
                <div
                  className="pointer-events-none absolute z-[1] box-border border border-dashed border-emerald-400/45"
                  style={{
                    left: margins.left,
                    top: margins.top,
                    width: Math.max(
                      0,
                      printPage.width - margins.left - margins.right,
                    ),
                    height: Math.max(
                      0,
                      printPage.height - margins.top - margins.bottom,
                    ),
                  }}
                />
                <div className="pointer-events-none absolute left-2 top-2 z-[2] rounded bg-zinc-950/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 ring-1 ring-zinc-600/80">
                  {formatPageSizeLabel(
                    canvas.printSizeId ?? 'letter',
                    canvas.orientation ?? 'portrait',
                  )}{' '}
                  · {printPage.width}×{printPage.height}
                  <span className="text-zinc-500">
                    {' '}
                    · m {margins.top}/{margins.right}/{margins.bottom}/
                    {margins.left}
                  </span>
                </div>
              </>
            )}

            {items.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
                <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 px-8 py-6 text-center">
                  <p className="text-sm font-medium text-zinc-300">
                    Drag equations from the library below
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Or create a custom equation / import an image from the right
                    sidebar
                  </p>
                </div>
              </div>
            )}

            {items.map((item) => (
              <CanvasItemView
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                zoom={zoom}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Zoom / grid toolbar */}
      <div
        className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-lg border border-zinc-700/80 bg-zinc-950/90 p-1 shadow-lg backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <ZoomBtn title="Zoom out (from viewport center)" onClick={handleZoomOut}>
          <Minus className="h-3.5 w-3.5" />
        </ZoomBtn>
        <button
          type="button"
          title="Reset to 100% (from viewport center)"
          onClick={handleZoomReset}
          className="min-w-[3.25rem] rounded px-1.5 py-1 text-[11px] font-medium tabular-nums text-zinc-300 hover:bg-zinc-800"
        >
          {Math.round(zoom * 100)}%
        </button>
        <ZoomBtn title="Zoom in (from viewport center)" onClick={handleZoomIn}>
          <Plus className="h-3.5 w-3.5" />
        </ZoomBtn>
        <div className="mx-0.5 h-4 w-px bg-zinc-700" />
        <ZoomBtn
          title={
            canvas.showPrintArea !== false
              ? 'Fit print page to viewport'
              : 'Fit free workspace to viewport'
          }
          onClick={zoomFitViewport}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </ZoomBtn>
        <ZoomBtn
          title="Zoom to fit placed cards (bounding box)"
          onClick={zoomFitContent}
        >
          <Scan className="h-3.5 w-3.5" />
        </ZoomBtn>
        <ZoomBtn
          title="Focus selection (or fit content)"
          onClick={() => {
            if (selectedId) {
              const it = items.find((i) => i.id === selectedId)
              if (!it || !viewportRef.current) return
              const pad = 80
              const scale = Math.min(
                (viewportRef.current.clientWidth - pad) / it.width,
                (viewportRef.current.clientHeight - pad) / it.height,
                1.5,
              )
              setCanvasZoom(scale)
              requestAnimationFrame(() => {
                const el = viewportRef.current
                if (!el) return
                el.scrollTo({
                  left: Math.max(
                    0,
                    it.x * scale + (it.width * scale) / 2 - el.clientWidth / 2,
                  ),
                  top: Math.max(
                    0,
                    it.y * scale + (it.height * scale) / 2 - el.clientHeight / 2,
                  ),
                  behavior: 'smooth',
                })
              })
            } else {
              zoomFitContent()
            }
          }}
        >
          <Focus className="h-3.5 w-3.5" />
        </ZoomBtn>
        <div className="mx-0.5 h-4 w-px bg-zinc-700" />
        <ZoomBtn
          title={
            canvas.showGrid
              ? 'Hide background grid'
              : 'Show background grid across the viewport'
          }
          onClick={() => toggleGrid()}
        >
          <Grid3x3
            className={`h-3.5 w-3.5 ${canvas.showGrid ? 'text-indigo-300' : ''}`}
          />
        </ZoomBtn>
        <ZoomBtn
          title={
            canvas.snapToGrid
              ? 'Snap to grid ON — click to disable'
              : `Snap to grid OFF — snap move/resize to ${gridSpacing}px`
          }
          onClick={() => toggleSnapToGrid()}
        >
          <Magnet
            className={`h-3.5 w-3.5 ${canvas.snapToGrid ? 'text-indigo-300' : ''}`}
          />
        </ZoomBtn>
        <ZoomBtn
          title="Auto-organize: pack cards on the print-page grid inside margins"
          onClick={() => {
            if (items.length === 0) return
            if (!canvas.showGrid) setCanvas({ showGrid: true })
            autoOrganize()
          }}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </ZoomBtn>
      </div>
    </div>
  )
}

function ZoomBtn({
  children,
  onClick,
  title,
}: {
  children: ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
    >
      {children}
    </button>
  )
}
