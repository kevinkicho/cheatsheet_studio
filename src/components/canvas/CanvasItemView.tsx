import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { CanvasItem } from '@/types'
import { DEFAULT_TITLE_FONT_SIZE, titleBandPx } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import { MermaidView } from '@/components/math/MermaidView'
import { ProcessFlowView } from '@/components/math/ProcessFlowView'
import { isProcessFlowSnapshot } from '@/lib/processFlowSnapshot'
import { CanvasCardBody } from '@/components/canvas/CanvasCardBody'
import {
  CARD_DEFAULTS,
  composeBorderCss,
  isFigureLike,
} from '@/lib/cardDefaults'
import {
  HANDLE_HIT_PX,
  HANDLE_LAYOUT,
  HANDLE_VISUAL_PX,
  RESIZE_CURSOR,
  applyHandleToRect,
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

const MAX_AUTO_W = 520
const MAX_AUTO_H = 420
const DRAG_THRESHOLD_PX = 3
/** Minimal chrome slack when snugging autoFit cards (avoid oversized height). */
const AUTOFIT_SLACK_PX = 2

/** Natural-size measure target for autoFit (unscaled). */
function NaturalBody({ item }: { item: CanvasItem }) {
  if (item.type === 'process-chart' || item.mermaidSource || item.processFlow) {
    if (isProcessFlowSnapshot(item.processFlow)) {
      return (
        <ProcessFlowView
          snapshot={item.processFlow}
          title={item.title}
          className="h-full w-full"
        />
      )
    }
    return (
      <MermaidView
        source={item.mermaidSource ?? ''}
        theme={item.mermaidTheme ?? 'dark'}
        forceDark={(item.mermaidTheme ?? 'dark') !== 'forest'}
        className="h-full w-full"
      />
    )
  }
  return (
    <>
      {(item.type === 'equation' ||
        item.type === 'custom-equation' ||
        item.latex) &&
        item.latex && (
          <LatexView
            latex={item.latex}
            className="overflow-visible text-inherit [&_.katex]:text-[1em] [&_.katex-display]:m-0"
          />
        )}
      {(item.type === 'table' || item.tableMarkdown) && item.tableMarkdown && (
        <MarkdownTable
          markdown={item.tableMarkdown}
          fitContent
          className="overflow-visible text-inherit"
        />
      )}
    </>
  )
}

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
  const displayZ = multiSelected ? item.zIndex + 10_000 : item.zIndex
  const updateItem = useCanvasStore((s) => s.updateItem)
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

      // Snug: natural content + title chrome only (minimal slack).
      const nextW = Math.min(
        MAX_AUTO_W,
        Math.max(80, contentW + pad + AUTOFIT_SLACK_PX),
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

      if (sizeStable || alreadySized) {
        lastFitRef.current = { w: nextW, h: nextH }
        // Freeze autoFit once snug so contentFill may grow on user free-transform
        if (!settled && alreadySized) {
          settled = true
          updateItem(item.id, { autoFit: false })
        }
        return
      }

      lastFitRef.current = { w: nextW, h: nextH }
      resizeItem(item.id, nextW, nextH)
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
      if ((e.target as HTMLElement).closest('[data-resize-handle]')) return

      e.stopPropagation()
      e.preventDefault()

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

      // One undo step for the whole drag
      useCanvasStore.getState().beginHistoryBatch()

      const hitTitle = Boolean(
        (e.target as HTMLElement).closest('[data-card-title]'),
      )

      const el = rootRef.current
      if (el) {
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }

      const state = useCanvasStore.getState()
      const idsForGroup =
        !shift && state.selectedIds.includes(item.id) && state.selectedIds.length > 1
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

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!interactive) return
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      // Shift+click toggle: ignore move
      if (d.shiftToggle) return

      const z = zoom > 0.01 ? zoom : 1
      const rawDx = e.clientX - d.startX
      const rawDy = e.clientY - d.startY

      if (d.mode === 'move' && !d.active) {
        if (Math.hypot(rawDx, rawDy) < DRAG_THRESHOLD_PX) return
        d.active = true
        setDragging(true)
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
    [item.id, zoom, interactive, snapLive],
  )

  const endPointer = useCallback(
    (e: ReactPointerEvent) => {
      if (!interactive) return
      const d = dragRef.current
      if (d && d.pointerId !== e.pointerId) return

      // Click (no drag) on title overlay → hide title (overlay only; no size change)
      if (d && d.mode === 'move' && !d.active && d.hitTitle && !d.shiftToggle) {
        updateItem(item.id, {
          showTitle: false,
          contentFitKey: (item.contentFitKey ?? 0) + 1,
        })
      }

      // Single store commit at end of gesture
      commitPendingGeom()

      if (d && (d.active || d.mode === 'resize')) {
        useCanvasStore.getState().endHistoryBatch()
      } else if (d) {
        // Click without drag — still close history batch opened in beginMove
        useCanvasStore.getState().endHistoryBatch()
      }

      dragRef.current = null
      setDragging(false)
      for (const el of [e.currentTarget as HTMLElement, rootRef.current]) {
        if (!el) continue
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
    },
    [item.id, item.contentFitKey, updateItem, interactive, commitPendingGeom],
  )

  /**
   * Double-click empty card space → scale content (up or down) to fill the
   * card body. Keeps card width/height; only changes render scale.
   */
  const onDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      if (!interactive) return
      if ((e.target as HTMLElement).closest('[data-resize-handle]')) return
      if ((e.target as HTMLElement).closest('[data-card-title]')) return
      e.stopPropagation()
      e.preventDefault()
      updateItem(item.id, {
        autoFit: false,
        contentFill: true,
        contentFitKey: (item.contentFitKey ?? 0) + 1,
      })
    },
    [item.id, item.contentFitKey, updateItem, interactive],
  )

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

  if (item.hidden) {
    // Still occupies layout identity for marquee hit-tests only when not hidden;
    // fully omit from canvas when Outliner eye is off.
    return null
  }

  return (
    <div
      ref={rootRef}
      data-canvas-item
      // overflow-visible so corner/edge handles are not clipped by rounded border
      className={`absolute select-none touch-none ${
        selected
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
        // Selected + handles above neighbors so grips stay clickable
        zIndex: showResizeHandles
          ? Math.max(displayZ, 1) + 50
          : displayZ,
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
      onPointerDown={beginMove}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onDoubleClick}
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
              <NaturalBody item={item} />
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

      {/* Free-transform handles sit outside clipped chrome (large hit targets) */}
      {showResizeHandles &&
        HANDLE_LAYOUT.map(({ id, className }) => (
          <div
            key={id}
            data-resize-handle={id}
            className={`${className} z-[60] flex items-center justify-center`}
            style={{
              width: HANDLE_HIT_PX,
              height: HANDLE_HIT_PX,
              cursor: RESIZE_CURSOR[id],
              // Extend hit area without enlarging visual grip
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
    </div>
  )
}
