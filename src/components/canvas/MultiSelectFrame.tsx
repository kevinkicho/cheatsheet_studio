import { useCallback, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCanvasStore } from '@/stores/canvasStore'

const PAD = 6
const MIN_W = 80
const MIN_H = 48

/**
 * Group selection chrome: bounding box over all selected cards with a
 * high z-index so move/resize stay above everything else (including print
 * overlays). Appears when 2+ items are selected.
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
  const resizeItemsBy = useCanvasStore((s) => s.resizeItemsBy)

  const selected = useMemo(
    () =>
      items.filter(
        (i) => selectedIds.includes(i.id) && !i.hidden,
      ),
    [items, selectedIds],
  )

  const bounds = useMemo(() => {
    if (selected.length < 2) return null
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
    if (!Number.isFinite(minX)) return null
    return {
      x: minX - PAD,
      y: minY - PAD,
      w: maxX - minX + PAD * 2,
      h: maxY - minY + PAD * 2,
    }
  }, [selected])

  const maxItemZ = useMemo(
    () => selected.reduce((m, i) => Math.max(m, i.zIndex), 1),
    [selected],
  )

  const dragRef = useRef<{
    mode: 'move' | 'resize'
    pointerId: number
    startX: number
    startY: number
    origins: Record<string, { x: number; y: number }>
    sizes: Record<string, { width: number; height: number }>
  } | null>(null)

  const [dragging, setDragging] = useState(false)

  const onPointerDownMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!interactive || e.button !== 0) return
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
        sizes: {},
      }
      setDragging(true)
    },
    [interactive, selected],
  )

  const onPointerDownResize = useCallback(
    (e: ReactPointerEvent) => {
      if (!interactive || e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      const sizes: Record<string, { width: number; height: number }> = {}
      for (const it of selected) {
        if (!it.locked)
          sizes[it.id] = { width: it.width, height: it.height }
      }
      if (Object.keys(sizes).length === 0) return
      useCanvasStore.getState().beginHistoryBatch()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        mode: 'resize',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origins: {},
        sizes,
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
      const dx = (e.clientX - d.startX) / z
      const dy = (e.clientY - d.startY) / z
      if (d.mode === 'move') {
        moveItemsBy(d.origins, dx, dy)
      } else {
        // Keep group aspect roughly usable: same pixel delta for all
        resizeItemsBy(d.sizes, dx, dy, { manual: true })
      }
    },
    [zoom, moveItemsBy, resizeItemsBy],
  )

  const endPointer = useCallback((e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    dragRef.current = null
    setDragging(false)
    useCanvasStore.getState().endHistoryBatch()
  }, [])

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
      title={`${selected.length} selected — drag to move, corner to resize all`}
    >
      {/* Label chip */}
      <div className="pointer-events-none absolute -top-5 left-0 rounded bg-indigo-500/90 px-1.5 py-px text-[9px] font-medium tabular-nums text-white shadow">
        {selected.length} selected
      </div>

      {/* Edge mid-handles (visual only for now — SE is interactive) */}
      <div className="pointer-events-none absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-sm bg-indigo-300 ring-1 ring-indigo-600" />
      <div className="pointer-events-none absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-sm bg-indigo-300 ring-1 ring-indigo-600" />
      <div className="pointer-events-none absolute left-1/2 -top-1 h-2 w-2 -translate-x-1/2 rounded-sm bg-indigo-300 ring-1 ring-indigo-600" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-sm bg-indigo-300 ring-1 ring-indigo-600" />

      {interactive && (
        <div
          data-resize-handle
          className="absolute -bottom-1 -right-1 z-10 h-3.5 w-3.5 cursor-se-resize rounded-sm bg-indigo-400 ring-1 ring-indigo-200"
          onPointerDown={onPointerDownResize}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          title="Resize all selected"
        />
      )}
    </div>
  )
}
