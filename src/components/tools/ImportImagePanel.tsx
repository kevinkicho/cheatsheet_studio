import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { createId } from '@/lib/ids'
import { bakePingPongGif, blobLooksLikeGif } from '@/lib/gifPingPongBake'
import { persistLocalImageFile } from '@/lib/localImageStore'
import { useAuthStore } from '@/stores/authStore'
import { useCanvasStore } from '@/stores/canvasStore'

const MAX_BYTES = 10 * 1024 * 1024

const ACCEPT =
  'image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,.png,.jpg,.jpeg,.gif,.webp,.svg'

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
])

type Draft = {
  /** Original bytes (never mutated). */
  original: Blob
  fileName: string
  contentType: string
  isGif: boolean
  /** Preview URL for original (blob:). */
  originalUrl: string
  /** Output after seamless bake (or same as original). */
  output: Blob
  /** Preview URL for current output. */
  outputUrl: string
  seamless: boolean
  baking: boolean
}

type StoredEntry = {
  path: string
  name: string
  url: string
}

function isAllowedImage(file: File): boolean {
  if (file.type && ALLOWED_MIME.has(file.type.toLowerCase())) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext ?? '')
}

function resolveContentType(file: File | Blob, name?: string): string {
  if (file.type && ALLOWED_MIME.has(file.type.toLowerCase())) {
    return file.type.split(';')[0].trim()
  }
  const ext = name?.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'gif':
      return 'image/gif'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    default:
      return (file.type || 'image/png').split(';')[0].trim()
  }
}

function resolveExt(name: string, contentType: string): string {
  const fromName = name.split('.').pop()?.toLowerCase()
  if (
    fromName &&
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(fromName)
  ) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  if (contentType.includes('gif')) return 'gif'
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('svg')) return 'svg'
  return 'jpg'
}

function formatStorageError(e: unknown): string {
  const err = e as { code?: string; message?: string }
  const code = err?.code ?? ''
  const msg = err?.message ?? (e instanceof Error ? e.message : String(e))
  if (code === 'storage/unauthorized' || /permission|unauthorized/i.test(msg)) {
    return 'Permission denied. Sign in and ensure storage rules are deployed.'
  }
  if (code === 'storage/unauthenticated') {
    return 'Not signed in. Sign in with Google, then try again.'
  }
  if (/cors|network|failed to fetch/i.test(msg)) {
    return 'Network error talking to Storage. Check connection and Storage setup.'
  }
  return code ? `${msg} (${code})` : msg
}

function revokeUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Image studio: pick → preview → toggle seamless (bake GIF) → upload → canvas.
 * Also list/manage Storage images and canvas figure cards.
 */
export function ImportImagePanel() {
  const user = useAuthStore((s) => s.user)
  const addCustomImage = useCanvasStore((s) => s.addCustomImage)
  const removeItems = useCanvasStore((s) => s.removeItems)
  const select = useCanvasStore((s) => s.select)
  const canvasItems = useCanvasStore((s) => s.items)
  const updateItem = useCanvasStore((s) => s.updateItem)

  const [title, setTitle] = useState('Custom image')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [urlInput, setUrlInput] = useState('')
  const [stored, setStored] = useState<StoredEntry[]>([])
  const [storedLoading, setStoredLoading] = useState(false)

  const canvasImages = useMemo(
    () =>
      canvasItems.filter(
        (i) =>
          Boolean(i.imageUrl) &&
          (i.type === 'custom-image' ||
            i.type === 'figure' ||
            (!i.latex && !i.tableMarkdown)),
      ),
    [canvasItems],
  )

  const refreshStored = useCallback(async () => {
    if (!user) {
      setStored([])
      return
    }
    setStoredLoading(true)
    try {
      const folder = ref(storage, `users/${user.uid}/images`)
      const res = await listAll(folder)
      const entries = await Promise.all(
        res.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef)
          return {
            path: itemRef.fullPath,
            name: itemRef.name,
            url,
          }
        }),
      )
      entries.sort((a, b) => a.name.localeCompare(b.name))
      setStored(entries)
    } catch (e) {
      console.warn('[images] list failed', e)
      setStored([])
    } finally {
      setStoredLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refreshStored()
  }, [refreshStored])

  // Cleanup blob URLs on unmount / draft clear
  useEffect(() => {
    return () => {
      if (draft) {
        revokeUrl(draft.originalUrl)
        if (draft.outputUrl !== draft.originalUrl) revokeUrl(draft.outputUrl)
      }
    }
  }, [draft])

  const clearDraft = () => {
    setDraft((d) => {
      if (d) {
        revokeUrl(d.originalUrl)
        if (d.outputUrl !== d.originalUrl) revokeUrl(d.outputUrl)
      }
      return null
    })
    setStatus(null)
    setError(null)
  }

  const loadFileIntoDraft = async (file: File) => {
    setError(null)
    setStatus(null)
    if (!isAllowedImage(file)) {
      setError('Unsupported type. Use PNG, JPG, GIF, WebP, or SVG.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('File too large (max 10 MB).')
      return
    }

    clearDraft()
    const contentType = resolveContentType(file, file.name)
    const isGif = blobLooksLikeGif(file, file.name)
    const originalUrl = URL.createObjectURL(file)

    const base: Draft = {
      original: file,
      fileName: file.name,
      contentType,
      isGif,
      originalUrl,
      output: file,
      outputUrl: originalUrl,
      seamless: isGif, // default on for GIFs
      baking: false,
    }
    setDraft(base)
    if (!title || title === 'Custom image') {
      setTitle(file.name.replace(/\.[^.]+$/, '') || 'Custom image')
    }

    // Auto-bake if GIF + seamless default
    if (isGif) {
      await applySeamless(base, true)
    } else {
      setStatus('Preview ready. Click “Upload & add to canvas” when ready.')
    }
  }

  const applySeamless = async (current: Draft, seamless: boolean) => {
    setError(null)
    if (!current.isGif) {
      setDraft({ ...current, seamless: false })
      return
    }

    if (!seamless) {
      // Revert to original
      if (current.outputUrl !== current.originalUrl) {
        revokeUrl(current.outputUrl)
      }
      setDraft({
        ...current,
        seamless: false,
        baking: false,
        output: current.original,
        outputUrl: current.originalUrl,
      })
      setStatus('Showing original GIF (normal loop).')
      return
    }

    setDraft({ ...current, seamless: true, baking: true })
    setStatus('Building seamless GIF (forward + reverse)…')
    try {
      const baked = await bakePingPongGif(current.original)
      const outputUrl = URL.createObjectURL(baked)
      setDraft((prev) => {
        if (!prev || prev.originalUrl !== current.originalUrl) {
          revokeUrl(outputUrl)
          return prev
        }
        if (prev.outputUrl !== prev.originalUrl) revokeUrl(prev.outputUrl)
        return {
          ...prev,
          seamless: true,
          baking: false,
          output: baked,
          outputUrl,
          contentType: 'image/gif',
          fileName: prev.fileName.replace(/\.gif$/i, '') + '-seamless.gif',
        }
      })
      setStatus('Seamless preview ready — upload when happy with it.')
    } catch (e) {
      console.error('[images] bake failed', e)
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              seamless: false,
              baking: false,
              output: prev.original,
              outputUrl: prev.originalUrl,
            }
          : null,
      )
      setError(
        e instanceof Error
          ? e.message
          : 'Could not build seamless GIF. Try another file.',
      )
      setStatus(null)
    }
  }

  const uploadAndAdd = async () => {
    if (!draft || draft.baking) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const label = title.trim() || draft.fileName || 'Custom image'
      const blob = draft.output
      const contentType = draft.seamless
        ? 'image/gif'
        : draft.contentType
      const fileName = draft.fileName

      if (!user) {
        const { url, via } = await persistLocalImageFile(blob, fileName)
        addCustomImage(url, label)
        setStatus(
          via === 'idb'
            ? 'Added to canvas (local browser storage). Sign in to use cloud Storage.'
            : 'Added to canvas (data URL).',
        )
        clearDraft()
        return
      }

      const ext = resolveExt(fileName, contentType)
      const path = `users/${user.uid}/images/${createId('img')}.${ext}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, blob, {
        contentType,
        customMetadata: {
          originalName: fileName.slice(0, 200),
          seamlessLoop: draft.seamless && draft.isGif ? '1' : '0',
        },
      })
      const downloadUrl = await getDownloadURL(storageRef)
      addCustomImage(downloadUrl, label, path)
      setStatus(
        draft.seamless && draft.isGif
          ? 'Uploaded seamless GIF and added to canvas.'
          : 'Uploaded and added to canvas.',
      )
      clearDraft()
      void refreshStored()
    } catch (e) {
      console.error('[images] upload failed', e)
      setError(formatStorageError(e))
    } finally {
      setBusy(false)
    }
  }

  const addStoredToCanvas = (entry: StoredEntry) => {
    addCustomImage(entry.url, entry.name.replace(/\.[^.]+$/, ''), entry.path)
    setStatus(`Added “${entry.name}” to canvas.`)
  }

  const deleteStored = async (entry: StoredEntry) => {
    if (!user) return
    if (!window.confirm(`Delete ${entry.name} from Storage?`)) return
    try {
      await deleteObject(ref(storage, entry.path))
      // Clear imageUrl on canvas cards that pointed here
      for (const it of canvasImages) {
        if (it.imagePath === entry.path || it.imageUrl === entry.url) {
          updateItem(it.id, { imageUrl: undefined, imagePath: undefined })
        }
      }
      void refreshStored()
      setStatus(`Deleted ${entry.name}.`)
    } catch (e) {
      setError(formatStorageError(e))
    }
  }

  const loadUrlAsDraft = async () => {
    const trimmed = urlInput.trim()
    if (!trimmed) {
      setError('Enter an image URL')
      return
    }
    if (
      !trimmed.startsWith('https://') &&
      !trimmed.startsWith('http://') &&
      !trimmed.startsWith('data:image/')
    ) {
      setError('URL must start with https:// or be a data:image URL')
      return
    }
    // Seamless bake needs local bytes — remote GIF seamless not supported via URL
    if (draft?.seamless) {
      /* ignore */
    }
    setBusy(true)
    setError(null)
    try {
      // Still images / non-seamless: add directly without preview bake
      addCustomImage(trimmed, title.trim() || 'Custom image')
      setUrlInput('')
      setStatus('Image added from URL (no seamless rewrite for remote URLs).')
    } finally {
      setBusy(false)
    }
  }

  const previewSrc = draft?.outputUrl ?? null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-xs text-zinc-500">
          Pick a file → preview → toggle seamless for GIFs → upload to Storage
          and place on the canvas.
        </p>

        {!user && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
            Not signed in. Images stay in this browser only. Sign in for cloud
            Storage + library list.
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase text-zinc-500">
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field-input"
            disabled={busy}
          />
        </label>

        {/* Drop zone */}
        <div className="relative">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-3 py-5 text-center hover:border-indigo-500/50">
            <Upload className="h-5 w-5 text-indigo-400" />
            <span className="text-xs text-zinc-300">
              {busy ? 'Working…' : 'Choose image / GIF'}
            </span>
            <span className="text-[10px] text-zinc-600">
              PNG, JPG, GIF, WebP, SVG · max 10 MB
            </span>
            <input
              type="file"
              accept={ACCEPT}
              className="absolute inset-0 cursor-pointer opacity-0"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void loadFileIntoDraft(f)
              }}
            />
          </label>
        </div>

        {/* Preview + seamless */}
        {draft && (
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/80 p-2">
            <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Preview"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-[11px] text-zinc-600">No preview</span>
              )}
              {draft.baking && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 text-[11px] text-zinc-300">
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Baking seamless GIF…
                </div>
              )}
              <span
                className="pointer-events-none absolute left-2 top-1.5 text-[9px] font-medium uppercase tracking-wide text-zinc-300"
                style={{ opacity: 0.5 }}
              >
                Preview
              </span>
            </div>

            {draft.isGif && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={draft.seamless}
                  disabled={draft.baking || busy}
                  onChange={(e) => {
                    void applySeamless(draft, e.target.checked)
                  }}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-600"
                />
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium text-zinc-200">
                    Seamless loop (forward + reverse)
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">
                    Rebuilds the GIF in your browser, then you upload the result.
                    Preview updates when you toggle.
                  </span>
                </span>
              </label>
            )}

            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busy || draft.baking}
                onClick={() => void uploadAndAdd()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {user ? 'Upload & add to canvas' : 'Add to canvas (local)'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={clearDraft}
                className="rounded-lg border border-zinc-700 px-2 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Quick URL (no seamless rewrite) */}
        <div className="space-y-1">
          <span className="text-[10px] font-medium uppercase text-zinc-500">
            Or add by URL
          </span>
          <div className="flex gap-1">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://…/image.png"
              className="field-input flex-1 text-[11px]"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => void loadUrlAsDraft()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
          <p className="text-[9px] text-zinc-600">
            URL add skips seamless bake (use file pick for GIF rewrite).
          </p>
        </div>

        {status && (
          <p className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-200">
            {status}
          </p>
        )}
        {error && (
          <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200">
            {error}
          </p>
        )}

        {/* Canvas images */}
        <section className="space-y-1.5 border-t border-zinc-800 pt-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            On this sheet ({canvasImages.length})
          </h3>
          {canvasImages.length === 0 ? (
            <p className="text-[10px] text-zinc-600">No image cards yet.</p>
          ) : (
            <ul className="max-h-36 space-y-1 overflow-y-auto">
              {canvasImages.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-zinc-200 hover:text-white"
                    onClick={() => select(it.id)}
                    title="Select on canvas"
                  >
                    {it.title || 'Image'}
                  </button>
                  <button
                    type="button"
                    title="Remove from sheet"
                    onClick={() => removeItems([it.id])}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Storage library */}
        <section className="space-y-1.5 border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Your Storage images
            </h3>
            <button
              type="button"
              onClick={() => void refreshStored()}
              disabled={!user || storedLoading}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
            >
              {storedLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {!user ? (
            <p className="text-[10px] text-zinc-600">Sign in to list Storage.</p>
          ) : stored.length === 0 ? (
            <p className="text-[10px] text-zinc-600">
              Empty. Upload with preview above.
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {stored.map((entry) => (
                <li
                  key={entry.path}
                  className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1"
                >
                  <img
                    src={entry.url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover bg-zinc-950"
                  />
                  <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-300">
                    {entry.name}
                  </span>
                  <button
                    type="button"
                    title="Add to canvas"
                    onClick={() => addStoredToCanvas(entry)}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-indigo-300"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete from Storage"
                    onClick={() => void deleteStored(entry)}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-600">
          <ImagePlus className="mt-0.5 h-3 w-3 shrink-0" />
          Cloud path: users/&#123;uid&#125;/images/ · Seamless GIFs are rewritten
          in the browser before upload (no CORS at playback).
        </p>
      </div>
    </div>
  )
}
