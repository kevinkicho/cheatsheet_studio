import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import {
  computePrintPageOrigins,
  dissolvedOuterPageSize,
  multiPageLayoutBounds,
  normalizePrintPageLayout,
  resolvePagePixels,
} from '@/lib/printSizes'
import { DEFAULT_MARGINS } from '@/types'
import { isFigureLike } from '@/lib/cardDefaults'
import type { CanvasItem, SheetCanvas } from '@/types'

const SIZE_SMALL = { w: 168, h: 120 } as const
const SIZE_LARGE = { w: 340, h: 260 } as const
const PAD = 8
const MAP_ZOOM_MIN = 1
const MAP_ZOOM_MAX = 6
const MAP_ZOOM_STEP = 0.35

type Props = {
  canvas: SheetCanvas
  items: CanvasItem[]
  selectedIds: string[]
  zoom: number
  viewportEl: HTMLElement | null
  /** Select a card from the minimap (main canvas selection). */
  onSelectItem: (id: string, multi: boolean) => void
}

/**
 * Bottom-right overview of the board: print pages, cards, and live viewport.
 * Expandable size, in-map zoom, click cards to select (dims the rest).
 */
export function CanvasMinimap({
  canvas,
  items,
  selectedIds,
  zoom,
  viewportEl,
  onSelectItem,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [mapZoom, setMapZoom] = useState(1)
  /** Pan of the map content when mapZoom > 1 (map-space pixels). */
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 })
  const [view, setView] = useState({
    left: 0,
    top: 0,
    width: 40,
    height: 30,
  })

  const dragRef = useRef<{
    kind: 'viewport' | 'map' | 'none'
    startClientX: number
    startClientY: number
    startScrollL: number
    startScrollT: number
    startMapPanX: number
    startMapPanY: number
    moved: boolean
    hitItemId: string | null
    multi: boolean
  } | null>(null)

  const mapW = expanded ? SIZE_LARGE.w : SIZE_SMALL.w
  const mapH = expanded ? SIZE_LARGE.h : SIZE_SMALL.h

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
  const dissolve = canvas.dissolvePrintArea === true
  const margins = { ...DEFAULT_MARGINS, ...(canvas.margins ?? {}) }
  // Match main canvas: dissolve abuts tiles (gap 0)
  const pageGap =
    dissolve && layout !== 'free' && pageCount > 1 ? 0 : undefined

  const bounds = useMemo(
    () =>
      multiPageLayoutBounds(
        page,
        pageCount,
        layout,
        canvas.printPagePositions,
        pageGap,
      ),
    [page, pageCount, layout, canvas.printPagePositions, pageGap],
  )

  const origins = useMemo(
    () =>
      computePrintPageOrigins(
        page,
        pageCount,
        layout,
        canvas.printPagePositions,
        pageGap ?? undefined,
      ),
    [page, pageCount, layout, canvas.printPagePositions, pageGap],
  )

  const dissolvedOuter = useMemo(() => {
    if (!dissolve || pageCount <= 1 || layout === 'free') return null
    return dissolvedOuterPageSize(page, pageCount, layout)
  }, [dissolve, pageCount, layout, page])

  const worldW = Math.max(canvas.width || 1, bounds.maxX, page.width, 1)
  const worldH = Math.max(canvas.height || 1, bounds.maxY, page.height, 1)

  // Fit world into map box, then apply user map-zoom
  const fitScale = Math.min(
    (mapW - PAD * 2) / worldW,
    (mapH - PAD * 2) / worldH,
  )
  const scale = fitScale * mapZoom
  const contentW = worldW * scale
  const contentH = worldH * scale
  // Center content when smaller than box; apply pan when larger
  const baseOffsetX = PAD + Math.max(0, (mapW - PAD * 2 - contentW) / 2)
  const baseOffsetY = PAD + Math.max(0, (mapH - PAD * 2 - contentH) / 2)
  const offsetX = baseOffsetX + mapPan.x
  const offsetY = baseOffsetY + mapPan.y

  const clampPan = useCallback(
    (pan: { x: number; y: number }) => {
      // Allow panning so content stays reachable
      const minX = Math.min(0, mapW - PAD - contentW - baseOffsetX + PAD)
      const maxX = Math.max(0, PAD - baseOffsetX)
      const minY = Math.min(0, mapH - PAD - contentH - baseOffsetY + PAD)
      const maxY = Math.max(0, PAD - baseOffsetY)
      // When content smaller than map, keep centered (pan ~ 0)
      if (contentW <= mapW - PAD * 2 && contentH <= mapH - PAD * 2) {
        return { x: 0, y: 0 }
      }
      return {
        x: Math.min(maxX, Math.max(minX, pan.x)),
        y: Math.min(maxY, Math.max(minY, pan.y)),
      }
    },
    [mapW, mapH, contentW, contentH, baseOffsetX, baseOffsetY],
  )

  useEffect(() => {
    setMapPan((p) => clampPan(p))
  }, [mapZoom, expanded, clampPan])

  const worldToMap = useCallback(
    (wx: number, wy: number) => ({
      x: offsetX + wx * scale,
      y: offsetY + wy * scale,
    }),
    [offsetX, offsetY, scale],
  )

  const mapToWorld = useCallback(
    (mx: number, my: number) => ({
      x: (mx - offsetX) / Math.max(scale, 1e-6),
      y: (my - offsetY) / Math.max(scale, 1e-6),
    }),
    [offsetX, offsetY, scale],
  )

  const visibleItems = useMemo(
    () =>
      items
        .filter((i) => !i.hidden)
        .slice()
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [items],
  )

  const hitTestItem = useCallback(
    (mx: number, my: number): CanvasItem | null => {
      // Topmost first
      for (let i = visibleItems.length - 1; i >= 0; i--) {
        const it = visibleItems[i]!
        const x = Number.isFinite(it.x) ? it.x : 0
        const y = Number.isFinite(it.y) ? it.y : 0
        const w = it.width || 40
        const h = it.height || 24
        const p0 = worldToMap(x, y)
        const p1 = worldToMap(x + w, y + h)
        const left = Math.min(p0.x, p1.x)
        const top = Math.min(p0.y, p1.y)
        const right = Math.max(p0.x, p1.x)
        const bottom = Math.max(p0.y, p1.y)
        // Slight hit padding for tiny cards
        const pad = 2
        if (
          mx >= left - pad &&
          mx <= right + pad &&
          my >= top - pad &&
          my <= bottom + pad
        ) {
          return it
        }
      }
      return null
    },
    [visibleItems, worldToMap],
  )

  const syncView = useCallback(() => {
    const vp = viewportEl
    if (!vp || scale <= 0) return
    const z = zoom > 0.01 ? zoom : 1
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
  }, [zoom, canvas.width, canvas.height, mapZoom, mapPan, expanded, syncView])

  const scrollToWorldCenter = useCallback(
    (cx: number, cy: number) => {
      const vp = viewportEl
      if (!vp) return
      const z = zoom > 0.01 ? zoom : 1
      vp.scrollTo({
        left: Math.max(0, cx * z - vp.clientWidth / 2),
        top: Math.max(0, cy * z - vp.clientHeight / 2),
        behavior: 'smooth',
      })
    },
    [viewportEl, zoom],
  )

  const setMapZoomClamped = (next: number) => {
    const z = Math.min(
      MAP_ZOOM_MAX,
      Math.max(MAP_ZOOM_MIN, Math.round(next * 100) / 100),
    )
    setMapZoom(z)
    if (z <= 1) setMapPan({ x: 0, y: 0 })
  }

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY > 0 ? -MAP_ZOOM_STEP : MAP_ZOOM_STEP
    setMapZoomClamped(mapZoom + delta)
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    const map = mapRef.current
    const vp = viewportEl
    if (!map) return
    e.preventDefault()
    e.stopPropagation()
    map.setPointerCapture(e.pointerId)

    const rect = map.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const hit = hitTestItem(mx, my)
    const multi = e.shiftKey || e.metaKey || e.ctrlKey

    if (hit) {
      // Select now for snappy feedback; drag still allowed lightly
      onSelectItem(hit.id, multi)
      const cx = (Number.isFinite(hit.x) ? hit.x : 0) + (hit.width || 40) / 2
      const cy = (Number.isFinite(hit.y) ? hit.y : 0) + (hit.height || 24) / 2
      scrollToWorldCenter(cx, cy)
      dragRef.current = {
        kind: 'none',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startScrollL: vp?.scrollLeft ?? 0,
        startScrollT: vp?.scrollTop ?? 0,
        startMapPanX: mapPan.x,
        startMapPanY: mapPan.y,
        moved: false,
        hitItemId: hit.id,
        multi,
      }
      return
    }

    // Empty map / viewport drag
    const inView =
      mx >= view.left &&
      mx <= view.left + view.width &&
      my >= view.top &&
      my <= view.top + view.height

    if (!inView && mapZoom <= 1.01 && vp) {
      const w = mapToWorld(mx, my)
      scrollToWorldCenter(w.x, w.y)
    }

    // Prefer map pan when zoomed in; otherwise pan main viewport
    const kind: 'viewport' | 'map' =
      mapZoom > 1.01 && !inView ? 'map' : 'viewport'

    dragRef.current = {
      kind,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollL: vp?.scrollLeft ?? 0,
      startScrollT: vp?.scrollTop ?? 0,
      startMapPanX: mapPan.x,
      startMapPanY: mapPan.y,
      moved: false,
      hitItemId: null,
      multi,
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dmx = e.clientX - d.startClientX
    const dmy = e.clientY - d.startClientY
    if (Math.abs(dmx) + Math.abs(dmy) > 3) d.moved = true

    if (d.kind === 'map') {
      setMapPan(
        clampPan({
          x: d.startMapPanX + dmx,
          y: d.startMapPanY + dmy,
        }),
      )
      return
    }

    if (d.kind === 'viewport') {
      const vp = viewportEl
      if (!vp) return
      const z = zoom > 0.01 ? zoom : 1
      const dwx = dmx / Math.max(scale, 1e-6)
      const dwy = dmy / Math.max(scale, 1e-6)
      vp.scrollLeft = d.startScrollL + dwx * z
      vp.scrollTop = d.startScrollT + dwy * z
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    dragRef.current = null
    try {
      mapRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const selected = new Set(selectedIds)
  const hasSelection = selected.size > 0

  return (
    <div
      className="overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950/95 shadow-lg backdrop-blur"
      data-testid="canvas-minimap"
      data-expanded={expanded ? 'true' : 'false'}
    >
      {/* Chrome: size + map zoom */}
      <div className="flex items-center gap-0.5 border-b border-zinc-800/80 px-1 py-0.5">
        <span className="mr-auto px-1 text-[9px] font-medium uppercase tracking-wide text-zinc-500">
          Minimap
        </span>
        <button
          type="button"
          title="Zoom out map"
          disabled={mapZoom <= MAP_ZOOM_MIN}
          onClick={() => setMapZoomClamped(mapZoom - MAP_ZOOM_STEP)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          title="Reset map zoom"
          onClick={() => {
            setMapZoom(1)
            setMapPan({ x: 0, y: 0 })
          }}
          className="min-w-[2.25rem] rounded px-0.5 py-0.5 text-[9px] tabular-nums text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          {Math.round(mapZoom * 100)}%
        </button>
        <button
          type="button"
          title="Zoom in map"
          disabled={mapZoom >= MAP_ZOOM_MAX}
          onClick={() => setMapZoomClamped(mapZoom + MAP_ZOOM_STEP)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
        >
          <Plus className="h-3 w-3" />
        </button>
        <div className="mx-0.5 h-3 w-px bg-zinc-700" />
        <button
          type="button"
          title={expanded ? 'Shrink minimap' : 'Enlarge minimap'}
          onClick={() => setExpanded((v) => !v)}
          className={`rounded p-1 hover:bg-zinc-800 ${
            expanded ? 'text-indigo-300' : 'text-zinc-400 hover:text-zinc-100'
          }`}
          data-testid="minimap-size-toggle"
        >
          {expanded ? (
            <Minimize2 className="h-3 w-3" />
          ) : (
            <Maximize2 className="h-3 w-3" />
          )}
        </button>
      </div>

      <div
        ref={mapRef}
        className="relative touch-none"
        style={{
          width: mapW,
          height: mapH,
          background: canvas.background || '#0f1115',
          cursor: mapZoom > 1.01 ? 'grab' : 'crosshair',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {/* Print area — dissolved: one super-page + outer margins only */}
        {showPrint &&
          dissolvedOuter &&
          (() => {
            const o0 = origins[0] ?? { x: 0, y: 0 }
            const outer = worldToMap(o0.x, o0.y)
            const content = worldToMap(
              o0.x + margins.left,
              o0.y + margins.top,
            )
            return (
              <>
                <div
                  key="mm-dissolved-outer"
                  className="pointer-events-none absolute box-border border border-dashed border-indigo-400/50 bg-indigo-500/[0.04]"
                  data-testid="minimap-dissolved-outer"
                  style={{
                    left: outer.x,
                    top: outer.y,
                    width: Math.max(2, dissolvedOuter.outerW * scale),
                    height: Math.max(2, dissolvedOuter.outerH * scale),
                  }}
                />
                <div
                  key="mm-dissolved-content"
                  className="pointer-events-none absolute box-border border border-dashed border-emerald-400/55 bg-emerald-500/[0.06]"
                  data-testid="minimap-dissolved-content"
                  style={{
                    left: content.x,
                    top: content.y,
                    width: Math.max(
                      2,
                      (dissolvedOuter.outerW -
                        margins.left -
                        margins.right) *
                        scale,
                    ),
                    height: Math.max(
                      2,
                      (dissolvedOuter.outerH -
                        margins.top -
                        margins.bottom) *
                        scale,
                    ),
                  }}
                />
              </>
            )
          })()}
        {showPrint &&
          !dissolvedOuter &&
          origins.map((o, i) => {
            const p = worldToMap(o.x, o.y)
            const mLeft = margins.left
            const mTop = margins.top
            const content = worldToMap(o.x + mLeft, o.y + mTop)
            return (
              <div key={`mm-pg-${i}`}>
                <div
                  className="pointer-events-none absolute box-border border border-dashed border-indigo-400/45 bg-indigo-500/[0.04]"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: Math.max(2, page.width * scale),
                    height: Math.max(2, page.height * scale),
                  }}
                />
                <div
                  className="pointer-events-none absolute box-border border border-dashed border-emerald-400/40"
                  style={{
                    left: content.x,
                    top: content.y,
                    width: Math.max(
                      1,
                      (page.width - margins.left - margins.right) * scale,
                    ),
                    height: Math.max(
                      1,
                      (page.height - margins.top - margins.bottom) * scale,
                    ),
                  }}
                />
              </div>
            )
          })}

        {/* Cards — clickable via hit-test on parent; dim non-selected when selection active */}
        {visibleItems.map((it) => {
          const p = worldToMap(
            Number.isFinite(it.x) ? it.x : 0,
            Number.isFinite(it.y) ? it.y : 0,
          )
          const isSel = selected.has(it.id)
          const dimmed = hasSelection && !isSel
          const fig = isFigureLike(it)
          const proc =
            it.type === 'process-chart' || Boolean(it.mermaidSource)
          const table = it.type === 'table' || Boolean(it.tableMarkdown)
          const bg = isSel
            ? 'rgba(129, 140, 248, 0.95)'
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
              className={`absolute rounded-[1px] ${
                isSel
                  ? 'z-10 ring-1 ring-indigo-200/90'
                  : ''
              }`}
              data-minimap-item={it.id}
              data-selected={isSel ? 'true' : undefined}
              style={{
                left: p.x,
                top: p.y,
                width: Math.max(2, (it.width || 40) * scale),
                height: Math.max(2, (it.height || 24) * scale),
                background: bg,
                opacity: dimmed ? 0.2 : 1,
                boxShadow: isSel
                  ? '0 0 0 1px rgba(199, 210, 254, 0.95), 0 0 8px rgba(99,102,241,0.5)'
                  : undefined,
              }}
              title={it.title || it.type}
            />
          )
        })}

        {/* Main canvas viewport window */}
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
        Click card · wheel zoom · drag to pan
      </div>
    </div>
  )
}
