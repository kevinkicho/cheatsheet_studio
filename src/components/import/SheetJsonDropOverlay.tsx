import { useCallback, useEffect, useState } from 'react'
import { FileJson2 } from 'lucide-react'

type Props = {
  enabled: boolean
  busy?: boolean
  onFile: (file: File) => void
}

/**
 * Full-window drop target for agent .sheet.json files (Workspace / Sheets).
 * Does not interfere with canvas card DnD (library uses dnd-kit, not files).
 */
export function SheetJsonDropOverlay({ enabled, busy, onFile }: Props) {
  const [active, setActive] = useState(false)
  const [depth, setDepth] = useState(0)

  const reset = useCallback(() => {
    setDepth(0)
    setActive(false)
  }, [])

  useEffect(() => {
    if (!enabled) {
      reset()
      return
    }

    const onDragEnter = (e: globalThis.DragEvent) => {
      if (!e.dataTransfer?.types || !Array.from(e.dataTransfer.types).includes('Files'))
        return
      e.preventDefault()
      setDepth((d) => d + 1)
      setActive(true)
    }
    const onDragLeave = (e: globalThis.DragEvent) => {
      e.preventDefault()
      setDepth((d) => {
        const n = Math.max(0, d - 1)
        if (n === 0) setActive(false)
        return n
      })
    }
    const onDragOver = (e: globalThis.DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: globalThis.DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
      e.preventDefault()
      reset()
      const file = e.dataTransfer?.files?.[0]
      if (file) onFile(file)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [enabled, onFile, reset])

  if (!enabled || !active) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[180] flex items-center justify-center bg-zinc-950/75 p-6 backdrop-blur-sm"
      data-testid="sheet-json-drop-overlay"
      data-depth={depth}
    >
      <div className="pointer-events-none flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-indigo-400/60 bg-zinc-900/90 px-10 py-8 text-center shadow-2xl">
        <FileJson2 className="h-10 w-10 text-indigo-300" />
        <p className="text-base font-semibold text-zinc-50">
          {busy ? 'Importing…' : 'Drop sheet JSON to import'}
        </p>
        <p className="text-xs leading-relaxed text-zinc-400">
          Agent CLI / SDK <code className="text-zinc-300">.sheet.json</code>{' '}
          files open as a new sheet in Workspace.
        </p>
      </div>
    </div>
  )
}
