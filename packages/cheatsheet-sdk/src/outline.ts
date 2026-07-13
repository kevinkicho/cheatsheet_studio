/**
 * High-level outline agents write — composed into a full SheetDocument.
 * Prefer this over hand-placing x/y for each card.
 *
 * Prefer Studio blocks via `catalog` / `blocks` so equations, figures, and
 * process charts match the app library quality.
 */
export type OutlineBlock =
  | {
      type: 'equation'
      title?: string
      latex: string
    }
  | {
      type: 'table'
      title?: string
      /** Pipe markdown table */
      markdown: string
    }
  | {
      type: 'process'
      title?: string
      mermaid: string
      kind?: 'flowchart' | 'mindmap'
    }
  | {
      type: 'figure'
      title?: string
      imageUrl: string
    }
  | {
      type: 'heading'
      /** Section label — becomes a zero-height spacer title card (equation-style note) */
      title: string
      note?: string
    }
  | {
      /** Pull one Studio block (equation/table/figure/process) by id or title */
      type: 'catalog'
      /** Catalog id (preferred) or title */
      id: string
    }
  | {
      /** Pull several Studio blocks by id/title */
      type: 'catalog'
      ids: string[]
    }
  | {
      /**
       * Alias for catalog — agent-facing “use our blocks”.
       * Either a single `id`, many `ids`, or a search pick.
       */
      type: 'blocks'
      id?: string
      ids?: string[]
      /** Search query when id/ids omitted */
      query?: string
      /** equation | table | figure | process */
      blockType?: 'equation' | 'table' | 'figure' | 'process' | 'all'
      subject?: string
      processKind?: 'flowchart' | 'mindmap' | 'all'
      /** How many search hits to append (default 3, max 12) */
      limit?: number
    }

export type SheetOutline = {
  title: string
  /** Optional agent notes stored in meta */
  notes?: string
  /** print size; default letter */
  printSizeId?: 'letter' | 'legal' | 'tabloid' | 'a3' | 'a4' | 'a5'
  orientation?: 'portrait' | 'landscape'
  blocks: OutlineBlock[]
  /** Run auto-layout after compose (default true) */
  autoLayout?: boolean
}
