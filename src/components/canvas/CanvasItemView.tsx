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
import { FitContent } from '@/components/math/FitContent'
import { FigureView } from '@/components/math/FigureView'
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'
import { MermaidView } from '@/components/math/MermaidView'
import {
  CARD_DEFAULTS,
  composeBorderCss,
  isFigureLike,
} from '@/lib/cardDefaults'

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
/** Title row + margin — reserved so showing the title grows the card instead of shrinking math. */
const TITLE_BAND = 22

/** Equations/tables/mermaid — figures use a dedicated crisp layout path. */
function ItemBody({ item }: { item: CanvasItem }) {
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
  const resizeItemsBy = useCanvasStore((s) => s.resizeItemsBy)
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
    /** Multi-resize: start sizes of every selected card */
    groupSizes: Record<string, { width: number; height: number }> | null
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
      const pad = (style.padding ?? 12) * 2
      const titleBand = showTitle ? TITLE_BAND : 0

      const contentW = Math.ceil(
        Math.max(body.scrollWidth, body.offsetWidth, 1),
      )
      const contentH = Math.ceil(
        Math.max(body.scrollHeight, body.offsetHeight, 1),
      )
      if (contentW < 2 && contentH < 2) return

      // Size the card to the *natural* equation size + title band so the title
      // never steals height from the formula (which forced tiny CSS/font scale).
      const nextW = Math.min(MAX_AUTO_W, Math.max(120, contentW + pad + 4))
      const nextH = Math.min(
        MAX_AUTO_H,
        Math.max(56, contentH + titleBand + pad + 4),
      )

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
    showTitle,
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
        groupSizes: null,
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
    (e: ReactPointerEvent) => {
      if (!interactive || item.locked) return
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      useCanvasStore.getState().beginHistoryBatch()
      const state = useCanvasStore.getState()
      // Ensure this card is selected; keep multi-selection if already in it
      if (!state.selectedIds.includes(item.id)) {
        select(item.id)
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      const idsForGroup =
        state.selectedIds.includes(item.id) && state.selectedIds.length > 1
          ? state.selectedIds
          : [item.id]
      // If we just selected only this card above, group is just [item.id]
      const ids =
        useCanvasStore.getState().selectedIds.includes(item.id) &&
        useCanvasStore.getState().selectedIds.length > 1
          ? useCanvasStore.getState().selectedIds
          : idsForGroup

      const groupSizes: Record<string, { width: number; height: number }> = {}
      for (const id of ids) {
        const it = useCanvasStore.getState().items.find((x) => x.id === id)
        if (it && !it.locked)
          groupSizes[id] = { width: it.width, height: it.height }
      }
      if (Object.keys(groupSizes).length === 0) return

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
        groupSizes,
        shiftToggle: false,
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
        // Multi-resize: same width/height delta for every selected card
        if (d.groupSizes && Object.keys(d.groupSizes).length > 1) {
          resizeItemsBy(d.groupSizes, dx, dy, { manual: true })
        } else {
          const nw = d.origW + dx
          const nh = d.origH + dy
          if (Number.isFinite(nw) && Number.isFinite(nh)) {
            resizeItem(item.id, nw, nh, { manual: true })
          }
        }
      }
    },
    [
      item.id,
      moveItem,
      moveItemsBy,
      resizeItem,
      resizeItemsBy,
      zoom,
      interactive,
    ],
  )

  const endPointer = useCallback(
    (e: ReactPointerEvent) => {
      if (!interactive) return
      const d = dragRef.current
      if (d && d.pointerId !== e.pointerId) return

      // Click (no drag) on title area → hide title; reclaim band so body size stays
      if (d && d.mode === 'move' && !d.active && d.hitTitle && !d.shiftToggle) {
        updateItem(item.id, {
          showTitle: false,
          height: Math.max(48, item.height - TITLE_BAND),
          contentFitKey: (item.contentFitKey ?? 0) + 1,
        })
      }

      if (d) {
        useCanvasStore.getState().endHistoryBatch()
      }

      dragRef.current = null
      setDragging(false)
      const el = rootRef.current
      if (el) {
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
    },
    [item.id, item.height, item.contentFitKey, updateItem, interactive],
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
  const pad = style.padding ?? 12
  const safeW = Math.max(80, item.width || 80)
  const safeH = Math.max(48, item.height || 48)
  const left = Number.isFinite(item.x) ? item.x : 0
  const top = Number.isFinite(item.y) ? item.y : 0
  const asFigure = isFigureLike(item)
  // Background fill ON unless user set transparentBackground: true
  // (figures and equations share the same solid panel default)
  const transparent = item.transparentBackground === true
  const titleAlign = item.titleAlign ?? CARD_DEFAULTS.titleAlign
  const contentFill = item.contentFill !== false
  const titleAlignClass =
    titleAlign === 'center'
      ? 'text-center'
      : titleAlign === 'right'
        ? 'text-right'
        : 'text-left'

  if (item.hidden) {
    // Still occupies layout identity for marquee hit-tests only when not hidden;
    // fully omit from canvas when Outliner eye is off.
    return null
  }

  return (
    <div
      ref={rootRef}
      data-canvas-item
      className={`absolute select-none overflow-hidden touch-none ${
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
        zIndex: displayZ,
        background: transparent
          ? 'transparent'
          : (style.background ?? 'rgba(30,32,40,0.92)'),
        // Border is independent of background fill (user can toggle stroke)
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
      <div className="relative z-0 flex h-full min-h-0 flex-col">
        {showTitle && (
          <div
            data-card-title
            title="Click to hide title"
            className={`pointer-events-auto relative z-10 mb-1 h-[18px] shrink-0 cursor-pointer truncate text-[10px] font-medium uppercase leading-[18px] tracking-wide text-zinc-500 hover:text-zinc-300 ${titleAlignClass}`}
          >
            {item.title}
          </div>
        )}

        {autoFit && !asFigure && (
          <div
            aria-hidden
            className="pointer-events-none fixed -left-[9999px] top-0 opacity-0"
            style={{ width: 'max-content', maxWidth: MAX_AUTO_W - pad * 2 }}
          >
            <div ref={naturalRef}>
              <ItemBody item={item} />
            </div>
          </div>
        )}

        {/* flex-1 body: title is shrink-0 so it never compresses the formula area */}
        <div className="pointer-events-none min-h-0 w-full flex-1">
          {asFigure && item.imageUrl ? (
            // Vector/bitmap at container size — no transform upscale blur
            <FigureView
              src={item.imageUrl}
              alt={item.title ?? 'figure'}
            />
          ) : item.type === 'process-chart' || item.mermaidSource ? (
            // Mermaid SVG: use transform fit (not fontSize). Honors contentFill.
            // contentKey includes mermaidReadyKey so we re-fit after async render.
            <FitContent
              mode="scale"
              minScale={CARD_DEFAULTS.minFitScale}
              maxScale={
                contentFill ? CARD_DEFAULTS.maxFillScale : 1
              }
              fitMethod="transform"
              showBadge={selected}
              contentKey={`${item.id}-mmd-${item.mermaidSource ?? ''}-${item.mermaidTheme ?? ''}-fit${item.contentFitKey ?? 0}-fill${contentFill ? 1 : 0}-t${showTitle ? 1 : 0}-r${mermaidReadyKey}`}
              className="h-full w-full"
            >
              <MermaidView
                source={item.mermaidSource ?? ''}
                theme={item.mermaidTheme ?? 'dark'}
                forceDark={(item.mermaidTheme ?? 'dark') !== 'forest'}
                scale={1}
                onRendered={() => setMermaidReadyKey((k) => k + 1)}
              />
            </FitContent>
          ) : (
            <FitContent
              mode="scale"
              minScale={CARD_DEFAULTS.minFitScale}
              maxScale={
                contentFill ? CARD_DEFAULTS.maxFillScale : 1
              }
              // App-wide default: fontSize (crisp). Figures never reach here.
              fitMethod={CARD_DEFAULTS.equationFitMethod}
              baseFontSize={style.fontSize ?? 18}
              showBadge={selected}
              contentKey={`${item.id}-${item.latex ?? ''}-${item.tableMarkdown ?? ''}-${item.style?.fontSize ?? ''}-fit${item.contentFitKey ?? 0}-fill${contentFill ? 1 : 0}-t${showTitle ? 1 : 0}`}
              className="h-full w-full"
            >
              <ItemBody item={item} />
            </FitContent>
          )}
        </div>
      </div>

      {/* Per-card handle only for single selection; multi uses MultiSelectFrame */}
      {selected && !item.locked && !multiSelected && (
        <div
          data-resize-handle
          className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-se-resize rounded-tl bg-indigo-400"
          onPointerDown={beginResize}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          title="Resize"
        />
      )}
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
