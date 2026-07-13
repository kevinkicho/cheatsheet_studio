/**
 * Curated process-chart blocks (flowcharts + mind maps) for the SDK catalog.
 * Mermaid labels avoid bare quotes/unicode that break parse (use double-quoted nodes).
 */
import type { CatalogItem } from './catalog'

export type ProcessBlock = CatalogItem & {
  type: 'process'
  mermaidSource: string
  mermaidKind: 'flowchart' | 'mindmap'
  mermaidDirection?: 'TD' | 'LR' | 'BT' | 'RL'
}

/**
 * Premade process blocks — ids are stable for agents (`proc-…`).
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
  A[Read problem] --> B[Identify givens]
  B --> C[Pick formula or method]
  C --> D[Compute carefully]
  D --> E[Check units]
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
  A[Identify f] --> B{Which rule?}
  B -->|Chain| C[Inner then outer]
  B -->|Product| D["u v product"]
  B -->|Quotient| E["u over v"]
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
  A[Look at integrand] --> B{Composition form?}
  B -->|Yes| C[u-substitution]
  B -->|No| D{Unlike product?}
  D -->|Yes| E[Integration by parts]
  D -->|No| F{Rational?}
  F -->|Yes| G[Partial fractions]
  F -->|No| H[Table or rewrite]
  C --> I[Simplify]
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
    description: 'H0/Ha to decision.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A["State H0 and Ha"] --> B["Choose alpha and test"]
  B --> C[Compute statistic]
  C --> D[p-value or critical]
  D --> E{Reject H0?}
  E -->|Yes| F[Significant]
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
    description: 'Prior to posterior.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'LR',
    mermaidSource: `flowchart LR
  A[Prior] --> B[Likelihood]
  B --> C[Evidence]
  C --> D[Posterior]
  D --> E[Decision]`,
  },
  {
    id: 'proc-npv-screen',
    type: 'process',
    title: 'NPV project screen',
    subject: 'finance',
    topic: 'Capital budgeting',
    tags: ['npv', 'irr', 'flowchart'],
    description: 'Estimate CF then accept/reject.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Estimate free cash flows] --> B[Choose discount rate]
  B --> C[Compute NPV IRR PI]
  C --> D{NPV positive?}
  D -->|Yes| E[Rank and fund]
  D -->|No| F[Reject or rework]
  E --> G[Sensitivity check]`,
  },
  {
    id: 'proc-capm-apply',
    type: 'process',
    title: 'Apply CAPM',
    subject: 'finance',
    topic: 'Asset pricing',
    tags: ['capm', 'beta', 'flowchart'],
    description: 'Rf, beta, market premium to required return.',
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
    description: 'Identify shock then new equilibrium.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Identify shock] --> B{Demand or supply?}
  B -->|Demand| C[Shift D]
  B -->|Supply| D[Shift S]
  C --> E[New equilibrium]
  D --> E
  E --> F[Surplus or shortage path]`,
  },
  {
    id: 'proc-lab-method',
    type: 'process',
    title: 'Lab method overview',
    subject: 'chemistry',
    topic: 'General',
    tags: ['lab', 'flowchart'],
    description: 'Plan measure analyze report.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Hypothesis] --> B[Design procedure]
  B --> C[Measure data]
  C --> D[Analyze error]
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
    description: 'List knowns then pick equation.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[List knowns and unknown] --> B{Constant a?}
  B -->|Yes| C[Pick kinematic equation]
  B -->|No| D[Use calculus or energy]
  C --> E[Solve algebraically]
  D --> E
  E --> F[Check units and sign]`,
  },
  {
    id: 'proc-energy-conservation',
    type: 'process',
    title: 'Energy conservation flow',
    subject: 'physics',
    topic: 'Mechanics',
    tags: ['energy', 'work', 'flowchart'],
    description: 'System energy types solve.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Define system] --> B[Initial energy]
  B --> C[Final energy]
  C --> D{Nonconservative work?}
  D -->|Yes| E["Delta E equals Wnc"]
  D -->|No| F["Ei equals Ef"]
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
    description: 'Balance moles limiting product.',
    mermaidKind: 'flowchart',
    mermaidDirection: 'TD',
    mermaidSource: `flowchart TD
  A[Balance equation] --> B[Convert to moles]
  B --> C[Compare mole ratios]
  C --> D[Identify limiting reagent]
  D --> E[Compute product moles]
  E --> F[Mass or yield]`,
  },
  {
    id: 'proc-monohybrid',
    type: 'process',
    title: 'Monohybrid cross flow',
    subject: 'biology',
    topic: 'Genetics',
    tags: ['mendel', 'punnett', 'flowchart'],
    description: 'Parents gametes Punnett ratios.',
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
  D --> E[Units sanity]
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
      LHopital
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
    description: 'TVM risk capital map.',
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
    description: 'S and D elasticity surplus map.',
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
    description: 'Starter flowchart edit after import.',
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
    description: 'Starter mind map edit after import.',
    mermaidKind: 'mindmap',
    mermaidSource: `mindmap
  root((Topic))
    BranchA
      Detail1
      Detail2
    BranchB
      Detail3
    BranchC`,
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
