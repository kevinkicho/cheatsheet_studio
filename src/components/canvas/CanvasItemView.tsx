import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { CanvasItem } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import { MermaidView } from '@/components/math/MermaidView'
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

/** Natural-size measure target for autoFit (unscaled). */
function NaturalBody({ item }: { item: CanvasItem }) {
  if (item.type === 'process-chart' || item.mermaidSource) {
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
  /** Bumps FitContent contentKey when Mermaid finishes async render. */
  const [mermaidReadyKey, setMermaidReadyKey] = useState(0)

  const autoFit = item.autoFit === true
  const showTitle = item.showTitle !== false && Boolean(item.title)

  useLayoutEffect(() => {
    if (!autoFit || !naturalRef.current) return

    const measure = () => {
      const body = naturalRef.current
      if (!body) return

      const style = item.style ?? {}
      const pad = (style.padding ?? CARD_DEFAULTS.padding) * 2

      const contentW = Math.ceil(
        Math.max(body.scrollWidth, body.offsetWidth, 1),
      )
      const contentH = Math.ceil(
        Math.max(body.scrollHeight, body.offsetHeight, 1),
      )
      if (contentW < 2 && contentH < 2) return

      // Natural content size only — title overlays; no reserved chrome gutters.
      const nextW = Math.min(MAX_AUTO_W, Math.max(120, contentW + pad + 2))
      const nextH = Math.min(MAX_AUTO_H, Math.max(48, contentH + pad + 2))

      const prev = lastFitRef.current
      if (Math.abs(prev.w - nextW) < 2 && Math.abs(prev.h - nextH) < 2) return
      if (
        Math.abs(item.width - nextW) < 2 &&
        Math.abs(item.height - nextH) < 2
      ) {
        lastFitRef.current = { w: nextW, h: nextH }
        return
      }

      lastFitRef.current = { w: nextW, h: nextH }
      resizeItem(item.id, nextW, nextH)
    }

    measure()
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    ro.observe(naturalRef.current)
    const t = window.setTimeout(measure, 80)
    return () => {
      ro.disconnect()
      window.clearTimeout(t)
    }
  }, [
    autoFit,
    item.id,
    item.latex,
    item.tableMarkdown,
    item.mermaidSource,
    item.mermaidTheme,
    item.imageUrl,
    item.title,
    item.style?.fontSize,
    item.style?.padding,
    item.width,
    item.height,
    resizeItem,
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
        if (d.groupOrigins && Object.keys(d.groupOrigins).length > 1) {
          moveItemsBy(d.groupOrigins, dx, dy)
        } else {
          const nx = d.origX + dx
          const ny = d.origY + dy
          if (Number.isFinite(nx) && Number.isFinite(ny)) {
            moveItem(item.id, nx, ny)
          }
        }
      } else {
        // Free-transform from active handle (single card: 4 corners + 4 edges)
        const handle = d.resizeHandle ?? 'se'
        const next = applyHandleToRect(
          { x: d.origX, y: d.origY, w: d.origW, h: d.origH },
          handle,
          dx,
          dy,
        )
        applyItemRects(
          {
            [item.id]: {
              x: next.x,
              y: next.y,
              width: next.w,
              height: next.h,
            },
          },
          { manual: true },
        )
      }
    },
    [
      item.id,
      moveItem,
      moveItemsBy,
      applyItemRects,
      zoom,
      interactive,
    ],
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

      if (d) {
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
    [item.id, item.contentFitKey, updateItem, interactive],
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
  const safeW = Math.max(80, item.width || 80)
  const safeH = Math.max(48, item.height || 48)
  const left = Number.isFinite(item.x) ? item.x : 0
  const top = Number.isFinite(item.y) ? item.y : 0
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
            className={`pointer-events-auto relative z-10 mb-0.5 h-4 shrink-0 cursor-pointer truncate px-0.5 text-[10px] font-medium uppercase leading-4 tracking-wide text-zinc-500 hover:text-zinc-200 ${titleAlignClass}`}
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
            showBadge={selected}
            mermaidReadyKey={mermaidReadyKey}
            onMermaidRendered={() => setMermaidReadyKey((k) => k + 1)}
            paintZoom={zoom}
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
