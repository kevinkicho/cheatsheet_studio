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

/**
 * Prepare inline SVG for full-card vector paint: ensure viewBox and
 * width/height 100% so it matches the card’s display resolution.
 */
function prepareInlineSvg(markup: string): string {
  let s = markup.trim()
  if (!s.includes('viewBox')) {
    const wm = s.match(/\bwidth=["']([\d.]+)["']/i)
    const hm = s.match(/\bheight=["']([\d.]+)["']/i)
    if (wm && hm) {
      s = s.replace(/<svg\b/i, `<svg viewBox="0 0 ${wm[1]} ${hm[1]}"`)
    }
  }
  // Prefer percentage sizing over fixed width/height attributes
  s = s.replace(/(<svg\b[^>]*?)\swidth=["'][^"']*["']/i, '$1')
  s = s.replace(/(<svg\b[^>]*?)\sheight=["'][^"']*["']/i, '$1')
  if (!/\swidth=/i.test(s)) {
    s = s.replace(/<svg\b/i, '<svg width="100%"')
  }
  if (!/\sheight=/i.test(s)) {
    s = s.replace(/<svg\b/i, '<svg height="100%"')
  }
  if (!/preserveAspectRatio=/i.test(s)) {
    s = s.replace(/<svg\b/i, '<svg preserveAspectRatio="xMidYMid meet"')
  }
  return s
}

/**
 * Display a figure at the container’s layout size.
 * - SVG (data URL, .svg path, or local SVG blob): inlined for resolution-independent resize
 * - Other images / local-asset: <img> sized to the box
 *
 * Diagrams and math illustrations use SVG (docs/vector-graphics.md).
 */
export function FigureView({
  src,
  alt = 'figure',
  className = '',
  /** When true, image fills the card (100% × 100%, object-contain). */
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
  /** Inlined SVG markup (data URL, or local SVG blob text). */
  const [localSvgMarkup, setLocalSvgMarkup] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

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
      // Local SVG → inline markup for vector paint at card size
      if (
        isSvgMime(rec.blob.type) ||
        isSvgMime(rec.contentType) ||
        (rec.name && /\.svg$/i.test(rec.name))
      ) {
        try {
          const text = await rec.blob.text()
          if (cancelled) return
          if (text.includes('<svg')) {
            setLocalSvgMarkup(prepareInlineSvg(text))
            setResolved(null)
            return
          }
        } catch {
          /* fall through to object URL */
        }
      }
      objectUrl = URL.createObjectURL(rec.blob)
      setResolved(objectUrl)
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  const dataUrlSvg = useMemo(() => {
    if (!resolved || isLocalAssetRef(src)) return null
    if (!isSvgDataUrl(resolved)) return null
    const raw = decodeSvgDataUrl(resolved)
    if (!raw) return null
    return prepareInlineSvg(raw)
  }, [resolved, src])

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
        {!hint && isLocalAssetRef(src) && !failed && (
          <span className="text-[9px] text-zinc-500">Loading…</span>
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

  // Inline SVG paints at the card’s display size (vector)
  if (inlineSvg) {
    return (
      <div
        className={`flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden [&_svg]:h-full [&_svg]:w-full ${className}`}
        role="img"
        aria-label={alt}
        data-figure-vector="svg"
        // eslint-disable-next-line react/no-danger -- trusted library / seed / imported SVG
        dangerouslySetInnerHTML={{ __html: inlineSvg }}
      />
    )
  }

  return (
    <div
      className={`flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden ${className}`}
    >
      <img
        src={resolved!}
        alt={alt}
        draggable={false}
        className={
          fillContainer
            ? 'h-full w-full max-h-full max-w-full select-none object-contain'
            : 'max-h-full max-w-full select-none object-contain'
        }
        style={{
          display: 'block',
          objectFit: 'contain',
          imageRendering: 'auto',
        }}
        onError={() => {
          setFailed(true)
          setHint(
            isEphemeralBlobUrl(src)
              ? 'Temporary image link expired. Re-import the file.'
              : 'Could not load image. Check the URL or re-import the file.',
          )
          setResolved(null)
        }}
      />
    </div>
  )
}
