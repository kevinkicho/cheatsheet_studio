import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { MermaidThemeId } from '@/types'
import {
  paintStudioSvg,
  renderMermaidSvg,
  usesStudioDarkVariables,
} from '@/lib/mermaidTheme'

type Props = {
  source: string
  theme?: MermaidThemeId
  className?: string
  scale?: number
  forceDark?: boolean
  /**
   * When true, SVG fills the host at display size (viewBox + 100% width/height).
   * Vector-friendly — preferred for canvas cards (docs/vector-graphics.md).
   */
  fillContainer?: boolean
  /**
   * SVG preserveAspectRatio when fillContainer is on.
   * meet = keep aspect (default); none = stretch to card.
   */
  preserveAspect?: 'meet' | 'none'
  onRendered?: (size: { width: number; height: number }) => void
}

/**
 * Renders Mermaid SVG for process-chart cards (and export).
 * Studio dark: prepareStudioDarkSource + paintStudioSvg (see docs/process-charts.md).
 * fillContainer paints SVG at the card’s display size (vector resize).
 */
export function MermaidView({
  source,
  theme = 'dark',
  className = '',
  scale = 1,
  forceDark,
  fillContainer = false,
  preserveAspect = 'meet',
  onRendered,
}: Props) {
  const reactId = useId().replace(/:/g, '')
  const hostRef = useRef<HTMLDivElement>(null)
  const onRenderedRef = useRef(onRendered)
  onRenderedRef.current = onRendered
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [markup, setMarkup] = useState('')
  const [natural, setNatural] = useState({ width: 0, height: 0 })

  const studioDark =
    forceDark !== undefined ? forceDark : usesStudioDarkVariables(theme)

  useEffect(() => {
    let cancelled = false
    const text = source.trim()
    if (!text) {
      setMarkup('')
      setError(null)
      setNatural({ width: 0, height: 0 })
      return
    }

    const run = async () => {
      setBusy(true)
      try {
        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 9)}`
        const { svg } = await renderMermaidSvg({
          id,
          source: text,
          theme,
          studioDark,
        })
        if (cancelled) return

        const box = document.createElement('div')
        box.style.cssText =
          'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none'
        box.innerHTML = svg
        document.body.appendChild(box)
        try {
          const svgEl = box.querySelector('svg')
          if (!svgEl) {
            setMarkup(svg)
            setError(null)
            return
          }
          if (studioDark) paintStudioSvg(svgEl)

          svgEl.style.maxWidth = 'none'
          svgEl.style.background = 'transparent'
          svgEl.style.overflow = 'visible'

          // Prefer bbox of content (includes label overflow) over tight viewBox
          let w = 0
          let h = 0
          try {
            const bb = svgEl.getBBox()
            if (bb.width > 2 && bb.height > 2) {
              w = Math.ceil(bb.width + 8)
              h = Math.ceil(bb.height + 8)
              // Expand viewBox slightly so scaled preview doesn't clip labels
              svgEl.setAttribute(
                'viewBox',
                `${bb.x - 4} ${bb.y - 4} ${bb.width + 8} ${bb.height + 8}`,
              )
            }
          } catch {
            /* not in document metrics */
          }
          if (w < 2 || h < 2) {
            const vb = svgEl.viewBox?.baseVal
            w = vb?.width ? Math.ceil(vb.width) : 0
            h = vb?.height ? Math.ceil(vb.height) : 0
          }
          if (w < 2 || h < 2) {
            const r = svgEl.getBoundingClientRect()
            w = Math.ceil(r.width) || w
            h = Math.ceil(r.height) || h
          }

          if (fillContainer) {
            // Vector fill: viewBox drives aspect; paint at host display size
            svgEl.removeAttribute('width')
            svgEl.removeAttribute('height')
            svgEl.setAttribute('width', '100%')
            svgEl.setAttribute('height', '100%')
            svgEl.style.width = '100%'
            svgEl.style.height = '100%'
            const par =
              preserveAspect === 'none' ? 'none' : 'xMidYMid meet'
            svgEl.setAttribute('preserveAspectRatio', par)
          } else {
            svgEl.style.width = 'auto'
            svgEl.style.height = 'auto'
            if (w > 0) svgEl.setAttribute('width', String(w))
            if (h > 0) svgEl.setAttribute('height', String(h))
          }

          if (cancelled) return
          setMarkup(svgEl.outerHTML)
          if (w > 0 && h > 0) {
            setNatural({ width: w, height: h })
            onRenderedRef.current?.({ width: w, height: h })
          }
        } finally {
          box.remove()
        }
        if (!cancelled) setError(null)
      } catch (e) {
        if (cancelled) return
        setMarkup('')
        setError(e instanceof Error ? e.message : String(e))
        setNatural({ width: 0, height: 0 })
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [source, theme, reactId, studioDark, fillContainer, preserveAspect])

  useLayoutEffect(() => {
    if (!studioDark || !markup || !hostRef.current) return
    const svg = hostRef.current.querySelector('svg')
    if (svg) paintStudioSvg(svg)
  }, [markup, studioDark])

  // Keep preserveAspect in sync if SVG already mounted
  useLayoutEffect(() => {
    if (!fillContainer || !hostRef.current) return
    const svg = hostRef.current.querySelector('svg')
    if (!svg) return
    const par = preserveAspect === 'none' ? 'none' : 'xMidYMid meet'
    svg.setAttribute('preserveAspectRatio', par)
  }, [fillContainer, preserveAspect, markup])

  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  const boxW = natural.width > 0 ? Math.ceil(natural.width * s) : undefined
  const boxH = natural.height > 0 ? Math.ceil(natural.height * s) : undefined

  if (fillContainer) {
    return (
      <div
        className={`relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden ${className}`}
      >
        {busy && (
          <span className="pointer-events-none absolute right-1 top-1 z-10 text-[9px] uppercase tracking-wide text-zinc-500">
            Rendering…
          </span>
        )}
        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-950/40 px-2 py-1.5 text-[10px] leading-snug text-rose-200">
            Mermaid error: {error}
          </div>
        )}
        <div
          ref={hostRef}
          className="mermaid-host h-full w-full min-h-0 min-w-0 [&_svg]:h-full [&_svg]:w-full"
          data-testid="mermaid-view"
          data-mermaid-dark={studioDark ? 'true' : 'false'}
          data-mermaid-fill="true"
          dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
        />
      </div>
    )
  }

  return (
    <div className={`relative min-h-0 min-w-0 ${className}`}>
      {busy && (
        <span className="pointer-events-none absolute right-1 top-1 z-10 text-[9px] uppercase tracking-wide text-zinc-500">
          Rendering…
        </span>
      )}
      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-950/40 px-2 py-1.5 text-[10px] leading-snug text-rose-200">
          Mermaid error: {error}
        </div>
      )}
      <div style={{ width: boxW, height: boxH, position: 'relative' }}>
        <div
          ref={hostRef}
          className="mermaid-host origin-top-left"
          data-testid="mermaid-view"
          data-mermaid-dark={studioDark ? 'true' : 'false'}
          style={{
            transform: s === 1 ? undefined : `scale(${s})`,
            transformOrigin: 'top left',
            width: natural.width || undefined,
            height: natural.height || undefined,
          }}
          dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
        />
      </div>
    </div>
  )
}
