import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { LayoutPanel } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore } from '@/stores/uiStore'
import {
  clearLiveCanvasDrag,
  setLiveCanvasDrag,
} from '@/lib/liveCanvasDrag'
import {
  applyHandleToRect,
  HANDLE_LAYOUT,
  HANDLE_VISUAL_PX,
  RESIZE_CURSOR,
  handleHitPx,
  type ItemRect,
  type ResizeHandle,
} from '@/lib/resizeHandles'
import {
  accentToSolidColor,
  accentWithAlpha,
  panelFillOpacity,
  panelWantsSoftFill,
} from '@/lib/panelChromePaint'

/**
 * Layout panel frames. With Select tool:
 * - Click title/border to select (left sidebar props)
 * - Drag selected panel to move panel + member cards (+ nested children)
 * - 8 free-transform handles (4 corners + 4 edges) resize the **frame only**
 *   (cards keep size/position; click Auto-layout in panel to reflow)
 *
 * Soft fill policy (see panelChromePaint.ts):
 * - Leaf stroked panels only (no nested stroked child) — avoids L1+L2 tint stack
 * - Runs painted opaque under one parent opacity — avoids n-gon run double-alpha
 * - Stroke via single exterior outlinePath for n-gon (never per-run borders)
 */
export function LayoutPanelsLayer({
  panels,
  interactive = false,
}: {
  panels: LayoutPanel[] | undefined
  interactive?: boolean
}) {
  const selectedPanelId = useCanvasStore((s) => s.selectedPanelId)
  const selectedPanelIds = useCanvasStore((s) => s.selectedPanelIds)
  const selectPanel = useCanvasStore((s) => s.selectPanel)
  const moveLayoutPanelBy = useCanvasStore((s) => s.moveLayoutPanelBy)
  const resizeLayoutPanelTo = useCanvasStore((s) => s.resizeLayoutPanelTo)
  const zoom = useUiStore((s) => s.canvasZoom)
  const gripHit = handleHitPx(zoom)

  type MoveDrag = {
    mode: 'move'
    panelId: string
    pointerId: number
    startX: number
    startY: number
    lastDx: number
    lastDy: number
    origins: Record<string, { x: number; y: number }>
    moved: boolean
  }
  type ResizeDrag = {
    mode: 'resize'
    panelId: string
    pointerId: number
    startX: number
    startY: number
    handle: ResizeHandle
    startGeom: { x: number; y: number; w: number; h: number }
    itemRects: Record<string, ItemRect>
    lastGeom: { x: number; y: number; width: number; height: number } | null
  }
  const dragRef = useRef<MoveDrag | ResizeDrag | null>(null)
  const [liveOffset, setLiveOffset] = useState<{
    panelId: string
    dx: number
    dy: number
  } | null>(null)
  /** Live free-transform box while resizing (paint panel chrome). */
  const [liveResize, setLiveResize] = useState<{
    panelId: string
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  const collectClusterOrigins = useCallback((p: LayoutPanel) => {
    const memberIds = p.memberIds ?? []
    const items = useCanvasStore.getState().items
    const origins: Record<string, { x: number; y: number }> = {}
    const itemRects: Record<string, ItemRect> = {}
    for (const id of memberIds) {
      const it = items.find((i) => i.id === id)
      if (it && !it.locked && !it.hidden) {
        origins[id] = { x: it.x, y: it.y }
        itemRects[id] = {
          x: it.x,
          y: it.y,
          width: it.width,
          height: it.height,
        }
      }
    }
    const allPanels = useCanvasStore.getState().canvas.layoutPanels ?? []
    const rootSet = new Set(memberIds)
    for (const other of allPanels) {
      if (other.id === p.id) continue
      if (
        other.memberIds?.length &&
        other.memberIds.every((id) => rootSet.has(id))
      ) {
        for (const id of other.memberIds) {
          const it = items.find((i) => i.id === id)
          if (it && !it.locked && !it.hidden) {
            origins[id] = { x: it.x, y: it.y }
            itemRects[id] = {
              x: it.x,
              y: it.y,
              width: it.width,
              height: it.height,
            }
          }
        }
      }
    }
    return { origins, itemRects }
  }, [])

  const onPanelPointerDown = useCallback(
    (p: LayoutPanel) => (e: ReactPointerEvent) => {
      if (!interactive || e.button !== 0) return
      // Resize handles own their pointer stream
      if ((e.target as HTMLElement).closest('[data-panel-resize-handle]')) {
        return
      }
      e.stopPropagation()
      e.preventDefault()

      // First click selects; drag only when already selected (or select + ready)
      const already = useCanvasStore.getState().selectedPanelId === p.id
      if (!already) {
        selectPanel(p.id)
      }

      const { origins } = collectClusterOrigins(p)

      useCanvasStore.getState().beginHistoryBatch()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        mode: 'move',
        panelId: p.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastDx: 0,
        lastDy: 0,
        origins,
        moved: false,
      }
    },
    [interactive, selectPanel, collectClusterOrigins],
  )

  const onResizePointerDown = useCallback(
    (p: LayoutPanel, handle: ResizeHandle) => (e: ReactPointerEvent) => {
      if (!interactive || e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      if (useCanvasStore.getState().selectedPanelId !== p.id) {
        selectPanel(p.id)
      }
      const { itemRects } = collectClusterOrigins(p)
      useCanvasStore.getState().beginHistoryBatch()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        mode: 'resize',
        panelId: p.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        handle,
        startGeom: { x: p.x, y: p.y, w: p.width, h: p.height },
        itemRects,
        lastGeom: null,
      }
      setLiveResize({
        panelId: p.id,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
      })
    },
    [interactive, selectPanel, collectClusterOrigins],
  )

  const onPanelPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const z = zoom > 0.01 ? zoom : 1
      let dx = (e.clientX - d.startX) / z
      let dy = (e.clientY - d.startY) / z
      const canvas = useCanvasStore.getState().canvas

      if (d.mode === 'move') {
        if (canvas.snapToGrid) {
          const g = Math.max(4, canvas.gridSpacing ?? 24)
          dx = Math.round(dx / g) * g
          dy = Math.round(dy / g) * g
        } else {
          dx = Math.round(dx)
          dy = Math.round(dy)
        }
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true
        d.lastDx = dx
        d.lastDy = dy
        setLiveOffset({ panelId: d.panelId, dx, dy })
        if (Object.keys(d.origins).length > 0) {
          setLiveCanvasDrag({ type: 'move', origins: d.origins, dx, dy })
        }
        return
      }

      // resize
      let geom = applyHandleToRect(d.startGeom, d.handle, dx, dy, 80, 48)
      if (canvas.snapToGrid) {
        const g = Math.max(4, canvas.gridSpacing ?? 24)
        geom = {
          x: Math.round(geom.x / g) * g,
          y: Math.round(geom.y / g) * g,
          w: Math.max(g * 2, Math.round(geom.w / g) * g),
          h: Math.max(g * 2, Math.round(geom.h / g) * g),
        }
      } else {
        geom = {
          x: Math.round(geom.x),
          y: Math.round(geom.y),
          w: Math.round(geom.w),
          h: Math.round(geom.h),
        }
      }
      d.lastGeom = {
        x: geom.x,
        y: geom.y,
        width: geom.w,
        height: geom.h,
      }
      setLiveResize({
        panelId: d.panelId,
        x: geom.x,
        y: geom.y,
        width: geom.w,
        height: geom.h,
      })
      // Frame-only live preview — do not scale cards with the panel.
      // Scaling during drag made pack look like a no-op (same relative layout).
    },
    [zoom],
  )

  const endDrag = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      dragRef.current = null
      clearLiveCanvasDrag()
      setLiveOffset(null)
      setLiveResize(null)
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      const didResize = d.mode === 'resize' && d.lastGeom != null
      const didMove =
        d.mode === 'move' &&
        d.moved &&
        (Math.abs(d.lastDx) > 0.5 || Math.abs(d.lastDy) > 0.5)
      if (d.mode === 'move') {
        if (didMove) {
          moveLayoutPanelBy(d.panelId, d.lastDx, d.lastDy)
        }
      } else if (d.lastGeom) {
        resizeLayoutPanelTo(d.panelId, d.lastGeom)
      }
      // Keep the panel selected after resize/move so free-transform grips stay
      // up and Panel props remain open (do not "let go" of the panel).
      const st = useCanvasStore.getState()
      if (st.selectedPanelId !== d.panelId) {
        selectPanel(d.panelId)
      } else if (!(st.selectedPanelIds ?? []).includes(d.panelId)) {
        selectPanel(d.panelId)
      }
      useCanvasStore.getState().endHistoryBatch()
      // Swallow the trailing click so empty-board / bubble handlers cannot clear
      // selection after a grip that finished off-handle.
      e.stopPropagation()
      if (didResize || didMove) {
        const vp = document.querySelector(
          '[data-main-canvas-viewport]',
        ) as (HTMLElement & { __skipClick?: boolean }) | null
        if (vp) {
          vp.__skipClick = true
          window.setTimeout(() => {
            if (vp) vp.__skipClick = false
          }, 0)
        }
      }
    },
    [moveLayoutPanelBy, resizeLayoutPanelTo, selectPanel],
  )

  if (!panels?.length) return null

  const offFor = (id: string) =>
    liveOffset?.panelId === id
      ? { dx: liveOffset.dx, dy: liveOffset.dy }
      : { dx: 0, dy: 0 }

  const geomFor = (p: LayoutPanel) => {
    if (liveResize?.panelId === p.id) {
      return {
        x: liveResize.x,
        y: liveResize.y,
        width: liveResize.width,
        height: liveResize.height,
      }
    }
    return { x: p.x, y: p.y, width: p.width, height: p.height }
  }

  return (
    <>
      {/* Parent stays pointer-events-none so empty board remains marquee-able;
          interactive children (title chips / selected frames) opt in. */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        data-testid="layout-panels-layer"
      >
        {[...panels]
          .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
          .map((p) => {
            const accent = p.accent ?? 'rgba(99, 102, 241, 0.55)'
            const level = p.hierarchyLevel ?? 1
            const isPoly = (p.shape ?? 'rect') === 'polygon'
            // Soft fill only on leaf chrome; opaque runs under group opacity
            const softFill = panelWantsSoftFill(p, panels)
            const fillSolid = accentToSolidColor(accent)
            const fillOpacity = panelFillOpacity(level, p.shape)
            const selected =
              selectedPanelId === p.id ||
              (selectedPanelIds?.includes(p.id) ?? false)
            // Inner/merged-sibling panels: title chip only — never paint frame fill/border
            const wantsFrame = p.showStroke !== false
            const drawStroke = wantsFrame || selected
            const { dx, dy } = offFor(p.id)
            // Nested panels that move with parent also offset during live drag
            const parentDrag =
              liveOffset &&
              liveOffset.panelId !== p.id &&
              p.memberIds?.length &&
              panels
                .find((x) => x.id === liveOffset.panelId)
                ?.memberIds?.length &&
              p.memberIds.every((id) =>
                panels
                  .find((x) => x.id === liveOffset.panelId)!
                  .memberIds!.includes(id),
              )
                ? liveOffset
                : null
            const ox = dx + (parentDrag?.dx ?? 0)
            const oy = dy + (parentDrag?.dy ?? 0)
            // Live free-transform uses absolute geom; move uses translate offset
            const g = geomFor(p)
            const resizing = liveResize?.panelId === p.id
            const px = resizing ? g.x : p.x
            const py = resizing ? g.y : p.y
            const pw = resizing ? g.width : p.width
            const ph = resizing ? g.height : p.height
            const runs =
              resizing || !p.runs || p.runs.length === 0
                ? [{ x: px, y: py, width: pw, height: ph }]
                : p.runs
            // N-gon exterior stroke slightly stronger so merged perimeter reads clearly
            const borderW = selected ? 2.5 : isPoly ? 2 : level <= 1 ? 2 : 1.5
            // During free-transform always paint as rect box (handles on AABB)
            const useOutline =
              !resizing && isPoly && Boolean(p.outlinePath)
            const dragCursor = interactive
              ? selected
                ? 'grab'
                : 'pointer'
              : undefined

            // Title-only panel (L2 / merged sibling): hit target only, no frame paint
            if (!wantsFrame && !selected) {
              return (
                <div
                  key={p.id}
                  data-layout-panel={p.id}
                  data-layout-panel-level={level}
                  data-layout-panel-stroke="0"
                  style={{
                    transform:
                      ox || oy ? `translate(${ox}px, ${oy}px)` : undefined,
                  }}
                >
                  {interactive ? (
                    <div
                      data-layout-panel-hit={p.id}
                      role="button"
                      tabIndex={0}
                      onPointerDown={onPanelPointerDown(p)}
                      onPointerMove={onPanelPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      style={{
                        position: 'absolute',
                        left: p.x,
                        top: p.y,
                        width: Math.min(p.width, 160),
                        height: 22,
                        zIndex: (p.zIndex ?? 0) + 0.5,
                        cursor: dragCursor,
                        background: 'transparent',
                        pointerEvents: 'auto',
                      }}
                    />
                  ) : null}
                </div>
              )
            }

            return (
              <div
                key={p.id}
                data-layout-panel={p.id}
                data-layout-panel-shape={p.shape ?? 'rect'}
                data-layout-panel-level={level}
                data-layout-panel-stroke={drawStroke ? '1' : '0'}
                data-selected={selected ? '1' : undefined}
                style={{
                  transform:
                    !resizing && (ox || oy)
                      ? `translate(${ox}px, ${oy}px)`
                      : undefined,
                }}
              >
                {/* Soft fill: opaque runs under one opacity (no double-alpha) */}
                {softFill ? (
                  <div
                    data-layout-panel-soft-fill={p.id}
                    data-layout-panel-soft-fill-leaf="1"
                    style={{
                      opacity: fillOpacity,
                      zIndex: p.zIndex ?? 0,
                      pointerEvents: 'none',
                    }}
                  >
                    {runs.map((r, i) => (
                      <div
                        key={`${p.id}-fill-${i}`}
                        style={{
                          position: 'absolute',
                          left: r.x,
                          top: r.y,
                          width: r.width,
                          height: r.height,
                          boxSizing: 'border-box',
                          border: 'none',
                          borderRadius:
                            !isPoly && level <= 1
                              ? 8
                              : !isPoly
                                ? 5
                                : 0,
                          background: fillSolid,
                        }}
                      />
                    ))}
                  </div>
                ) : null}

                {useOutline ? (
                  <>
                    {drawStroke ? (
                      <svg
                        data-layout-panel-outline={p.id}
                        width={pw + borderW * 2}
                        height={ph + borderW * 2}
                        viewBox={`${px - borderW} ${py - borderW} ${pw + borderW * 2} ${ph + borderW * 2}`}
                        style={{
                          position: 'absolute',
                          left: px - borderW,
                          top: py - borderW,
                          width: pw + borderW * 2,
                          height: ph + borderW * 2,
                          overflow: 'visible',
                          zIndex: (p.zIndex ?? 0) + 0.5,
                          // Stroke-only hit target so marquee can start on
                          // empty panel interior; full box when selected (drag).
                          pointerEvents: interactive
                            ? selected
                              ? 'auto'
                              : 'none'
                            : 'none',
                          cursor: dragCursor,
                        }}
                        onPointerDown={
                          interactive && selected
                            ? onPanelPointerDown(p)
                            : undefined
                        }
                        onPointerMove={
                          interactive && selected ? onPanelPointerMove : undefined
                        }
                        onPointerUp={
                          interactive && selected ? endDrag : undefined
                        }
                        onPointerCancel={
                          interactive && selected ? endDrag : undefined
                        }
                      >
                        <path
                          d={p.outlinePath}
                          fill="transparent"
                          stroke={accent}
                          strokeWidth={borderW}
                          strokeLinejoin="miter"
                          strokeLinecap="square"
                          vectorEffect="non-scaling-stroke"
                          // Border remains clickable to select when unselected
                          style={{
                            pointerEvents: interactive ? 'stroke' : 'none',
                            cursor: dragCursor,
                          }}
                          onPointerDown={
                            interactive ? onPanelPointerDown(p) : undefined
                          }
                          onPointerMove={
                            interactive ? onPanelPointerMove : undefined
                          }
                          onPointerUp={interactive ? endDrag : undefined}
                          onPointerCancel={interactive ? endDrag : undefined}
                        />
                        {selected ? (
                          <path
                            d={p.outlinePath}
                            fill="transparent"
                            stroke={accentWithAlpha(accent, 0.4)}
                            strokeWidth={borderW + 2}
                            strokeLinejoin="miter"
                            opacity={0.5}
                            style={{ pointerEvents: 'none' }}
                          />
                        ) : null}
                      </svg>
                    ) : interactive ? (
                      <div
                        data-layout-panel-hit={p.id}
                        role="button"
                        tabIndex={0}
                        onPointerDown={onPanelPointerDown(p)}
                        onPointerMove={onPanelPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            selectPanel(p.id)
                          }
                        }}
                        style={{
                          position: 'absolute',
                          left: px,
                          top: py,
                          width: pw,
                          height: ph,
                          zIndex: (p.zIndex ?? 0) + 0.5,
                          cursor: dragCursor,
                          background: 'transparent',
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  // Rect chrome: stroke on runs (fill already painted above)
                  runs.map((r, i) => (
                    <div
                      key={`${p.id}-run-${i}`}
                      style={{
                        position: 'absolute',
                        left: r.x,
                        top: r.y,
                        width: r.width,
                        height: r.height,
                        boxSizing: 'border-box',
                        border: drawStroke
                          ? `${borderW}px solid ${accent}`
                          : 'none',
                        borderRadius: level <= 1 ? 8 : 5,
                        background: 'transparent',
                        zIndex: (p.zIndex ?? 0) + 0.25,
                        boxShadow: selected
                          ? `0 0 0 1px ${accentWithAlpha(accent, 0.4)}`
                          : undefined,
                        // Never block cards/marquee. Select via title chip;
                        // drag only when already selected.
                        pointerEvents:
                          interactive && selected ? 'auto' : 'none',
                        cursor: selected ? dragCursor : undefined,
                      }}
                      onPointerDown={
                        interactive && selected
                          ? onPanelPointerDown(p)
                          : undefined
                      }
                      onPointerMove={
                        interactive && selected ? onPanelPointerMove : undefined
                      }
                      onPointerUp={
                        interactive && selected ? endDrag : undefined
                      }
                      onPointerCancel={
                        interactive && selected ? endDrag : undefined
                      }
                    />
                  ))
                )}

                {/* 8 free-transform handles (corners + edges) when selected */}
                {interactive && selected ? (
                  <div
                    data-layout-panel-resize-frame={p.id}
                    className="pointer-events-none absolute"
                    style={{
                      left: px,
                      top: py,
                      width: pw,
                      height: ph,
                      zIndex: (p.zIndex ?? 0) + 50,
                    }}
                  >
                    {HANDLE_LAYOUT.map(({ id, className }) => (
                      <div
                        key={id}
                        data-panel-resize-handle={id}
                        className={`${className} pointer-events-auto flex items-center justify-center`}
                        style={{
                          width: gripHit,
                          height: gripHit,
                          cursor: RESIZE_CURSOR[id],
                          touchAction: 'none',
                        }}
                        onPointerDown={onResizePointerDown(p, id)}
                        onPointerMove={onPanelPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onClick={(ev) => {
                          // Never let grip click clear panel selection via board
                          ev.stopPropagation()
                          selectPanel(p.id)
                        }}
                        title={`Resize panel (${id})`}
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
                ) : null}
              </div>
            )
          })}
      </div>

      {/* Container must stay pointer-events-none so empty board + cards remain
          clickable; only individual title chips opt into hit-testing. */}
      <div
        className="pointer-events-none absolute inset-0 z-[30]"
        data-testid="layout-panel-titles"
      >
        {[...panels]
          .sort((a, b) => (a.hierarchyLevel ?? 1) - (b.hierarchyLevel ?? 1))
          .map((p) => {
            if (p.showTitle === false || !p.title) return null
            const accent = p.accent ?? 'rgba(99, 102, 241, 0.55)'
            const selected = selectedPanelId === p.id
            const level = p.hierarchyLevel ?? 1
            const { dx, dy } = offFor(p.id)
            const parentDrag =
              liveOffset &&
              liveOffset.panelId !== p.id &&
              p.memberIds?.length &&
              panels
                .find((x) => x.id === liveOffset.panelId)
                ?.memberIds?.length &&
              p.memberIds.every((id) =>
                panels
                  .find((x) => x.id === liveOffset.panelId)!
                  .memberIds!.includes(id),
              )
                ? liveOffset
                : null
            const ox = dx + (parentDrag?.dx ?? 0)
            const oy = dy + (parentDrag?.dy ?? 0)
            const g = geomFor(p)
            const resizing = liveResize?.panelId === p.id
            // L1/L2/L3: chip on this panel's own top edge (never stack nested
            // chips under L1 — that garbled all L2 titles into one row, 014705).
            const isOuter = p.showStroke !== false && level <= 1
            const baseX = resizing ? g.x : p.x + ox
            const baseY = resizing ? g.y : p.y + oy
            const baseW = resizing ? g.width : p.width
            const titleLeft = baseX + (isOuter ? 6 : 8)
            const titleTop = baseY + (isOuter ? 3 : 2)
            const maxW = Math.max(48, baseW - (isOuter ? 14 : 16))
            const fontSize = isOuter ? 10 : 8
            return (
              <div
                key={`${p.id}-title`}
                data-layout-panel-title={p.id}
                data-layout-panel-title-level={level}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                onPointerDown={interactive ? onPanelPointerDown(p) : undefined}
                onPointerMove={interactive ? onPanelPointerMove : undefined}
                onPointerUp={interactive ? endDrag : undefined}
                onPointerCancel={interactive ? endDrag : undefined}
                style={{
                  position: 'absolute',
                  left: titleLeft,
                  top: titleTop,
                  maxWidth: maxW,
                  padding: isOuter ? '2px 7px' : '1px 5px',
                  fontSize,
                  fontWeight: isOuter ? 700 : 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: accentWithAlpha(accent, 0.98),
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  background: 'rgba(15, 17, 21, 0.96)',
                  borderRadius: 3,
                  border: selected
                    ? `1px solid ${accent}`
                    : isOuter
                      ? `1px solid ${accentWithAlpha(accent, 0.55)}`
                      : `1px solid ${accentWithAlpha(accent, 0.28)}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
                  zIndex: isOuter ? 40 : 25 + level,
                  cursor: interactive
                    ? selected
                      ? 'grab'
                      : 'pointer'
                    : undefined,
                  // Chip only — parent layer is pointer-events-none
                  pointerEvents: interactive ? 'auto' : 'none',
                }}
              >
                {p.title}
              </div>
            )
          })}
      </div>
    </>
  )
}
