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
import { LatexView } from '@/components/math/LatexView'
import { MarkdownTable } from '@/components/math/MarkdownTable'

interface CanvasItemViewProps {
  item: CanvasItem
  selected: boolean
  zoom: number
}

const MAX_AUTO_W = 520
const MAX_AUTO_H = 420
const DRAG_THRESHOLD_PX = 3
/** Title row + margin — reserved so showing the title grows the card instead of shrinking math. */
const TITLE_BAND = 22

function ItemBody({ item }: { item: CanvasItem }) {
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
          className="overflow-visible"
        />
      )}
      {(item.type === 'figure' ||
        item.type === 'custom-image' ||
        item.imageUrl) &&
        item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.title ?? 'figure'}
            className="block max-h-none max-w-none object-contain"
            draggable={false}
          />
        )}
    </>
  )
}

export function CanvasItemView({ item, selected, zoom }: CanvasItemViewProps) {
  const select = useCanvasStore((s) => s.select)
  const moveItem = useCanvasStore((s) => s.moveItem)
  const resizeItem = useCanvasStore((s) => s.resizeItem)
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
  } | null>(null)
  const lastFitRef = useRef({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)

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
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest('[data-resize-handle]')) return

      e.stopPropagation()
      e.preventDefault()
      select(item.id)

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
        hitTitle,
      }
    },
    [item.id, item.x, item.y, item.width, item.height, select],
  )

  const beginResize = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      select(item.id)
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
      }
    },
    [item.id, item.x, item.y, item.width, item.height, select],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return

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
        const nx = d.origX + dx
        const ny = d.origY + dy
        if (Number.isFinite(nx) && Number.isFinite(ny)) {
          moveItem(item.id, nx, ny)
        }
      } else {
        const nw = d.origW + dx
        const nh = d.origH + dy
        if (Number.isFinite(nw) && Number.isFinite(nh)) {
          resizeItem(item.id, nw, nh, { manual: true })
        }
      }
    },
    [item.id, moveItem, resizeItem, zoom],
  )

  const endPointer = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current
      if (d && d.pointerId !== e.pointerId) return

      // Click (no drag) on title area → hide title; reclaim band so body size stays
      if (d && d.mode === 'move' && !d.active && d.hitTitle) {
        updateItem(item.id, {
          showTitle: false,
          // Keep formula size: drop the reserved title band from the card height
          height: Math.max(48, item.height - TITLE_BAND),
          contentFitKey: (item.contentFitKey ?? 0) + 1,
        })
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
    [item.id, item.height, item.contentFitKey, updateItem],
  )

  /**
   * Double-click empty card space → scale content (up or down) to fill the
   * card body. Keeps card width/height; only changes render scale.
   */
  const onDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
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
    [item.id, item.contentFitKey, updateItem],
  )

  const style = item.style ?? {}
  const pad = style.padding ?? 12
  const safeW = Math.max(80, item.width || 80)
  const safeH = Math.max(48, item.height || 48)
  const left = Number.isFinite(item.x) ? item.x : 0
  const top = Number.isFinite(item.y) ? item.y : 0

  return (
    <div
      ref={rootRef}
      data-canvas-item
      className={`absolute select-none overflow-hidden touch-none ${
        selected ? 'ring-2 ring-indigo-400' : 'ring-1 ring-transparent hover:ring-zinc-600'
      } ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        left,
        top,
        width: safeW,
        height: safeH,
        zIndex: item.zIndex,
        background: style.background ?? 'rgba(30,32,40,0.92)',
        border: style.border,
        borderRadius: 8,
        color: style.color ?? '#e8eaed',
        fontSize: style.fontSize ?? 18,
        padding: pad,
        boxSizing: 'border-box',
        boxShadow: selected
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
        select(item.id)
      }}
    >
      <div className="relative z-0 flex h-full min-h-0 flex-col">
        {showTitle && (
          <div
            data-card-title
            title="Click to hide title"
            className="pointer-events-auto relative z-10 mb-1 h-[18px] shrink-0 cursor-pointer truncate text-[10px] font-medium uppercase leading-[18px] tracking-wide text-zinc-500 hover:text-zinc-300"
          >
            {item.title}
          </div>
        )}

        {autoFit && (
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
          <FitContent
            mode="scale"
            minScale={0.08}
            // Fill mode: high cap so content keeps growing as you drag larger
            // (old cap of 12× made scaling look like it “suddenly stopped”)
            maxScale={item.contentFill === false ? 1 : 64}
            // Transform is continuous & reliable while dragging corners.
            // Font-size is crisp but can hitch; use it only when not filling.
            fitMethod={
              item.contentFill === false &&
              item.type !== 'figure' &&
              item.type !== 'custom-image' &&
              !(item.imageUrl && !item.latex && !item.tableMarkdown)
                ? 'fontSize'
                : 'transform'
            }
            baseFontSize={style.fontSize ?? 18}
            showBadge={selected}
            // Do NOT include width/height — ResizeObserver handles continuous resize
            contentKey={`${item.id}-${item.latex ?? ''}-${item.tableMarkdown ?? ''}-${item.imageUrl ?? ''}-${item.style?.fontSize ?? ''}-fit${item.contentFitKey ?? 0}-fill${item.contentFill === false ? 0 : 1}-t${showTitle ? 1 : 0}`}
            className="h-full w-full"
          >
            <ItemBody item={item} />
          </FitContent>
        </div>
      </div>

      {selected && (
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
    </div>
  )
}
