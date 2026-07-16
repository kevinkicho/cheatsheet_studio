import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { CanvasItem } from '@/types'
import { DEFAULT_TITLE_FONT_SIZE, titleBandPx } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore } from '@/stores/uiStore'
import { CanvasCardBody } from '@/components/canvas/CanvasCardBody'
import {
  NATURAL_MAX_H,
  NATURAL_MAX_W,
  NATURAL_SLACK_PX,
  NaturalCardBody,
} from '@/components/canvas/NaturalCardBody'
import {
  CARD_DEFAULTS,
  composeBorderCss,
  isFigureLike,
} from '@/lib/cardDefaults'
import {
  CARD_SELECTED_FLOAT,
  CARD_STACK_BASE,
  HANDLE_LAYOUT,
  HANDLE_VISUAL_PX,
  RESIZE_CURSOR,
  applyHandleToRect,
  handleHitPx,
  type ResizeHandle,
} from '@/lib/resizeHandles'
import {
  getPrintAwareSnapOrigin,
  ORGANIZE_GRID,
  snapToGridValue,
} from '@/lib/autoOrganize'
import {
  clearLiveCanvasDrag,
  getLiveCanvasDrag,
  liveRectForItem,
  setLiveCanvasDrag,
  subscribeLiveCanvasDrag,
} from '@/lib/liveCanvasDrag'

interface CanvasItemViewProps {
  item: CanvasItem
  selected: boolean
  zoom: number
  /** When false (pan tool), card ignores pointer so the board can be dragged. */
  interactive?: boolean
}

/** Shared with CanvasDragPreview so library ghost size matches canvas snug. */
const MAX_AUTO_W = NATURAL_MAX_W
const MAX_AUTO_H = NATURAL_MAX_H
const DRAG_THRESHOLD_PX = 3
/** Minimal chrome slack when snugging autoFit cards (avoid oversized height). */
const AUTOFIT_SLACK_PX = NATURAL_SLACK_PX

export function CanvasItemView({
  item,
  selected,
  zoom,
  interactive = true,
}: CanvasItemViewProps) {
  const select = useCanvasStore((s) => s.select)
  const toggleSelect = useCanvasStore((s) => s.toggleSelect)
  const moveItem = useCanvasStore((s) => s.moveItem)
  const moveItemsBy = useCanvasStore((s) => s.moveItemsBy)
  const resizeItem = useCanvasStore((s) => s.resizeItem)
  const applyItemRects = useCanvasStore((s) => s.applyItemRects)
  const selectedCount = useCanvasStore((s) => s.selectedIds.length)
  /** Multi-select: group frame owns resize; cards float above non-selected. */
  const multiSelected = selected && selectedCount > 1
  // Stack above panel title chips (CARD_STACK_BASE). Selected floats so
  // protruding corner grips are not covered by higher-z neighbors.
  const displayZ = multiSelected
    ? CARD_STACK_BASE + item.zIndex + CARD_SELECTED_FLOAT
    : selected
      ? CARD_STACK_BASE + item.zIndex + CARD_SELECTED_FLOAT
      : CARD_STACK_BASE + item.zIndex
  const updateItem = useCanvasStore((s) => s.updateItem)
  const editingProcessChartId = useUiStore((s) => s.editingProcessChartId)
  const beginEditProcessChart = useUiStore((s) => s.beginEditProcessChart)
  const canvasShowHiddenItems = useUiStore((s) => s.canvasShowHiddenItems)
  const isProcessChart =
    item.type === 'process-chart' ||
    Boolean(item.mermaidSource || item.processFlow)
  const isEditingThis =
    isProcessChart && editingProcessChartId === item.id
  const rootRef = useRef<HTMLDivElement>(null)
  const naturalRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: 'move' | 'resize'
    active: boolean
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
    hitTitle: boolean
    /** Multi-drag: start positions of every selected card */
    groupOrigins: Record<string, { x: number; y: number }> | null
    /** Free-transform handle id (n/s/e/w/ne/nw/se/sw) */
    resizeHandle?: ResizeHandle
    shiftToggle: boolean
  } | null>(null)
  const lastFitRef = useRef({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const snapToGrid = useCanvasStore((s) => s.canvas.snapToGrid === true)
  const gridSpacing = useCanvasStore((s) => s.canvas.gridSpacing ?? ORGANIZE_GRID)
  /**
   * Shared live drag (multi-select siblings) — only selected cards subscribe
   * so the rest of the sheet does not re-render every pointer move.
   */
  const liveDrag = useSyncExternalStore(
    selected ? subscribeLiveCanvasDrag : () => () => {},
    getLiveCanvasDrag,
    getLiveCanvasDrag,
  )

  /** Snap live coords so UI matches store snap (was broken by local-only paint). */
  const snapLive = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const g = Math.max(4, gridSpacing)
      if (!snapToGrid) {
        return {
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(w),
          h: Math.round(h),
        }
      }
      // Read canvas at call time — avoid re-creating snapLive on every canvas field change
      const canvas = useCanvasStore.getState().canvas
      const { ox, oy } = getPrintAwareSnapOrigin(x, y, canvas)
      return {
        x: snapToGridValue(x, g, ox),
        y: snapToGridValue(y, g, oy),
        w: Math.max(g, snapToGridValue(w, g)),
        h: Math.max(g, snapToGridValue(h, g)),
      }
    },
    [snapToGrid, gridSpacing],
  )
  /** Pending store commit — written only on pointer-up (not every frame). */
  const pendingGeomRef = useRef<{
    mode: 'move' | 'resize'
    rects: Record<string, { x: number; y: number; width: number; height: number }>
    groupOrigins?: Record<string, { x: number; y: number }>
    dx?: number
    dy?: number
  } | null>(null)

  const autoFit = item.autoFit === true
  const showTitle = item.showTitle !== false && Boolean(item.title)

  useLayoutEffect(() => {
    if (!autoFit || !naturalRef.current) return

    let settled = false

    const measure = () => {
      const body = naturalRef.current
      if (!body) return

      const style = item.style ?? {}
      const pad = (style.padding ?? CARD_DEFAULTS.padding) * 2
      // Title sits in normal flow above the body — reserve its band so the body
      // height equals content height (no forced shrink / grow gutters).
      const titleBand = showTitle
        ? titleBandPx(style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE)
        : 0

      const contentW = Math.ceil(
        Math.max(body.scrollWidth, body.offsetWidth, 1),
      )
      const contentH = Math.ceil(
        Math.max(body.scrollHeight, body.offsetHeight, 1),
      )
      if (contentW < 2 && contentH < 2) return

      // Title is ellipsis-truncated if card is only as wide as a short formula
      // (e.g. Continuous Compounding vs FV=PV e^{rt}). Floor width by title.
      const tFont = style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE
      const titleW = showTitle
        ? Math.ceil((item.title ?? '').length * tFont * 0.58) + 12
        : 0

      // Snug: natural KaTeX/table + title chrome (minimal slack).
      const nextW = Math.min(
        MAX_AUTO_W,
        Math.max(80, Math.max(contentW, titleW) + pad + AUTOFIT_SLACK_PX),
      )
      const nextH = Math.min(
        MAX_AUTO_H,
        Math.max(40, contentH + pad + titleBand + AUTOFIT_SLACK_PX),
      )

      const prev = lastFitRef.current
      const sizeStable =
        Math.abs(prev.w - nextW) < 2 && Math.abs(prev.h - nextH) < 2
      const alreadySized =
        Math.abs(item.width - nextW) < 2 && Math.abs(item.height - nextH) < 2

      // Card already matches measured content — freeze autoFit and allow fill
      // so residual body slack can scale slightly (no flash: card already snug).
      if (alreadySized) {
        lastFitRef.current = { w: nextW, h: nextH }
        if (!settled) {
          settled = true
          updateItem(item.id, { autoFit: false, contentFill: true })
        }
        return
      }

      // Measured size stable (or first good read) but card still wrong — resize.
      // Old code returned early on sizeStable without resize, so pack heuristics
      // left empty guts forever (Future Value / Continuous / CAPM).
      lastFitRef.current = { w: nextW, h: nextH }
      resizeItem(item.id, nextW, nextH)
      if (sizeStable && !settled) {
        // Next effect pass should hit alreadySized and freeze
      }
    }

    measure()
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    ro.observe(naturalRef.current)
    // KaTeX / fonts settle after mount
    const t1 = window.setTimeout(measure, 50)
    const t2 = window.setTimeout(measure, 150)
    const t3 = window.setTimeout(measure, 350)
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!settled) measure()
      })
    }
    return () => {
      ro.disconnect()
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [
    autoFit,
    showTitle,
    item.id,
    item.latex,
    item.tableMarkdown,
    item.mermaidSource,
    item.mermaidTheme,
    item.imageUrl,
    item.title,
    item.style?.fontSize,
    item.style?.titleFontSize,
    item.style?.padding,
    item.width,
    item.height,
    resizeItem,
    updateItem,
  ])

  const beginMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!interactive) return
      if (e.button !== 0) return
      // Resize grips + process Edit control own their pointer events
      if (
        (e.target as HTMLElement).closest(
          '[data-resize-handle], [data-process-edit]',
        )
      ) {
        return
      }

      e.stopPropagation()
      // Do not preventDefault on pure click — helps avoid sticky capture after
      // splash/first paint when pointerup is lost. Capture only after threshold.

      const shift = e.shiftKey
      if (shift) {
        // Shift+click: add/remove from multi-select (no drag start intent)
        toggleSelect(item.id)
      } else {
        // Plain click: select only this card, unless it's already part of a
        // multi-selection (keep group so we can drag all together).
        const state = useCanvasStore.getState()
        const inMulti =
          state.selectedIds.includes(item.id) && state.selectedIds.length > 1
        if (!inMulti) select(item.id)
      }

      // Locked items can be selected but not dragged
      if (item.locked) {
        dragRef.current = null
        return
      }

      const hitTitle = Boolean(
        (e.target as HTMLElement).closest('[data-card-title]'),
      )

      const state = useCanvasStore.getState()
      const idsForGroup =
        !shift &&
        state.selectedIds.includes(item.id) &&
        state.selectedIds.length > 1
          ? state.selectedIds
          : [item.id]
      const groupOrigins: Record<string, { x: number; y: number }> = {}
      for (const id of idsForGroup) {
        const it = state.items.find((x) => x.id === id)
        // Never include locked cards in multi-drag
        if (it && !it.locked) groupOrigins[id] = { x: it.x, y: it.y }
      }
      // If everything in the group was locked, abort drag
      if (Object.keys(groupOrigins).length === 0) {
        dragRef.current = null
        return
      }

      // Intent only — pointer capture starts after DRAG_THRESHOLD so a normal
      // click never sticks to the cursor if pointerup is missed (post-refresh).
      dragRef.current = {
        mode: 'move',
        active: false,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: item.x,
        origY: item.y,
        origW: item.width,
        origH: item.height,
        hitTitle: hitTitle && !shift,
        groupOrigins: shift ? null : groupOrigins,
        shiftToggle: shift,
      }
    },
    [
      item.id,
      item.x,
      item.y,
      item.width,
      item.height,
      item.locked,
      select,
      toggleSelect,
      interactive,
    ],
  )

  const beginResize = useCallback(
    (handle: ResizeHandle) => (e: ReactPointerEvent) => {
      if (!interactive || item.locked) return
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      useCanvasStore.getState().beginHistoryBatch()
      const state = useCanvasStore.getState()
      if (!state.selectedIds.includes(item.id)) {
        select(item.id)
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      dragRef.current = {
        mode: 'resize',
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: item.x,
        origY: item.y,
        origW: item.width,
        origH: item.height,
        hitTitle: false,
        groupOrigins: null,
        resizeHandle: handle,
        shiftToggle: false,
      }
      setLiveCanvasDrag({
        type: 'resize',
        rects: {
          [item.id]: {
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
          },
        },
      })
      setDragging(true)
    },
    [
      item.id,
      item.x,
      item.y,
      item.width,
      item.height,
      item.locked,
      select,
      interactive,
    ],
  )

  /** One store write at gesture end — keeps drag smooth. */
  const commitPendingGeom = useCallback(() => {
    const p = pendingGeomRef.current
    pendingGeomRef.current = null
    clearLiveCanvasDrag()
    if (!p) return
    if (p.mode === 'move') {
      if (
        p.groupOrigins &&
        p.dx != null &&
        p.dy != null &&
        Object.keys(p.groupOrigins).length > 1
      ) {
        moveItemsBy(p.groupOrigins, p.dx, p.dy)
        return
      }
      const entries = Object.entries(p.rects)
      if (entries.length > 0) {
        for (const [id, r] of entries) {
          moveItem(id, r.x, r.y)
        }
        return
      }
      if (p.groupOrigins && p.dx != null && p.dy != null) {
        moveItemsBy(p.groupOrigins, p.dx, p.dy)
      }
      return
    }
    if (p.mode === 'resize') {
      applyItemRects(p.rects, { manual: true })
    }
  }, [moveItem, moveItemsBy, applyItemRects])

  /** End move/resize even when the event isn't on this node (lost pointerup). */
  const endPointerGesture = useCallback(
    (pointerId: number, opts?: { fromWindow?: boolean }) => {
      const d = dragRef.current
      if (!d || d.pointerId !== pointerId) return

      // Click (no drag) on title overlay → hide title
      if (d.mode === 'move' && !d.active && d.hitTitle && !d.shiftToggle) {
        updateItem(item.id, {
          showTitle: false,
          contentFitKey: (item.contentFitKey ?? 0) + 1,
        })
      }

      commitPendingGeom()

      if (d.active || d.mode === 'resize') {
        useCanvasStore.getState().endHistoryBatch()
      } else if (d.mode === 'move' && d.active === false) {
        // Intent-only click: no history batch was opened until drag activates
      }

      dragRef.current = null
      setDragging(false)
      const el = rootRef.current
      if (el) {
        try {
          if (el.hasPointerCapture?.(pointerId)) {
            el.releasePointerCapture(pointerId)
          }
        } catch {
          /* ignore */
        }
      }
      void opts
    },
    [item.id, item.contentFitKey, updateItem, commitPendingGeom],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!interactive) return
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      // Button released but we missed pointerup (splash / focus steal / etc.)
      if (e.buttons === 0) {
        endPointerGesture(e.pointerId, { fromWindow: true })
        return
      }
      // Shift+click toggle: ignore move
      if (d.shiftToggle) return

      const z = zoom > 0.01 ? zoom : 1
      const rawDx = e.clientX - d.startX
      const rawDy = e.clientY - d.startY

      if (d.mode === 'move' && !d.active) {
        if (Math.hypot(rawDx, rawDy) < DRAG_THRESHOLD_PX) return
        d.active = true
        setDragging(true)
        // Capture only once drag is real — simple clicks never hold the pointer
        useCanvasStore.getState().beginHistoryBatch()
        const el = rootRef.current
        if (el) {
          try {
            el.setPointerCapture(e.pointerId)
          } catch {
            /* ignore */
          }
        }
      }

      const dx = rawDx / z
      const dy = rawDy / z
      if (d.mode === 'move') {
        // Paint via shared live drag (no Zustand items write until pointer-up)
        const s = snapLive(d.origX + dx, d.origY + dy, d.origW, d.origH)
        const sdx = s.x - d.origX
        const sdy = s.y - d.origY
        if (d.groupOrigins && Object.keys(d.groupOrigins).length > 0) {
          setLiveCanvasDrag({
            type: 'move',
            origins: d.groupOrigins,
            dx: sdx,
            dy: sdy,
          })
          pendingGeomRef.current = {
            mode: 'move',
            rects:
              Object.keys(d.groupOrigins).length === 1
                ? {
                    [item.id]: {
                      x: s.x,
                      y: s.y,
                      width: s.w,
                      height: s.h,
                    },
                  }
                : {},
            groupOrigins: d.groupOrigins,
            dx: sdx,
            dy: sdy,
          }
        }
      } else {
        const handle = d.resizeHandle ?? 'se'
        const next = applyHandleToRect(
          { x: d.origX, y: d.origY, w: d.origW, h: d.origH },
          handle,
          dx,
          dy,
        )
        const s = snapLive(next.x, next.y, next.w, next.h)
        const rect = {
          x: s.x,
          y: s.y,
          width: s.w,
          height: s.h,
        }
        setLiveCanvasDrag({
          type: 'resize',
          rects: { [item.id]: rect },
        })
        pendingGeomRef.current = {
          mode: 'resize',
          rects: { [item.id]: rect },
        }
      }
    },
    [item.id, zoom, interactive, snapLive, endPointerGesture],
  )

  const endPointer = useCallback(
    (e: ReactPointerEvent) => {
      endPointerGesture(e.pointerId)
    },
    [endPointerGesture],
  )

  // Global safety net: if pointerup is lost (common after hard refresh /
  // splash / focus changes), buttons===0 on any move ends the sticky drag.
  useEffect(() => {
    const onWinPointerUp = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      endPointerGesture(e.pointerId, { fromWindow: true })
    }
    const onWinPointerMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      if (e.buttons === 0) {
        endPointerGesture(e.pointerId, { fromWindow: true })
      }
    }
    const onBlur = () => {
      const d = dragRef.current
      if (!d) return
      endPointerGesture(d.pointerId, { fromWindow: true })
    }
    window.addEventListener('pointerup', onWinPointerUp, true)
    window.addEventListener('pointercancel', onWinPointerUp, true)
    window.addEventListener('pointermove', onWinPointerMove, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointerup', onWinPointerUp, true)
      window.removeEventListener('pointercancel', onWinPointerUp, true)
      window.removeEventListener('pointermove', onWinPointerMove, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [endPointerGesture])

  const style = item.style ?? {}
  const pad = style.padding ?? CARD_DEFAULTS.padding
  const liveRect = liveRectForItem(
    item.id,
    {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    },
    liveDrag,
  )
  const geomX = liveRect?.x ?? item.x
  const geomY = liveRect?.y ?? item.y
  const geomW = liveRect?.width ?? item.width
  const geomH = liveRect?.height ?? item.height
  const safeW = Math.max(40, geomW || 80)
  const safeH = Math.max(32, geomH || 48)
  const left = Number.isFinite(geomX) ? geomX : 0
  const top = Number.isFinite(geomY) ? geomY : 0
  const asFigure = isFigureLike(item)
  // Background fill ON unless user set transparentBackground: true
  // (figures and equations share the same solid panel default)
  const transparent = item.transparentBackground === true
  const titleAlign = item.titleAlign ?? CARD_DEFAULTS.titleAlign
  const titleAlignClass =
    titleAlign === 'center'
      ? 'text-center'
      : titleAlign === 'right'
        ? 'text-right'
        : 'text-left'
  const showResizeHandles = selected && !item.locked && !multiSelected
  // Canvas-space hit that stays ~22px on screen when zoomed out
  const gripHit = handleHitPx(zoom)

  // Layers eye-off: omit from board unless "Show hidden" is checked
  if (item.hidden && !canvasShowHiddenItems) {
    return null
  }

  return (
    <div
      ref={rootRef}
      data-canvas-item
      data-testid={`canvas-item-${item.id}`}
      // overflow-visible so corner/edge handles are not clipped by rounded border
      className={`absolute select-none touch-none ${
        item.hidden ? 'opacity-40' : ''
      } ${
        isEditingThis
          ? 'ring-2 ring-emerald-400/90'
          : selected
            ? 'ring-2 ring-indigo-400'
            : transparent
              ? 'ring-1 ring-transparent hover:ring-zinc-600/60'
              : 'ring-1 ring-transparent hover:ring-zinc-600'
      } ${
        !interactive
          ? 'pointer-events-none'
          : item.locked
            ? 'cursor-default'
            : dragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
      }`}
      style={{
        left,
        top,
        width: safeW,
        height: safeH,
        // displayZ already floats selected above neighbors + panel chips
        zIndex: displayZ,
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
      onPointerDown={beginMove}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onLostPointerCapture={(e) => {
        // Capture lost without pointerup (browser/tab focus) — end gesture
        endPointerGesture(e.pointerId, { fromWindow: true })
      }}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation()
        // Selection handled on pointer down (supports Shift multi-select)
        if (e.shiftKey) return
        if (!selected) select(item.id)
      }}
    >
      {/* Chrome + content: clips to radius; handles live as siblings outside.
          Title sits in normal flow (reserved band) so it never overlaps body. */}
      <div
        className="pointer-events-none absolute inset-0 flex min-h-0 flex-col overflow-hidden"
        style={{
          background: transparent
            ? 'transparent'
            : (style.background ?? 'rgba(30,32,40,0.92)'),
          border: composeBorderCss(style),
          borderRadius: 8,
          color: style.color ?? '#e8eaed',
          fontSize: style.fontSize ?? 18,
          padding: pad,
          boxSizing: 'border-box',
          boxShadow: transparent
            ? 'none'
            : selected
              ? '0 0 0 1px rgba(129,140,248,0.4), 0 8px 24px rgba(0,0,0,0.35)'
              : '0 4px 16px rgba(0,0,0,0.25)',
        }}
      >
        {showTitle && (
          <div
            data-card-title
            title="Click to hide title"
            className={`pointer-events-auto relative z-10 shrink-0 cursor-pointer truncate px-0.5 font-medium uppercase tracking-wide text-zinc-500 hover:text-zinc-200 ${titleAlignClass}`}
            style={{
              fontSize: style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE,
              lineHeight: 1.6,
              marginBottom: 2,
              height: Math.round(
                (style.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE) * 1.6,
              ),
            }}
          >
            {item.title}
          </div>
        )}

        {autoFit && !asFigure && (
          <div
            aria-hidden
            className="pointer-events-none fixed -left-[9999px] top-0 opacity-0"
            style={{
              width: 'max-content',
              maxWidth: MAX_AUTO_W - pad * 2,
              // Match card body base font so autoFit width ≈ FitContent natural size
              fontSize: style.fontSize ?? 18,
              color: style.color ?? '#e8eaed',
            }}
          >
            <div ref={naturalRef}>
              <NaturalCardBody item={item} />
            </div>
          </div>
        )}

        {/* Body below title — process charts / equations never sit under the label */}
        <div className="pointer-events-none relative min-h-0 w-full flex-1">
          <CanvasCardBody
            item={item}
            showBadge={selected && !dragging}
            interactiveFast={dragging}
          />
        </div>
      </div>

      {/* Free-transform handles sit outside clipped chrome (zoom-stable hits) */}
      {showResizeHandles &&
        HANDLE_LAYOUT.map(({ id, className }) => (
          <div
            key={id}
            data-resize-handle={id}
            className={`${className} z-[60] flex items-center justify-center`}
            style={{
              width: gripHit,
              height: gripHit,
              // Invisible padding keeps a large hit without a huge blue square
              cursor: RESIZE_CURSOR[id],
              touchAction: 'none',
            }}
            onPointerDown={beginResize(id)}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            title={`Resize (${id})`}
          >
            <span
              className="pointer-events-none block rounded-sm bg-indigo-400 shadow-sm ring-1 ring-indigo-100"
              style={{
                width: HANDLE_VISUAL_PX,
                height: HANDLE_VISUAL_PX,
              }}
            />
          </div>
        ))}
      {item.locked && selected && (
        <div
          className="pointer-events-none absolute bottom-1 right-1 z-20 rounded bg-zinc-950/80 px-1 text-[9px] text-zinc-400 ring-1 ring-zinc-700"
          title="Locked — unlock in Outliner"
        >
          🔒
        </div>
      )}

      {/* Process Edit — top-right inset (bottom edge is full of resize grips
          when selected: SW / S / SE at z-60 with large hit boxes). */}
      {isProcessChart && interactive && !item.locked && (
        <button
          type="button"
          data-process-edit
          className={`pointer-events-auto absolute right-1.5 top-1.5 z-[70] rounded px-1.5 py-0.5 text-[9px] font-semibold shadow-sm ring-1 ${
            isEditingThis
              ? 'bg-emerald-500/25 text-emerald-200 ring-emerald-400/50'
              : 'bg-zinc-950/90 text-zinc-200 ring-zinc-600 hover:bg-indigo-500/25 hover:text-indigo-100 hover:ring-indigo-400/60'
          }`}
          title={
            isEditingThis
              ? 'Editing in Process panel — canvas card is not selected (Delete is safe for diagram nodes)'
              : 'Edit in Process panel (loads this chart; deselects card so Delete won’t remove it)'
          }
          onPointerDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            // Deselect canvas so Delete never removes this card while editing
            select(null)
            beginEditProcessChart(item.id)
          }}
        >
          {isEditingThis ? 'Editing' : 'Edit'}
        </button>
      )}
    </div>
  )
}
