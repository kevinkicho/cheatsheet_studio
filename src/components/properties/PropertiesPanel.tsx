import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Scan, Trash2 } from 'lucide-react'
import { AutoLayoutPanel } from '@/components/properties/AutoLayoutPanel'
import { PanelProperties } from '@/components/properties/PanelProperties'
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
  const selectedPanelId = useCanvasStore((s) => s.selectedPanelId)
  const items = useCanvasStore((s) => s.items)
  const title = useCanvasStore((s) => s.title)
  const canvas = useCanvasStore((s) => s.canvas)
  const setTitle = useCanvasStore((s) => s.setTitle)
  const setCanvas = useCanvasStore((s) => s.setCanvas)
  const updateItems = useCanvasStore((s) => s.updateItems)
  const updateItemsStyle = useCanvasStore((s) => s.updateItemsStyle)
  const fitItemsToContent = useCanvasStore((s) => s.fitItemsToContent)
  const removeItems = useCanvasStore((s) => s.removeItems)
  const toggleItemHidden = useCanvasStore((s) => s.toggleItemHidden)

  const selected = items.filter((i) => selectedIds.includes(i.id))
  const multi = selected.length > 1
  const single = selected.length === 1 ? selected[0] : null
  const selectedPanel =
    selectedPanelId != null
      ? (canvas.layoutPanels ?? []).find((p) => p.id === selectedPanelId)
      : undefined

  const [sheetPropsOpen, setSheetPropsOpen] = useState(false)
  const [gridSettingsOpen, setGridSettingsOpen] = useState(false)
  const [autoLayoutOpen, setAutoLayoutOpen] = useState(true)
  // Item properties collapsibles (when a card is selected)
  const [titleOpen, setTitleOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [contentOpen, setContentOpen] = useState(false)

  // Panel selected → panel editor in left sidebar
  if (selected.length === 0 && selectedPanel) {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <PanelProperties panel={selectedPanel} />
      </div>
    )
  }

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

        {/* Auto layout (collapsible) — same hierarchy as Grid settings */}
        <button
          type="button"
          onClick={() => setAutoLayoutOpen((o) => !o)}
          className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-900"
          data-testid="auto-layout-toggle"
        >
          {autoLayoutOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
          )}
          Auto layout
          <span className="ml-auto font-normal normal-case tracking-normal text-zinc-600">
            pack · AI
          </span>
        </button>
        {autoLayoutOpen && (
          <div className="min-h-0 max-h-[50%] shrink overflow-y-auto border-b border-zinc-800">
            <AutoLayoutPanel />
          </div>
        )}

        {/* Grid settings — sibling of Auto layout (not nested) */}
        <button
          type="button"
          onClick={() => setGridSettingsOpen((o) => !o)}
          className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-900"
          data-testid="grid-settings-toggle"
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
              Click a layout panel to edit its title / card sort. Select a card
              for card properties.
            </p>
          </div>
        )}

        {!sheetPropsOpen && !autoLayoutOpen && !gridSettingsOpen && (
          <p className="p-3 text-xs text-zinc-600">
            Expand a section above, click a panel, or select a card.
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
  const keepAspectVal = commonValue(
    selected,
    (i) => i.keepAspectRatio !== false,
  )
  const titleAlignVal = commonValue(
    selected,
    (i) => (i.titleAlign ?? 'left') as TitleAlign,
  )
  const bgFillVal = commonValue(
    selected,
    (i) => i.transparentBackground !== true,
  )
  const fontSizeVal = commonValue(selected, (i) => i.style?.fontSize ?? 18)
  const titleFontSizeVal = commonValue(
    selected,
    (i) => i.style?.titleFontSize ?? 10,
  )
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky header */}
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {multi ? `${selected.length} cards selected` : 'Item properties'}
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Fit card(s) to content — snugs height/width to the equation/table/SVG and turns off fill-scale so empty letterbox gutters collapse"
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

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {(multi || single) && (
          <div className="space-y-2 border-b border-zinc-800 px-3 py-2">
            {multi && (
              <p className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-indigo-200/90">
                Edits below apply to all {selected.length} selected cards.
                Ctrl/Cmd+A selects all on the board · Ctrl/Cmd+click to
                add/remove.
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
                . Ctrl/Cmd+A selects all · Ctrl/Cmd+click multi-select.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                title="Hide / show on canvas (Layers eye)"
                onClick={() => {
                  for (const id of ids) toggleItemHidden(id)
                }}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                  selected.every((i) => i.hidden)
                    ? 'border-zinc-500/40 bg-zinc-800 text-zinc-300'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {selected.every((i) => i.hidden) ? 'Hidden' : 'Hide'}
              </button>
            </div>
          </div>
        )}

        {/* ── Title ───────────────────────────────────────────────────────── */}
        <ItemCollapsible
          title="Title"
          open={titleOpen}
          onToggle={() => setTitleOpen((o) => !o)}
        >
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
              for (const it of selected) {
                useCanvasStore.getState().updateItem(it.id, {
                  showTitle: show,
                  contentFitKey: (it.contentFitKey ?? 0) + 1,
                })
              }
            }}
          />

          {(showTitleVal === true || showTitleVal === 'mixed') && (
            <>
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

              <Field
                label={
                  titleFontSizeVal === 'mixed'
                    ? 'Title size · mixed'
                    : `Title size · ${titleFontSizeVal}px`
                }
              >
                <input
                  type="range"
                  min={8}
                  max={24}
                  step={1}
                  value={
                    titleFontSizeVal === 'mixed' ? 10 : titleFontSizeVal
                  }
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    patchStyle({ titleFontSize: next })
                    // Nudge autofit measure when title chrome height changes
                    for (const it of selected) {
                      useCanvasStore.getState().updateItem(it.id, {
                        contentFitKey: (it.contentFitKey ?? 0) + 1,
                      })
                    }
                  }}
                  className="w-full"
                  aria-label="Title font size"
                />
              </Field>
            </>
          )}
        </ItemCollapsible>

        {/* ── Size ────────────────────────────────────────────────────────── */}
        <ItemCollapsible
          title="Size"
          open={sizeOpen}
          onToggle={() => setSizeOpen((o) => !o)}
        >
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
          <p className="-mt-1 text-[10px] leading-snug text-zinc-500">
            On: grow content to the card box (can leave empty bands above/below
            when the card is taller than the equation). Off +{' '}
            <strong className="text-zinc-400">Fit</strong> snugs the card to
            content. See docs/vector-graphics.md (letterboxing).
          </p>

          <TriCheck
            label="Keep aspect ratio"
            value={keepAspectVal}
            onChange={(on) =>
              patch({
                keepAspectRatio: on,
                contentFitKey: Date.now(),
              })
            }
          />
          <p className="-mt-1 text-[10px] leading-snug text-zinc-500">
            On: preserve proportions when resizing (default). Off: stretch X and
            Y independently with free-transform edges.
          </p>

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
        </ItemCollapsible>

        {/* ── Content (chrome: colors, border) ────────────────────────────── */}
        <ItemCollapsible
          title="Content"
          open={contentOpen}
          onToggle={() => setContentOpen((o) => !o)}
        >
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

          <ItemColorPalette
            fill={
              bgFillVal === false || fillColorVal === 'mixed'
                ? undefined
                : fillColorVal
            }
            border={borderColorVal === 'mixed' ? undefined : borderColorVal}
            text={textColorVal === 'mixed' ? undefined : textColorVal}
            onFill={(hex) => {
              patch({ transparentBackground: false })
              patchStyle({ background: hex })
            }}
            onBorder={(hex) =>
              patchStyle({
                borderEnabled: true,
                borderStyle:
                  borderStyleVal === 'none' || borderStyleVal === 'mixed'
                    ? 'solid'
                    : (borderStyleVal as BorderStroke),
                borderColor: hex,
              })
            }
            onText={(hex) => patchStyle({ color: hex })}
            onReset={() => {
              for (const it of selected) {
                const st = it.style ?? {}
                useCanvasStore.getState().updateItem(it.id, {
                  transparentBackground: false,
                  style: {
                    ...st,
                    background: '#1e2028',
                    borderColor: '#6366f1',
                    color: '#e8eaed',
                  },
                })
              }
            }}
          />

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
              Stroke around the card. Independent of background fill. Color is
              under Colors → Border.
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
              </div>
            )}
          </div>
        </ItemCollapsible>

        {/* ── Type-specific (not collapsible) ─────────────────────────────── */}
        <div className="flex flex-col gap-3 p-3">
          {!multi &&
            single &&
            (single.latex !== undefined ||
              single.type === 'equation' ||
              single.type === 'custom-equation') && (
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
                  <p className="mb-1 text-[10px] uppercase text-zinc-500">
                    Preview
                  </p>
                  <LatexView latex={single.latex ?? ''} className="text-sm" />
                </div>
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
      </div>
    </div>
  )
}

/** Collapsible block for Item properties (Title / Size / Content). */
function ItemCollapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="border-b border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 bg-zinc-900/80 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-900"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}
        {title}
      </button>
      {open && <div className="flex flex-col gap-3 p-3">{children}</div>}
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

type ItemColorChannel = 'fill' | 'border' | 'text'

const ITEM_COLOR_CHANNELS: {
  id: ItemColorChannel
  label: string
  defaultVal: string
}[] = [
  { id: 'fill', label: 'Fill', defaultVal: '#1e2028' },
  { id: 'border', label: 'Border', defaultVal: '#6366f1' },
  { id: 'text', label: 'Text', defaultVal: '#e8eaed' },
]

/**
 * One shared palette for Fill / Border / Text — chip selects the channel,
 * then a single ColorPicker applies it (same pattern as editor Object Settings).
 */
function ItemColorPalette({
  fill,
  border,
  text,
  onFill,
  onBorder,
  onText,
  onReset,
}: {
  fill?: string
  border?: string
  text?: string
  onFill: (hex: string) => void
  onBorder: (hex: string) => void
  onText: (hex: string) => void
  onReset: () => void
}) {
  const [channel, setChannel] = useState<ItemColorChannel>('fill')
  const values: Record<ItemColorChannel, string | undefined> = {
    fill,
    border,
    text,
  }
  const defaults: Record<ItemColorChannel, string> = {
    fill: '#1e2028',
    border: '#6366f1',
    text: '#e8eaed',
  }
  const apply: Record<ItemColorChannel, (hex: string) => void> = {
    fill: onFill,
    border: onBorder,
    text: onText,
  }
  const current = values[channel]
  const defaultVal = defaults[channel]

  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Colors
      </span>
      <div className="mb-2 flex flex-wrap gap-1">
        {ITEM_COLOR_CHANNELS.map(({ id, label, defaultVal: d }) => {
          const v = values[id]
          const swatch = v || d
          const isOn = channel === id
          return (
            <button
              key={id}
              type="button"
              title={`${label}${v ? `: ${v}` : ' (default)'}`}
              aria-pressed={isOn}
              onClick={() => setChannel(id)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                isOn
                  ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                  : 'border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-sm border border-white/15"
                style={{ background: swatch }}
              />
              {label}
            </button>
          )
        })}
      </div>
      <ColorPicker
        key={`item-palette-${channel}-${current ?? 'def'}`}
        value={current}
        defaultValue={defaultVal}
        onChange={(hex) => apply[channel](hex)}
        aria-label={`${ITEM_COLOR_CHANNELS.find((c) => c.id === channel)?.label} color`}
        compact
        endAction={
          <button
            type="button"
            title="Reset fill, border, and text to defaults"
            onClick={onReset}
            className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
          >
            Reset
          </button>
        }
      />
    </div>
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
