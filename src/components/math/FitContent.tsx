import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type FitMode = 'scale' | 'scroll' | 'clip'
/**
 * transform — CSS scale() (smooth while dragging; stretch / non-uniform)
 * fontSize  — change font-size so KaTeX reflows as vector type (uniform; equations)
 * See docs/vector-graphics.md
 */
export type FitMethod = 'transform' | 'fontSize'

/**
 * contain — uniform scale (aspect locked); letterboxing ignored via top-left align
 * stretch — independent scaleX / scaleY so edge resize only affects that axis
 */
export type FitFillMode = 'contain' | 'stretch'

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
  /**
   * contain (default for library thumbs): one scale for both axes.
   * stretch (canvas free-transform): scale X from width, Y from height so
   * vertical resize does not force horizontal content growth.
   */
  fillMode?: FitFillMode
  /**
   * start (default): top-left, no gutters (canvas cards).
   * center: letterbox margins so the diagram sits in the middle (sidebar preview).
   */
  align?: 'start' | 'center'
  /** Base font size (px) for natural measurement (fontSize method). */
  baseFontSize?: number
  /**
   * Canvas board zoom. For fontSize fit, multiplies paint font-size and
   * counter-scales so glyphs resolve at screen pixels under board CSS zoom.
   * Keep 1 for library thumbs / export off-board.
   */
  paintZoom?: number
  showBadge?: boolean
  /**
   * Remeasure natural content size when this changes.
   * Do not put card width/height here — ResizeObserver handles box resize
   * without re-measuring content (avoids flicker).
   */
  contentKey?: string | number
}

function clampScale(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/**
 * Fits children into a bounded box and keeps refitting as the box resizes.
 *
 * Natural content size is measured only when contentKey / method inputs change.
 * On card resize we only recompute scale from cached natural size — we never
 * flash unscaled content (that was the resize flicker bug).
 *
 * Equations use fitMethod="fontSize" so enlarge reflows KaTeX as vector type
 * (docs/vector-graphics.md). Prefer SVG fill for figures/Mermaid over transform.
 */
export function FitContent({
  children,
  className = '',
  minScale = 0.08,
  maxScale = 1,
  mode = 'scale',
  fitMethod = 'fontSize',
  fillMode = 'contain',
  align = 'start',
  baseFontSize = 18,
  paintZoom = 1,
  showBadge = false,
  contentKey,
}: FitContentProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  /** Cached natural (unscaled) content size. */
  const naturalRef = useRef({ w: 0, h: 0, ready: false })
  const lastScaleRef = useRef({ sx: 1, sy: 1, pz: 1 })
  const [scale, setScale] = useState(1)
  const [scaleY, setScaleY] = useState(1)
  const [usingTransform, setUsingTransform] = useState(
    fitMethod === 'transform' || fillMode === 'stretch',
  )

  useLayoutEffect(() => {
    if (mode !== 'scale') {
      setScale(1)
      setScaleY(1)
      naturalRef.current = { w: 0, h: 0, ready: false }
      return
    }

    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return

    let raf = 0
    let cancelled = false
    // Force remeasure when content identity changes
    naturalRef.current = { w: 0, h: 0, ready: false }
    lastScaleRef.current = { sx: 1, sy: 1, pz: 1 }

    const preferTransform =
      fillMode === 'stretch' || fitMethod === 'transform'
    const pz = Number.isFinite(paintZoom) && paintZoom > 0 ? paintZoom : 1

    const measureNatural = (): boolean => {
      const el = innerRef.current
      if (!el) return false
      const base = Math.max(1, baseFontSize)

      // Measure at base size (no paintZoom) in canvas layout space.
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

      if (nw < 8 && nh < 8) {
        naturalRef.current = { w: 0, h: 0, ready: false }
        return false
      }

      naturalRef.current = { w: nw, h: nh, ready: true }
      return true
    }

    const applyScaleOnly = () => {
      if (cancelled) return
      const b = boxRef.current
      const el = innerRef.current
      if (!b || !el) return

      const base = Math.max(1, baseFontSize)
      const { w: nw, h: nh, ready } = naturalRef.current
      if (!ready || nw < 8 || nh < 8) return

      const cw = Math.max(b.clientWidth, 1)
      const ch = Math.max(b.clientHeight, 1)
      const stretch = fillMode === 'stretch'
      const hasTable = el.querySelector('table') != null
      const useTransform =
        preferTransform || (fitMethod === 'fontSize' && hasTable)

      let sx: number
      let sy: number
      if (stretch) {
        sx = clampScale(cw / nw, minScale, maxScale)
        sy = clampScale(ch / nh, minScale, maxScale)
      } else {
        const fit = clampScale(Math.min(cw / nw, ch / nh), minScale, maxScale)
        sx = fit
        sy = fit
      }

      // Skip DOM writes / React state when scale barely changed (smooth drag)
      const prev = lastScaleRef.current
      const same =
        Math.abs(prev.sx - sx) < 0.002 &&
        Math.abs(prev.sy - sy) < 0.002 &&
        Math.abs(prev.pz - pz) < 0.002

      if (!same || !el.style.transform || el.style.transform === 'none') {
        if (useTransform || stretch) {
          // Transform path: paint at base size, CSS scale for layout fit.
          el.style.fontSize = `${base}px`
          el.style.transform =
            Math.abs(sx - sy) < 0.0005
              ? `scale(${sx})`
              : `scale(${sx}, ${sy})`
          el.style.transformOrigin = 'top left'
          setUsingTransform(true)
        } else {
          // fontSize path: reflow KaTeX at target size (vector type).
          // paintZoom: render glyphs at screen resolution under board CSS zoom.
          const paint = base * sx * pz
          if (pz === 1) {
            el.style.transform = 'none'
            el.style.fontSize = `${paint}px`
          } else {
            el.style.fontSize = `${paint}px`
            el.style.transform = `scale(${1 / pz})`
            el.style.transformOrigin = 'top left'
          }
          // One refine pass when content overflows the card box
          void el.offsetWidth
          const nw2 = Math.max(el.scrollWidth, el.offsetWidth, 1) / pz
          const nh2 = Math.max(el.scrollHeight, el.offsetHeight, 1) / pz
          if (nw2 > cw + 1 || nh2 > ch + 1) {
            const refine = Math.min(cw / nw2, ch / nh2)
            sx = Math.max(minScale, sx * refine * 0.995)
            sy = sx
            el.style.fontSize = `${base * sx * pz}px`
          }
          setUsingTransform(pz !== 1)
        }
        if (align === 'center' && !stretch) {
          const scaledW = nw * sx
          const scaledH = nh * sy
          el.style.marginLeft = `${Math.max(0, (cw - scaledW) / 2)}px`
          el.style.marginTop = `${Math.max(0, (ch - scaledH) / 2)}px`
        } else {
          el.style.marginLeft = '0'
          el.style.marginTop = '0'
        }
        lastScaleRef.current = { sx, sy, pz }
      }

      if (!same) {
        setScale(sx)
        setScaleY(sy)
      }
    }

    const apply = (remeasure: boolean) => {
      if (cancelled) return
      if (remeasure || !naturalRef.current.ready) {
        if (!measureNatural()) {
          // Keep prior scale; async content may still be loading
          setScale(1)
          setScaleY(1)
          return
        }
      }
      applyScaleOnly()
    }

    const schedule = (remeasure = false) => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        apply(remeasure)
      })
    }

    // Initial: measure natural once, then scale
    apply(true)

    // Box resize → scale only (no natural remeasure → no flicker)
    const roBox = new ResizeObserver(() => schedule(false))
    roBox.observe(box)

    // Content size changes (async inject) → remeasure natural
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => schedule(true))
        : null
    mo?.observe(inner, { childList: true, subtree: true })

    const imgs = inner.querySelectorAll('img')
    imgs.forEach((img) => {
      if (!img.complete) {
        img.addEventListener('load', () => schedule(true), { once: true })
      }
    })

    // Async mermaid / fonts — remeasure when they settle
    const t1 = window.setTimeout(() => schedule(true), 50)
    const t2 = window.setTimeout(() => schedule(true), 200)
    const t3 = window.setTimeout(() => schedule(true), 500)

    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!cancelled) schedule(true)
      })
    }

    return () => {
      cancelled = true
      roBox.disconnect()
      mo?.disconnect()
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [
    mode,
    minScale,
    maxScale,
    fitMethod,
    fillMode,
    align,
    baseFontSize,
    paintZoom,
    contentKey,
  ])

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

  const nonUniform = fillMode === 'stretch' && Math.abs(scale - scaleY) > 0.01
  const badgeText = nonUniform
    ? `${Math.round(scale * 100)}×${Math.round(scaleY * 100)}%`
    : `${Math.round(scale * 100)}%`

  return (
    <div
      ref={boxRef}
      className={`relative h-full w-full min-h-0 overflow-hidden ${className}`}
      data-fit-scale={scale.toFixed(3)}
      data-fit-scale-y={scaleY.toFixed(3)}
      data-fit-method={fitMethod}
      data-fit-fill={fillMode}
      data-paint-zoom={String(paintZoom)}
    >
      <div
        ref={innerRef}
        className={`inline-block origin-top-left ${
          usingTransform ? 'will-change-transform' : ''
        }`}
      >
        {children}
      </div>
      {showBadge && (
        <span
          className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-zinc-950/85 px-1 py-px text-[9px] tabular-nums text-zinc-400 ring-1 ring-zinc-700/60"
          title={
            fillMode === 'stretch'
              ? `Stretch fill · X ${Math.round(scale * 100)}% · Y ${Math.round(scaleY * 100)}% (edge resize is independent)`
              : maxScale <= 1
                ? 'Shrink-only (fill card off)'
                : `Uniform fit · scale ${Math.round(scale * 100)}% (cap ${Math.round(maxScale * 100)}%)`
          }
        >
          {badgeText}
        </span>
      )}
    </div>
  )
}
