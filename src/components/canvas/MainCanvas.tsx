import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { useDroppable } from '@dnd-kit/core'
import {
  ChevronDown,
  ChevronUp,
  Focus,
  Grid3x3,
  Hand,
  LayoutGrid,
  Magnet,
  Map as MapIcon,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  Plus,
  Scan,
} from 'lucide-react'
import {
  clampPrintPageCount,
  computePrintPageOrigins,
  dissolvedOuterPageSize,
  formatPageSizeLabel,
  getPrintPageSize,
  multiPageLayoutBounds,
  normalizePrintPageLayout,
  PRINT_PAGE_STACK_GAP,
} from '@/lib/printSizes'
import {
  clampGridOpacity,
  DEFAULT_MARGINS,
  GRID_OPACITY_CSS_MAX,
  gridOpacityToPercent,
  normalizeGridExtent,
  percentToGridOpacity,
  type GridExtent,
} from '@/types'
import { resolveGridCoverage, resolvePageGridRect } from '@/lib/gridCoverage'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/stores/uiStore'
import { CanvasGridLayer } from './CanvasGridLayer'
import { CanvasItemView } from './CanvasItemView'
import { LayoutPanelsLayer } from './LayoutPanelsLayer'
import { CanvasMinimap } from './CanvasMinimap'
import { MultiSelectFrame } from './MultiSelectFrame'

const GRID_EXTENT_OPTIONS: {
  id: GridExtent
  label: string
  hint: string
}[] = [
  {
    id: 'page',
    label: 'Full page',
    hint: 'Own grid inside each page frame',
  },
  {
    id: 'printable',
    label: 'Printable area',
    hint: 'Own grid inside each margin box',
  },
  {
    id: 'board',
    label: 'Whole board',
    hint: 'One continuous grid on the free board',
  },
]

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
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const select = useCanvasStore((s) => s.select)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const canvas = useCanvasStore((s) => s.canvas)
  // Dedicated selectors so opacity/spacing updates always re-render this view
  const gridOpacityRaw = useCanvasStore((s) => s.canvas.gridOpacity)
  const gridSpacingRaw = useCanvasStore((s) => s.canvas.gridSpacing)
  const showGrid = useCanvasStore((s) => s.canvas.showGrid)
  const autoOrganize = useCanvasStore((s) => s.autoOrganize)
  const toggleGrid = useCanvasStore((s) => s.toggleGrid)
  const toggleSnapToGrid = useCanvasStore((s) => s.toggleSnapToGrid)
  const setCanvas = useCanvasStore((s) => s.setCanvas)
  const zoom = useUiStore((s) => s.canvasZoom)
  const setCanvasZoom = useUiStore((s) => s.setCanvasZoom)
  const canvasTool = useUiStore((s) => s.canvasTool)
  const setCanvasTool = useUiStore((s) => s.setCanvasTool)
  const minimapOpen = useUiStore((s) => s.minimapOpen)
  const toggleMinimap = useUiStore((s) => s.toggleMinimap)
  const canvasToolbarOpen = useUiStore((s) => s.canvasToolbarOpen)
  const toggleCanvasToolbar = useUiStore((s) => s.toggleCanvasToolbar)
  const focusCanvasItemRequest = useUiStore((s) => s.focusCanvasItemRequest)
  const margins = { ...DEFAULT_MARGINS, ...canvas.margins }
  const printPage = getPrintPageSize(
    canvas.printSizeId ?? 'letter',
    canvas.orientation ?? 'portrait',
  )
  const printPageCount = clampPrintPageCount(canvas.printPageCount ?? 1)
  const printPageLayout = normalizePrintPageLayout(canvas.printPageLayout)
  const dissolvePrintArea = canvas.dissolvePrintArea === true
  // Dissolved multipage: abut pages (gap 0) for vertical / horizontal / grid
  // so board coords match continuous pack space (outer margins only).
  const printPageOrigins =
    dissolvePrintArea &&
    printPageCount > 1 &&
    printPageLayout !== 'free'
      ? computePrintPageOrigins(
          printPage,
          printPageCount,
          printPageLayout,
          canvas.printPagePositions,
          /* gap */ 0,
        )
      : computePrintPageOrigins(
          printPage,
          printPageCount,
          printPageLayout,
          canvas.printPagePositions,
        )
  const setPrintPagePosition = useCanvasStore((s) => s.setPrintPagePosition)
  const gridSpacing = Math.max(4, Math.min(128, gridSpacingRaw ?? 24))
  // Stored CSS opacity 0–0.3; slider shows 0–100% of that range.
  const gridOpacity = clampGridOpacity(gridOpacityRaw)
  const gridOpacityPct = gridOpacityToPercent(gridOpacity)
  const gridExtent = normalizeGridExtent(canvas.gridExtent)

  const viewportRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  /** State mirror of viewportRef so minimap re-binds after mount */
  const [viewportNode, setViewportNode] = useState<HTMLDivElement | null>(null)

  // Droppable is the full viewport so drops land under the cursor anywhere in
  // the scroll area (not only over the scaled board surface).
  const { setNodeRef, isOver } = useDroppable({
    id: 'main-canvas',
    data: { type: 'canvas' },
  })

  const setViewportRef = useCallback(
    (el: HTMLDivElement | null) => {
      viewportRef.current = el
      setViewportNode(el)
      setNodeRef(el)
    },
    [setNodeRef],
  )

  const setSurfaceNode = useCallback((node: HTMLDivElement | null) => {
    surfaceRef.current = node
  }, [])

  const [isPanning, setIsPanning] = useState(false)
  /** Shift held → temporary grab cursor while Select tool is active */
  const [shiftHeld, setShiftHeld] = useState(false)
  const panRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
    didMove: boolean
  } | null>(null)
  /** Drag a free-layout print page frame. */
  const pageDragRef = useRef<{
    pointerId: number
    pageIndex: number
    startClientX: number
    startClientY: number
    originX: number
    originY: number
  } | null>(null)
  const [draggingPageIndex, setDraggingPageIndex] = useState<number | null>(
    null,
  )
  const [gridMenuOpen, setGridMenuOpen] = useState(false)
  const gridMenuRef = useRef<HTMLDivElement>(null)
  /** Marquee drag-select in canvas coordinates (select tool only). */
  const [marquee, setMarquee] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const marqueeRef = useRef<{
    pointerId: number
    x0: number
    y0: number
    additive: boolean
    didMove: boolean
  } | null>(null)

  /** True when the event started on empty board (not a card / control). */
  const isBackgroundTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null
    if (!el) return false
    if (el.closest('[data-canvas-item]')) return false
    if (el.closest('[data-print-page-handle]')) return false
    // Layout panels (title, stroke, selected frame, resize grips) are objects —
    // never treat as empty board. Old bug: after panel resize the synthetic
    // click landed on the grip; isBackground → select(null) dropped the panel.
    if (
      el.closest(
        [
          '[data-layout-panel]',
          '[data-layout-panel-title]',
          '[data-layout-panel-hit]',
          '[data-layout-panel-outline]',
          '[data-layout-panel-resize-frame]',
          '[data-panel-resize-handle]',
        ].join(', '),
      )
    ) {
      return false
    }
    if (el.closest('button, input, textarea, a, [role="button"]')) return false
    return true
  }

  const onPrintPageHandlePointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    pageIndex: number,
  ) => {
    if (e.button !== 0) return
    if (printPageLayout !== 'free') return
    e.stopPropagation()
    e.preventDefault()
    const origin = printPageOrigins[pageIndex]
    if (!origin) return
    useCanvasStore.getState().beginHistoryBatch()
    pageDragRef.current = {
      pointerId: e.pointerId,
      pageIndex,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: origin.x,
      originY: origin.y,
    }
    setDraggingPageIndex(pageIndex)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPrintPageHandlePointerMove = (
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = pageDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const z = zoomRef.current > 0.01 ? zoomRef.current : 1
    const dx = (e.clientX - drag.startClientX) / z
    const dy = (e.clientY - drag.startClientY) / z
    let x = Math.max(0, drag.originX + dx)
    let y = Math.max(0, drag.originY + dy)
    // Snap free page frames to board grid (keeps multi-page layouts tidy)
    if (canvas.snapToGrid) {
      const g = gridSpacing
      x = Math.max(0, Math.round(x / g) * g)
      y = Math.max(0, Math.round(y / g) * g)
    }
    setPrintPagePosition(drag.pageIndex, { x, y })
  }

  const endPrintPageDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = pageDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    pageDragRef.current = null
    setDraggingPageIndex(null)
    useCanvasStore.getState().endHistoryBatch()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  /** Client → canvas coords (accounts for CSS scale on the surface). */
  const clientToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const surface = surfaceRef.current
      if (!surface) return { x: 0, y: 0 }
      const rect = surface.getBoundingClientRect()
      const z = zoomRef.current > 0.01 ? zoomRef.current : 1
      return {
        x: (clientX - rect.left) / z,
        y: (clientY - rect.top) / z,
      }
    },
    [],
  )

  const beginPan = (
    e: ReactPointerEvent<HTMLDivElement>,
    vp: HTMLDivElement,
  ) => {
    e.preventDefault()
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
      didMove: false,
    }
    marqueeRef.current = null
    setMarquee(null)
    try {
      vp.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    setIsPanning(true)
  }

  const onViewportPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current
    if (!vp) return

    // —— Middle mouse (wheel click): pan from anywhere on the board ——
    // Works over cards/empty space; cards ignore non-left buttons so this bubbles.
    if (e.button === 1) {
      beginPan(e, vp)
      return
    }

    if (e.button !== 0) return
    if (!isBackgroundTarget(e.target)) return

    // —— Pan tool, or temporary pan: Shift + left-drag on empty board ——
    // (Shift+click multi-select on cards is unchanged in CanvasItemView.)
    const temporaryPan = canvasTool === 'select' && e.shiftKey
    if (canvasTool === 'pan' || temporaryPan) {
      beginPan(e, vp)
      return
    }

    // —— Select tool: marquee on empty board (Ctrl/Meta = additive) ——
    const { x, y } = clientToCanvas(e.clientX, e.clientY)
    marqueeRef.current = {
      pointerId: e.pointerId,
      x0: x,
      y0: y,
      additive: e.ctrlKey || e.metaKey,
      didMove: false,
    }
    setMarquee({ x0: x, y0: y, x1: x, y1: y })
    panRef.current = null
    vp.setPointerCapture(e.pointerId)
  }

  const onViewportPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current
    if (!vp) return

    // Pan
    const pan = panRef.current
    if (pan && pan.pointerId === e.pointerId) {
      // Missed pointerup → don't stick-pan forever
      if (e.buttons === 0) {
        try {
          vp.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        panRef.current = null
        setIsPanning(false)
        return
      }
      const dx = e.clientX - pan.startX
      const dy = e.clientY - pan.startY
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) pan.didMove = true
      vp.scrollLeft = pan.scrollLeft - dx
      vp.scrollTop = pan.scrollTop - dy
      return
    }

    // Marquee
    const m = marqueeRef.current
    if (m && m.pointerId === e.pointerId) {
      const { x, y } = clientToCanvas(e.clientX, e.clientY)
      if (Math.hypot(x - m.x0, y - m.y0) > 3) m.didMove = true
      setMarquee({ x0: m.x0, y0: m.y0, x1: x, y1: y })
    }
  }

  const endViewportPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current

    // End pan
    const pan = panRef.current
    if (pan && pan.pointerId === e.pointerId) {
      try {
        vp?.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      if (pan.didMove && vp) {
        ;(vp as HTMLElement & { __skipClick?: boolean }).__skipClick = true
        window.setTimeout(() => {
          if (vp) {
            ;(vp as HTMLElement & { __skipClick?: boolean }).__skipClick = false
          }
        }, 0)
      }
      panRef.current = null
      setIsPanning(false)
      return
    }

    // End marquee → select intersecting cards
    const m = marqueeRef.current
    if (m && m.pointerId === e.pointerId) {
      try {
        vp?.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      // Final corner from this event (state may lag one frame)
      const end = clientToCanvas(e.clientX, e.clientY)
      marqueeRef.current = null
      setMarquee(null)

      if (!m.didMove) {
        // Click empty (no drag) → clear selection unless Shift
        if (!m.additive) select(null)
        return
      }

      const minX = Math.min(m.x0, end.x)
      const maxX = Math.max(m.x0, end.x)
      const minY = Math.min(m.y0, end.y)
      const maxY = Math.max(m.y0, end.y)

      const state = useCanvasStore.getState()
      const hit = state.items
        .filter(
          (it) =>
            !it.hidden &&
            it.x < maxX &&
            it.x + it.width > minX &&
            it.y < maxY &&
            it.y + it.height > minY,
        )
        .map((it) => it.id)

      // Marquee selects layout panels like objects (all intersecting frames),
      // together with cards — not panel-XOR-cards.
      const hitPanels = (state.canvas.layoutPanels ?? []).filter((p) => {
        const px2 = p.x + p.width
        const py2 = p.y + p.height
        return p.x < maxX && px2 > minX && p.y < maxY && py2 > minY
      })
      // Prefer smaller (nested) panels first in the multi-select list so the
      // last/primary is the most specific when many nest.
      const panelIds = [...hitPanels]
        .sort((a, b) => b.width * b.height - a.width * a.height)
        .map((p) => p.id)

      if (m.additive) {
        const prevCards = state.selectedIds
        const prevPanels = state.selectedPanelIds ?? []
        state.setMarqueeSelection(
          [...new Set([...prevCards, ...hit])],
          [...new Set([...prevPanels, ...panelIds])],
        )
      } else if (hit.length > 0 || panelIds.length > 0) {
        state.setMarqueeSelection(hit, panelIds)
      } else {
        state.setMarqueeSelection([], [])
      }

      if (vp) {
        ;(vp as HTMLElement & { __skipClick?: boolean }).__skipClick = true
        window.setTimeout(() => {
          if (vp) {
            ;(vp as HTMLElement & { __skipClick?: boolean }).__skipClick = false
          }
        }, 0)
      }
    }
  }

  const onViewportClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const vp = viewportRef.current as
      | (HTMLElement & { __skipClick?: boolean })
      | null
    if (vp?.__skipClick) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (canvasTool === 'pan') return
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
   * Fit print page frame(s) when visible — uses the full multi-page layout
   * bounds (vertical / horizontal / grid / free), not only page 1.
   * When print frame is off, fit the free workspace.
   */
  const zoomFitViewport = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const pad = 32
    const availW = Math.max(vp.clientWidth - pad, 80)
    const availH = Math.max(vp.clientHeight - pad, 80)
    const showPrint = canvas.showPrintArea !== false

    if (!showPrint) {
      const scale = Math.min(
        availW / canvas.width,
        availH / canvas.height,
        2,
      )
      setCanvasZoom(scale)
      requestAnimationFrame(() => {
        viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
      })
      return
    }

    const bounds = multiPageLayoutBounds(
      printPage,
      printPageCount,
      printPageLayout,
      canvas.printPagePositions,
      dissolvePrintArea && printPageLayout !== 'free' && printPageCount > 1
        ? 0
        : undefined,
    )
    const fitW = Math.max(bounds.width, 40)
    const fitH = Math.max(bounds.height, 40)
    const scale = Math.min(availW / fitW, availH / fitH, 2)
    setCanvasZoom(scale)
    requestAnimationFrame(() => {
      const el = viewportRef.current
      if (!el) return
      // Center the full page layout in the viewport
      const left = Math.max(
        0,
        bounds.minX * scale - (el.clientWidth - fitW * scale) / 2,
      )
      const top = Math.max(
        0,
        bounds.minY * scale - (el.clientHeight - fitH * scale) / 2,
      )
      el.scrollTo({ left, top, behavior: 'smooth' })
    })
  }, [
    canvas.width,
    canvas.height,
    canvas.showPrintArea,
    canvas.printPagePositions,
    printPage,
    printPageCount,
    printPageLayout,
    dissolvePrintArea,
    setCanvasZoom,
  ])

  /**
   * Zoom/scroll so a single card is centered in the viewport (Layers click).
   * Avoids flicker: never paint a frame at the new zoom with the old scroll.
   * Same zoom → smooth pan from current view; zoom change → atomic jump.
   */
  const zoomFitItem = useCallback(
    (itemId: string) => {
      const vp = viewportRef.current
      if (!vp) return
      const it = useCanvasStore.getState().items.find((i) => i.id === itemId)
      if (!it || it.hidden) return
      if (!Number.isFinite(it.x) || !Number.isFinite(it.y)) return

      const pad = 64
      const availW = Math.max(vp.clientWidth - pad, 80)
      const availH = Math.max(vp.clientHeight - pad, 80)
      const contentW = Math.max(it.width || 80, 40)
      const contentH = Math.max(it.height || 48, 40)
      // Cap zoom so tiny cards don't blow past readable size
      const targetZoom = clampZoom(
        Math.min(availW / contentW, availH / contentH, 1.75),
      )

      // Item center in canvas space → scroll so it sits in viewport center
      const itemCx = it.x + contentW / 2
      const itemCy = it.y + contentH / 2
      const targetLeft = Math.max(
        0,
        itemCx * targetZoom - vp.clientWidth / 2,
      )
      const targetTop = Math.max(
        0,
        itemCy * targetZoom - vp.clientHeight / 2,
      )

      const currentZoom = zoomRef.current
      const zoomUnchanged = Math.abs(targetZoom - currentZoom) < 0.015

      if (zoomUnchanged) {
        // Pan only — smooth from current view toward the card
        vp.scrollTo({
          left: targetLeft,
          top: targetTop,
          behavior: 'smooth',
        })
        return
      }

      // Zoom change: commit scale + scroll in one turn (no intermediate flash)
      flushSync(() => {
        setCanvasZoom(targetZoom)
      })
      // DOM spacer/transform updated; set scroll before the next paint
      vp.scrollLeft = targetLeft
      vp.scrollTop = targetTop
    },
    [setCanvasZoom],
  )

  // Layers panel (and others) request zoom-to-card via uiStore
  const lastFocusToken = useRef(0)
  useEffect(() => {
    if (!focusCanvasItemRequest) return
    if (focusCanvasItemRequest.token === lastFocusToken.current) return
    lastFocusToken.current = focusCanvasItemRequest.token
    zoomFitItem(focusCanvasItemRequest.id)
  }, [focusCanvasItemRequest, zoomFitItem])

  // Track Shift for temporary pan cursor (Select tool + empty board drag)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false)
    }
    const onBlur = () => setShiftHeld(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Block browser “auto-scroll” mode on middle-click inside the canvas
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const blockMiddleAutoScroll = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    }
    // auxclick fires on middle release in some browsers
    const blockAux = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    }
    vp.addEventListener('mousedown', blockMiddleAutoScroll)
    vp.addEventListener('auxclick', blockAux)
    return () => {
      vp.removeEventListener('mousedown', blockMiddleAutoScroll)
      vp.removeEventListener('auxclick', blockAux)
    }
  }, [])

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

  // Close grid settings popover on outside click / Escape
  useEffect(() => {
    if (!gridMenuOpen) return
    const onDoc = (e: globalThis.MouseEvent) => {
      if (gridMenuRef.current?.contains(e.target as Node)) return
      setGridMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGridMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [gridMenuOpen])

  // Default zoom is 100%. Fit print page / content only via toolbar buttons
  // (auto fit-to-letter was landing at ~40–45% and felt like a zoom-out on drop).
  // Agent Import JSON dispatches this after load.
  useEffect(() => {
    const onFit = () => {
      window.requestAnimationFrame(() => zoomFitViewport())
    }
    window.addEventListener('cheatsheet:fit-print-layout', onFit)
    return () =>
      window.removeEventListener('cheatsheet:fit-print-layout', onFit)
  }, [zoomFitViewport])

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

  const showPrint = canvas.showPrintArea !== false
  const { useBoardGrid, usePerPageGrid } = resolveGridCoverage({
    showGrid,
    showPrintArea: showPrint,
    gridExtent,
  })

  // Pan tool / Shift+empty / middle-mouse drag → grab cursor
  const panCursor =
    isPanning ||
    canvasTool === 'pan' ||
    (canvasTool === 'select' && shiftHeld)
  const cursorClass = panCursor
    ? isPanning
      ? 'cursor-grabbing select-none'
      : 'cursor-grab'
    : marquee
      ? 'cursor-crosshair select-none'
      : 'cursor-default'

  return (
    <div className="relative h-full w-full">
      <div
        ref={setViewportRef}
        data-main-canvas-viewport
        className={`relative h-full w-full overflow-auto ${cursorClass} ${
          isOver ? 'ring-2 ring-inset ring-indigo-500/40' : ''
        }`}
        style={{ background: canvas.background }}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={endViewportPointer}
        onPointerCancel={endViewportPointer}
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
            ref={setSurfaceNode}
            id="main-canvas-surface"
            data-zoom={zoom}
            data-canvas-tool={canvasTool}
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: canvas.width,
              height: canvas.height,
              transform: `scale(${zoom})`,
              background: canvas.background,
            }}
          >
            {/*
              Print page chrome first (frames only). Grids are painted AFTER
              so they are never dimmed under the page fill — that made Whole
              board look softer than Full page / Printable for the same α.
            */}
            {showPrint &&
              (() => {
                // Dissolved multipage: one super-page frame; only outer margins
                // (inter-page gutters gone for vertical / horizontal / grid).
                const stackDissolve =
                  dissolvePrintArea &&
                  printPageCount > 1 &&
                  printPageLayout !== 'free'
                if (stackDissolve) {
                  const origin0 = printPageOrigins[0] ?? { x: 0, y: 0 }
                  const outer = dissolvedOuterPageSize(
                    printPage,
                    printPageCount,
                    printPageLayout,
                  )
                  const outerW = outer.outerW
                  const outerH = outer.outerH
                  const contentW = Math.max(
                    0,
                    outerW - margins.left - margins.right,
                  )
                  const contentH = Math.max(
                    0,
                    outerH - margins.top - margins.bottom,
                  )
                  const layoutHint =
                    outer.cols > 1 || outer.rows > 1
                      ? ` · ${outer.cols}×${outer.rows}`
                      : ''
                  return (
                    <div key="print-dissolved-chrome">
                      <div
                        className="pointer-events-none absolute z-[1] box-border border-2 border-dashed border-indigo-400/50"
                        data-testid="print-dissolved-outer"
                        style={{
                          left: origin0.x,
                          top: origin0.y,
                          width: outerW,
                          height: outerH,
                        }}
                      />
                      <div
                        className="pointer-events-none absolute z-[1] box-border border border-dashed border-emerald-400/55"
                        data-testid="print-dissolved-content"
                        style={{
                          left: origin0.x + margins.left,
                          top: origin0.y + margins.top,
                          width: contentW,
                          height: contentH,
                        }}
                      />
                      <div
                        className="pointer-events-none absolute z-[2] flex items-center gap-1 rounded bg-zinc-950/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 ring-1 ring-zinc-600/80"
                        style={{
                          left: origin0.x + 8,
                          top: origin0.y + 8,
                        }}
                      >
                        <span className="mr-0.5 text-emerald-300">
                          Dissolved · {printPageCount} pages{layoutHint}
                        </span>
                        {formatPageSizeLabel(
                          canvas.printSizeId ?? 'letter',
                          canvas.orientation ?? 'portrait',
                        )}{' '}
                        · {outerW}×{outerH}
                        <span className="text-zinc-500">
                          {' '}
                          · outer m {margins.top}/{margins.right}/
                          {margins.bottom}/{margins.left}
                        </span>
                      </div>
                    </div>
                  )
                }

                return printPageOrigins.map((origin, pageIndex) => {
                  const left = origin.x
                  const top = origin.y
                  const contentW = Math.max(
                    0,
                    printPage.width - margins.left - margins.right,
                  )
                  const contentH = Math.max(
                    0,
                    printPage.height - margins.top - margins.bottom,
                  )
                  const isDragging = draggingPageIndex === pageIndex
                  const freeMode = printPageLayout === 'free'
                  return (
                    <div key={`print-page-chrome-${pageIndex}`}>
                      <div
                        className={`pointer-events-none absolute z-[1] box-border border-2 border-dashed ${
                          isDragging
                            ? 'border-indigo-400/80'
                            : 'border-indigo-400/50'
                        }`}
                        style={{
                          left,
                          top,
                          width: printPage.width,
                          height: printPage.height,
                          background: isDragging
                            ? 'rgba(99, 102, 241, 0.08)'
                            : 'transparent',
                        }}
                      />
                      <div
                        className="pointer-events-none absolute z-[1] box-border border border-dashed border-emerald-400/55"
                        style={{
                          left: left + margins.left,
                          top: top + margins.top,
                          width: contentW,
                          height: contentH,
                        }}
                      />
                      <div
                        data-print-page-handle={freeMode ? 'true' : undefined}
                        className={`absolute z-[2] flex items-center gap-1 rounded bg-zinc-950/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 ring-1 ring-zinc-600/80 ${
                          freeMode
                            ? 'pointer-events-auto cursor-grab select-none active:cursor-grabbing hover:ring-indigo-400/60'
                            : 'pointer-events-none'
                        } ${isDragging ? 'ring-indigo-400/80' : ''}`}
                        style={{ left: left + 8, top: top + 8 }}
                        title={
                          freeMode
                            ? 'Drag to place this page frame'
                            : undefined
                        }
                        onPointerDown={
                          freeMode
                            ? (e) => onPrintPageHandlePointerDown(e, pageIndex)
                            : undefined
                        }
                        onPointerMove={
                          freeMode ? onPrintPageHandlePointerMove : undefined
                        }
                        onPointerUp={freeMode ? endPrintPageDrag : undefined}
                        onPointerCancel={
                          freeMode ? endPrintPageDrag : undefined
                        }
                      >
                        {freeMode && (
                          <Move className="h-3 w-3 shrink-0 text-indigo-300" />
                        )}
                        {printPageCount > 1 && (
                          <span className="mr-0.5 text-indigo-300">
                            Page {pageIndex + 1}/{printPageCount}
                          </span>
                        )}
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
                      {printPageCount > 1 &&
                        printPageLayout === 'vertical' &&
                        !dissolvePrintArea &&
                        pageIndex < printPageCount - 1 && (
                          <div
                            className="pointer-events-none absolute z-[1] border-t border-dashed border-zinc-600/40"
                            style={{
                              left,
                              top: top + printPage.height,
                              width: printPage.width,
                              height: PRINT_PAGE_STACK_GAP,
                            }}
                            aria-hidden
                          />
                        )}
                    </div>
                  )
                })
              })()}

            {/*
              Grids AFTER page chrome. Every extent uses the same tile bitmap
              + CSS `opacity: α` (not rgba-in-gradient), so Whole board /
              Full page / Printable stay the same brightness for one slider value.
            */}
            {useBoardGrid && (
              <CanvasGridLayer
                key={`grid-board-${gridSpacing}-${gridOpacity}`}
                left={0}
                top={0}
                width={canvas.width}
                height={canvas.height}
                spacing={gridSpacing}
                opacity={gridOpacity}
              />
            )}
            {usePerPageGrid &&
              (dissolvePrintArea &&
              printPageCount > 1 &&
              printPageLayout !== 'free' ? (
                // One continuous grid over the dissolved super-page band
                (() => {
                  const outer = dissolvedOuterPageSize(
                    printPage,
                    printPageCount,
                    printPageLayout,
                  )
                  const o0 = printPageOrigins[0] ?? { x: 0, y: 0 }
                  const printable = gridExtent === 'printable'
                  return (
                <CanvasGridLayer
                  key={`grid-dissolved-${gridExtent}-${gridSpacing}-${gridOpacity}-${printPageLayout}`}
                  left={
                    printable ? o0.x + margins.left : o0.x
                  }
                  top={
                    printable ? o0.y + margins.top : o0.y
                  }
                  width={
                    outer.outerW -
                    (printable ? margins.left + margins.right : 0)
                  }
                  height={
                    outer.outerH -
                    (printable ? margins.top + margins.bottom : 0)
                  }
                  spacing={gridSpacing}
                  opacity={gridOpacity}
                />
                  )
                })()
              ) : (
                printPageOrigins.map((origin, pageIndex) => {
                  const rect = resolvePageGridRect(
                    gridExtent,
                    origin,
                    printPage,
                    margins,
                  )
                  if (!rect) return null
                  return (
                    <CanvasGridLayer
                      key={`grid-${gridExtent}-${pageIndex}-${gridSpacing}-${gridOpacity}`}
                      left={rect.left}
                      top={rect.top}
                      width={rect.width}
                      height={rect.height}
                      spacing={gridSpacing}
                      opacity={gridOpacity}
                    />
                  )
                })
              ))}

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

            {/* Topic/folder encapsulating frames (Auto-layout panels chrome) */}
            <LayoutPanelsLayer
              panels={canvas.layoutPanels}
              interactive={canvasTool === 'select'}
            />

            {items.map((item) => (
              <CanvasItemView
                key={item.id}
                item={item}
                selected={selectedIds.includes(item.id)}
                zoom={zoom}
                interactive={canvasTool === 'select'}
              />
            ))}

            {/* Group transform frame — above all cards when multi-selected */}
            <MultiSelectFrame
              zoom={zoom}
              interactive={canvasTool === 'select'}
            />

            {/* Marquee selection rectangle (canvas space, inside scaled surface) */}
            {marquee && (
              <div
                className="pointer-events-none absolute z-[50] border border-indigo-400 bg-indigo-500/15"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Tools + zoom / grid + minimap (bottom-right stack) */}
      <div
        className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {canvasToolbarOpen && minimapOpen && (
          <CanvasMinimap
            canvas={canvas}
            items={items}
            selectedIds={selectedIds}
            zoom={zoom}
            viewportEl={viewportNode}
            onSelectItem={(id, multi) => {
              if (multi) toggleSelect(id)
              else select(id)
            }}
          />
        )}

        {!canvasToolbarOpen ? (
          /* Collapsed: compact expand control only */
          <button
            type="button"
            title="Expand canvas tools"
            aria-label="Expand canvas tools"
            aria-expanded={false}
            data-testid="canvas-toolbar-expand"
            onClick={() => toggleCanvasToolbar()}
            className="flex items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-950/90 px-2 py-1.5 text-zinc-300 shadow-lg backdrop-blur transition hover:border-indigo-500/40 hover:text-indigo-200"
          >
            <MousePointer2 className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium tabular-nums text-zinc-400">
              {Math.round(zoom * 100)}%
            </span>
            <ChevronUp className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        ) : (
          <div
            className="flex items-center gap-0.5 rounded-lg border border-zinc-700/80 bg-zinc-950/90 p-1 shadow-lg backdrop-blur"
            data-testid="canvas-toolbar"
          >
            <ToolBtn
              title="Select (V) — click cards, drag empty to marquee · Middle-drag or Shift+drag empty to pan · Ctrl+drag marquee adds"
              active={canvasTool === 'select'}
              onClick={() => setCanvasTool('select')}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              title="Pan (H) — drag to move the view · middle-mouse drag anywhere · or Shift+drag empty in Select"
              active={canvasTool === 'pan'}
              onClick={() => setCanvasTool('pan')}
            >
              <Hand className="h-3.5 w-3.5" />
            </ToolBtn>
            <div className="mx-0.5 h-4 w-px bg-zinc-700" />
            <ZoomBtn
              title="Zoom out (from viewport center)"
              onClick={handleZoomOut}
            >
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
            <ZoomBtn
              title="Zoom in (from viewport center)"
              onClick={handleZoomIn}
            >
              <Plus className="h-3.5 w-3.5" />
            </ZoomBtn>
            <div className="mx-0.5 h-4 w-px bg-zinc-700" />
            <ZoomBtn
              title={
                canvas.showPrintArea !== false
                  ? printPageCount > 1
                    ? `Fit all ${printPageCount} print pages (${printPageLayout}) to viewport`
                    : 'Fit print page to viewport'
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
                const selected = items.filter((i) =>
                  selectedIds.includes(i.id),
                )
                if (selected.length > 0 && viewportRef.current) {
                  let minX = Infinity
                  let minY = Infinity
                  let maxX = -Infinity
                  let maxY = -Infinity
                  for (const it of selected) {
                    minX = Math.min(minX, it.x)
                    minY = Math.min(minY, it.y)
                    maxX = Math.max(maxX, it.x + it.width)
                    maxY = Math.max(maxY, it.y + it.height)
                  }
                  const w = Math.max(maxX - minX, 40)
                  const h = Math.max(maxY - minY, 40)
                  const pad = 80
                  const scale = Math.min(
                    (viewportRef.current.clientWidth - pad) / w,
                    (viewportRef.current.clientHeight - pad) / h,
                    1.5,
                  )
                  setCanvasZoom(scale)
                  requestAnimationFrame(() => {
                    const el = viewportRef.current
                    if (!el) return
                    el.scrollTo({
                      left: Math.max(
                        0,
                        minX * scale + (w * scale) / 2 - el.clientWidth / 2,
                      ),
                      top: Math.max(
                        0,
                        minY * scale + (h * scale) / 2 - el.clientHeight / 2,
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
            <ToolBtn
              title={minimapOpen ? 'Hide minimap' : 'Show minimap'}
              active={minimapOpen}
              onClick={() => toggleMinimap()}
            >
              <MapIcon className="h-3.5 w-3.5" />
            </ToolBtn>
            <div className="mx-0.5 h-4 w-px bg-zinc-700" />
            <div className="relative flex items-center" ref={gridMenuRef}>
              <ZoomBtn
                title={
                  showGrid
                    ? `Hide grid (opacity ${gridOpacityPct}% / α ${gridOpacity.toFixed(2)}, max ${GRID_OPACITY_CSS_MAX})`
                    : 'Show grid (per page or whole board — open ▴ for settings)'
                }
                active={showGrid}
                onClick={() => toggleGrid()}
              >
                <Grid3x3 className="h-3.5 w-3.5" />
              </ZoomBtn>
              {showGrid && (
                <span
                  className="select-none px-0.5 text-[9px] tabular-nums text-zinc-500"
                  title={`Grid opacity: ${gridOpacityPct}% maps to CSS α ${gridOpacity.toFixed(2)} (max ${GRID_OPACITY_CSS_MAX})`}
                >
                  {gridOpacityPct}%
                </span>
              )}
              <button
                type="button"
                title="Grid settings — where the grid appears"
                aria-expanded={gridMenuOpen}
                aria-haspopup="menu"
                onClick={() => setGridMenuOpen((v) => !v)}
                className={`rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${
                  gridMenuOpen ? 'bg-zinc-800 text-indigo-300' : ''
                }`}
              >
                <ChevronUp
                  className={`h-3 w-3 transition ${gridMenuOpen ? '' : 'rotate-180'}`}
                />
              </button>
              {gridMenuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full right-0 z-30 mb-2 w-60 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 p-2 shadow-2xl"
                >
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    Grid covers
                  </p>
                  <p className="mt-0.5 px-1 text-[10px] leading-snug text-zinc-600">
                    Full page / Printable = separate grid on each page. Whole
                    board = one continuous grid.
                  </p>
                  <div className="mt-2 flex flex-col gap-1">
                    {GRID_EXTENT_OPTIONS.map((opt) => {
                      const active = gridExtent === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            setCanvas({
                              gridExtent: opt.id,
                              showGrid: true,
                            })
                          }}
                          className={`rounded-md border px-2 py-1.5 text-left transition ${
                            active
                              ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-100'
                              : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                          }`}
                        >
                          <span className="block text-[11px] font-medium">
                            {opt.label}
                          </span>
                          <span className="mt-0.5 block text-[9px] text-zinc-500">
                            {opt.hint}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 border-t border-zinc-800 pt-2">
                    <label className="flex flex-col gap-1 px-1">
                      <span className="text-[10px] text-zinc-500">
                        Spacing · {gridSpacing}px
                      </span>
                      <input
                        type="range"
                        min={8}
                        max={64}
                        step={4}
                        value={gridSpacing}
                        onChange={(e) =>
                          setCanvas({
                            gridSpacing: Number(e.target.value),
                            showGrid: true,
                          })
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="mt-2 flex flex-col gap-1 px-1">
                      <span className="text-[10px] text-zinc-500">
                        Opacity · {gridOpacityPct}% of soft range → α{' '}
                        {gridOpacity.toFixed(2)}
                        <span className="ml-1 text-zinc-600">
                          (bar 0–100% = α 0–{GRID_OPACITY_CSS_MAX})
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={gridOpacityPct}
                        onInput={(e) => {
                          const next = percentToGridOpacity(
                            Number((e.target as HTMLInputElement).value),
                          )
                          setCanvas({
                            gridOpacity: next,
                            showGrid: true,
                          })
                        }}
                        onChange={(e) => {
                          const next = percentToGridOpacity(
                            Number(e.target.value),
                          )
                          setCanvas({
                            gridOpacity: next,
                            showGrid: true,
                          })
                        }}
                        className="w-full"
                      />
                      <span className="text-[9px] leading-snug text-zinc-600">
                        Full bar travel: 0% = invisible, 50% = α{' '}
                        {(GRID_OPACITY_CSS_MAX / 2).toFixed(2)}, 100% = α{' '}
                        {GRID_OPACITY_CSS_MAX} (not CSS 1.0).
                      </span>
                    </label>
                  </div>
                  <p className="mt-2 px-1 text-[9px] text-zinc-600">
                    Also in left Properties panel when no card is selected.
                  </p>
                </div>
              )}
            </div>
            <ZoomBtn
              title={
                canvas.snapToGrid
                  ? 'Snap to grid ON — click to disable'
                  : `Snap to grid OFF — snap move/resize to ${gridSpacing}px`
              }
              active={canvas.snapToGrid === true}
              onClick={() => toggleSnapToGrid()}
            >
              <Magnet className="h-3.5 w-3.5" />
            </ZoomBtn>
            <ZoomBtn
              title="Auto-layout: grid-pack cards on the print page"
              onClick={() => {
                if (items.length === 0) return
                if (!showGrid) setCanvas({ showGrid: true })
                autoOrganize({
                  density: 'sm',
                  fitPrint: true,
                  multiPage: true,
                  columns: 'auto',
                  mode: 'columns',
                  // Toolbar: keep current “topic labels” chrome; use Auto layout
                  // panel for panels / both / none.
                  groupChrome: 'labels',
                })
                // Visible confirmation (DevTools also logs [autoOrganize])
                const n = useCanvasStore.getState().items.filter((i) => !i.hidden)
                  .length
                console.info('[canvas] Auto-layout applied to', n, 'cards')
              }}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </ZoomBtn>
            <div className="mx-0.5 h-4 w-px bg-zinc-700" />
            <button
              type="button"
              title="Collapse canvas tools"
              aria-label="Collapse canvas tools"
              aria-expanded={true}
              data-testid="canvas-toolbar-collapse"
              onClick={() => {
                setGridMenuOpen(false)
                toggleCanvasToolbar()
              }}
              className="rounded p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ZoomBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: ReactNode
  onClick: () => void
  title: string
  /** When true, button looks pressed (e.g. grid / snap on). */
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`rounded p-1.5 transition ${
        active
          ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

function ToolBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: ReactNode
  onClick: () => void
  title: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`rounded p-1.5 transition ${
        active
          ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}
