import { useState } from 'react'
import { ImagePlus, Link2, Upload } from 'lucide-react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { createId } from '@/lib/ids'
import { persistLocalImageFile } from '@/lib/localImageStore'
import { useAuthStore } from '@/stores/authStore'
import { useCanvasStore } from '@/stores/canvasStore'

const MAX_BYTES = 10 * 1024 * 1024

/** Formats accepted for import (including animated GIF). */
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

function isAllowedImage(file: File): boolean {
  if (file.type && ALLOWED_MIME.has(file.type.toLowerCase())) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return (
    ext === 'png' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'gif' ||
    ext === 'webp' ||
    ext === 'svg'
  )
}

function resolveContentType(file: File): string {
  if (file.type && ALLOWED_MIME.has(file.type.toLowerCase())) {
    return file.type.split(';')[0].trim()
  }
  const ext = file.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'gif':
      return 'image/gif'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    default:
      return (file.type || 'image/png').split(';')[0].trim()
  }
}

function resolveExt(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (
    fromName &&
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(fromName)
  ) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  const t = resolveContentType(file)
  if (t.includes('gif')) return 'gif'
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  if (t.includes('svg')) return 'svg'
  return 'jpg'
}

function formatStorageError(e: unknown): string {
  const err = e as { code?: string; message?: string; serverResponse?: string }
  const code = err?.code ?? ''
  const msg = err?.message ?? (e instanceof Error ? e.message : String(e))

  if (code === 'storage/unauthorized' || /permission|unauthorized/i.test(msg)) {
    return (
      'Permission denied. Sign in with Google, then deploy Storage rules: ' +
      '`firebase deploy --only storage`. In Console → Storage → Rules, confirm ' +
      'writes allow authenticated users under users/{uid}/…'
    )
  }
  if (code === 'storage/unauthenticated' || /unauthenticated/i.test(msg)) {
    return 'Not signed in. Sign in with Google, then try the upload again.'
  }
  if (
    code === 'storage/retry-limit-exceeded' ||
    code === 'storage/unknown' ||
    /404|not found|bucket/i.test(msg)
  ) {
    return (
      'Storage bucket unavailable. In Firebase Console → Storage, click Get started ' +
      'if the bucket is not created. Confirm .env VITE_FIREBASE_STORAGE_BUCKET matches ' +
      'Project settings (often project-id.firebasestorage.app or project-id.appspot.com).'
    )
  }
  if (code === 'storage/canceled') {
    return 'Upload canceled.'
  }
  if (code === 'storage/quota-exceeded') {
    return 'Storage quota exceeded for this project.'
  }
  if (/cors|network|failed to fetch/i.test(msg)) {
    return (
      'Network/CORS error talking to Storage. Check internet, ad-blockers, and that ' +
      'the Storage API is enabled for this Google Cloud project.'
    )
  }
  // Surface raw code so support/debug is easier
  return code ? `${msg} (${code})` : msg
}

export function ImportImagePanel() {
  const user = useAuthStore((s) => s.user)
  const addCustomImage = useCanvasStore((s) => s.addCustomImage)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('Custom image')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okNote, setOkNote] = useState<string | null>(null)

  const addFromUrl = () => {
    setError(null)
    setOkNote(null)
    const trimmed = url.trim()
    if (!trimmed) {
      setError('Enter an image URL')
      return
    }
    if (
      !trimmed.startsWith('https://') &&
      !trimmed.startsWith('http://') &&
      !trimmed.startsWith('data:image/')
    ) {
      setError(
        'URL must start with https:// or be a data:image URL (including data:image/gif)',
      )
      return
    }
    addCustomImage(trimmed, title.trim() || 'Custom image')
    setUrl('')
    setOkNote('Image added from URL.')
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    setError(null)
    setOkNote(null)

    if (!isAllowedImage(file)) {
      setError('Unsupported type. Use PNG, JPG, GIF, WebP, or SVG.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('File too large (max 10 MB).')
      return
    }

    const label = title.trim() || file.name
    const contentType = resolveContentType(file)

    /**
     * Never use URL.createObjectURL alone on the card — blob: links die on
     * refresh. Prefer Firebase Storage when signed in; otherwise persist
     * bytes in IndexedDB as local-asset: (or data URL fallback).
     */
    const addLocalPersistent = async (note: string, asError = false) => {
      const { url, via } = await persistLocalImageFile(file, file.name)
      addCustomImage(url, label)
      const where =
        via === 'idb'
          ? 'saved in this browser (survives refresh)'
          : 'embedded as data URL (survives refresh; large files may not cloud-save)'
      if (asError) setError(`${note} Image ${where}.`)
      else setOkNote(`${note} Image ${where}.`)
    }

    if (!user) {
      setBusy(true)
      try {
        await addLocalPersistent(
          'Not signed in — skipped Firebase Storage.',
          true,
        )
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'Could not store image locally. Try again or sign in.',
        )
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      const ext = resolveExt(file)
      // Path must match storage.rules: users/{uid}/**
      const path = `users/${user.uid}/images/${createId('img')}.${ext}`
      const storageRef = ref(storage, path)

      console.info('[storage] upload start', {
        path,
        contentType,
        size: file.size,
        uid: user.uid,
        bucket: storage.app.options.storageBucket,
      })

      await uploadBytes(storageRef, file, {
        contentType,
        customMetadata: {
          originalName: file.name.slice(0, 200),
        },
      })
      const downloadUrl = await getDownloadURL(storageRef)
      addCustomImage(downloadUrl, label, path)
      setOkNote('Uploaded to Firebase Storage (persists across devices).')
      console.info('[storage] upload ok', downloadUrl.slice(0, 80))
    } catch (e) {
      console.error('[storage] upload failed', e)
      const friendly = formatStorageError(e)
      try {
        await addLocalPersistent(friendly, true)
      } catch {
        setError(`${friendly} — and local save also failed.`)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-zinc-500">
        Import a still image or{' '}
        <strong className="text-zinc-400">animated GIF</strong> from a URL or
        upload a file to Firebase Storage.
      </p>

      {!user && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
          Not signed in. Files are kept in this browser (survive refresh). Sign
          in to upload to Firebase Storage for cloud sheets / other devices.
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
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase text-zinc-500">
          Image URL
        </span>
        <div className="flex gap-1">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/animation.gif"
            className="field-input flex-1 text-[11px]"
          />
          <button
            type="button"
            onClick={addFromUrl}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            <Link2 className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      </label>

      <div className="relative">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-3 py-6 text-center hover:border-indigo-500/50">
          <Upload className="h-5 w-5 text-indigo-400" />
          <span className="text-xs text-zinc-300">
            {busy ? 'Uploading…' : 'Click to upload image / GIF'}
          </span>
          <span className="text-[10px] text-zinc-600">
            PNG, JPG, <span className="text-zinc-400">GIF</span>, WebP, SVG · max
            10 MB
          </span>
          <input
            type="file"
            accept={ACCEPT}
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={busy}
            onChange={(e) => {
              void onFile(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {okNote && (
        <p className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-200">
          {okNote}
        </p>
      )}

      {error && (
        <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200">
          {error}
        </p>
      )}

      <div className="space-y-1 text-[10px] leading-relaxed text-zinc-600">
        <div className="flex items-center gap-1.5">
          <ImagePlus className="h-3 w-3 shrink-0" />
          Cloud path: users/&#123;uid&#125;/images/ · GIFs stay animated
        </div>
        <p>
          Never uses temporary blob: links (those break after refresh). Local
          files use IndexedDB; signed-in uploads use Storage.
        </p>
        <p>
          If upload fails: (1) Sign in · (2) Console → Storage → Get started ·
          (3) <code className="text-zinc-500">firebase deploy --only storage</code>
        </p>
      </div>
    </div>
  )
}
