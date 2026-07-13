/**
 * High-level outline agents write — composed into a full SheetDocument.
 * Prefer this over hand-placing x/y for each card.
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
