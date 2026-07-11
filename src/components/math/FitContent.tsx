import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type FitMode = 'scale' | 'scroll' | 'clip'
/**
 * transform — CSS scale() (smooth while dragging card corners)
 * fontSize  — change font-size so KaTeX re-rasterizes crisp
 */
export type FitMethod = 'transform' | 'fontSize'

interface FitContentProps {
  children: ReactNode
  className?: string
  /** Minimum scale when shrinking (default 0.08). */
  minScale?: number
  /**
   * Maximum scale when enlarging. 1 = shrink only.
   * Use a large value (e.g. 64) for "fill card" so content keeps growing
   * as you drag the card larger — a low cap feels like scaling “stops”.
   */
  maxScale?: number
  mode?: FitMode
  fitMethod?: FitMethod
  /** Base font size (px) for natural measurement (fontSize method). */
  baseFontSize?: number
  showBadge?: boolean
  /**
   * Remeasure when *content* changes. Do not put card width/height here —
   * ResizeObserver handles continuous resize.
   */
  contentKey?: string | number
}

/**
 * Fits children into a bounded box and keeps refitting as the box resizes.
 *
 * Always measures natural size at the base size first, then applies a uniform
 * scale. That avoids locking in an intermediate size that stops growing.
 */
export function FitContent({
  children,
  className = '',
  minScale = 0.08,
  maxScale = 1,
  mode = 'scale',
  // App default: re-render at target size (crisp KaTeX). Pass 'transform' only if needed.
  fitMethod = 'fontSize',
  baseFontSize = 18,
  showBadge = false,
  contentKey,
}: FitContentProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    if (mode !== 'scale') {
      setScale(1)
      return
    }

    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return

    let raf = 0
    let cancelled = false

    const apply = () => {
      if (cancelled) return
      const b = boxRef.current
      const el = innerRef.current
      if (!b || !el) return

      const base = Math.max(1, baseFontSize)

      // Detect content that scales poorly with font-size alone (fixed rem
      // classes, multi-column tables). Prefer CSS transform for those so
      // the whole layout grows/shrinks with the card.
      const hasTable = el.querySelector('table') != null
      const method =
        fitMethod === 'fontSize' && hasTable ? 'transform' : fitMethod

      // 1) Natural size always at base — never measure the already-scaled tree
      el.style.transform = 'none'
      el.style.transformOrigin = 'top left'
      el.style.fontSize = `${base}px`
      el.style.width = 'max-content'
      el.style.maxWidth = 'none'
      el.style.marginLeft = '0'
      el.style.marginTop = '0'
      void el.offsetWidth

      const nw = Math.max(el.scrollWidth, el.offsetWidth, 1)
      const nh = Math.max(el.scrollHeight, el.offsetHeight, 1)
      const cw = Math.max(b.clientWidth, 1)
      const ch = Math.max(b.clientHeight, 1)

      // 2) Uniform fit; only limited by min/maxScale
      const fit = Math.min(cw / nw, ch / nh)
      let clamped = Math.min(maxScale, Math.max(minScale, fit))

      if (method === 'fontSize') {
        el.style.transform = 'none'
        el.style.fontSize = `${base * clamped}px`
        void el.offsetWidth

        // KaTeX metrics can overshoot slightly after font change
        const nw2 = Math.max(el.scrollWidth, el.offsetWidth, 1)
        const nh2 = Math.max(el.scrollHeight, el.offsetHeight, 1)
        if (nw2 > cw + 1 || nh2 > ch + 1) {
          const refine = Math.min(cw / nw2, ch / nh2)
          clamped = Math.max(minScale, clamped * refine * 0.995)
          el.style.fontSize = `${base * clamped}px`
          void el.offsetWidth
        }

        const finalW = Math.max(el.scrollWidth, el.offsetWidth, 1)
        const finalH = Math.max(el.scrollHeight, el.offsetHeight, 1)
        el.style.marginLeft = `${Math.max(0, (cw - finalW) / 2)}px`
        el.style.marginTop = `${Math.max(0, (ch - finalH) / 2)}px`
      } else {
        // Transform scales the whole painted layer (tables, mixed content)
        el.style.fontSize = `${base}px`
        el.style.transform = `scale(${clamped})`
        el.style.transformOrigin = 'top left'
        const scaledW = nw * clamped
        const scaledH = nh * clamped
        el.style.marginLeft = `${Math.max(0, (cw - scaledW) / 2)}px`
        el.style.marginTop = `${Math.max(0, (ch - scaledH) / 2)}px`
      }

      setScale(clamped)
    }

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        apply()
      })
    }

    apply()

    const ro = new ResizeObserver(schedule)
    ro.observe(box)

    const t1 = window.setTimeout(schedule, 40)
    const t2 = window.setTimeout(schedule, 160)
    const imgs = inner.querySelectorAll('img')
    imgs.forEach((img) => {
      if (!img.complete) img.addEventListener('load', schedule, { once: true })
    })
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!cancelled) schedule()
      })
    }

    return () => {
      cancelled = true
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [mode, minScale, maxScale, fitMethod, baseFontSize, contentKey])

  if (mode === 'scroll') {
    return (
      <div
        ref={boxRef}
        className={`overflow-auto overscroll-contain ${className}`}
      >
        <div ref={innerRef}>{children}</div>
      </div>
    )
  }

  if (mode === 'clip') {
    return (
      <div ref={boxRef} className={`overflow-hidden ${className}`}>
        <div ref={innerRef}>{children}</div>
      </div>
    )
  }

  return (
    <div
      ref={boxRef}
      className={`relative h-full w-full min-h-0 overflow-hidden ${className}`}
      data-fit-scale={scale.toFixed(3)}
      data-fit-method={fitMethod}
    >
      <div
        ref={innerRef}
        className="inline-block will-change-transform origin-top-left"
      >
        {children}
      </div>
      {showBadge && (
        <span
          className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-zinc-950/85 px-1 py-px text-[9px] tabular-nums text-zinc-400 ring-1 ring-zinc-700/60"
          title={
            maxScale <= 1
              ? 'Shrink-only (fill card off)'
              : `Fills card · scale ${Math.round(scale * 100)}% (cap ${Math.round(maxScale * 100)}%)`
          }
        >
          {Math.round(scale * 100)}%
        </span>
      )}
    </div>
  )
}
