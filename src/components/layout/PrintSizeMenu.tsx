import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronDown,
  Columns3,
  Eye,
  EyeOff,
  LayoutGrid,
  Move,
  Printer,
  RotateCw,
  Rows3,
} from 'lucide-react'
import {
  formatPageSizeLabel,
  normalizePrintPageLayout,
  PRINT_SIZE_PRESETS,
  type PrintPageLayout,
  type PrintSizeId,
} from '@/lib/printSizes'
import { DEFAULT_MARGINS } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'

const INCH = 96 // px @ 96dpi
const PRESET_INCHES = [0.25, 0.5, 0.75, 1] as const

const LAYOUT_OPTIONS: {
  id: PrintPageLayout
  label: string
  hint: string
  icon: typeof Rows3
}[] = [
  {
    id: 'vertical',
    label: 'Vertical',
    hint: 'Stack pages top → bottom',
    icon: Rows3,
  },
  {
    id: 'horizontal',
    label: 'Horizontal',
    hint: 'Place pages left → right',
    icon: Columns3,
  },
  {
    id: 'grid',
    label: 'Grid',
    hint: 'Near-square multi-column grid',
    icon: LayoutGrid,
  },
  {
    id: 'free',
    label: 'Drag & place',
    hint: 'Drag each page frame freely',
    icon: Move,
  },
]

export function PrintSizeMenu() {
  const canvas = useCanvasStore((s) => s.canvas)
  const setPrintSize = useCanvasStore((s) => s.setPrintSize)
  const setOrientation = useCanvasStore((s) => s.setOrientation)
  const toggleShowPrintArea = useCanvasStore((s) => s.toggleShowPrintArea)
  const setShowPrintArea = useCanvasStore((s) => s.setShowPrintArea)
  const setMargins = useCanvasStore((s) => s.setMargins)
  const setUniformMargin = useCanvasStore((s) => s.setUniformMargin)
  const setPrintPageCount = useCanvasStore((s) => s.setPrintPageCount)
  const setPrintPageLayout = useCanvasStore((s) => s.setPrintPageLayout)
  const [open, setOpen] = useState(false)
  const [pageCountDraft, setPageCountDraft] = useState('1')
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  const printSizeId = (canvas.printSizeId ?? 'letter') as PrintSizeId
  const orientation = canvas.orientation ?? 'portrait'
  const showPrintArea = canvas.showPrintArea !== false
  const printPageCount = Math.max(1, Math.min(20, canvas.printPageCount ?? 1))
  const printPageLayout = normalizePrintPageLayout(canvas.printPageLayout)
  const sizeLabel = formatPageSizeLabel(printSizeId, orientation)
  const margins = { ...DEFAULT_MARGINS, ...canvas.margins }

  useEffect(() => {
    setPageCountDraft(String(printPageCount))
  }, [printPageCount])
  const uniform =
    margins.top === margins.right &&
    margins.right === margins.bottom &&
    margins.bottom === margins.left

  const updatePosition = () => {
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    const menuWidth = 288
    const padding = 8
    let left = rect.left
    if (left + menuWidth > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - menuWidth - padding)
    }
    setMenuPos({ top: rect.bottom + 4, left })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onReposition = () => updatePosition()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Print page size"
          className="fixed z-[9999] w-72 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <div className="border-b border-zinc-800 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Print area
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Show or hide the page frame. Workspace & cards stay put — zoom
              unchanged. Grid covers the full free board when off.
            </p>
          </div>

          <button
            type="button"
            onClick={() => toggleShowPrintArea()}
            className={`flex w-full items-center gap-2 border-b border-zinc-800 px-3 py-2.5 text-left text-xs transition ${
              showPrintArea
                ? 'bg-indigo-500/10 text-indigo-100'
                : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            {showPrintArea ? (
              <Eye className="h-4 w-4 shrink-0 text-indigo-400" />
            ) : (
              <EyeOff className="h-4 w-4 shrink-0 text-zinc-500" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {showPrintArea ? 'Print frame visible' : 'Print frame hidden'}
              </span>
              <span className="block text-[10px] text-zinc-500">
                {showPrintArea
                  ? 'Letter/A4 frame + margins on free workspace'
                  : 'Frame hidden — cards & grid remain'}
              </span>
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                showPrintArea
                  ? 'bg-indigo-500/20 text-indigo-200'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {showPrintArea ? 'ON' : 'OFF'}
            </span>
          </button>

          <div className="border-b border-zinc-800 px-3 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              Page size
            </p>
          </div>

          <ul className="max-h-56 overflow-y-auto py-1">
            {PRINT_SIZE_PRESETS.map((preset) => {
              const active = printSizeId === preset.id
              return (
                <li key={preset.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintSize(preset.id, orientation)
                      setOpen(false)
                    }}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left transition ${
                      active
                        ? 'bg-indigo-500/15 text-indigo-100'
                        : 'text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    <span className="mt-0.5 w-4 shrink-0">
                      {active && (
                        <Check className="h-3.5 w-3.5 text-indigo-400" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium">{preset.label}</span>
                        <span className="shrink-0 text-[10px] text-zinc-500">
                          {preset.physical}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[10px] text-zinc-500">
                        {preset.description}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="border-t border-zinc-800 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Pages
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">
              Multiple page frames on the board so you can layout a multi-page
              cheat sheet at once (1–20).
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                title="Fewer pages"
                disabled={printPageCount <= 1}
                onClick={() => setPrintPageCount(printPageCount - 1)}
                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={20}
                value={pageCountDraft}
                onChange={(e) => setPageCountDraft(e.target.value)}
                onBlur={() => {
                  const n = Number(pageCountDraft)
                  setPrintPageCount(n)
                  setPageCountDraft(
                    String(Math.max(1, Math.min(20, Math.round(n) || 1))),
                  )
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                className="w-14 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-center text-xs text-zinc-100 outline-none focus:border-indigo-500"
                title="Number of pages"
                aria-label="Number of print pages"
              />
              <button
                type="button"
                title="More pages"
                disabled={printPageCount >= 20}
                onClick={() => setPrintPageCount(printPageCount + 1)}
                className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
              >
                +
              </button>
              <span className="text-[10px] text-zinc-500">
                {printPageCount === 1
                  ? '1 page frame'
                  : `${printPageCount} page frames`}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[1, 2, 3, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPrintPageCount(n)}
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    printPageCount === n
                      ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/40'
                      : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Page layout on board
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">
              How page frames are arranged in the viewport. Fit-print zooms to
              the full layout. Drag &amp; place lets you move frames freely.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {LAYOUT_OPTIONS.map((opt) => {
                const active = printPageLayout === opt.id
                const Icon = opt.icon
                return (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.hint}
                    onClick={() => setPrintPageLayout(opt.id)}
                    className={`flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-left transition ${
                      active
                        ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-100'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <Icon
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        active ? 'text-indigo-300' : 'text-zinc-500'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium leading-tight">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-[9px] leading-snug text-zinc-500">
                        {opt.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-zinc-800 px-3 py-2">
            <span className="text-[10px] font-medium uppercase text-zinc-500">
              Orientation
            </span>
            <div className="ml-auto flex rounded-md border border-zinc-800 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setOrientation('portrait')
                  if (!showPrintArea) setShowPrintArea(true)
                }}
                className={`rounded px-2 py-1 text-[11px] ${
                  orientation === 'portrait'
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Portrait
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrientation('landscape')
                  if (!showPrintArea) setShowPrintArea(true)
                }}
                className={`rounded px-2 py-1 text-[11px] ${
                  orientation === 'landscape'
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Landscape
              </button>
            </div>
            <button
              type="button"
              title="Rotate orientation"
              onClick={() => {
                setOrientation(
                  orientation === 'portrait' ? 'landscape' : 'portrait',
                )
                if (!showPrintArea) setShowPrintArea(true)
              }}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="border-t border-zinc-800 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Margins
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Content inset for auto-organize (96 px = 1 in). Default 0.5 in.
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {PRESET_INCHES.map((inch) => {
                const px = Math.round(inch * INCH)
                const active = uniform && margins.top === px
                return (
                  <button
                    key={inch}
                    type="button"
                    onClick={() => setUniformMargin(px)}
                    className={`rounded px-2 py-1 text-[11px] ${
                      active
                        ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/40'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {inch}&quot;
                  </button>
                )
              })}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(
                [
                  ['top', 'Top'],
                  ['right', 'Right'],
                  ['bottom', 'Bottom'],
                  ['left', 'Left'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-1.5 text-[10px] text-zinc-500"
                >
                  <span className="w-10 shrink-0">{label}</span>
                  <input
                    type="number"
                    min={0}
                    max={400}
                    step={8}
                    value={margins[key]}
                    onChange={(e) =>
                      setMargins({ [key]: Number(e.target.value) || 0 })
                    }
                    className="field-input w-full py-0.5 text-[11px]"
                    title={`${label} margin (px)`}
                  />
                  <span className="shrink-0 text-[9px] text-zinc-600">px</span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-[10px] text-zinc-500">
            Board:{' '}
            <span className="text-zinc-300">
              {canvas.width} × {canvas.height} px
            </span>
            {!showPrintArea && (
              <span className="text-zinc-600"> · frame hidden</span>
            )}
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <div className="relative flex items-stretch" ref={rootRef}>
      <button
        type="button"
        title={
          showPrintArea
            ? 'Hide print frame (zoom unchanged)'
            : 'Show print frame (zoom unchanged)'
        }
        aria-pressed={showPrintArea}
        onClick={() => toggleShowPrintArea()}
        className={`inline-flex items-center gap-1.5 rounded-l-md border border-r-0 px-2 py-1 text-xs transition ${
          showPrintArea
            ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/15'
            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200'
        }`}
      >
        {showPrintArea ? (
          <Printer className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <EyeOff className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="max-w-[8.5rem] truncate font-medium">
          {sizeLabel}
          {printPageCount > 1
            ? ` · ${printPageCount}p · ${
                printPageLayout === 'free'
                  ? 'free'
                  : printPageLayout === 'horizontal'
                    ? 'row'
                    : printPageLayout === 'grid'
                      ? 'grid'
                      : 'stack'
              }`
            : ''}
        </span>
        {!showPrintArea && (
          <span className="hidden text-[10px] text-zinc-600 sm:inline">off</span>
        )}
      </button>
      <button
        type="button"
        title="Page size & orientation"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center rounded-r-md border px-1.5 transition ${
          open
            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
            : showPrintArea
              ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/15'
              : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-300'
        }`}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {menu}
    </div>
  )
}
