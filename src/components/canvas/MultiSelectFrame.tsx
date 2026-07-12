import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCanvasStore } from '@/stores/canvasStore'
import {
  HANDLE_HIT_PX,
  HANDLE_LAYOUT,
  HANDLE_VISUAL_PX,
  RESIZE_CURSOR,
  applyHandleToRect,
  boundsOfItems,
  mapItemsToNewBounds,
  type ItemRect,
  type ResizeHandle,
} from '@/lib/resizeHandles'
import {
  clearLiveCanvasDrag,
  getLiveCanvasDrag,
  liveRectForItem,
  setLiveCanvasDrag,
  subscribeLiveCanvasDrag,
} from '@/lib/liveCanvasDrag'
import {
  getPrintAwareSnapOrigin,
  ORGANIZE_GRID,
  snapToGridValue,
} from '@/lib/autoOrganize'

const PAD = 6
const MIN_W = 80
const MIN_H = 48

/**
 * Group selection chrome: bounding box over all selected cards with a
 * high z-index so move/resize stay above everything else (including print
 * overlays). Appears when 2+ items are selected.
 * Free-transform via 4 corners + 4 edge midpoints.
 *
 * During drag/resize, geometry is painted via liveCanvasDrag (no per-frame
 * Zustand item writes). Store commits once on pointer-up.
 */
export function MultiSelectFrame({
  zoom,
  interactive,
}: {
  zoom: number
  interactive: boolean
}) {
  const items = useCanvasStore((s) => s.items)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const moveItemsBy = useCanvasStore((s) => s.moveItemsBy)
  const applyItemRects = useCanvasStore((s) => s.applyItemRects)
  const snapToGrid = useCanvasStore((s) => s.canvas.snapToGrid === true)
  const gridSpacing = useCanvasStore(
    (s) => s.canvas.gridSpacing ?? ORGANIZE_GRID,
  )

  const liveDrag = useSyncExternalStore(
    subscribeLiveCanvasDrag,
    getLiveCanvasDrag,
    getLiveCanvasDrag,
  )

  const selected = useMemo(
    () => items.filter((i) => selectedIds.includes(i.id) && !i.hidden),
    [items, selectedIds],
  )

  const bounds = useMemo(() => {
    if (selected.length < 2) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const it of selected) {
      const r =
        liveRectForItem(
          it.id,
          { x: it.x, y: it.y, width: it.width, height: it.height },
          liveDrag,
        ) ?? { x: it.x, y: it.y, width: it.width, height: it.height }
      minX = Math.min(minX, r.x)
      minY = Math.min(minY, r.y)
      maxX = Math.max(maxX, r.x + r.width)
      maxY = Math.max(maxY, r.y + r.height)
    }
    if (!Number.isFinite(minX)) return null
    return {
      x: minX - PAD,
      y: minY - PAD,
      w: maxX - minX + PAD * 2,
      h: maxY - minY + PAD * 2,
    }
  }, [selected, liveDrag])

  const maxItemZ = useMemo(
    () => selected.reduce((m, i) => Math.max(m, i.zIndex), 1),
    [selected],
  )

  const dragRef = useRef<{
    mode: 'move' | 'resize'
    handle?: ResizeHandle
    pointerId: number
    startX: number
    startY: number
    origins: Record<string, { x: number; y: number }>
    itemRects: Record<string, ItemRect>
    groupBounds: { x: number; y: number; w: number; h: number }
  } | null>(null)

  const pendingRef = useRef<{
    mode: 'move' | 'resize'
    origins?: Record<string, { x: number; y: number }>
    dx?: number
    dy?: number
    rects?: Record<string, ItemRect>
  } | null>(null)

  const [dragging, setDragging] = useState(false)

  const onPointerDownMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!interactive || e.button !== 0) return
      if ((e.target as HTMLElement).closest('[data-resize-handle]')) return
      e.stopPropagation()
      e.preventDefault()
      const origins: Record<string, { x: number; y: number }> = {}
      for (const it of selected) {
        if (!it.locked) origins[it.id] = { x: it.x, y: it.y }
      }
      if (Object.keys(origins).length === 0) return
      useCanvasStore.getState().beginHistoryBatch()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        mode: 'move',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origins,
        itemRects: {},
        groupBounds: { x: 0, y: 0, w: 1, h: 1 },
      }
      setDragging(true)
    },
    [interactive, selected],
  )

  const onPointerDownResize = useCallback(
    (handle: ResizeHandle) => (e: ReactPointerEvent) => {
      if (!interactive || e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      const itemRects: Record<string, ItemRect> = {}
      for (const it of selected) {
        if (!it.locked) {
          itemRects[it.id] = {
            x: it.x,
            y: it.y,
            width: it.width,
            height: it.height,
          }
        }
      }
      if (Object.keys(itemRects).length === 0) return
      const groupBounds = boundsOfItems(Object.values(itemRects))
      if (!groupBounds) return
      useCanvasStore.getState().beginHistoryBatch()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        mode: 'resize',
        handle,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origins: {},
        itemRects,
        groupBounds,
      }
      setDragging(true)
    },
    [interactive, selected],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const z = zoom > 0.01 ? zoom : 1
      let dx = (e.clientX - d.startX) / z
      let dy = (e.clientY - d.startY) / z

      if (d.mode === 'move') {
        // Snap group delta from first origin (same grid as single-card drag)
        if (snapToGrid) {
          const firstId = Object.keys(d.origins)[0]
          const o = firstId ? d.origins[firstId] : null
          if (o) {
            const g = Math.max(4, gridSpacing)
            const canvas = useCanvasStore.getState().canvas
            const nx = o.x + dx
            const ny = o.y + dy
            const { ox, oy } = getPrintAwareSnapOrigin(nx, ny, canvas)
            dx = snapToGridValue(nx, g, ox) - o.x
            dy = snapToGridValue(ny, g, oy) - o.y
          }
        } else {
          dx = Math.round(dx)
          dy = Math.round(dy)
        }
        setLiveCanvasDrag({ type: 'move', origins: d.origins, dx, dy })
        pendingRef.current = { mode: 'move', origins: d.origins, dx, dy }
      } else {
        if (!d.handle) return
        const newBounds = applyHandleToRect(d.groupBounds, d.handle, dx, dy)
        let mapped = mapItemsToNewBounds(
          d.itemRects,
          d.groupBounds,
          newBounds,
        )
        if (snapToGrid) {
          const g = Math.max(4, gridSpacing)
          const canvas = useCanvasStore.getState().canvas
          const next: Record<string, ItemRect> = {}
          for (const [id, r] of Object.entries(mapped)) {
            const { ox, oy } = getPrintAwareSnapOrigin(r.x, r.y, canvas)
            next[id] = {
              x: snapToGridValue(r.x, g, ox),
              y: snapToGridValue(r.y, g, oy),
              width: Math.max(g, snapToGridValue(r.width, g)),
              height: Math.max(g, snapToGridValue(r.height, g)),
            }
          }
          mapped = next
        }
        setLiveCanvasDrag({ type: 'resize', rects: mapped })
        pendingRef.current = { mode: 'resize', rects: mapped }
      }
    },
    [zoom, snapToGrid, gridSpacing],
  )

  const endPointer = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const p = pendingRef.current
      pendingRef.current = null
      clearLiveCanvasDrag()
      if (p) {
        if (p.mode === 'move' && p.origins && p.dx != null && p.dy != null) {
          moveItemsBy(p.origins, p.dx, p.dy)
        } else if (p.mode === 'resize' && p.rects) {
          applyItemRects(p.rects, { manual: true })
        }
      }
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      dragRef.current = null
      setDragging(false)
      useCanvasStore.getState().endHistoryBatch()
    },
    [moveItemsBy, applyItemRects],
  )

  if (!bounds || selected.length < 2) return null

  // Sit above multi-boosted cards (item.z + 10k) and print chrome
  const frameZ = Math.max(maxItemZ + 10_000 + 1_000, 100_000)

  return (
    <div
      data-multi-select-frame
      className={`absolute box-border border-2 border-indigo-400 bg-indigo-500/5 shadow-[0_0_0_1px_rgba(129,140,248,0.35)] ${
        interactive
          ? dragging
            ? 'cursor-grabbing'
            : 'cursor-grab'
          : 'pointer-events-none'
      }`}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: Math.max(bounds.w, MIN_W),
        height: Math.max(bounds.h, MIN_H),
        zIndex: frameZ,
      }}
      onPointerDown={onPointerDownMove}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      title={`${selected.length} selected — drag to move · corners & edges to resize all`}
    >
      <div className="pointer-events-none absolute -top-5 left-0 rounded bg-indigo-500/90 px-1.5 py-px text-[9px] font-medium tabular-nums text-white shadow">
        {selected.length} selected
      </div>

      {interactive &&
        HANDLE_LAYOUT.map(({ id, className }) => (
          <div
            key={id}
            data-resize-handle={id}
            className={`${className} z-20 flex items-center justify-center`}
            style={{
              width: HANDLE_HIT_PX,
              height: HANDLE_HIT_PX,
              cursor: RESIZE_CURSOR[id],
              touchAction: 'none',
            }}
            onPointerDown={onPointerDownResize(id)}
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
    </div>
  )
}
