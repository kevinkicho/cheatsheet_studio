import { useEffect, useMemo, useState } from 'react'
import {
  getLocalImageRecord,
  isEphemeralBlobUrl,
  isLocalAssetRef,
} from '@/lib/localImageStore'

function isSvgDataUrl(src: string): boolean {
  return /^data:image\/svg\+xml/i.test(src.trim())
}

function isSvgMime(type: string | undefined | null): boolean {
  return Boolean(type && /image\/svg\+xml/i.test(type))
}

/** Decode data:image/svg+xml (optional ;base64) to SVG markup. */
function decodeSvgDataUrl(src: string): string | null {
  const m = src.match(
    /^data:image\/svg\+xml(;charset=[^;,]+)?(;(base64))?,([\s\S]*)$/i,
  )
  if (!m) return null
  const isB64 = Boolean(m[3])
  const payload = m[4] ?? ''
  try {
    if (isB64) {
      return atob(payload)
    }
    return decodeURIComponent(payload)
  } catch {
    try {
      return decodeURIComponent(payload.replace(/\+/g, ' '))
    } catch {
      return null
    }
  }
}

function parseViewBox(
  markup: string,
): { w: number; h: number } | null {
  const vb = markup.match(/\bviewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i)
  if (vb) {
    const w = Number(vb[3])
    const h = Number(vb[4])
    if (w > 0 && h > 0) return { w, h }
  }
  const wm = markup.match(/\bwidth=["']([\d.]+)["']/i)
  const hm = markup.match(/\bheight=["']([\d.]+)["']/i)
  if (wm && hm) {
    const w = Number(wm[1])
    const h = Number(hm[1])
    if (w > 0 && h > 0) return { w, h }
  }
  return null
}

/**
 * Fill mode: SVG stretches to host (100% × 100%, meet).
 * Intrinsic mode: fixed px from viewBox so FitContent can zoom-fit + show %.
 */
function prepareInlineSvg(
  markup: string,
  mode: 'fill' | 'intrinsic',
): string {
  let s = markup.trim()
  const dims = parseViewBox(s)
  if (!s.includes('viewBox') && dims) {
    s = s.replace(/<svg\b/i, `<svg viewBox="0 0 ${dims.w} ${dims.h}"`)
  }

  s = s.replace(/(<svg\b[^>]*?)\swidth=["'][^"']*["']/i, '$1')
  s = s.replace(/(<svg\b[^>]*?)\sheight=["'][^"']*["']/i, '$1')

  if (mode === 'fill') {
    s = s.replace(/<svg\b/i, '<svg width="100%" height="100%"')
  } else {
    // Intrinsic: concrete px size for FitContent natural measure / CSS scale
    const w = dims?.w ?? 220
    const h = dims?.h ?? 180
    s = s.replace(/<svg\b/i, `<svg width="${w}" height="${h}"`)
  }

  if (/preserveAspectRatio=/i.test(s)) {
    s = s.replace(
      /preserveAspectRatio=["'][^"']*["']/i,
      'preserveAspectRatio="xMidYMid meet"',
    )
  } else {
    s = s.replace(/<svg\b/i, '<svg preserveAspectRatio="xMidYMid meet"')
  }
  return s
}

/**
 * Display a figure at the container’s layout size.
 * - fillContainer (default): SVG fills host (canvas cards)
 * - fillContainer false: intrinsic viewBox size for FitContent zoom-fit + badge
 */
export function FigureView({
  src,
  alt = 'figure',
  className = '',
  fillContainer = true,
}: {
  src: string
  alt?: string
  className?: string
  fillContainer?: boolean
}) {
  const [resolved, setResolved] = useState<string | null>(() =>
    isLocalAssetRef(src) || isEphemeralBlobUrl(src) ? null : src,
  )
  const [localSvgMarkup, setLocalSvgMarkup] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const mode = fillContainer ? 'fill' : 'intrinsic'

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    setFailed(false)
    setHint(null)
    setLocalSvgMarkup(null)

    if (isEphemeralBlobUrl(src)) {
      setResolved(null)
      setFailed(true)
      setHint(
        'This image used a temporary browser link that expires on refresh. Re-import the file.',
      )
      return
    }

    if (!isLocalAssetRef(src)) {
      setResolved(src)
      return
    }

    setResolved(null)
    void (async () => {
      const rec = await getLocalImageRecord(src)
      if (cancelled) return
      if (!rec?.blob) {
        setFailed(true)
        setHint(
          'Local image missing from this browser’s storage. Re-import the file.',
        )
        return
      }
      if (
        isSvgMime(rec.blob.type) ||
        isSvgMime(rec.contentType) ||
        (rec.name && /\.svg$/i.test(rec.name))
      ) {
        try {
          const text = await rec.blob.text()
          if (cancelled) return
          if (text.includes('<svg')) {
            setLocalSvgMarkup(prepareInlineSvg(text, mode))
            setResolved(null)
            return
          }
        } catch {
          /* fall through */
        }
      }
      objectUrl = URL.createObjectURL(rec.blob)
      setResolved(objectUrl)
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, mode])

  const dataUrlSvg = useMemo(() => {
    if (!resolved || isLocalAssetRef(src)) return null
    if (!isSvgDataUrl(resolved)) return null
    const raw = decodeSvgDataUrl(resolved)
    if (!raw) return null
    return prepareInlineSvg(raw, mode)
  }, [resolved, src, mode])

  const inlineSvg = localSvgMarkup ?? dataUrlSvg

  if (failed || (!resolved && !inlineSvg && isLocalAssetRef(src))) {
    return (
      <div
        className={`flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden bg-zinc-900/80 px-2 text-center ${className}`}
      >
        <span className="text-[10px] font-medium text-amber-200/90">
          Image unavailable
        </span>
        {hint && (
          <span className="text-[9px] leading-snug text-zinc-500">{hint}</span>
        )}
      </div>
    )
  }

  if (!resolved && !inlineSvg) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center text-[10px] text-zinc-500 ${className}`}
      >
        Loading…
      </div>
    )
  }

  if (inlineSvg) {
    if (fillContainer) {
      return (
        <div
          className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden ${className}`}
          role="img"
          aria-label={alt}
          data-figure-vector="svg"
          data-figure-mode="fill"
        >
          <div
            className="pointer-events-none absolute inset-0 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
            // eslint-disable-next-line react/no-danger -- trusted SVG
            dangerouslySetInnerHTML={{ __html: inlineSvg }}
          />
        </div>
      )
    }
    // Intrinsic: block-size from SVG width/height attrs for FitContent zoom-fit
    return (
      <div
        className={`inline-block leading-none ${className}`}
        role="img"
        aria-label={alt}
        data-figure-vector="svg"
        data-figure-mode="intrinsic"
        // eslint-disable-next-line react/no-danger -- trusted SVG
        dangerouslySetInnerHTML={{ __html: inlineSvg }}
      />
    )
  }

  return (
    <div
      className={
        fillContainer
          ? `relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden ${className}`
          : `inline-block leading-none ${className}`
      }
    >
      <img
        src={resolved!}
        alt={alt}
        draggable={false}
        className={
          fillContainer
            ? 'h-full w-full max-h-full max-w-full select-none object-contain'
            : 'block max-w-none select-none'
        }
        style={{ display: 'block', objectFit: 'contain' }}
        onError={() => {
          setFailed(true)
          setHint('Could not load image. Check the URL or re-import the file.')
          setResolved(null)
        }}
      />
    </div>
  )
}
