/**
 * AI-assisted cheatsheet packing via local Ollama (e.g. gemma4:31b-cloud).
 * Returns packing knobs and/or absolute placements inside the print content box.
 */
import type { CanvasItem, SheetCanvas } from '@/types'
import {
  getContentBox,
  packCheatsheetLayout,
  type CheatsheetLayoutOptions,
  type ContentDensity,
  DENSITY_PRESETS,
} from '@/lib/autoOrganize'
import {
  DEFAULT_OLLAMA_BASE,
  DEFAULT_OLLAMA_MODEL,
  ollamaChat,
  parseJsonFromModel,
} from '@/lib/ollamaClient'

export type AiLayoutPlacement = {
  id: string
  x: number
  y: number
  width?: number
  height?: number
  fontSize?: number
  titleFontSize?: number
}

export type AiLayoutSuggestion = {
  density?: ContentDensity
  gap?: number
  columns?: number | 'auto'
  mode?: 'columns' | 'flow'
  fitPrint?: boolean
  /** Optional freeform note from the model (shown in UI). */
  rationale?: string
  /** When present and complete enough, applied as absolute layout. */
  placements?: AiLayoutPlacement[]
}

export type AiLayoutResult = {
  suggestion: AiLayoutSuggestion
  /** Items after applying AI params and/or placements. */
  items: CanvasItem[]
  printPageCount: number
  model: string
  /** true when model returned usable per-card positions. */
  usedPlacements: boolean
}

function cardKind(it: CanvasItem): string {
  if (it.type === 'process-chart' || it.mermaidSource) return 'process'
  if (it.type === 'table' || it.tableMarkdown) return 'table'
  if (it.imageUrl) return 'figure'
  if (it.latex?.trim().startsWith('\\text{')) return 'heading'
  return 'equation'
}

function summarizeItems(items: CanvasItem[]) {
  return items
    .filter((i) => !i.hidden)
    .map((it) => ({
      id: it.id,
      kind: cardKind(it),
      title: (it.title || '').slice(0, 48),
      w: Math.round(it.width),
      h: Math.round(it.height),
    }))
}

const SYSTEM = `You are a print cheatsheet layout expert for CheatSheet Studio.
Goal: pack many math/science cards into a letter page content box so they stay readable but tight.
Return ONLY valid JSON (no markdown). Prefer multi-column sectioned layouts.
Density: xs (densest midterm) | sm (recommended) | md | lg (roomy).
Do not invent card ids — only use ids from the user payload.`

function buildUserPrompt(
  items: ReturnType<typeof summarizeItems>,
  box: { left: number; top: number; width: number; height: number },
  hint?: string,
): string {
  return JSON.stringify(
    {
      task: 'cheatsheet_layout',
      contentBox: {
        x: box.left,
        y: box.top,
        width: box.width,
        height: box.height,
      },
      cards: items,
      userHint: hint ?? 'Dense exam cheat sheet; keep related cards together.',
      respondWith: {
        density: 'xs|sm|md|lg',
        gap: 'number px 4-24',
        columns: '1|2|3|auto',
        mode: 'columns|flow',
        fitPrint: true,
        rationale: 'short string',
        placements:
          'optional array of {id,x,y,width?,height?} all inside contentBox; include every card id if used',
      },
    },
    null,
    0,
  )
}

function clampPlacement(
  p: AiLayoutPlacement,
  box: { left: number; top: number; width: number; height: number },
): AiLayoutPlacement {
  const w = Math.max(40, Math.min(box.width, p.width ?? 200))
  const h = Math.max(24, Math.min(box.height, p.height ?? 80))
  const x = Math.max(box.left, Math.min(box.left + box.width - w, p.x))
  const y = Math.max(box.top, Math.min(box.top + box.height * 3, p.y))
  return {
    id: p.id,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(w),
    height: Math.round(h),
    fontSize: p.fontSize,
    titleFontSize: p.titleFontSize,
  }
}

function normalizeSuggestion(
  raw: AiLayoutSuggestion,
  cardIds: Set<string>,
  box: { left: number; top: number; width: number; height: number },
): AiLayoutSuggestion {
  const dens =
    raw.density && raw.density in DENSITY_PRESETS
      ? raw.density
      : ('sm' as ContentDensity)
  let columns: number | 'auto' = 'auto'
  if (raw.columns === 'auto' || raw.columns === undefined) columns = 'auto'
  else if (typeof raw.columns === 'number')
    columns = Math.min(3, Math.max(1, Math.round(raw.columns)))
  else if (raw.columns === 1 || raw.columns === 2 || raw.columns === 3)
    columns = raw.columns

  let placements: AiLayoutPlacement[] | undefined
  if (Array.isArray(raw.placements) && raw.placements.length > 0) {
    const mapped = raw.placements
      .filter((p) => p && typeof p.id === 'string' && cardIds.has(p.id))
      .map((p) =>
        clampPlacement(
          {
            id: p.id,
            x: Number(p.x) || box.left,
            y: Number(p.y) || box.top,
            width: typeof p.width === 'number' ? p.width : undefined,
            height: typeof p.height === 'number' ? p.height : undefined,
            fontSize:
              typeof p.fontSize === 'number' ? p.fontSize : undefined,
            titleFontSize:
              typeof p.titleFontSize === 'number'
                ? p.titleFontSize
                : undefined,
          },
          box,
        ),
      )
    // Only use freeform placements if ≥70% of visible cards covered
    if (mapped.length >= Math.ceil(cardIds.size * 0.7)) {
      placements = mapped
    }
  }

  return {
    density: dens,
    gap:
      typeof raw.gap === 'number' && Number.isFinite(raw.gap)
        ? Math.max(2, Math.min(32, Math.round(raw.gap)))
        : dens === 'xs'
          ? 6
          : 8,
    columns,
    mode: raw.mode === 'flow' ? 'flow' : 'columns',
    fitPrint: raw.fitPrint !== false,
    rationale:
      typeof raw.rationale === 'string' ? raw.rationale.slice(0, 280) : undefined,
    placements,
  }
}

export type SuggestLayoutOpts = {
  baseUrl?: string
  model?: string
  hint?: string
  signal?: AbortSignal
  /** Starting knobs shown in UI (merged as soft preferences). */
  preferred?: Partial<CheatsheetLayoutOptions>
}

/**
 * Ask Ollama for layout params (and optional placements), then pack the sheet.
 */
export async function suggestCheatsheetLayoutWithOllama(
  items: CanvasItem[],
  canvas: SheetCanvas,
  opts: SuggestLayoutOpts = {},
): Promise<AiLayoutResult> {
  const box = getContentBox(canvas)
  const summary = summarizeItems(items)
  if (summary.length === 0) {
    return {
      suggestion: { density: 'sm', gap: 8, columns: 'auto', mode: 'columns' },
      items,
      printPageCount: canvas.printPageCount ?? 1,
      model: opts.model ?? DEFAULT_OLLAMA_MODEL,
      usedPlacements: false,
    }
  }

  const { content, model } = await ollamaChat({
    baseUrl: opts.baseUrl ?? DEFAULT_OLLAMA_BASE,
    model: opts.model ?? DEFAULT_OLLAMA_MODEL,
    temperature: 0.25,
    json: true,
    signal: opts.signal,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: buildUserPrompt(summary, box, opts.hint),
      },
    ],
  })

  const parsed = parseJsonFromModel<AiLayoutSuggestion>(content)
  const cardIds = new Set(summary.map((c) => c.id))
  const suggestion = normalizeSuggestion(parsed, cardIds, box)

  // Soft-merge UI preferences when model omits fields
  if (opts.preferred?.density && !parsed.density) {
    suggestion.density = opts.preferred.density
  }
  if (opts.preferred?.gap != null && parsed.gap == null) {
    suggestion.gap = opts.preferred.gap
  }

  if (suggestion.placements && suggestion.placements.length > 0) {
    const byId = new Map(suggestion.placements.map((p) => [p.id, p]))
    const dens = suggestion.density ?? 'sm'
    const preset = DENSITY_PRESETS[dens]
    const next = items.map((it) => {
      const p = byId.get(it.id)
      if (!p) return it
      return {
        ...it,
        x: p.x,
        y: p.y,
        width: p.width ?? it.width,
        height: p.height ?? it.height,
        autoFit: false,
        contentFill: true,
        style: {
          ...it.style,
          fontSize: p.fontSize ?? preset.fontSize,
          titleFontSize: p.titleFontSize ?? preset.titleFontSize,
        },
      }
    })
    // Optional second-pass fit using packer if overflowing badly
    const maxY = next.reduce(
      (m, it) => (it.hidden ? m : Math.max(m, it.y + it.height)),
      box.top,
    )
    if (suggestion.fitPrint !== false && maxY > box.top + box.height * 1.15) {
      const packed = packCheatsheetLayout(next, canvas, {
        density: dens,
        gap: suggestion.gap,
        columns: suggestion.columns,
        mode: suggestion.mode,
        fitPrint: true,
      })
      return {
        suggestion,
        items: packed.items,
        printPageCount: packed.printPageCount,
        model,
        usedPlacements: false,
      }
    }
    return {
      suggestion,
      items: next,
      printPageCount: Math.max(1, canvas.printPageCount ?? 1),
      model,
      usedPlacements: true,
    }
  }

  const packed = packCheatsheetLayout(items, canvas, {
    density: suggestion.density ?? 'sm',
    gap: suggestion.gap,
    columns: suggestion.columns ?? 'auto',
    mode: suggestion.mode ?? 'columns',
    fitPrint: suggestion.fitPrint !== false,
  })
  return {
    suggestion,
    items: packed.items,
    printPageCount: packed.printPageCount,
    model,
    usedPlacements: false,
  }
}
