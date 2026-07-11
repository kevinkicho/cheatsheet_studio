import type { ReactNode } from 'react'
import { Scan, Trash2 } from 'lucide-react'
import { useCanvasStore } from '@/stores/canvasStore'
import { LatexView } from '@/components/math/LatexView'

export function PropertiesPanel() {
  const selectedId = useCanvasStore((s) => s.selectedId)
  const items = useCanvasStore((s) => s.items)
  const title = useCanvasStore((s) => s.title)
  const canvas = useCanvasStore((s) => s.canvas)
  const setTitle = useCanvasStore((s) => s.setTitle)
  const setCanvas = useCanvasStore((s) => s.setCanvas)
  const updateItem = useCanvasStore((s) => s.updateItem)
  const updateItemStyle = useCanvasStore((s) => s.updateItemStyle)
  const fitItemToContent = useCanvasStore((s) => s.fitItemToContent)
  const removeItem = useCanvasStore((s) => s.removeItem)

  const item = items.find((i) => i.id === selectedId)

  if (!item) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Sheet properties
        </h2>
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field-input"
          />
        </Field>
        <Field label="Background">
          <input
            type="color"
            value={
              canvas.background.startsWith('#')
                ? canvas.background
                : '#0f1115'
            }
            onChange={(e) => setCanvas({ background: e.target.value })}
            className="h-8 w-full cursor-pointer rounded border border-zinc-700 bg-transparent"
          />
        </Field>
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
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Grid settings
          </p>
          <label className="mt-2 flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">
              Spacing · {canvas.gridSpacing ?? 24}px
              <span className="text-zinc-600"> (24 aligns with 0.5″ margins)</span>
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
              Opacity · {Math.round((canvas.gridOpacity ?? 0.1) * 100)}%
            </span>
            <input
              type="range"
              min={0.05}
              max={0.8}
              step={0.01}
              value={canvas.gridOpacity ?? 0.1}
              onChange={(e) =>
                setCanvas({ gridOpacity: Number(e.target.value) })
              }
              className="w-full"
            />
          </label>
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-2 text-[11px] text-zinc-400">
          <p className="font-medium text-zinc-300">Print page</p>
          <p className="mt-0.5">
            {canvas.showPrintArea !== false ? (
              <>
                {(canvas.printSizeId ?? 'letter').toUpperCase()} ·{' '}
                {canvas.orientation ?? 'portrait'}
              </>
            ) : (
              <span className="text-amber-200/90">Frame hidden · free board</span>
            )}
          </p>
          <p className="mt-0.5 text-zinc-500">
            Workspace {canvas.width} × {canvas.height} px
          </p>
          <p className="mt-1 text-[10px] text-zinc-600">
            Printer toggles the Letter/A4 frame only — cards stay put. Grid
            covers the full free board when the frame is off.
          </p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Select an item on the canvas to edit its position, style, and content.
        </p>
      </div>
    )
  }

  const style = item.style ?? {}

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Item properties
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Fit card to content"
            onClick={() => fitItemToContent(item.id)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-indigo-300 hover:bg-indigo-500/10"
          >
            <Scan className="h-3.5 w-3.5" />
            Fit
          </button>
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-500">
        Size mode:{' '}
        <span className="text-zinc-300">
          {item.autoFit !== false ? 'auto-fit (grow up to max)' : 'manual resize'}
        </span>
        . Oversized equations/tables always <span className="text-zinc-300">scale to fit</span>{' '}
        inside the card so nothing spills.
      </p>

      <Field label="Title">
        <input
          value={item.title ?? ''}
          onChange={(e) => updateItem(item.id, { title: e.target.value })}
          className="field-input"
        />
      </Field>
      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={item.showTitle !== false}
          onChange={(e) => {
            const show = e.target.checked
            const TITLE_BAND = 22
            const wasShown = item.showTitle !== false
            // Grow/shrink the card so the formula area keeps the same height
            let nextH = item.height
            if (show && !wasShown) nextH = item.height + TITLE_BAND
            if (!show && wasShown) nextH = Math.max(48, item.height - TITLE_BAND)
            updateItem(item.id, {
              showTitle: show,
              height: nextH,
              contentFitKey: (item.contentFitKey ?? 0) + 1,
            })
          }}
          className="rounded border-zinc-600"
        />
        Show title on card
      </label>
      <p className="text-[10px] text-zinc-600">
        Tip: click the title on the card to hide it (card height shrinks so
        content stays large). Double-click the body to re-fit content.
      </p>
      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={item.contentFill !== false}
          onChange={(e) =>
            updateItem(item.id, {
              contentFill: e.target.checked,
              contentFitKey: (item.contentFitKey ?? 0) + 1,
            })
          }
          className="rounded border-zinc-600"
        />
        Fill card with content (scale to fit)
      </label>
      <p className="text-[10px] text-zinc-600">
        When on, content grows/shrinks with the card as you drag corners (up
        to a large cap). When off, content only shrinks if the card is too
        small.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Field label="X">
          <input
            type="number"
            value={item.x}
            onChange={(e) =>
              updateItem(item.id, { x: Number(e.target.value) || 0 })
            }
            className="field-input"
          />
        </Field>
        <Field label="Y">
          <input
            type="number"
            value={item.y}
            onChange={(e) =>
              updateItem(item.id, { y: Number(e.target.value) || 0 })
            }
            className="field-input"
          />
        </Field>
        <Field label="Width">
          <input
            type="number"
            value={item.width}
            onChange={(e) =>
              updateItem(item.id, {
                width: Math.max(80, Number(e.target.value) || 80),
              })
            }
            className="field-input"
          />
        </Field>
        <Field label="Height">
          <input
            type="number"
            value={item.height}
            onChange={(e) =>
              updateItem(item.id, {
                height: Math.max(48, Number(e.target.value) || 48),
              })
            }
            className="field-input"
          />
        </Field>
      </div>

      <Field label="Font size">
        <input
          type="range"
          min={12}
          max={36}
          value={style.fontSize ?? 18}
          onChange={(e) =>
            updateItemStyle(item.id, { fontSize: Number(e.target.value) })
          }
          className="w-full"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Text color">
          <input
            type="color"
            value={style.color ?? '#e8eaed'}
            onChange={(e) =>
              updateItemStyle(item.id, { color: e.target.value })
            }
            className="h-8 w-full cursor-pointer rounded border border-zinc-700"
          />
        </Field>
        <Field label="Background">
          <input
            type="color"
            value={
              style.background?.startsWith('#')
                ? style.background
                : '#1e2028'
            }
            onChange={(e) =>
              updateItemStyle(item.id, { background: e.target.value })
            }
            className="h-8 w-full cursor-pointer rounded border border-zinc-700"
          />
        </Field>
      </div>

      {(item.type === 'equation' ||
        item.type === 'custom-equation' ||
        item.latex !== undefined) && (
        <>
          <Field label="LaTeX">
            <textarea
              value={item.latex ?? ''}
              onChange={(e) => updateItem(item.id, { latex: e.target.value })}
              rows={4}
              className="field-input font-mono text-[11px]"
              spellCheck={false}
            />
          </Field>
          <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
            <p className="mb-1 text-[10px] uppercase text-zinc-500">Preview</p>
            <LatexView latex={item.latex ?? ''} className="text-sm" />
          </div>
        </>
      )}

      {(item.type === 'figure' ||
        item.type === 'custom-image' ||
        item.imageUrl) && (
        <Field label="Image URL">
          <input
            value={item.imageUrl ?? ''}
            onChange={(e) =>
              updateItem(item.id, { imageUrl: e.target.value })
            }
            className="field-input text-[11px]"
          />
        </Field>
      )}

      <p className="text-[10px] text-zinc-600">
        Type: {item.type} · z: {item.zIndex}
      </p>
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
