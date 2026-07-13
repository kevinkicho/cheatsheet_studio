/**
 * Curated process-chart blocks (flowcharts + mind maps) for the SDK catalog.
 * Seed library historically covers equations/tables/figures only; agents use these
 * for process cards that match Studio Mermaid process charts.
 */
import type { CatalogItem } from './catalog'

/** Process-capable catalog entries (mermaidSource required). */
export type ProcessBlock = CatalogItem & {
  type: 'process'
  mermaidSource: string
  mermaidKind: 'flowchart' | 'mindmap'
  mermaidDirection?: 'TD' | 'LR' | 'BT' | 'RL'
}

/**
 * Premade process blocks — ids are stable for agents (`proc-…`).
 * Prefer these over inventing Mermaid when the intent matches.
 */
export const PROCESS_BLOCKS: ProcessBlock[] = [
  {
    id: 'proc-problem-solve',
    type: 'process',
    title: 'Problem-solving flow',
    subject: 'mathematics',
    topic: 'General',
    tags: ['exam', 'workflow', 'flowchart'],
    description: 'Generic exam problem workflow.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Read problem] --> B[Identify givens / unknown]
  B --> C[Pick formula or method]
  C --> D[Compute carefully]
  D --> E[Check units / reasonableness]
  E --> F[State answer]`,
  },
  {
    id: 'proc-differentiate',
    type: 'process',
    title: 'Differentiate workflow',
    subject: 'mathematics',
    topic: 'Calculus',
    tags: ['derivatives', 'flowchart'],
    description: 'Chain / product / quotient decision tree.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Identify f] --> B{Product / chain / quotient?}
  B -->|Chain| C[Inner then outer]
  B -->|Product| D[u'v + uv']
  B -->|Quotient| E[(u'v - uv') / v²]
  C --> F[Simplify]
  D --> F
  E --> F`,
  },
  {
    id: 'proc-integrate',
    type: 'process',
    title: 'Integration technique picker',
    subject: 'mathematics',
    topic: 'Calculus',
    tags: ['integrals', 'flowchart'],
    description: 'Choose u-sub, parts, or partial fractions.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Look at integrand] --> B{f(g) g' form?}
  B -->|Yes| C[u-substitution]
  B -->|No| D{Product of unlike?}
  D -->|Yes| E[Integration by parts]
  D -->|No| F{Rational?}
  F -->|Yes| G[Partial fractions]
  F -->|No| H[Table / rewrite]
  C --> I[Simplify + +C]
  E --> I
  G --> I
  H --> I`,
  },
  {
    id: 'proc-hypothesis-test',
    type: 'process',
    title: 'Hypothesis test workflow',
    subject: 'mathematics',
    topic: 'Statistics',
    tags: ['stats', 'p-value', 'flowchart'],
    description: 'H0/Ha → statistic → decision.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[State H0 / Ha] --> B[Choose α and test]
  B --> C[Compute statistic]
  C --> D[p-value or critical region]
  D --> E{Reject H0?}
  E -->|Yes| F[Significant at α]
  E -->|No| G[Fail to reject]
  F --> H[Context sentence]
  G --> H`,
  },
  {
    id: 'proc-bayes-update',
    type: 'process',
    title: 'Bayes update flow',
    subject: 'mathematics',
    topic: 'Probability',
    tags: ['bayes', 'flowchart'],
    description: 'Prior → likelihood → posterior.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'LR',
    mermaidSource: `flowchart LR
  A[Prior P(H)] --> B[Likelihood P(D|H)]
  B --> C[Evidence P(D)]
  C --> D[Posterior P(H|D)]
  D --> E[Decision / next data]`,
  },
  {
    id: 'proc-npv-screen',
    type: 'process',
    title: 'NPV project screen',
    subject: 'finance',
    topic: 'Capital budgeting',
    tags: ['npv', 'irr', 'flowchart'],
    description: 'Estimate CF → discount → accept/reject.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Estimate free cash flows] --> B[Choose discount rate r]
  B --> C[Compute NPV / IRR / PI]
  C --> D{NPV > 0?}
  D -->|Yes| E[Rank and fund]
  D -->|No| F[Reject or rework CF]
  E --> G[Sensitivity / scenarios]`,
  },
  {
    id: 'proc-capm-apply',
    type: 'process',
    title: 'Apply CAPM',
    subject: 'finance',
    topic: 'Asset pricing',
    tags: ['capm', 'beta', 'flowchart'],
    description: 'Rf, beta, market premium → required return.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'LR',
    mermaidSource: `flowchart LR
  A[Get Rf] --> B[Estimate beta]
  B --> C[Estimate E Rm]
  C --> D[Compute E Ri]
  D --> E[Compare to forecast]`,
  },
  {
    id: 'proc-supply-demand-shock',
    type: 'process',
    title: 'Supply/demand shock analysis',
    subject: 'economics',
    topic: 'Microeconomics',
    tags: ['elasticity', 'equilibrium', 'flowchart'],
    description: 'Identify shock → shift → new equilibrium.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Identify shock] --> B{Demand or supply?}
  B -->|Demand| C[Shift D]
  B -->|Supply| D[Shift S]
  C --> E[New eq P*, Q*]
  D --> E
  E --> F[Surplus / shortage transition]`,
  },
  {
    id: 'proc-lab-method',
    type: 'process',
    title: 'Lab method overview',
    subject: 'chemistry',
    topic: 'General',
    tags: ['lab', 'flowchart'],
    description: 'Plan → measure → analyze → report.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Hypothesis] --> B[Design procedure]
  B --> C[Measure data]
  C --> D[Analyze / error]
  D --> E[Conclusion]
  E --> F[Report]`,
  },
  {
    id: 'proc-kinematics-1d',
    type: 'process',
    title: '1D kinematics approach',
    subject: 'physics',
    topic: 'Mechanics',
    tags: ['kinematics', 'flowchart'],
    description: 'List knowns → pick equation → solve.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[List knowns / unknown] --> B{Constant a?}
  B -->|Yes| C[Pick kinematic equation]
  B -->|No| D[Use calculus / energy]
  C --> E[Solve algebraically]
  D --> E
  E --> F[Check units & sign]`,
  },
  {
    id: 'proc-energy-conservation',
    type: 'process',
    title: 'Energy conservation flow',
    subject: 'physics',
    topic: 'Mechanics',
    tags: ['energy', 'work', 'flowchart'],
    description: 'System → energy types → solve.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Define system] --> B[Initial energy]
  B --> C[Final energy]
  C --> D{Non-conservative work?}
  D -->|Yes| E[ΔE_mech = W_nc]
  D -->|No| F[E_i = E_f]
  E --> G[Solve for unknown]
  F --> G`,
  },
  {
    id: 'proc-limiting-reagent',
    type: 'process',
    title: 'Limiting reagent workflow',
    subject: 'chemistry',
    topic: 'Stoichiometry',
    tags: ['moles', 'flowchart'],
    description: 'Balance → moles → limiting → product.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Balance equation] --> B[Convert to moles]
  B --> C[Compare mole ratios]
  C --> D[Identify limiting reagent]
  D --> E[Compute product moles]
  E --> F[Mass / yield if needed]`,
  },
  {
    id: 'proc-monohybrid',
    type: 'process',
    title: 'Monohybrid cross flow',
    subject: 'biology',
    topic: 'Genetics',
    tags: ['mendel', 'punnett', 'flowchart'],
    description: 'Parents → gametes → Punnett → ratios.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Parental genotypes] --> B[Gametes]
  B --> C[Punnett square]
  C --> D[Offspring genotypes]
  D --> E[Phenotype ratios]`,
  },
  {
    id: 'proc-exam-checklist',
    type: 'process',
    title: 'Exam problem checklist',
    subject: 'general',
    topic: 'Study skills',
    tags: ['exam', 'flowchart'],
    description: 'Fast midterm checklist.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'LR',
    mermaidSource: `flowchart LR
  A[Read carefully] --> B[Identify topic]
  B --> C[Pick formula]
  C --> D[Plug numbers]
  D --> E[Units / sanity]
  E --> F[Box answer]`,
  },
  {
    id: 'proc-mind-calc-topics',
    type: 'process',
    title: 'Calculus topics mind map',
    subject: 'mathematics',
    topic: 'Calculus',
    tags: ['mindmap', 'overview'],
    description: 'High-level calc topic map.',
    mermaidKind: 'mindmap',
    mermaidSource: `mindmap
  root((Calculus))
    Limits
      Continuity
      L'Hôpital
    Derivatives
      Rules
      Applications
    Integrals
      FTC
      Techniques
    Series
      Taylor
      Convergence`,
  },
  {
    id: 'proc-mind-finance-topics',
    type: 'process',
    title: 'Finance midterm mind map',
    subject: 'finance',
    topic: 'Corporate finance',
    tags: ['mindmap', 'midterm'],
    description: 'TVM / risk / capital map.',
    mermaidKind: 'mindmap',
    mermaidSource: `mindmap
  root((Finance))
    TVM
      PV FV
      Annuities
    Projects
      NPV
      IRR
    Risk
      CAPM
      Beta
    Capital
      WACC
      Leverage`,
  },
  {
    id: 'proc-mind-micro-topics',
    type: 'process',
    title: 'Microeconomics mind map',
    subject: 'economics',
    topic: 'Microeconomics',
    tags: ['mindmap', 'overview'],
    description: 'S&D, elasticity, surplus map.',
    mermaidKind: 'mindmap',
    mermaidSource: `mindmap
  root((Micro))
    Markets
      Supply
      Demand
      Equilibrium
    Elasticity
      PED
      Revenue
    Welfare
      CS PS
      DWL
    Firm
      Cost
      Profit`,
  },
  {
    id: 'proc-generic-start',
    type: 'process',
    title: 'Generic process starter',
    subject: 'general',
    topic: 'Templates',
    tags: ['template', 'flowchart'],
    description: 'Blank-ish starter flowchart (edit after import).',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  Start([Start]) --> Input[Collect input]
  Input --> Check{Valid?}
  Check -->|Yes| Process[Process data]
  Check -->|No| Input
  Process --> Done([Done])`,
  },
  {
    id: 'proc-mind-generic',
    type: 'process',
    title: 'Generic mind map starter',
    subject: 'general',
    topic: 'Templates',
    tags: ['template', 'mindmap'],
    description: 'Starter mind map (edit after import).',
    mermaidKind: 'mindmap',
    mermaidSource: `mindmap
  root((Topic))
    Branch A
      Detail 1
      Detail 2
    Branch B
      Detail 3
    Branch C`,
  },
]

export function listProcessBlocks(opts?: {
  subject?: string
  kind?: 'flowchart' | 'mindmap' | 'all'
  query?: string
}): ProcessBlock[] {
  let list = [...PROCESS_BLOCKS]
  const kind = opts?.kind ?? 'all'
  const subject = opts?.subject?.trim().toLowerCase()
  const q = opts?.query?.trim().toLowerCase()
  if (kind !== 'all') {
    list = list.filter((b) => b.mermaidKind === kind)
  }
  if (subject) {
    list = list.filter(
      (b) =>
        (b.subject ?? '').toLowerCase() === subject ||
        (b.subject ?? '').toLowerCase().includes(subject) ||
        subject.includes((b.subject ?? '').toLowerCase()),
    )
  }
  if (q) {
    list = list.filter((b) => {
      const hay = [
        b.id,
        b.title,
        b.topic,
        b.description,
        ...(b.tags ?? []),
        b.mermaidSource,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }
  return list
}

export function findProcessBlock(idOrTitle: string): ProcessBlock | null {
  const key = idOrTitle.trim().toLowerCase()
  return (
    PROCESS_BLOCKS.find((b) => b.id.toLowerCase() === key) ??
    PROCESS_BLOCKS.find((b) => b.title.toLowerCase() === key) ??
    PROCESS_BLOCKS.find((b) => b.title.toLowerCase().includes(key)) ??
    null
  )
}
