import { useCallback, useEffect, useState } from 'react'
import { Loader2, Sparkles, LayoutGrid } from 'lucide-react'
import {
  DENSITY_PRESETS,
  GROUP_CHROME_PRESETS,
  GROUP_SORT_ORDER,
  GROUP_SORT_PRESETS,
  PANEL_SHAPE_PRESETS,
  panelGroupLevelOptions,
  type CheatsheetLayoutOptions,
  type ContentDensity,
  type GroupChrome,
  type GroupSortOrder,
  type PanelGroupLevel,
  normalizeGroupChrome,
} from '@/lib/autoOrganize'
import type { PanelShape } from '@/types'
import {
  DEFAULT_OLLAMA_MODEL,
  ollamaPing,
  resolveOllamaBackend,
  resolveOllamaBaseUrl,
  type OllamaBackend,
} from '@/lib/ollamaClient'
import { suggestCheatsheetLayoutWithOllama } from '@/lib/ollamaLayout'
import { useCanvasStore } from '@/stores/canvasStore'

const DENSITIES = Object.keys(DENSITY_PRESETS) as ContentDensity[]

/**
 * Sheet-level cheatsheet packing controls + Ollama AI assist
 * (Cloud via Vite proxy + OLLAMA_API_KEY, or local :11434).
 */
export function AutoLayoutPanel() {
  const items = useCanvasStore((s) => s.items)
  const canvas = useCanvasStore((s) => s.canvas)
  const folders = useCanvasStore((s) => s.folders)
  const autoOrganize = useCanvasStore((s) => s.autoOrganize)
  const applyItemLayout = useCanvasStore((s) => s.applyItemLayout)
  const [density, setDensity] = useState<ContentDensity>('sm')
  const [gap, setGap] = useState(4)
  /** Topic chrome: labels (banner rows) vs panels (encapsulating frames). */
  const [groupChrome, setGroupChrome] = useState<GroupChrome>('panels')
  const [panelShape, setPanelShape] = useState<PanelShape>('rect')
  /** Gap between panels + chrome pad (px). Drives free-flow inter-panel cells. */
  const [panelPadding, setPanelPadding] = useState(4)
  /**
   * Multi-select hierarchy depths. Selecting 1+2 draws outer (top) panels
   * wrapping inner (subsection) panels.
   */
  const [panelGroupLevels, setPanelGroupLevels] = useState<PanelGroupLevel[]>([
    1, 2, 3,
  ])
  /**
   * Which group levels draw a border stroke.
   * Default L1+L2+L3 so nested frames (and n-gon on L2/L3) work out of the box.
   */
  const [panelBorderLevels, setPanelBorderLevels] = useState<PanelGroupLevel[]>([
    1, 2, 3,
  ])
  const [groupSort, setGroupSort] = useState<GroupSortOrder>('name-asc')
  const [fitPrint, setFitPrint] = useState(true)
  const [aiHint, setAiHint] = useState(
    'Dense exam cheat sheet; keep Layers folders clustered; group by section; keep readable.',
  )
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [backend, setBackend] = useState<OllamaBackend>(resolveOllamaBackend())
  const [baseUrl, setBaseUrl] = useState(resolveOllamaBaseUrl())
  const [model, setModel] = useState(DEFAULT_OLLAMA_MODEL)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshOllama = useCallback(async () => {
    const ping = await ollamaPing()
    setOllamaOk(ping.ok)
    setOllamaModels(ping.models)
    setBackend(ping.backend)
    setBaseUrl(ping.baseUrl)
    if (ping.ok && ping.models.includes(DEFAULT_OLLAMA_MODEL)) {
      setModel(DEFAULT_OLLAMA_MODEL)
    } else if (ping.ok && ping.models.some((m) => m.includes('gemma4'))) {
      const g =
        ping.models.find((m) => m === 'gemma4:31b') ||
        ping.models.find((m) => m.includes('gemma4:31b')) ||
        ping.models.find((m) => m.includes('gemma4'))
      if (g) setModel(g)
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
    // Dense mosaic only — no forced multi-column / row bands (those leave
    // large gutters between uneven topic groups).
    groupChrome,
    panelShape: groupChrome === 'panels' ? panelShape : undefined,
    panelPadding,
    panelGroupLevels,
    panelBorderLevels,
    // Polygon → n-gon on all bordered levels (no per-level picker)
    panelNgonLevels:
      panelShape === 'polygon' ? panelBorderLevels : undefined,
    groupSort,
    fitPrint,
    multiPage: true,
    // Sheet properties → dissolvePrintArea
    dissolvePrintArea: canvas.dissolvePrintArea === true,
    groupByFolder: true,
    folders: folders?.map((f) => ({
      id: f.id,
      order: f.order,
      name: f.name,
      parentId: f.parentId,
    })),
  })

  const runPack = () => {
    setError(null)
    const o = opts()
    autoOrganize(o)
    const chrome = GROUP_CHROME_PRESETS[groupChrome].label
    const panelsOn = groupChrome === 'panels'
    const panelBit = panelsOn
      ? ` · ${panelShape === 'polygon' ? 'n-gon' : 'rect'} · borders L${panelBorderLevels.join('+')} · pad ${panelPadding}px`
      : ''
    setStatus(
      `Packed ${items.filter((i) => !i.hidden).length} cards · ${DENSITY_PRESETS[density].label} · ${chrome} · levels L${panelGroupLevels.join('+')} · gap ${gap}px${panelBit}`,
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
        // Apply full packed items via store (incl. layout panels when chrome=panels)
        useCanvasStore.setState({
          items: result.items,
          dirty: true,
          canvas: {
            ...canvas,
            printPageCount: result.printPageCount,
            layoutPanels: result.layoutPanels ?? [],
          },
        })
      }
      if (result.suggestion.density) setDensity(result.suggestion.density)
      if (result.suggestion.gap != null) setGap(result.suggestion.gap)
      if (result.suggestion.groupChrome) {
        setGroupChrome(normalizeGroupChrome(result.suggestion.groupChrome))
      }

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
        sizes (not free-form font numbers). Cards that share a{' '}
        <span className="text-zinc-400">Layers folder</span> stay clustered
        together (agent collections).
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
        <span className="text-[10px] text-zinc-500">
          Gap · {gap}px
          <span className="font-normal text-zinc-600">
            {' '}
            (between groups / panel outers)
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={48}
          step={2}
          value={gap}
          onChange={(e) => setGap(Number(e.target.value))}
          className="w-full"
          data-testid="pack-gap-slider"
        />
        <span className="text-[9px] text-zinc-600">
          Free-flow air between topic groups. With panels, clearance between
          frames is gap + 2× panel pad.
        </span>
      </label>

      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Group chrome
        </p>
        <p className="mb-1.5 text-[9px] leading-snug text-zinc-600">
          How topics/folders are marked after packing. <span className="text-zinc-400">Topic labels</span> =
          banner rows (current). <span className="text-zinc-400">Panels</span> =
          encapsulating box around cards that belong together.
        </p>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(GROUP_CHROME_PRESETS) as GroupChrome[]).map((id) => {
            const p = GROUP_CHROME_PRESETS[id]
            const active = groupChrome === id
            return (
              <button
                key={id}
                type="button"
                data-testid={`group-chrome-${id}`}
                onClick={() => setGroupChrome(id)}
                className={`rounded-md border px-2 py-1.5 text-left transition ${
                  active
                    ? 'border-emerald-500/50 bg-emerald-500/12 text-emerald-100'
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

      {groupChrome === 'panels' && (
        <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/30 p-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Panel packing
          </p>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(PANEL_SHAPE_PRESETS) as PanelShape[]).map((id) => {
              const p = PANEL_SHAPE_PRESETS[id]
              const active = panelShape === id
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`panel-shape-${id}`}
                  onClick={() => {
                    setPanelShape(id)
                    if (id === 'polygon') {
                      // Ensure nested group + borders; n-gon applies to all
                      // bordered levels (per-level n-gon UI removed).
                      setPanelGroupLevels((g) => {
                        const next = new Set(g)
                        next.add(1)
                        next.add(2)
                        if (g.includes(3) || next.has(3)) next.add(3)
                        else next.add(2)
                        return [...next].sort((a, b) => a - b) as PanelGroupLevel[]
                      })
                      setPanelBorderLevels((b) => {
                        const next = new Set(b)
                        next.add(1)
                        next.add(2)
                        return [...next].sort(
                          (a, c) => a - c,
                        ) as PanelGroupLevel[]
                      })
                    }
                  }}
                  className={`rounded-md border px-2 py-1.5 text-left transition ${
                    active
                      ? 'border-sky-500/50 bg-sky-500/12 text-sky-100'
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
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500">
              Panel pad · {panelPadding}px
              <span className="font-normal text-zinc-600">
                {' '}
                (cards → frame stroke)
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={48}
              step={2}
              value={panelPadding}
              onChange={(e) => setPanelPadding(Number(e.target.value))}
              className="w-full"
              data-testid="panel-gap-slider"
            />
            <span className="text-[9px] text-zinc-600">
              Chrome inset around cards. Combined with Gap: outer spacing =
              gap + 2× pad (no second panel-gap control).
            </span>
          </label>

          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Panel group levels
              <span className="ml-1 font-normal normal-case text-zinc-600">
                (multi-select)
              </span>
            </p>
            <div className="grid grid-cols-3 gap-1">
              {panelGroupLevelOptions().map((opt) => {
                const active = panelGroupLevels.includes(opt.level)
                return (
                  <button
                    key={opt.level}
                    type="button"
                    data-testid={`panel-group-level-${opt.level}`}
                    aria-pressed={active}
                    onClick={() => {
                      setPanelGroupLevels((prev) => {
                        if (prev.includes(opt.level)) {
                          // Keep at least one level selected
                          const next = prev.filter((L) => L !== opt.level)
                          if (next.length === 0) return prev
                          // Drop border / n-gon for removed group levels
                          setPanelBorderLevels((b) => {
                            const nb = b.filter((L) => next.includes(L))
                            return nb.length > 0 ? nb : [next[0]!]
                          })
                          return next
                        }
                        return [...prev, opt.level].sort(
                          (a, b) => a - b,
                        ) as PanelGroupLevel[]
                      })
                    }}
                    title={opt.hint}
                    className={`rounded-md border px-2 py-1.5 text-center transition ${
                      active
                        ? 'border-emerald-500/50 bg-emerald-500/12 text-emerald-100'
                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span className="block text-[11px] font-medium">
                      {opt.label}
                    </span>
                    {active && (
                      <span className="mt-0.5 block text-[8px] text-emerald-400/90">
                        on
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-[9px] leading-snug text-zinc-600">
              {panelGroupLevels.length > 1
                ? `Nested: L${panelGroupLevels.join('+L')} — outer wraps inner (e.g. “1.” around “1.1” / “1.2”).`
                : (panelGroupLevelOptions().find(
                    (o) => o.level === panelGroupLevels[0],
                  )?.hint ?? 'Select one or more levels.')}
            </p>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Panel borders
              <span className="ml-1 font-normal normal-case text-zinc-600">
                (by level)
              </span>
            </p>
            <p className="mb-1.5 text-[9px] leading-snug text-zinc-600">
              Which hierarchy levels draw a frame stroke. Off = title chip only.
            </p>
            <div className="grid grid-cols-3 gap-1">
              {panelGroupLevelOptions().map((opt) => {
                const inGroup = panelGroupLevels.includes(opt.level)
                const active = panelBorderLevels.includes(opt.level)
                return (
                  <button
                    key={`border-${opt.level}`}
                    type="button"
                    data-testid={`panel-border-level-${opt.level}`}
                    aria-pressed={active}
                    disabled={!inGroup}
                    title={
                      inGroup
                        ? `Show border at level ${opt.level}`
                        : 'Enable this group level first'
                    }
                    onClick={() => {
                      if (!inGroup) return
                      if (panelBorderLevels.includes(opt.level)) {
                        const next = panelBorderLevels.filter(
                          (L) => L !== opt.level,
                        )
                        // Keep at least one border among active group levels
                        if (next.length === 0) return
                        setPanelBorderLevels(next)
                      } else {
                        setPanelBorderLevels(
                          [...panelBorderLevels, opt.level].sort(
                            (a, b) => a - b,
                          ) as PanelGroupLevel[],
                        )
                      }
                    }}
                    className={`rounded-md border px-2 py-1.5 text-center transition ${
                      !inGroup
                        ? 'cursor-not-allowed border-zinc-900 bg-zinc-950/20 text-zinc-700'
                        : active
                          ? 'border-amber-500/50 bg-amber-500/12 text-amber-100'
                          : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span className="block text-[11px] font-medium">
                      L{opt.level}
                    </span>
                    {active && inGroup && (
                      <span className="mt-0.5 block text-[8px] text-amber-400/90">
                        border
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      )}

      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Group sort
        </p>
        <div className="grid grid-cols-1 gap-1">
          {GROUP_SORT_ORDER.map((id) => {
            const p = GROUP_SORT_PRESETS[id]
            const active = groupSort === id
            return (
              <button
                key={id}
                type="button"
                data-testid={`group-sort-${id}`}
                onClick={() => setGroupSort(id)}
                className={`rounded-md border px-2 py-1.5 text-left transition ${
                  active
                    ? 'border-violet-500/50 bg-violet-500/12 text-violet-100'
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

      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={fitPrint}
          onChange={(e) => setFitPrint(e.target.checked)}
          className="rounded border-zinc-600"
        />
        Fit into print box when single-page (shrink if needed)
      </label>
      {canvas.dissolvePrintArea ? (
        <p className="text-[10px] leading-snug text-emerald-500/90">
          Dissolve print pages is on (Sheet properties) — pack uses continuous
          max space.
        </p>
      ) : null}
      <p className="text-[9px] leading-snug text-zinc-600">
        Always <span className="text-zinc-400">free-flow</span>.
        <span className="text-zinc-400"> Levels</span> multi-select for nested
        frames (L1 wraps L2).
        <span className="text-zinc-400"> N-gon</span> = L/stepped chrome on card
        runs (not a full empty box).
      </p>

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
            AI layout (Ollama Cloud)
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
          Browser → <code className="text-zinc-500">/ollama-proxy</code> (no
          CORS) → Cloud or local. Put{' '}
          <code className="text-zinc-500">OLLAMA_API_KEY</code> in{' '}
          <code className="text-zinc-500">.env</code> (not VITE_*) and restart
          Vite. Create key:{' '}
          <a
            className="text-indigo-400/90 hover:underline"
            href="https://ollama.com/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            ollama.com/settings/keys
          </a>
          .
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
            ? `Online · ${backend} · ${baseUrl} · ${ollamaModels.length} model(s)`
            : ollamaOk === false
              ? `Offline · ${backend} — check OLLAMA_API_KEY / restart Vite`
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
