import type {
  MermaidDiagramKind,
  MermaidFlowDirection,
  MermaidThemeId,
} from '@/types'

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
    id: 'sequence',
    label: 'Sequence',
    description: 'Actors and message order',
  },
  {
    id: 'state',
    label: 'State',
    description: 'States and transitions',
  },
  {
    id: 'class',
    label: 'Class',
    description: 'Classes and relationships',
  },
  {
    id: 'er',
    label: 'ER diagram',
    description: 'Entities and relations',
  },
  {
    id: 'pie',
    label: 'Pie chart',
    description: 'Simple proportional slices',
  },
  {
    id: 'mindmap',
    label: 'Mind map',
    description: 'Hierarchical ideas',
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

/** Starter templates for each diagram kind. */
export function mermaidTemplate(
  kind: MermaidDiagramKind,
  direction: MermaidFlowDirection = 'TD',
): string {
  switch (kind) {
    case 'flowchart':
      return `flowchart ${direction}
    Start([Start]) --> Input[Collect input]
    Input --> Check{Valid?}
    Check -->|Yes| Process[Process data]
    Check -->|No| Input
    Process --> Done([Done])`
    case 'sequence':
      return `sequenceDiagram
    actor User
    participant UI
    participant API
    participant DB
    User->>UI: Submit form
    UI->>API: POST /items
    API->>DB: Insert row
    DB-->>API: OK
    API-->>UI: 201 Created
    UI-->>User: Success`
    case 'state':
      return `stateDiagram-v2
    [*] --> Draft
    Draft --> Review: submit
    Review --> Draft: changes requested
    Review --> Published: approve
    Published --> [*]`
    case 'class':
      return `classDiagram
    class Order {
      +String id
      +Date created
      +place()
      +cancel()
    }
    class Customer {
      +String name
      +String email
    }
    Customer "1" --> "*" Order : places`
    case 'er':
      return `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER {
      string name
      string email
    }
    ORDER {
      string id
      date created
    }`
    case 'pie':
      return `pie showData
    title Study time
    "Math" : 40
    "Physics" : 25
    "Review" : 20
    "Breaks" : 15`
    case 'mindmap':
      return `mindmap
  root((Cheat sheet))
    Formulas
      Algebra
      Calculus
    Process
      Study plan
      Exam tips
    Visuals
      Diagrams
      Tables`
    default:
      return `flowchart ${direction}
    A[Start] --> B[End]`
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
