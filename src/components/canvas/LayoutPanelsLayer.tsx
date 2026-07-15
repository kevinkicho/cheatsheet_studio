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

function accentFill(accent: string, alpha = 0.08): string {
  if (/rgba?\(/i.test(accent)) {
    return accent.replace(/[\d.]+\s*\)$/, `${alpha})`)
  }
  return `rgba(99, 102, 241, ${alpha})`
}

/**
 * Layout panel frames. Clickable when Select tool is active so users can
 * fine-tune title / content sort in the left sidebar.
 *
 * Selected panels can be dragged to move the panel + its member cards.
 *
 * N-gon: fill via runs (no per-run border); stroke via single exterior
 * `outlinePath` so merged joins never show double lines.
 * Nested multi-level: inner panels may set `showStroke: false` (title + fill
 * only) so only the outer solid frame strokes.
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
  const zoom = useUiStore((s) => s.canvasZoom)

  const dragRef = useRef<{
    panelId: string
    pointerId: number
    startX: number
    startY: number
    lastDx: number
    lastDy: number
    origins: Record<string, { x: number; y: number }>
    moved: boolean
  } | null>(null)
  const [liveOffset, setLiveOffset] = useState<{
    panelId: string
    dx: number
    dy: number
  } | null>(null)

  const onPanelPointerDown = useCallback(
    (p: LayoutPanel) => (e: ReactPointerEvent) => {
      if (!interactive || e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()

      // First click selects; drag only when already selected (or select + ready)
      const already = useCanvasStore.getState().selectedPanelId === p.id
      if (!already) {
        selectPanel(p.id)
      }

      const memberIds = p.memberIds ?? []
      const items = useCanvasStore.getState().items
      const origins: Record<string, { x: number; y: number }> = {}
      for (const id of memberIds) {
        const it = items.find((i) => i.id === id)
        if (it && !it.locked) origins[id] = { x: it.x, y: it.y }
      }
      // Also include nested panel members that are subsets
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
            if (it && !it.locked) origins[id] = { x: it.x, y: it.y }
          }
        }
      }

      useCanvasStore.getState().beginHistoryBatch()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
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
    [interactive, selectPanel],
  )

  const onPanelPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const z = zoom > 0.01 ? zoom : 1
      let dx = (e.clientX - d.startX) / z
      let dy = (e.clientY - d.startY) / z
      // Snap to grid when enabled
      const canvas = useCanvasStore.getState().canvas
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
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      if (d.moved && (Math.abs(d.lastDx) > 0.5 || Math.abs(d.lastDy) > 0.5)) {
        moveLayoutPanelBy(d.panelId, d.lastDx, d.lastDy)
      }
      useCanvasStore.getState().endHistoryBatch()
    },
    [moveLayoutPanelBy],
  )

  if (!panels?.length) return null

  const offFor = (id: string) =>
    liveOffset?.panelId === id
      ? { dx: liveOffset.dx, dy: liveOffset.dy }
      : { dx: 0, dy: 0 }

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
            const fill = isPoly
              ? accentFill(accent, level <= 1 ? 0.04 : 0.06)
              : accentFill(accent, level <= 1 ? 0.05 : 0.07)
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
            const runs =
              p.runs && p.runs.length > 0
                ? p.runs
                : [
                    {
                      x: p.x,
                      y: p.y,
                      width: p.width,
                      height: p.height,
                    },
                  ]
            // N-gon exterior stroke slightly stronger so merged perimeter reads clearly
            const borderW = selected ? 2.5 : isPoly ? 2 : level <= 1 ? 2 : 1.5
            const useOutline = isPoly && Boolean(p.outlinePath)
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
                    ox || oy ? `translate(${ox}px, ${oy}px)` : undefined,
                }}
              >
                {useOutline ? (
                  <>
                    {/* Soft fill only for stroked frames (never under internal borders) */}
                    {wantsFrame
                      ? runs.map((r, i) => (
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
                              borderRadius: 0,
                              background: fill,
                              zIndex: p.zIndex ?? 0,
                              pointerEvents: 'none',
                            }}
                          />
                        ))
                      : null}
                    {drawStroke ? (
                      <svg
                        data-layout-panel-outline={p.id}
                        width={p.width + borderW * 2}
                        height={p.height + borderW * 2}
                        viewBox={`${p.x - borderW} ${p.y - borderW} ${p.width + borderW * 2} ${p.height + borderW * 2}`}
                        style={{
                          position: 'absolute',
                          left: p.x - borderW,
                          top: p.y - borderW,
                          width: p.width + borderW * 2,
                          height: p.height + borderW * 2,
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
                            stroke={accentFill(accent, 0.4)}
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
                          left: p.x,
                          top: p.y,
                          width: p.width,
                          height: p.height,
                          zIndex: (p.zIndex ?? 0) + 0.5,
                          cursor: dragCursor,
                          background: 'transparent',
                        }}
                      />
                    ) : null}
                  </>
                ) : (
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
                        background: fill,
                        zIndex: p.zIndex ?? 0,
                        boxShadow: selected
                          ? `0 0 0 1px ${accentFill(accent, 0.4)}`
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
            // L1: top of exclusive header. L2: under parent L1 chip, above cards.
            const isOuter = p.showStroke !== false && level <= 1
            const parentL1 =
              !isOuter && panels
                ? panels.find(
                    (o) =>
                      o.showStroke !== false &&
                      (o.hierarchyLevel ?? 1) <= 1 &&
                      o.memberIds?.length &&
                      p.memberIds?.length &&
                      p.memberIds.every((id) => o.memberIds!.includes(id)),
                  )
                : undefined
            const titleLeft = p.x + ox + (isOuter ? 6 : 8)
            let titleTop = p.y + oy + (isOuter ? 3 : 2)
            if (parentL1) {
              const underL1 = parentL1.y + oy + 24
              titleTop = Math.max(titleTop, underL1)
            }
            const maxW = Math.max(48, p.width - (isOuter ? 14 : 16))
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
                  color: accentFill(accent, 0.98),
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  background: 'rgba(15, 17, 21, 0.96)',
                  borderRadius: 3,
                  border: selected
                    ? `1px solid ${accent}`
                    : isOuter
                      ? `1px solid ${accentFill(accent, 0.55)}`
                      : `1px solid ${accentFill(accent, 0.28)}`,
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
