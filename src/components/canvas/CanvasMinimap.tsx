import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  computePrintPageOrigins,
  multiPageLayoutBounds,
  normalizePrintPageLayout,
  resolvePagePixels,
} from '@/lib/printSizes'
import { isFigureLike } from '@/lib/cardDefaults'
import type { CanvasItem, SheetCanvas } from '@/types'

const MAP_W = 168
const MAP_H = 120
const PAD = 6

type Props = {
  canvas: SheetCanvas
  items: CanvasItem[]
  selectedIds: string[]
  zoom: number
  /** Scroll container for the main board */
  viewportEl: HTMLElement | null
}

/**
 * Bottom-right overview of the board: print pages, cards, and live viewport.
 * Click / drag the view rect (or empty map) to pan the main canvas.
 */
export function CanvasMinimap({
  canvas,
  items,
  selectedIds,
  zoom,
  viewportEl,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({
    left: 0,
    top: 0,
    width: 40,
    height: 30,
  })
  const dragRef = useRef<{
    mode: 'pan' | 'grab'
    startClientX: number
    startClientY: number
    startScrollL: number
    startScrollT: number
  } | null>(null)

  const page = useMemo(
    () =>
      resolvePagePixels(
        canvas.printSizeId ?? 'letter',
        canvas.orientation ?? 'portrait',
      ),
    [canvas.printSizeId, canvas.orientation],
  )

  const pageCount = Math.max(1, canvas.printPageCount ?? 1)
  const layout = normalizePrintPageLayout(canvas.printPageLayout)
  const showPrint = canvas.showPrintArea !== false

  const bounds = useMemo(
    () =>
      multiPageLayoutBounds(
        page,
        pageCount,
        layout,
        canvas.printPagePositions,
      ),
    [page, pageCount, layout, canvas.printPagePositions],
  )

  const origins = useMemo(
    () =>
      computePrintPageOrigins(
        page,
        pageCount,
        layout,
        canvas.printPagePositions,
      ),
    [page, pageCount, layout, canvas.printPagePositions],
  )

  // World extent: board size, at least print layout
  const worldW = Math.max(canvas.width || 1, bounds.maxX, page.width, 1)
  const worldH = Math.max(canvas.height || 1, bounds.maxY, page.height, 1)

  const scale = Math.min(
    (MAP_W - PAD * 2) / worldW,
    (MAP_H - PAD * 2) / worldH,
  )
  const contentW = worldW * scale
  const contentH = worldH * scale
  const offsetX = PAD + (MAP_W - PAD * 2 - contentW) / 2
  const offsetY = PAD + (MAP_H - PAD * 2 - contentH) / 2

  const worldToMap = useCallback(
    (wx: number, wy: number) => ({
      x: offsetX + wx * scale,
      y: offsetY + wy * scale,
    }),
    [offsetX, offsetY, scale],
  )

  const mapToWorld = useCallback(
    (mx: number, my: number) => ({
      x: (mx - offsetX) / scale,
      y: (my - offsetY) / scale,
    }),
    [offsetX, offsetY, scale],
  )

  const syncView = useCallback(() => {
    const vp = viewportEl
    if (!vp || scale <= 0) return
    const z = zoom > 0.01 ? zoom : 1
    // Visible region in canvas space
    const left = vp.scrollLeft / z
    const top = vp.scrollTop / z
    const width = vp.clientWidth / z
    const height = vp.clientHeight / z
    const a = worldToMap(left, top)
    const b = worldToMap(left + width, top + height)
    setView({
      left: a.x,
      top: a.y,
      width: Math.max(4, b.x - a.x),
      height: Math.max(4, b.y - a.y),
    })
  }, [viewportEl, zoom, scale, worldToMap])

  useEffect(() => {
    const vp = viewportEl
    if (!vp) return
    syncView()
    vp.addEventListener('scroll', syncView, { passive: true })
    const ro = new ResizeObserver(syncView)
    ro.observe(vp)
    return () => {
      vp.removeEventListener('scroll', syncView)
      ro.disconnect()
    }
  }, [viewportEl, syncView])

  useEffect(() => {
    syncView()
  }, [zoom, canvas.width, canvas.height, syncView])

  const scrollToWorldCenter = useCallback(
    (cx: number, cy: number) => {
      const vp = viewportEl
      if (!vp) return
      const z = zoom > 0.01 ? zoom : 1
      const left = cx * z - vp.clientWidth / 2
      const top = cy * z - vp.clientHeight / 2
      vp.scrollTo({
        left: Math.max(0, left),
        top: Math.max(0, top),
        behavior: 'auto',
      })
    },
    [viewportEl, zoom],
  )

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    const map = mapRef.current
    const vp = viewportEl
    if (!map || !vp) return
    e.preventDefault()
    e.stopPropagation()
    map.setPointerCapture(e.pointerId)

    const rect = map.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    // If click outside view rect, jump first
    const inView =
      mx >= view.left &&
      mx <= view.left + view.width &&
      my >= view.top &&
      my <= view.top + view.height

    if (!inView) {
      const w = mapToWorld(mx, my)
      scrollToWorldCenter(w.x, w.y)
    }

    dragRef.current = {
      mode: inView ? 'grab' : 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollL: vp.scrollLeft,
      startScrollT: vp.scrollTop,
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    const vp = viewportEl
    if (!d || !vp) return
    const z = zoom > 0.01 ? zoom : 1
    // Map delta → world delta → scroll delta
    const dmx = e.clientX - d.startClientX
    const dmy = e.clientY - d.startClientY
    const dwx = dmx / scale
    const dwy = dmy / scale
    vp.scrollLeft = d.startScrollL + dwx * z
    vp.scrollTop = d.startScrollT + dwy * z
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    dragRef.current = null
    try {
      mapRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const visibleItems = items.filter((i) => !i.hidden).slice(0, 200)
  const selected = new Set(selectedIds)

  return (
    <div
      className="overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950/95 shadow-lg backdrop-blur"
      data-testid="canvas-minimap"
      title="Minimap — click or drag to navigate"
    >
      <div
        ref={mapRef}
        className="relative cursor-crosshair touch-none"
        style={{
          width: MAP_W,
          height: MAP_H,
          background: canvas.background || '#0f1115',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Print pages */}
        {showPrint &&
          origins.map((o, i) => {
            const p = worldToMap(o.x, o.y)
            return (
              <div
                key={`mm-pg-${i}`}
                className="pointer-events-none absolute box-border border border-dashed border-indigo-400/45 bg-indigo-500/[0.04]"
                style={{
                  left: p.x,
                  top: p.y,
                  width: Math.max(2, page.width * scale),
                  height: Math.max(2, page.height * scale),
                }}
              />
            )
          })}

        {/* Cards */}
        {visibleItems.map((it) => {
          const p = worldToMap(
            Number.isFinite(it.x) ? it.x : 0,
            Number.isFinite(it.y) ? it.y : 0,
          )
          const isSel = selected.has(it.id)
          const fig = isFigureLike(it)
          const proc =
            it.type === 'process-chart' || Boolean(it.mermaidSource)
          const table = it.type === 'table' || Boolean(it.tableMarkdown)
          const bg = isSel
            ? 'rgba(129, 140, 248, 0.9)'
            : fig
              ? 'rgba(52, 211, 153, 0.55)'
              : proc
                ? 'rgba(99, 102, 241, 0.55)'
                : table
                  ? 'rgba(251, 191, 36, 0.55)'
                  : 'rgba(161, 161, 170, 0.65)'
          return (
            <div
              key={it.id}
              className="pointer-events-none absolute rounded-[1px]"
              style={{
                left: p.x,
                top: p.y,
                width: Math.max(2, (it.width || 40) * scale),
                height: Math.max(2, (it.height || 24) * scale),
                background: bg,
                boxShadow: isSel
                  ? '0 0 0 1px rgba(199, 210, 254, 0.9)'
                  : undefined,
              }}
            />
          )
        })}

        {/* Viewport window */}
        <div
          className="pointer-events-none absolute box-border border-2 border-sky-400/90 bg-sky-400/10 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{
            left: view.left,
            top: view.top,
            width: view.width,
            height: view.height,
          }}
        />
      </div>
      <div className="border-t border-zinc-800/80 px-1.5 py-0.5 text-center text-[8px] text-zinc-600">
        Minimap · drag to pan
      </div>
    </div>
  )
}
