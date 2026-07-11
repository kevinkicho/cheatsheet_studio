import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckSquare,
  FileDown,
  FileImage,
  FileType2,
  Image,
  Square,
  X,
} from 'lucide-react'
import type { CanvasItem, SheetCanvas } from '@/types'
import {
  getExportPageRects,
  itemsForPage,
  type PageRect,
} from '@/lib/exportPdf'
import {
  EXPORT_COLOR_MODES,
  EXPORT_FORMATS,
  exportColorModeMeta,
  type ExportColorMode,
  type ExportFormat,
} from '@/lib/exportFormats'
import { PdfExportPages, type ExportPageModel } from '@/components/export/PdfExportPages'
import {
  runSheetExport,
  type SheetExportProgress,
} from '@/lib/runSheetExport'

const FORMAT_ICONS: Record<ExportFormat, typeof FileDown> = {
  pdf: FileType2,
  png: Image,
  jpeg: FileImage,
}

export type ExportDialogProps = {
  open: boolean
  onClose: () => void
  canvas: SheetCanvas
  items: CanvasItem[]
  title: string
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onProgress?: (p: SheetExportProgress) => void
  onError?: (message: string) => void
}

type PageInfo = {
  index: number
  rect: PageRect
  cardCount: number
}

export function ExportDialog({
  open,
  onClose,
  canvas,
  items,
  title,
  busy,
  onBusyChange,
  onProgress,
  onError,
}: ExportDialogProps) {
  const pages = useMemo((): PageInfo[] => {
    const rects = getExportPageRects(canvas)
    return rects.map((rect, index) => ({
      index,
      rect,
      cardCount: itemsForPage(items, rect).length,
    }))
  }, [canvas, items])

  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [colorMode, setColorMode] = useState<ExportColorMode>('color')
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  // Reset selection when dialog opens or page count changes
  useEffect(() => {
    if (!open) return
    setSelected(new Set(pages.map((p) => p.index)))
    setFormat('pdf')
    setColorMode('color')
  }, [open, pages])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  // Prevent background scroll while modal is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const selectedPages = useMemo(
    () => pages.filter((p) => selected.has(p.index)),
    [pages, selected],
  )

  const previewModels: ExportPageModel[] = useMemo(
    () =>
      selectedPages.map((p) => ({
        page: p.rect,
        items: itemsForPage(items, p.rect),
      })),
    [selectedPages, items],
  )

  const previewFilter = exportColorModeMeta(colorMode).previewFilter
  const allSelected = pages.length > 0 && selected.size === pages.length
  const noneSelected = selected.size === 0
  const totalCards = useMemo(() => {
    const ids = new Set<string>()
    for (const m of previewModels) {
      for (const it of m.items) ids.add(it.id)
    }
    return ids.size
  }, [previewModels])

  // Fixed preview width inside the modal scroll pane
  const PREVIEW_FRAME_W = 300
  const previewScale = useMemo(() => {
    const w = selectedPages[0]?.rect.width ?? 816
    return Math.min(0.4, PREVIEW_FRAME_W / w)
  }, [selectedPages])

  const togglePage = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(pages.map((p) => p.index)))
  const selectNone = () => setSelected(new Set())

  const handleExport = () => {
    if (noneSelected || busy) return
    onBusyChange(true)
    const pageIndices = Array.from(selected).sort((a, b) => a - b)
    void runSheetExport(
      canvas,
      items,
      title,
      { format, colorMode, pageIndices },
      onProgress,
    )
      .catch((err) => {
        console.error('[export]', err)
        onError?.(err instanceof Error ? err.message : 'Export failed')
      })
      .finally(() => {
        onBusyChange(false)
      })
  }

  if (!open) return null

  // Portal to body — TopBar uses backdrop-blur, which creates a containing
  // block and would pin `position:fixed` to the 48px header (overflow/cutoff).
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      data-testid="export-dialog"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close export dialog"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose()
        }}
      />

      {/* Fixed shell: content scrolls inside, modal size does not grow */}
      <div
        className="relative flex h-[min(640px,calc(100vh-1.5rem))] w-[min(920px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl sm:flex-row"
        data-testid="export-dialog-shell"
      >
        {/* Preview column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-zinc-800 sm:border-b-0 sm:border-r">
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-4">
            <div className="min-w-0">
              <h2
                id="export-dialog-title"
                className="truncate text-sm font-semibold text-zinc-100"
              >
                Export preview
              </h2>
              <p className="truncate text-[11px] text-zinc-500">
                {selected.size === 0
                  ? 'No pages selected'
                  : `${selected.size} page${selected.size === 1 ? '' : 's'} · ${totalCards} card${totalCards === 1 ? '' : 's'}`}
                {' · '}
                scroll to review
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 sm:hidden"
              onClick={() => !busy && onClose()}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-zinc-900/80 p-4"
            data-testid="export-preview-scroll"
          >
            {selectedPages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Select at least one page to preview.
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-[320px] flex-col items-center gap-5 pb-2">
                {selectedPages.map((p, i) => {
                  const model = previewModels[i]!
                  const frameW = p.rect.width * previewScale
                  const frameH = p.rect.height * previewScale
                  return (
                    <div
                      key={p.index}
                      className="flex w-full flex-col items-center gap-1.5"
                      data-testid={`export-preview-page-${p.index + 1}`}
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                        Page {p.index + 1}
                        {p.cardCount === 0
                          ? ' · empty'
                          : ` · ${p.cardCount} card${p.cardCount === 1 ? '' : 's'}`}
                      </span>
                      <div
                        className="overflow-hidden rounded-sm bg-white shadow-lg ring-1 ring-zinc-600/60"
                        style={{
                          width: frameW,
                          height: frameH,
                          filter:
                            previewFilter === 'none' ? undefined : previewFilter,
                        }}
                      >
                        <div
                          style={{
                            width: p.rect.width,
                            height: p.rect.height,
                            transform: `scale(${previewScale})`,
                            transformOrigin: 'top left',
                          }}
                        >
                          <PdfExportPages pages={[model]} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Options column — fixed width, own vertical scroll */}
        <div className="flex h-[42%] min-h-0 w-full shrink-0 flex-col sm:h-full sm:w-[300px]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
            <span className="text-sm font-semibold text-zinc-100">Options</span>
            <button
              type="button"
              className="hidden rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 sm:inline-flex"
              onClick={() => !busy && onClose()}
              aria-label="Close"
              disabled={busy}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-3">
            <div className="flex flex-col gap-4">
              {/* Format */}
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Format
                </legend>
                <div className="grid grid-cols-3 gap-1.5">
                  {EXPORT_FORMATS.map((f) => {
                    const Icon = FORMAT_ICONS[f.id]
                    const active = format === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        data-testid={`export-opt-format-${f.id}`}
                        disabled={busy}
                        onClick={() => setFormat(f.id)}
                        className={`flex flex-col items-center gap-1 rounded-md border px-1.5 py-2 text-center transition ${
                          active
                            ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-100'
                            : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                        title={f.description}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-medium">{f.label}</span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* Color mode */}
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Color
                </legend>
                <div className="flex flex-col gap-1">
                  {EXPORT_COLOR_MODES.map((m) => {
                    const active = colorMode === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        data-testid={`export-opt-color-${m.id}`}
                        disabled={busy}
                        onClick={() => setColorMode(m.id)}
                        className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                          active
                            ? 'border-indigo-500/60 bg-indigo-500/15'
                            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                        }`}
                      >
                        <ColorSwatch mode={m.id} active={active} />
                        <span className="min-w-0">
                          <span
                            className={`block text-xs font-medium ${active ? 'text-indigo-100' : 'text-zinc-200'}`}
                          >
                            {m.label}
                          </span>
                          <span className="block text-[10px] text-zinc-500">
                            {m.description}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* Pages */}
              <fieldset className="flex min-h-0 min-w-0 flex-col">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <legend className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Pages
                  </legend>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={busy || allSelected}
                      onClick={selectAll}
                      className="rounded px-1.5 py-0.5 text-[10px] text-indigo-300 hover:bg-zinc-900 disabled:opacity-40"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      disabled={busy || noneSelected}
                      onClick={selectNone}
                      className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-900 disabled:opacity-40"
                    >
                      None
                    </button>
                  </div>
                </div>
                <ul className="max-h-44 space-y-0.5 overflow-y-auto overscroll-contain rounded-md border border-zinc-800 bg-zinc-900/30 p-1">
                  {pages.map((p) => {
                    const on = selected.has(p.index)
                    return (
                      <li key={p.index}>
                        <button
                          type="button"
                          data-testid={`export-opt-page-${p.index + 1}`}
                          disabled={busy}
                          onClick={() => togglePage(p.index)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                            on
                              ? 'bg-indigo-500/10 text-zinc-100'
                              : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                          }`}
                        >
                          {on ? (
                            <CheckSquare className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
                          ) : (
                            <Square className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                          )}
                          <span className="flex-1">Page {p.index + 1}</span>
                          <span className="text-[10px] text-zinc-500">
                            {p.cardCount === 0
                              ? 'empty'
                              : `${p.cardCount} card${p.cardCount === 1 ? '' : 's'}`}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
                  Only cards on the dashed print frames are included. Empty
                  pages export as blank paper.
                </p>
              </fieldset>
            </div>
          </div>

          <div className="flex h-[52px] shrink-0 items-center gap-2 border-t border-zinc-800 px-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => !busy && onClose()}
              className="flex-1 rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="export-dialog-confirm"
              disabled={busy || noneSelected}
              onClick={handleExport}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-indigo-500/50 bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FileDown
                className={`h-3.5 w-3.5 ${busy ? 'animate-pulse' : ''}`}
              />
              {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ColorSwatch({
  mode,
  active,
}: {
  mode: ExportColorMode
  active: boolean
}) {
  if (mode === 'color') {
    return (
      <span
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-sm bg-gradient-to-br from-rose-400 via-amber-300 to-sky-400 ring-1 ${active ? 'ring-indigo-400' : 'ring-zinc-600'}`}
        aria-hidden
      />
    )
  }
  if (mode === 'greyscale') {
    return (
      <span
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-sm bg-gradient-to-r from-zinc-800 via-zinc-400 to-zinc-100 ring-1 ${active ? 'ring-indigo-400' : 'ring-zinc-600'}`}
        aria-hidden
      />
    )
  }
  return (
    <span
      className={`mt-0.5 h-4 w-4 shrink-0 rounded-sm bg-[repeating-linear-gradient(90deg,#000_0_50%,#fff_50%_100%)] ring-1 ${active ? 'ring-indigo-400' : 'ring-zinc-600'}`}
      aria-hidden
    />
  )
}
