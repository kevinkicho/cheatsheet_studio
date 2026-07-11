import { useState } from 'react'
import { ImagePlus, Link2, Upload } from 'lucide-react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { createId } from '@/lib/ids'
import { useAuthStore } from '@/stores/authStore'
import { useCanvasStore } from '@/stores/canvasStore'

export function ImportImagePanel() {
  const user = useAuthStore((s) => s.user)
  const addCustomImage = useCanvasStore((s) => s.addCustomImage)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('Custom image')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFromUrl = () => {
    setError(null)
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
      setError('URL must start with https:// or be a data:image URL')
      return
    }
    addCustomImage(trimmed, title.trim() || 'Custom image')
    setUrl('')
  }

  const onFile = async (file: File | null) => {
    if (!file || !user) return
    setBusy(true)
    setError(null)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `users/${user.uid}/images/${createId('img')}.${ext}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file, { contentType: file.type })
      const downloadUrl = await getDownloadURL(storageRef)
      addCustomImage(
        downloadUrl,
        title.trim() || file.name,
        path,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(
        msg.includes('storage') || msg.includes('permission')
          ? 'Upload failed — check Storage rules & that Storage is enabled in Firebase Console.'
          : msg,
      )
      // Fallback: local object URL so the UX still works offline / pre-rules
      try {
        const local = URL.createObjectURL(file)
        addCustomImage(local, title.trim() || file.name)
        setError((prev) =>
          prev
            ? `${prev} Used temporary local preview instead.`
            : 'Used temporary local preview (not persisted).',
        )
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-zinc-500">
        Import an image from a URL or upload a file to Firebase Storage.
      </p>

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
            placeholder="https://…"
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
            {busy ? 'Uploading…' : 'Click to upload image'}
          </span>
          <span className="text-[10px] text-zinc-600">PNG, JPG, SVG · max 10MB</span>
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={busy || !user}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {error && (
        <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          {error}
        </p>
      )}

      <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
        <ImagePlus className="h-3 w-3" />
        Files go to users/&#123;uid&#125;/images/
      </div>
    </div>
  )
}
