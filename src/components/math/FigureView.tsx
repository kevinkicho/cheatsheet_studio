import { useEffect, useState } from 'react'
import {
  getLocalImageRecord,
  isEphemeralBlobUrl,
  isLocalAssetRef,
} from '@/lib/localImageStore'

/**
 * Display a figure/image at the container’s layout size.
 * Resolves durable `local-asset:` refs from IndexedDB for display.
 * Seamless GIF loops are baked into the file at import time (normal <img>).
 */
export function FigureView({
  src,
  alt = 'figure',
  className = '',
}: {
  src: string
  alt?: string
  className?: string
}) {
  const [resolved, setResolved] = useState<string | null>(() =>
    isLocalAssetRef(src) || isEphemeralBlobUrl(src) ? null : src,
  )
  const [failed, setFailed] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    setFailed(false)
    setHint(null)

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
      objectUrl = URL.createObjectURL(rec.blob)
      setResolved(objectUrl)
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  if (failed || (!resolved && isLocalAssetRef(src))) {
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

  if (!resolved) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center text-[10px] text-zinc-500 ${className}`}
      >
        Loading…
      </div>
    )
  }

  return (
    <div
      className={`flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden ${className}`}
    >
      <img
        src={resolved}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{
          width: '100%',
          height: '100%',
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
