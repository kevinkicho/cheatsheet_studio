import type {
  MermaidDiagramKind,
  MermaidFlowDirection,
  MermaidThemeId,
} from '@/types'

/** Diagram types offered in the Process panel. */
export const MERMAID_KINDS: {
  id: MermaidDiagramKind
  label: string
  description: string
}[] = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    description: 'Process steps, decisions, branches',
  },
  {
    id: 'mindmap',
    label: 'Mind map',
    description: 'Hierarchical ideas (Mermaid mindmap)',
  },
]

export const MERMAID_DIRECTIONS: {
  id: MermaidFlowDirection
  label: string
}[] = [
  { id: 'TD', label: 'Top → bottom' },
  { id: 'LR', label: 'Left → right' },
  { id: 'BT', label: 'Bottom → top' },
  { id: 'RL', label: 'Right → left' },
]

export const MERMAID_THEMES: { id: MermaidThemeId; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'default', label: 'Default' },
  { id: 'forest', label: 'Forest' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'base', label: 'Base' },
]

/**
 * Official Mermaid mindmap example (syntax/mindmap).
 * https://mermaid.js.org/syntax/mindmap.html
 */
export const MERMAID_MINDMAP_EXAMPLE = `mindmap
  root((mindmap))
    Origins
      Long history
      ::icon(fa fa-book)
      Popularisation
        British popular psychology author Tony Buzan
    Research
      On effectiveness<br/>and features
      On Automatic creation
        Uses
            Creative techniques
            Strategic planning
            Argument mapping
    Tools
      Pen and paper
      Mermaid`

/** Starter templates for Process diagram types. */
export function mermaidTemplate(
  kind: MermaidDiagramKind = 'flowchart',
  direction: MermaidFlowDirection = 'TD',
): string {
  switch (kind) {
    case 'mindmap':
      return MERMAID_MINDMAP_EXAMPLE
    case 'flowchart':
    default:
      return `flowchart ${direction}
    Start([Start]) --> Input[Collect input]
    Input --> Check{Valid?}
    Check -->|Yes| Process[Process data]
    Check -->|No| Input
    Process --> Done([Done])`
  }
}

/**
 * If source is a flowchart/graph and direction changes, rewrite the header line.
 */
export function applyFlowDirection(
  source: string,
  direction: MermaidFlowDirection,
): string {
  const lines = source.split(/\r?\n/)
  const headerRe = /^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i
  let replaced = false
  const next = lines.map((line) => {
    if (replaced) return line
    if (headerRe.test(line.trim())) {
      replaced = true
      return line.replace(headerRe, (_, kw: string) => `${kw} ${direction}`)
    }
    return line
  })
  if (!replaced && /flowchart|graph/i.test(source)) {
    return `flowchart ${direction}\n${source}`
  }
  return next.join('\n')
}

export function detectFlowDirection(
  source: string,
): MermaidFlowDirection | null {
  const m = source.match(/^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/im)
  if (!m) return null
  const d = m[1]!.toUpperCase()
  if (d === 'TB') return 'TD'
  if (d === 'TD' || d === 'LR' || d === 'RL' || d === 'BT') return d
  return null
}

/** Classify Mermaid source. */
export function detectMermaidKind(source: string): MermaidDiagramKind {
  const head = source.trim().split(/\r?\n/)[0]?.trim().toLowerCase() ?? ''
  if (head.startsWith('sequencediagram')) return 'sequence'
  if (head.startsWith('statediagram')) return 'state'
  if (head.startsWith('classdiagram')) return 'class'
  if (head.startsWith('erdiagram')) return 'er'
  if (head.startsWith('pie')) return 'pie'
  if (head.startsWith('mindmap')) return 'mindmap'
  if (head.startsWith('flowchart') || head.startsWith('graph')) return 'flowchart'
  return 'flowchart'
}

/** Kinds the Process panel can load / create (chips). */
export function isProcessPanelKind(
  kind: MermaidDiagramKind,
): kind is 'flowchart' | 'mindmap' {
  return kind === 'flowchart' || kind === 'mindmap'
}
