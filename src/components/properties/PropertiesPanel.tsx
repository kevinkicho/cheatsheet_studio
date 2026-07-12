import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Scan, Trash2 } from 'lucide-react'
import type {
  BorderStroke,
  CanvasItem,
  GridExtent,
  ItemStyle,
  TitleAlign,
} from '@/types'
import {
  GRID_OPACITY_CSS_MAX,
  gridOpacityToPercent,
  normalizeGridExtent,
  percentToGridOpacity,
} from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { LatexView } from '@/components/math/LatexView'
import { ColorPicker } from '@/components/ui/ColorPicker'

const GRID_EXTENT_OPTIONS: {
  id: GridExtent
  label: string
  hint: string
}[] = [
  {
    id: 'page',
    label: 'Full page',
    hint: 'Each page frame has its own grid from the page corner',
  },
  {
    id: 'printable',
    label: 'Printable area',
    hint: 'Grid only inside margins (green box) on each page',
  },
  {
    id: 'board',
    label: 'Whole board',
    hint: 'One continuous grid across the free workspace',
  },
]

function commonValue<T>(
  items: CanvasItem[],
  get: (i: CanvasItem) => T,
): T | 'mixed' {
  if (items.length === 0) return 'mixed'
  const first = get(items[0])
  for (let i = 1; i < items.length; i++) {
    if (get(items[i]) !== first) return 'mixed'
  }
  return first
}

export function PropertiesPanel() {
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const items = useCanvasStore((s) => s.items)
  const title = useCanvasStore((s) => s.title)
  const canvas = useCanvasStore((s) => s.canvas)
  const setTitle = useCanvasStore((s) => s.setTitle)
  const setCanvas = useCanvasStore((s) => s.setCanvas)
  const updateItems = useCanvasStore((s) => s.updateItems)
  const updateItemsStyle = useCanvasStore((s) => s.updateItemsStyle)
  const fitItemsToContent = useCanvasStore((s) => s.fitItemsToContent)
  const removeItems = useCanvasStore((s) => s.removeItems)

  const selected = items.filter((i) => selectedIds.includes(i.id))
  const multi = selected.length > 1
  const single = selected.length === 1 ? selected[0] : null

  const [sheetPropsOpen, setSheetPropsOpen] = useState(true)
  const [gridSettingsOpen, setGridSettingsOpen] = useState(true)

  if (selected.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Sheet properties (collapsible) */}
        <button
          type="button"
          onClick={() => setSheetPropsOpen((o) => !o)}
          className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-900"
        >
          {sheetPropsOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
          )}
          Sheet properties
        </button>
        {sheetPropsOpen && (
          <div className="shrink-0 space-y-3 border-b border-zinc-800 p-3">
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="field-input"
              />
            </Field>
            <Field label="Background">
              <ColorPicker
                value={canvas.background}
                defaultValue="#0f1115"
                onChange={(hex) => setCanvas({ background: hex })}
                aria-label="Sheet background"
              />
            </Field>
          </div>
        )}

        {/* Grid settings (collapsible) */}
        <button
          type="button"
          onClick={() => setGridSettingsOpen((o) => !o)}
          className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-900"
        >
          {gridSettingsOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
          )}
          Grid settings
          <span className="ml-auto font-normal normal-case tracking-normal text-zinc-600">
            {canvas.showGrid ? 'On' : 'Off'}
            {canvas.snapToGrid ? ' · snap' : ''}
          </span>
        </button>
        {gridSettingsOpen && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={canvas.showGrid}
                onChange={(e) => setCanvas({ showGrid: e.target.checked })}
                className="rounded border-zinc-600"
              />
              Show grid
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={canvas.snapToGrid === true}
                onChange={(e) => setCanvas({ snapToGrid: e.target.checked })}
                className="rounded border-zinc-600"
              />
              Snap to grid
            </label>

            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-2">
              <p className="text-[10px] leading-snug text-zinc-600">
                With the print frame on, Full page / Printable area draw a{' '}
                <span className="text-zinc-400">
                  separate grid on every page
                </span>{' '}
                (not one grid continuing across the board).
              </p>

              <p className="mt-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Grid covers
              </p>
              <div className="mt-1.5 flex flex-col gap-1">
                {GRID_EXTENT_OPTIONS.map((opt) => {
                  const active =
                    normalizeGridExtent(canvas.gridExtent) === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setCanvas({ gridExtent: opt.id, showGrid: true })
                      }}
                      className={`rounded-md border px-2 py-1.5 text-left transition ${
                        active
                          ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-100'
                          : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <span className="block text-[11px] font-medium leading-tight">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-[9px] leading-snug text-zinc-500">
                        {opt.hint}
                      </span>
                    </button>
                  )
                })}
              </div>

              <label className="mt-2.5 flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500">
                  Spacing · {canvas.gridSpacing ?? 24}px
                </span>
                <input
                  type="range"
                  min={8}
                  max={64}
                  step={4}
                  value={canvas.gridSpacing ?? 24}
                  onChange={(e) =>
                    setCanvas({ gridSpacing: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500">
                  Opacity ·{' '}
                  {gridOpacityToPercent(canvas.gridOpacity ?? 0.09)}% of soft
                  range → α{' '}
                  {Math.min(
                    GRID_OPACITY_CSS_MAX,
                    Math.max(0, canvas.gridOpacity ?? 0.09),
                  ).toFixed(2)}{' '}
                  (0–100% bar = α 0–{GRID_OPACITY_CSS_MAX})
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={gridOpacityToPercent(canvas.gridOpacity ?? 0.09)}
                  onInput={(e) =>
                    setCanvas({
                      gridOpacity: percentToGridOpacity(
                        Number((e.target as HTMLInputElement).value),
                      ),
                      showGrid: true,
                    })
                  }
                  onChange={(e) =>
                    setCanvas({
                      gridOpacity: percentToGridOpacity(
                        Number(e.target.value),
                      ),
                      showGrid: true,
                    })
                  }
                  className="w-full"
                />
              </label>
            </div>

            <p className="text-xs leading-relaxed text-zinc-500">
              Select a card to edit it. Hold{' '}
              <kbd className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-300">
                Shift
              </kbd>{' '}
              and click to select multiple cards, then edit them together here.
            </p>
          </div>
        )}

        {!sheetPropsOpen && !gridSettingsOpen && (
          <p className="p-3 text-xs text-zinc-600">
            Expand a section above, or select a card on the canvas.
          </p>
        )}
      </div>
    )
  }

  const ids = selected.map((i) => i.id)
  const primary = selected[selected.length - 1]

  const patch = (partial: Partial<CanvasItem>) => updateItems(ids, partial)
  const patchStyle = (s: Partial<ItemStyle>) => updateItemsStyle(ids, s)

  const showTitleVal = commonValue(selected, (i) => i.showTitle !== false)
  const contentFillVal = commonValue(selected, (i) => i.contentFill !== false)
  const titleAlignVal = commonValue(
    selected,
    (i) => (i.titleAlign ?? 'left') as TitleAlign,
  )
  const bgFillVal = commonValue(
    selected,
    (i) => i.transparentBackground !== true,
  )
  const fontSizeVal = commonValue(selected, (i) => i.style?.fontSize ?? 18)
  const borderOnVal = commonValue(
    selected,
    (i) =>
      i.style?.borderEnabled !== false && i.style?.borderStyle !== 'none',
  )
  const borderStyleVal = commonValue(
    selected,
    (i) => (i.style?.borderStyle ?? 'solid') as BorderStroke,
  )
  const borderWidthVal = commonValue(selected, (i) => i.style?.borderWidth ?? 1)
  const borderColorVal = commonValue(
    selected,
    (i) => i.style?.borderColor ?? '#6366f1',
  )
  const textColorVal = commonValue(
    selected,
    (i) => i.style?.color ?? '#e8eaed',
  )
  const fillColorVal = commonValue(
    selected,
    (i) => i.style?.background ?? '#1e2028',
  )

  const allEquations = selected.every(
    (i) =>
      i.type === 'equation' ||
      i.type === 'custom-equation' ||
      Boolean(i.latex),
  )
  const allFigures = selected.every(
    (i) =>
      i.type === 'figure' ||
      i.type === 'custom-image' ||
      (Boolean(i.imageUrl) && !i.latex),
  )

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {multi ? `${selected.length} cards selected` : 'Item properties'}
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Fit card(s) to content"
            onClick={() => fitItemsToContent(ids)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-indigo-300 hover:bg-indigo-500/10"
          >
            <Scan className="h-3.5 w-3.5" />
            Fit
          </button>
          <button
            type="button"
            onClick={() => removeItems(ids)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      {multi && (
        <p className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-indigo-200/90">
          Edits below apply to all {selected.length} selected cards. Shift+click
          a card to add or remove it from the selection.
        </p>
      )}

      {!multi && single && (
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Size mode:{' '}
          <span className="text-zinc-300">
            {single.autoFit !== false
              ? 'auto-fit (grow up to max)'
              : 'manual resize'}
          </span>
          . Shift+click other cards to multi-select.
        </p>
      )}

      {!multi && (
        <Field label="Title">
          <input
            value={primary.title ?? ''}
            onChange={(e) => patch({ title: e.target.value })}
            className="field-input"
          />
        </Field>
      )}

      <TriCheck
        label="Show title on card"
        value={showTitleVal}
        onChange={(show) => {
          const TITLE_BAND = 22
          for (const it of selected) {
            const wasShown = it.showTitle !== false
            let nextH = it.height
            if (show && !wasShown) nextH = it.height + TITLE_BAND
            if (!show && wasShown) nextH = Math.max(48, it.height - TITLE_BAND)
            useCanvasStore.getState().updateItem(it.id, {
              showTitle: show,
              height: nextH,
              contentFitKey: (it.contentFitKey ?? 0) + 1,
            })
          }
        }}
      />

      {(showTitleVal === true || showTitleVal === 'mixed') && (
        <Field label="Title alignment">
          <div className="flex gap-1">
            {(
              [
                ['left', 'Left'],
                ['center', 'Center'],
                ['right', 'Right'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => patch({ titleAlign: value })}
                className={`flex-1 rounded-md border px-2 py-1 text-[11px] transition ${
                  titleAlignVal === value
                    ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {titleAlignVal === 'mixed' && (
            <span className="text-[10px] text-amber-500/80">Mixed</span>
          )}
        </Field>
      )}

      <TriCheck
        label="Scale content to fill card"
        value={contentFillVal}
        onChange={(on) =>
          patch({
            contentFill: on,
            contentFitKey: Date.now(),
          })
        }
      />

      {!multi && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <input
              type="number"
              value={primary.x}
              onChange={(e) =>
                patch({ x: Number(e.target.value) || 0 })
              }
              className="field-input"
            />
          </Field>
          <Field label="Y">
            <input
              type="number"
              value={primary.y}
              onChange={(e) =>
                patch({ y: Number(e.target.value) || 0 })
              }
              className="field-input"
            />
          </Field>
          <Field label="Width">
            <input
              type="number"
              value={primary.width}
              onChange={(e) =>
                patch({
                  width: Math.max(80, Number(e.target.value) || 80),
                })
              }
              className="field-input"
            />
          </Field>
          <Field label="Height">
            <input
              type="number"
              value={primary.height}
              onChange={(e) =>
                patch({
                  height: Math.max(48, Number(e.target.value) || 48),
                })
              }
              className="field-input"
            />
          </Field>
        </div>
      )}

      <Field
        label={
          fontSizeVal === 'mixed'
            ? 'Font size · mixed'
            : `Font size · ${fontSizeVal}px`
        }
      >
        <input
          type="range"
          min={12}
          max={36}
          value={fontSizeVal === 'mixed' ? 18 : fontSizeVal}
          onChange={(e) =>
            patchStyle({ fontSize: Number(e.target.value) })
          }
          className="w-full"
        />
      </Field>

      <TriCheck
        label="Background fill"
        value={bgFillVal}
        onChange={(on) => {
          if (on) {
            for (const it of selected) {
              const st = it.style ?? {}
              useCanvasStore.getState().updateItem(it.id, {
                transparentBackground: false,
                style: {
                  ...st,
                  background:
                    st.background && st.background !== 'transparent'
                      ? st.background
                      : 'rgba(30, 32, 40, 0.92)',
                },
              })
            }
          } else {
            patch({ transparentBackground: true })
          }
        }}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Text color">
          <ColorPicker
            value={textColorVal === 'mixed' ? undefined : textColorVal}
            defaultValue="#e8eaed"
            onChange={(hex) => patchStyle({ color: hex })}
            aria-label="Text color"
            compact
          />
        </Field>
        <Field label="Fill color">
          <ColorPicker
            value={
              bgFillVal === false || fillColorVal === 'mixed'
                ? undefined
                : fillColorVal
            }
            defaultValue="#1e2028"
            disabled={bgFillVal === false}
            onChange={(hex) => {
              patch({ transparentBackground: false })
              patchStyle({ background: hex })
            }}
            aria-label="Fill color"
            compact
          />
        </Field>
      </div>

      {/* Border */}
      <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-2">
        <TriCheck
          label="Border"
          value={borderOnVal}
          onChange={(on) =>
            patchStyle({
              borderEnabled: on,
              borderStyle: on
                ? borderStyleVal === 'none' || borderStyleVal === 'mixed'
                  ? 'solid'
                  : borderStyleVal
                : 'none',
            })
          }
        />
        <p className="mt-1 text-[10px] text-zinc-600">
          Stroke around the card. Independent of background fill.
        </p>

        {borderOnVal !== false && (
          <div className="mt-2 flex flex-col gap-2">
            <Field label="Stroke type">
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                {(
                  [
                    ['solid', 'Solid'],
                    ['dashed', 'Dashed'],
                    ['dotted', 'Dotted'],
                    ['double', 'Double'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      patchStyle({
                        borderEnabled: true,
                        borderStyle: value,
                      })
                    }
                    className={`rounded-md border px-1.5 py-1 text-[10px] transition ${
                      borderStyleVal === value
                        ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                        : 'border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700'
                    }`}
                    title={label}
                  >
                    <span
                      className="mx-auto mb-0.5 block h-0 w-full border-t-2 border-zinc-300"
                      style={{
                        borderTopStyle: value,
                        borderTopColor: 'currentColor',
                      }}
                    />
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={
                borderWidthVal === 'mixed'
                  ? 'Thickness · mixed'
                  : `Thickness · ${borderWidthVal}px`
              }
            >
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={borderWidthVal === 'mixed' ? 1 : borderWidthVal}
                onChange={(e) =>
                  patchStyle({
                    borderEnabled: true,
                    borderWidth: Number(e.target.value),
                  })
                }
                className="w-full"
              />
            </Field>

            <Field label="Stroke color">
              <ColorPicker
                value={
                  borderColorVal === 'mixed' ? undefined : borderColorVal
                }
                defaultValue="#6366f1"
                onChange={(hex) =>
                  patchStyle({
                    borderEnabled: true,
                    borderColor: hex,
                  })
                }
                aria-label="Stroke color"
                compact
              />
            </Field>
          </div>
        )}
      </div>

      {/* Content-specific: only when single or all same kind */}
      {!multi && single && (single.latex !== undefined || single.type === 'equation' || single.type === 'custom-equation') && (
        <>
          <Field label="LaTeX">
            <textarea
              value={single.latex ?? ''}
              onChange={(e) => patch({ latex: e.target.value })}
              rows={4}
              className="field-input font-mono text-[11px]"
              spellCheck={false}
            />
          </Field>
          <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
            <p className="mb-1 text-[10px] uppercase text-zinc-500">Preview</p>
            <LatexView latex={single.latex ?? ''} className="text-sm" />
          </div>
        </>
      )}

      {!multi &&
        single &&
        (single.type === 'process-chart' || single.mermaidSource !== undefined) && (
          <>
            <Field label="Mermaid source">
              <textarea
                value={single.mermaidSource ?? ''}
                onChange={(e) => patch({ mermaidSource: e.target.value })}
                rows={6}
                className="field-input font-mono text-[11px]"
                spellCheck={false}
              />
            </Field>
            <p className="text-[10px] text-zinc-500">
              Tip: open the right sidebar <strong className="text-zinc-400">Process</strong> tool
              for templates, themes, and a larger preview.
            </p>
          </>
        )}

      {!multi &&
        single &&
        (single.type === 'figure' ||
          single.type === 'custom-image' ||
          single.imageUrl) && (
          <Field label="Image URL">
            <input
              value={single.imageUrl ?? ''}
              onChange={(e) => patch({ imageUrl: e.target.value })}
              className="field-input text-[11px]"
            />
          </Field>
        )}

      {multi && allEquations && (
        <p className="text-[10px] text-zinc-500">
          All selected are equations — shared chrome edits apply. Edit LaTeX
          one card at a time.
        </p>
      )}
      {multi && allFigures && (
        <p className="text-[10px] text-zinc-500">
          All selected are figures — shared chrome edits apply.
        </p>
      )}

      <p className="text-[10px] text-zinc-600">
        {multi
          ? `Types: ${[...new Set(selected.map((i) => i.type))].join(', ')}`
          : `Type: ${primary.type} · z: ${primary.zIndex}`}
      </p>
    </div>
  )
}

/** Checkbox that supports true / false / mixed (indeterminate). */
function TriCheck({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | 'mixed'
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-300">
      <input
        type="checkbox"
        checked={value === true}
        ref={(el) => {
          if (el) el.indeterminate = value === 'mixed'
        }}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-zinc-600"
      />
      <span>
        {label}
        {value === 'mixed' && (
          <span className="ml-1 text-[10px] text-amber-500/80">(mixed)</span>
        )}
      </span>
    </label>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  )
}
