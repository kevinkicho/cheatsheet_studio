import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type FitMode = 'scale' | 'scroll' | 'clip'
/**
 * transform — CSS scale() (fast while dragging; stretch / non-uniform; soft when
 *   enlarging bitmap-like content)
 * fontSize  — grow/shrink via font-size so KaTeX + HTML tables reflow as **vector
 *   type** (stays sharp on resize). Prefer this for equations and pipe tables.
 *
 * VECTOR POLICY: new block content should be authored as vector (LaTeX, SVG,
 * processFlow, em-based HTML tables) so either path stays crisp when possible.
 * See docs/vector-graphics.md
 */
export type FitMethod = 'transform' | 'fontSize'

/**
 * contain — uniform scale (aspect locked)
 * stretch — independent scaleX / scaleY
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
   * as you drag the card larger.
   */
  maxScale?: number
  mode?: FitMode
  fitMethod?: FitMethod
  fillMode?: FitFillMode
  /**
   * center (default): content centered in the box.
   * start: top-left (stretch free-transform).
   */
  align?: 'start' | 'center'
  /** Base font size (px) for natural measurement (fontSize method). */
  baseFontSize?: number
  /**
   * Canvas board zoom for fontSize paint resolution. Keep 1 for library.
   */
  paintZoom?: number
  showBadge?: boolean
  /**
   * Remeasure natural content when this changes.
   * Do not put card width/height here.
   */
  contentKey?: string | number
}

function clampScale(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/**
 * Fits children into a bounded box and keeps refitting as the box resizes.
 *
 * Critical: natural remeasure must not flash unscaled content (that made library
 * tiles jump when the hover tooltip mounted another KaTeX instance).
 */
export function FitContent({
  children,
  className = '',
  minScale = 0.08,
  maxScale = 1,
  mode = 'scale',
  fitMethod = 'fontSize',
  fillMode = 'contain',
  align = 'center',
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
  const appliedRef = useRef(false)
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
      appliedRef.current = false
      return
    }

    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return

    let raf = 0
    let moRaf = 0
    let cancelled = false
    naturalRef.current = { w: 0, h: 0, ready: false }
    lastScaleRef.current = { sx: 1, sy: 1, pz: 1 }
    appliedRef.current = false

    const preferTransform =
      fillMode === 'stretch' || fitMethod === 'transform'
    const pz = Number.isFinite(paintZoom) && paintZoom > 0 ? paintZoom : 1

    /**
     * Measure natural size at base font without leaving a painted unscaled frame:
     * save → measure at base → restore previous styles, then applyScaleOnly paints.
     */
    const measureNatural = (): boolean => {
      const el = innerRef.current
      if (!el) return false
      const base = Math.max(1, baseFontSize)

      const prev = {
        transform: el.style.transform,
        transformOrigin: el.style.transformOrigin,
        fontSize: el.style.fontSize,
        width: el.style.width,
        maxWidth: el.style.maxWidth,
        marginLeft: el.style.marginLeft,
        marginTop: el.style.marginTop,
      }

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

      // Restore immediately so the browser never paints unscaled content
      el.style.transform = prev.transform
      el.style.transformOrigin = prev.transformOrigin
      el.style.fontSize = prev.fontSize
      el.style.width = prev.width
      el.style.maxWidth = prev.maxWidth
      el.style.marginLeft = prev.marginLeft
      el.style.marginTop = prev.marginTop

      if (nw < 8 && nh < 8) {
        naturalRef.current = { w: 0, h: 0, ready: false }
        return false
      }

      naturalRef.current = { w: nw, h: nh, ready: true }
      return true
    }

    const writeScale = (sx: number, sy: number) => {
      const el = innerRef.current
      if (!el) return
      const base = Math.max(1, baseFontSize)
      const stretch = fillMode === 'stretch'
      // Tables used to force transform, which pixelated text on enlarge.
      // MarkdownTable uses em sizing so fontSize fit stays sharp (vector type).
      const useTransform = preferTransform
      const { w: nw, h: nh } = naturalRef.current
      const b = boxRef.current
      // client* includes padding — never put padding on this element
      const cw = Math.max(b?.clientWidth ?? 1, 1)
      const ch = Math.max(b?.clientHeight ?? 1, 1)

      // Slight safety inset so subpixel / KaTeX metrics never clip R/B
      const fitW = Math.max(1, cw - 1)
      const fitH = Math.max(1, ch - 1)

      let outSx = sx
      let outSy = sy
      // Recompute from natural against the true content box
      if (!stretch) {
        const fit = clampScale(
          Math.min(fitW / nw, fitH / nh),
          minScale,
          maxScale,
        )
        outSx = fit
        outSy = fit
      } else {
        outSx = clampScale(fitW / nw, minScale, maxScale)
        outSy = clampScale(fitH / nh, minScale, maxScale)
      }

      el.style.marginLeft = '0'
      el.style.marginTop = '0'
      el.style.width = 'max-content'
      el.style.maxWidth = 'none'

      if (useTransform || stretch) {
        el.style.fontSize = `${base}px`
        el.style.transform =
          Math.abs(outSx - outSy) < 0.0005
            ? `scale(${outSx})`
            : `scale(${outSx}, ${outSy})`
        el.style.transformOrigin = 'top left'
        setUsingTransform(true)
      } else {
        // fontSize path (canvas equations) — iterate until visual fits
        for (let pass = 0; pass < 5; pass++) {
          const paint = base * outSx * pz
          if (pz === 1) {
            el.style.transform = 'none'
            el.style.fontSize = `${paint}px`
          } else {
            el.style.fontSize = `${paint}px`
            el.style.transform = `scale(${1 / pz})`
            el.style.transformOrigin = 'top left'
          }
          void el.offsetWidth
          const aw = Math.max(el.scrollWidth, el.offsetWidth, 1)
          const ah = Math.max(el.scrollHeight, el.offsetHeight, 1)
          const visW = pz === 1 ? aw : aw / pz
          const visH = pz === 1 ? ah : ah / pz
          if (visW <= fitW + 0.5 && visH <= fitH + 0.5) break
          const refine = Math.min(fitW / visW, fitH / visH) * 0.98
          outSx = Math.max(minScale, outSx * refine)
          outSy = outSx
        }
        setUsingTransform(pz !== 1)
      }

      // Center: visual size after scale
      const laidW = useTransform || stretch
        ? nw * outSx
        : Math.max(el.offsetWidth, el.scrollWidth, 1) / (pz === 1 ? 1 : pz)
      const laidH = useTransform || stretch
        ? nh * outSy
        : Math.max(el.offsetHeight, el.scrollHeight, 1) / (pz === 1 ? 1 : pz)

      if (align === 'center' && !stretch) {
        el.style.marginLeft = `${Math.max(0, (cw - laidW) / 2)}px`
        el.style.marginTop = `${Math.max(0, (ch - laidH) / 2)}px`
      } else {
        el.style.marginLeft = '0'
        el.style.marginTop = '0'
      }

      lastScaleRef.current = { sx: outSx, sy: outSy, pz }
      appliedRef.current = true
      return { sx: outSx, sy: outSy }
    }

    const applyScaleOnly = () => {
      if (cancelled) return
      const b = boxRef.current
      const el = innerRef.current
      if (!b || !el) return

      const { w: nw, h: nh, ready } = naturalRef.current
      if (!ready || nw < 8 || nh < 8) return

      const cw = Math.max(b.clientWidth, 1)
      const ch = Math.max(b.clientHeight, 1)
      const stretch = fillMode === 'stretch'

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

      const prev = lastScaleRef.current
      const same =
        appliedRef.current &&
        Math.abs(prev.sx - sx) < 0.002 &&
        Math.abs(prev.sy - sy) < 0.002 &&
        Math.abs(prev.pz - pz) < 0.002

      // Skip work when scale is unchanged — critical during free-transform drag
      // and hover-tooltip re-renders (avoids KaTeX reflow “twitch”).
      if (same) return

      const out = writeScale(sx, sy)
      if (out) {
        setScale(out.sx)
        setScaleY(out.sy)
      }
    }

    const apply = (remeasure: boolean) => {
      if (cancelled) return
      if (remeasure || !naturalRef.current.ready) {
        if (!measureNatural()) {
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

    // Debounce mutation remeasures so unrelated DOM (hover tooltip KaTeX) does not
    // thrash every library tile in the same frame.
    const scheduleRemeasureDebounced = () => {
      if (moRaf) cancelAnimationFrame(moRaf)
      moRaf = requestAnimationFrame(() => {
        moRaf = 0
        // Only remeasure if our own subtree still needs it; box resize uses schedule(false)
        schedule(true)
      })
    }

    apply(true)

    const roBox = new ResizeObserver(() => schedule(false))
    roBox.observe(box)

    // Only watch direct content swaps (async inject), not every text mutation
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver((records) => {
            // Ignore pure attribute noise; childList = real content inject
            if (records.some((r) => r.type === 'childList' && r.addedNodes.length)) {
              scheduleRemeasureDebounced()
            }
          })
        : null
    mo?.observe(inner, { childList: true, subtree: true })

    const imgs = inner.querySelectorAll('img')
    imgs.forEach((img) => {
      if (!img.complete) {
        img.addEventListener('load', () => schedule(true), { once: true })
      }
    })

    // One deferred remeasure for async KaTeX/fonts (not a long storm of resets)
    const t1 = window.setTimeout(() => schedule(true), 80)
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
      if (moRaf) cancelAnimationFrame(moRaf)
      window.clearTimeout(t1)
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
      // Isolate layout so sibling/tooltip mounts do not reflow this tile
      style={{ contain: 'layout' }}
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
              ? `Stretch fill · X ${Math.round(scale * 100)}% · Y ${Math.round(scaleY * 100)}%`
              : maxScale <= 1
                ? 'Natural size (100% cap)'
                : `Uniform fit · scale ${Math.round(scale * 100)}% (cap ${Math.round(maxScale * 100)}%)`
          }
        >
          {badgeText}
        </span>
      )}
    </div>
  )
}
