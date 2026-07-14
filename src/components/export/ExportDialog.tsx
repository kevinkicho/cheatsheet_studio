import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckSquare,
  FileCode2,
  FileDown,
  FileImage,
  FileType2,
  Grid3x3,
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
  EXPORT_ARRANGEMENTS,
  EXPORT_BACKGROUND_MODES,
  EXPORT_COLOR_MODES,
  EXPORT_FORMATS,
  EXPORT_PACKAGE_MODES,
  exportColorModeMeta,
  type ExportBackgroundMode,
  type ExportColorMode,
  type ExportFormat,
  type ExportPackageMode,
  type ExportPageArrangement,
} from '@/lib/exportFormats'
import { PdfExportPages, type ExportPageModel } from '@/components/export/PdfExportPages'
import {
  runSheetExport,
  type SheetExportProgress,
} from '@/lib/runSheetExport'
import { buildExportFileNameStem } from '@/lib/autoOrganize'
import type { AutoLayoutExportSnapshot } from '@/lib/autoOrganize'

const FORMAT_ICONS: Record<ExportFormat, typeof FileDown> = {
  pdf: FileType2,
  svg: FileCode2,
  png: Image,
  jpeg: FileImage,
}

export type ExportDialogProps = {
  open: boolean
  onClose: () => void
  canvas: SheetCanvas
  items: CanvasItem[]
  title: string
  /** Last Auto-layout snapshot — tags default download name. */
  lastAutoLayout?: AutoLayoutExportSnapshot | null
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
  lastAutoLayout = null,
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
  const [showGrid, setShowGrid] = useState(false)
  const [backgroundMode, setBackgroundMode] =
    useState<ExportBackgroundMode>('transparent')
  const [pageArrangement, setPageArrangement] =
    useState<ExportPageArrangement>('vertical')
  const [packageMode, setPackageMode] =
    useState<ExportPackageMode>('combined')
  /** Download basename without extension (browser may append “ (n)” if exists). */
  const [fileName, setFileName] = useState(title)

  // Reset selection + defaults when dialog opens or page count changes
  useEffect(() => {
    if (!open) return
    setSelected(new Set(pages.map((p) => p.index)))
    setFormat('pdf')
    setColorMode('color')
    setShowGrid(false)
    setBackgroundMode('transparent')
    setPageArrangement('vertical')
    setPackageMode('combined')
    setFileName(buildExportFileNameStem(title || 'cheatsheet', lastAutoLayout))
  }, [open, pages, title, lastAutoLayout])

  // SVG opens in browsers as white paper if transparent — prefer board color
  useEffect(() => {
    if (!open) return
    if (format === 'svg' && backgroundMode === 'transparent') {
      setBackgroundMode('asShown')
    }
  }, [format, open, backgroundMode])

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

  const multiPage = selectedPages.length > 1

  const previewCanvas = useMemo((): SheetCanvas => {
    return {
      ...canvas,
      showGrid,
      background:
        backgroundMode === 'transparent'
          ? 'transparent'
          : canvas.background || '#0f1115',
    }
  }, [canvas, showGrid, backgroundMode])

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
    if (
      multiPage &&
      packageMode === 'combined' &&
      pageArrangement === 'asSheet'
    ) {
      const minX = Math.min(...selectedPages.map((p) => p.rect.x))
      const maxX = Math.max(
        ...selectedPages.map((p) => p.rect.x + p.rect.width),
      )
      const boardW = Math.max(1, maxX - minX)
      return Math.min(0.35, PREVIEW_FRAME_W / boardW)
    }
    const w = selectedPages[0]?.rect.width ?? 816
    return Math.min(0.4, PREVIEW_FRAME_W / w)
  }, [selectedPages, multiPage, packageMode, pageArrangement])

  const asSheetLayout = useMemo(() => {
    if (selectedPages.length === 0) return null
    const minX = Math.min(...selectedPages.map((p) => p.rect.x))
    const minY = Math.min(...selectedPages.map((p) => p.rect.y))
    const maxX = Math.max(
      ...selectedPages.map((p) => p.rect.x + p.rect.width),
    )
    const maxY = Math.max(
      ...selectedPages.map((p) => p.rect.y + p.rect.height),
    )
    return {
      minX,
      minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    }
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
      {
        format,
        colorMode,
        pageIndices,
        showGrid,
        backgroundMode,
        pageArrangement,
        packageMode,
        fileName: fileName.trim() || title || 'cheatsheet',
      },
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

  const previewBg =
    backgroundMode === 'transparent'
      ? 'transparent'
      : canvas.background || '#0f1115'

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
            style={
              backgroundMode === 'transparent'
                ? {
                    backgroundImage:
                      'linear-gradient(45deg,#3f3f46 25%,transparent 25%),linear-gradient(-45deg,#3f3f46 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3f3f46 75%),linear-gradient(-45deg,transparent 75%,#3f3f46 75%)',
                    backgroundSize: '12px 12px',
                    backgroundPosition: '0 0,0 6px,6px -6px,-6px 0',
                    backgroundColor: '#27272a',
                  }
                : undefined
            }
          >
            {selectedPages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Select at least one page to preview.
              </div>
            ) : multiPage &&
              packageMode === 'combined' &&
              pageArrangement === 'asSheet' &&
              asSheetLayout ? (
              <div className="mx-auto flex w-full max-w-[320px] flex-col items-center gap-1.5 pb-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Sheet layout · {selectedPages.length} pages
                </span>
                <div
                  className="relative overflow-hidden rounded-sm shadow-lg ring-1 ring-zinc-600/60"
                  style={{
                    width: asSheetLayout.width * previewScale,
                    height: asSheetLayout.height * previewScale,
                    background: previewBg,
                    filter:
                      previewFilter === 'none' ? undefined : previewFilter,
                  }}
                >
                  {selectedPages.map((p, i) => {
                    const model = previewModels[i]!
                    const left =
                      (p.rect.x - asSheetLayout.minX) * previewScale
                    const top =
                      (p.rect.y - asSheetLayout.minY) * previewScale
                    return (
                      <div
                        key={p.index}
                        className="absolute overflow-hidden"
                        style={{
                          left,
                          top,
                          width: p.rect.width * previewScale,
                          height: p.rect.height * previewScale,
                        }}
                        data-testid={`export-preview-page-${p.index + 1}`}
                      >
                        <div
                          style={{
                            width: p.rect.width,
                            height: p.rect.height,
                            transform: `scale(${previewScale})`,
                            transformOrigin: 'top left',
                          }}
                        >
                          <PdfExportPages
                            pages={[model]}
                            canvas={previewCanvas}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div
                className={`mx-auto flex w-full max-w-[320px] flex-col items-center pb-2 ${
                  multiPage && packageMode === 'combined'
                    ? 'gap-0'
                    : 'gap-5'
                }`}
              >
                {selectedPages.map((p, i) => {
                  const model = previewModels[i]!
                  const frameW = p.rect.width * previewScale
                  const frameH = p.rect.height * previewScale
                  const stackVertical =
                    multiPage &&
                    packageMode === 'combined' &&
                    pageArrangement === 'vertical'
                  return (
                    <div
                      key={p.index}
                      className={`flex w-full flex-col items-center ${
                        stackVertical ? 'gap-0' : 'gap-1.5'
                      }`}
                      data-testid={`export-preview-page-${p.index + 1}`}
                    >
                      {!stackVertical && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          Page {p.index + 1}
                          {p.cardCount === 0
                            ? ' · empty'
                            : ` · ${p.cardCount} card${p.cardCount === 1 ? '' : 's'}`}
                        </span>
                      )}
                      <div
                        className={`overflow-hidden shadow-lg ring-1 ring-zinc-600/60 ${
                          stackVertical ? 'rounded-none' : 'rounded-sm'
                        } ${
                          stackVertical && i === 0 ? 'rounded-t-sm' : ''
                        } ${
                          stackVertical && i === selectedPages.length - 1
                            ? 'rounded-b-sm'
                            : ''
                        }`}
                        style={{
                          width: frameW,
                          height: frameH,
                          background: previewBg,
                          filter:
                            previewFilter === 'none'
                              ? undefined
                              : previewFilter,
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
                          <PdfExportPages
                            pages={[model]}
                            canvas={previewCanvas}
                          />
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
              {/* File name — top of options for quick edit before format */}
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  File name
                </legend>
                <label className="block">
                  <span className="sr-only">Export file name</span>
                  <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 focus-within:border-indigo-500/50">
                    <input
                      type="text"
                      data-testid="export-file-name"
                      value={fileName}
                      disabled={busy}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder={title || 'cheatsheet'}
                      className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
                      spellCheck={false}
                    />
                    <span className="shrink-0 text-[10px] text-zinc-500">
                      .{format === 'jpeg' ? 'jpg' : format}
                    </span>
                  </div>
                  <span className="mt-1 block text-[10px] leading-snug text-zinc-600">
                    {lastAutoLayout
                      ? 'Default includes Auto-layout tags (density, panels, n-gon, levels, sort, gap) so shared files show how they were packed.'
                      : 'Downloads use this name. Apply Auto-layout first to auto-tag pack settings in the filename.'}
                    {' '}
                    If the file already exists, the browser usually adds “ (1)”,
                    “ (2)”, …
                  </span>
                </label>
              </fieldset>

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

              {/* Grid */}
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Grid
                </legend>
                <button
                  type="button"
                  data-testid="export-opt-show-grid"
                  disabled={busy}
                  aria-pressed={showGrid}
                  onClick={() => setShowGrid((v) => !v)}
                  className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                    showGrid
                      ? 'border-indigo-500/60 bg-indigo-500/15'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                  }`}
                >
                  <Grid3x3
                    className={`h-3.5 w-3.5 shrink-0 ${showGrid ? 'text-indigo-300' : 'text-zinc-500'}`}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-xs font-medium ${showGrid ? 'text-indigo-100' : 'text-zinc-200'}`}
                    >
                      {showGrid ? 'Show grid' : 'Hide grid'}
                    </span>
                    <span className="block text-[10px] text-zinc-500">
                      {showGrid
                        ? 'Grid lines included in export'
                        : 'No grid lines in export (default)'}
                    </span>
                  </span>
                </button>
              </fieldset>

              {/* Background */}
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Background
                </legend>
                <div className="flex flex-col gap-1">
                  {EXPORT_BACKGROUND_MODES.map((m) => {
                    const active = backgroundMode === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        data-testid={`export-opt-bg-${m.id}`}
                        disabled={busy}
                        onClick={() => setBackgroundMode(m.id)}
                        className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                          active
                            ? 'border-indigo-500/60 bg-indigo-500/15'
                            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                        }`}
                      >
                        <BgSwatch mode={m.id} active={active} boardBg={canvas.background} />
                        <span className="min-w-0">
                          <span
                            className={`block text-xs font-medium ${active ? 'text-indigo-100' : 'text-zinc-200'}`}
                          >
                            {m.label}
                          </span>
                          <span className="block text-[10px] text-zinc-500">
                            {m.id === 'transparent' && format === 'jpeg'
                              ? 'JPEG has no alpha — falls back to dark board'
                              : m.description}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* Package mode — files */}
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Files
                </legend>
                <div className="flex flex-col gap-1">
                  {EXPORT_PACKAGE_MODES.map((m) => {
                    const active = packageMode === m.id
                    const disabledSingle =
                      !multiPage && m.id === 'separate'
                    return (
                      <button
                        key={m.id}
                        type="button"
                        data-testid={`export-opt-package-${m.id}`}
                        disabled={busy || disabledSingle}
                        onClick={() => setPackageMode(m.id)}
                        className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                          active
                            ? 'border-indigo-500/60 bg-indigo-500/15'
                            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
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

              {/* Page arrangement — only when multi-page + combined raster/preview */}
              {multiPage && packageMode === 'combined' && (
                <fieldset className="min-w-0">
                  <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Page layout
                  </legend>
                  <div className="flex flex-col gap-1">
                    {EXPORT_ARRANGEMENTS.map((m) => {
                      const active = pageArrangement === m.id
                      const pdfNote =
                        format === 'pdf' && m.id === 'asSheet'
                          ? 'PDF is always one page per frame; layout applies to PNG/JPEG stitch'
                          : m.description
                      return (
                        <button
                          key={m.id}
                          type="button"
                          data-testid={`export-opt-arrange-${m.id}`}
                          disabled={busy}
                          onClick={() => setPageArrangement(m.id)}
                          className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                            active
                              ? 'border-indigo-500/60 bg-indigo-500/15'
                              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                          }`}
                        >
                          <span className="min-w-0">
                            <span
                              className={`block text-xs font-medium ${active ? 'text-indigo-100' : 'text-zinc-200'}`}
                            >
                              {m.label}
                            </span>
                            <span className="block text-[10px] text-zinc-500">
                              {pdfNote}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )}

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

              <p
                className="rounded-md border border-zinc-800/80 bg-zinc-900/50 px-2.5 py-2 text-[10px] leading-snug text-zinc-500"
                data-testid="export-parity-note"
              >
                <span className="font-medium text-zinc-400">Studio PDF</span> =
                WYSIWYG print-page capture (this dialog).{' '}
                <span className="font-medium text-zinc-400">CLI export-pdf</span>{' '}
                = clean agent print layout — not pixel-identical. Prefer Studio
                after Import when fidelity matters; use CLI for automation.
              </p>
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

function BgSwatch({
  mode,
  active,
  boardBg,
}: {
  mode: ExportBackgroundMode
  active: boolean
  boardBg?: string
}) {
  if (mode === 'transparent') {
    return (
      <span
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-sm ring-1 ${active ? 'ring-indigo-400' : 'ring-zinc-600'}`}
        style={{
          backgroundImage:
            'linear-gradient(45deg,#71717a 25%,transparent 25%),linear-gradient(-45deg,#71717a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#71717a 75%),linear-gradient(-45deg,transparent 75%,#71717a 75%)',
          backgroundSize: '6px 6px',
          backgroundPosition: '0 0,0 3px,3px -3px,-3px 0',
          backgroundColor: '#3f3f46',
        }}
        aria-hidden
      />
    )
  }
  return (
    <span
      className={`mt-0.5 h-4 w-4 shrink-0 rounded-sm ring-1 ${active ? 'ring-indigo-400' : 'ring-zinc-600'}`}
      style={{ background: boardBg || '#0f1115' }}
      aria-hidden
    />
  )
}
