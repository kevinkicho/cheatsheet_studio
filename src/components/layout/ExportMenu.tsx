import { useState } from 'react'
import { FileDown, Settings2 } from 'lucide-react'
import { useCanvasStore } from '@/stores/canvasStore'
import { ExportDialog } from '@/components/export/ExportDialog'
import type { SheetExportProgress } from '@/lib/runSheetExport'

export type ExportStatusKind = 'info' | 'ok' | 'err'

type Props = {
  busy: boolean
  setBusy: (v: boolean) => void
  setStatus: (msg: string | null) => void
  setStatusKind: (k: ExportStatusKind) => void
}

/**
 * Top-bar export control: opens a dialog with preview, page select,
 * format, and color mode. Primary button opens the full export UI.
 */
export function ExportMenu({
  busy,
  setBusy,
  setStatus,
  setStatusKind,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const canvas = useCanvasStore((s) => s.canvas)
  const items = useCanvasStore((s) => s.items)
  const title = useCanvasStore((s) => s.title)
  const lastAutoLayout = useCanvasStore((s) => s.lastAutoLayout)

  const openDialog = () => {
    setDialogOpen(true)
  }

  const onProgress = (p: SheetExportProgress) => {
    if (p.message) setStatus(p.message)
    if (p.phase === 'done') {
      setStatus(p.message ?? 'Export saved — check Downloads')
      setStatusKind('ok')
      setDialogOpen(false)
      window.setTimeout(() => {
        setStatus(null)
        setStatusKind('info')
      }, 7000)
    }
    if (p.phase === 'error') {
      setStatus(p.message ?? 'Export failed')
      setStatusKind('err')
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          title="Export"
          aria-label="Open export dialog"
          disabled={busy}
          data-testid="export-pdf"
          onClick={openDialog}
          className="inline-flex items-center gap-1 rounded-l-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-100 hover:border-indigo-400 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FileDown
            className={`h-3.5 w-3.5 ${busy ? 'animate-pulse' : ''}`}
          />
          <span>{busy ? 'Exporting…' : 'Export'}</span>
        </button>
        <button
          type="button"
          title="Export options"
          aria-label="Open export options"
          disabled={busy}
          data-testid="export-menu-toggle"
          onClick={openDialog}
          className="inline-flex items-center rounded-r-md border border-l-0 border-indigo-500/40 bg-indigo-500/10 px-1.5 py-1 text-indigo-100 hover:border-indigo-400 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <ExportDialog
        open={dialogOpen}
        onClose={() => {
          if (!busy) setDialogOpen(false)
        }}
        canvas={canvas}
        items={items}
        title={title}
        lastAutoLayout={lastAutoLayout}
        busy={busy}
        onBusyChange={(v) => {
          setBusy(v)
          if (v) {
            setStatus('Preparing export…')
            setStatusKind('info')
          }
        }}
        onProgress={onProgress}
        onError={(message) => {
          setStatus(message)
          setStatusKind('err')
          window.setTimeout(() => {
            setStatus(null)
            setStatusKind('info')
          }, 8000)
        }}
      />
    </>
  )
}
