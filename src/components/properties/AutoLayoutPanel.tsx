import { useCallback, useEffect, useState } from 'react'
import { Loader2, Sparkles, LayoutGrid } from 'lucide-react'
import {
  DENSITY_PRESETS,
  type CheatsheetLayoutOptions,
  type ContentDensity,
} from '@/lib/autoOrganize'
import {
  DEFAULT_OLLAMA_BASE,
  DEFAULT_OLLAMA_MODEL,
  ollamaPing,
} from '@/lib/ollamaClient'
import { suggestCheatsheetLayoutWithOllama } from '@/lib/ollamaLayout'
import { useCanvasStore } from '@/stores/canvasStore'

const DENSITIES = Object.keys(DENSITY_PRESETS) as ContentDensity[]

/**
 * Sheet-level cheatsheet packing controls + optional local Ollama AI assist.
 */
export function AutoLayoutPanel() {
  const items = useCanvasStore((s) => s.items)
  const canvas = useCanvasStore((s) => s.canvas)
  const autoOrganize = useCanvasStore((s) => s.autoOrganize)
  const applyItemLayout = useCanvasStore((s) => s.applyItemLayout)
  const [density, setDensity] = useState<ContentDensity>('sm')
  const [gap, setGap] = useState(8)
  const [columns, setColumns] = useState<number | 'auto'>('auto')
  const [mode, setMode] = useState<'columns' | 'flow'>('columns')
  const [fitPrint, setFitPrint] = useState(true)
  const [aiHint, setAiHint] = useState(
    'Dense exam cheat sheet; group by section; keep readable.',
  )
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [model, setModel] = useState(DEFAULT_OLLAMA_MODEL)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshOllama = useCallback(async () => {
    const ping = await ollamaPing(DEFAULT_OLLAMA_BASE)
    setOllamaOk(ping.ok)
    setOllamaModels(ping.models)
    if (ping.ok && ping.models.includes(DEFAULT_OLLAMA_MODEL)) {
      setModel(DEFAULT_OLLAMA_MODEL)
    } else if (ping.ok && ping.models.length > 0) {
      setModel(ping.models[0]!)
    }
    if (!ping.ok) {
      setError(ping.error ?? 'Ollama unreachable')
    } else {
      setError(null)
    }
  }, [])

  useEffect(() => {
    void refreshOllama()
  }, [refreshOllama])

  const opts = (): CheatsheetLayoutOptions => ({
    density,
    gap,
    columns,
    mode,
    fitPrint,
  })

  const runPack = () => {
    setError(null)
    autoOrganize(opts())
    setStatus(
      `Packed ${items.filter((i) => !i.hidden).length} cards · ${DENSITY_PRESETS[density].label} · gap ${gap}px`,
    )
  }

  const runAi = async () => {
    setBusy(true)
    setError(null)
    setStatus('Asking Ollama…')
    try {
      const result = await suggestCheatsheetLayoutWithOllama(items, canvas, {
        model,
        hint: aiHint,
        preferred: opts(),
      })
      if (result.usedPlacements && result.suggestion.placements) {
        applyItemLayout(result.suggestion.placements)
      } else {
        // Apply full packed items via store
        useCanvasStore.setState({
          items: result.items,
          dirty: true,
          canvas:
            result.printPageCount !== (canvas.printPageCount ?? 1)
              ? { ...canvas, printPageCount: result.printPageCount }
              : canvas,
        })
      }
      if (result.suggestion.density) setDensity(result.suggestion.density)
      if (result.suggestion.gap != null) setGap(result.suggestion.gap)
      if (result.suggestion.columns != null)
        setColumns(result.suggestion.columns)
      if (result.suggestion.mode) setMode(result.suggestion.mode)

      const note = result.suggestion.rationale
        ? ` — ${result.suggestion.rationale}`
        : ''
      setStatus(
        `${result.model}: ${result.usedPlacements ? 'custom placements' : 'density pack'}${note}`,
      )
      // Fit print view after AI layout
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('cheatsheet:fit-print-layout', {
            detail: { reason: 'ai-layout' },
          }),
        )
      }, 60)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const n = items.filter((i) => !i.hidden).length

  return (
    <div
      className="space-y-3 p-3"
      data-testid="auto-layout-panel"
    >
      <p className="text-[10px] leading-snug text-zinc-500">
        Pack cards into the <span className="text-zinc-400">print margins</span>{' '}
        like a real cheat sheet — tight but readable. Density uses semantic
        sizes (not free-form font numbers).
      </p>

      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Content size
        </p>
        <div className="grid grid-cols-2 gap-1">
          {DENSITIES.map((d) => {
            const p = DENSITY_PRESETS[d]
            const active = density === d
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                className={`rounded-md border px-2 py-1.5 text-left transition ${
                  active
                    ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-100'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <span className="block text-[11px] font-medium">{p.label}</span>
                <span className="mt-0.5 block text-[9px] leading-snug text-zinc-500">
                  {p.hint}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-zinc-500">Gap · {gap}px</span>
        <input
          type="range"
          min={2}
          max={24}
          step={1}
          value={gap}
          onChange={(e) => setGap(Number(e.target.value))}
          className="w-full"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500">Columns</span>
          <select
            value={columns === 'auto' ? 'auto' : String(columns)}
            onChange={(e) => {
              const v = e.target.value
              setColumns(v === 'auto' ? 'auto' : Number(v))
            }}
            className="field-input py-1 text-[11px]"
          >
            <option value="auto">Auto</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500">Mode</span>
          <select
            value={mode}
            onChange={(e) =>
              setMode(e.target.value === 'flow' ? 'flow' : 'columns')
            }
            className="field-input py-1 text-[11px]"
          >
            <option value="columns">Multi-column</option>
            <option value="flow">Flow wrap</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={fitPrint}
          onChange={(e) => setFitPrint(e.target.checked)}
          className="rounded border-zinc-600"
        />
        Fit into print box (shrink if needed)
      </label>

      <button
        type="button"
        data-testid="auto-layout-apply"
        disabled={n === 0}
        onClick={runPack}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1.5 text-xs font-medium text-indigo-100 hover:bg-indigo-500/25 disabled:opacity-40"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Apply auto layout ({n})
      </button>

      <div className="border-t border-zinc-800 pt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            AI layout (Ollama)
          </p>
          <button
            type="button"
            onClick={() => void refreshOllama()}
            className="text-[9px] text-zinc-500 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>
        <p className="mb-2 text-[9px] leading-snug text-zinc-600">
          Local{' '}
          <code className="text-zinc-500">127.0.0.1:11434</code> · default{' '}
          <code className="text-zinc-500">gemma4:31b-cloud</code>. Suggests
          density / columns / placements for a tight midterm sheet.
        </p>
        <p
          className={`mb-1.5 text-[10px] ${
            ollamaOk === true
              ? 'text-emerald-500/90'
              : ollamaOk === false
                ? 'text-rose-400'
                : 'text-zinc-600'
          }`}
        >
          {ollamaOk === true
            ? `Ollama online · ${ollamaModels.length} model(s)`
            : ollamaOk === false
              ? 'Ollama offline — start ollama serve'
              : 'Checking Ollama…'}
        </p>

        <label className="mb-1.5 flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500">Model</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="field-input py-1 text-[10px]"
            disabled={!ollamaOk}
          >
            {!ollamaModels.includes(model) && (
              <option value={model}>{model}</option>
            )}
            {ollamaModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-2 flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500">Hint for the model</span>
          <textarea
            value={aiHint}
            onChange={(e) => setAiHint(e.target.value)}
            rows={2}
            className="field-input resize-none py-1 text-[11px]"
            disabled={busy}
          />
        </label>

        <button
          type="button"
          data-testid="auto-layout-ai"
          disabled={busy || n === 0 || ollamaOk === false}
          onClick={() => void runAi()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/15 px-2.5 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-500/25 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {busy ? 'AI packing…' : 'AI organize with Ollama'}
        </button>
      </div>

      {status && (
        <p className="text-[10px] leading-snug text-emerald-500/90">{status}</p>
      )}
      {error && (
        <p className="text-[10px] leading-snug text-rose-400">{error}</p>
      )}

      <p className="text-[9px] leading-snug text-zinc-600">
        Tip: after packing, use fit-print on the canvas toolbar. Agent imports
        also trigger fit-print automatically.
      </p>
    </div>
  )
}
