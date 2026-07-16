/**
 * Enriched Tier 1 (prose) + Tier 2 (STEM structured) seed blocks.
 * Merged into SEED_LIBRARY via seedLibrary.ts.
 *
 * Kinds: definition | list | callout | code | constant | identity-set | plot | matrix
 */
import type { CalloutVariant, LibraryItem, Subject } from '@/types'

function svgUrl(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg.trim())
}

function defn(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  term: string,
  body: string,
  tags: string[],
  description?: string,
): LibraryItem {
  return {
    id,
    type: 'definition',
    title,
    subject,
    topic,
    tags,
    term,
    body,
    description,
    isSystem: true,
  }
}

function listCard(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  listItems: string[],
  tags: string[],
  opts?: { listOrdered?: boolean; description?: string },
): LibraryItem {
  return {
    id,
    type: 'list',
    title,
    subject,
    topic,
    tags,
    listItems,
    listOrdered: opts?.listOrdered,
    description: opts?.description,
    isSystem: true,
  }
}

function callout(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  body: string,
  tags: string[],
  opts?: { calloutVariant?: CalloutVariant; description?: string },
): LibraryItem {
  return {
    id,
    type: 'callout',
    title,
    subject,
    topic,
    tags,
    body,
    calloutVariant: opts?.calloutVariant ?? 'note',
    description: opts?.description,
    isSystem: true,
  }
}

function codeCard(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  code: string,
  tags: string[],
  opts?: { codeLanguage?: string; description?: string },
): LibraryItem {
  return {
    id,
    type: 'code',
    title,
    subject,
    topic,
    tags,
    code,
    codeLanguage: opts?.codeLanguage,
    description: opts?.description,
    isSystem: true,
  }
}

function constant(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  symbol: string,
  value: string,
  unit: string,
  tags: string[],
  opts?: { latex?: string; body?: string; description?: string },
): LibraryItem {
  return {
    id,
    type: 'constant',
    title,
    subject,
    topic,
    tags,
    symbol,
    value,
    unit,
    latex: opts?.latex,
    body: opts?.body,
    description: opts?.description,
    isSystem: true,
  }
}

function identitySet(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  identities: string[],
  tags: string[],
  description?: string,
): LibraryItem {
  return {
    id,
    type: 'identity-set',
    title,
    subject,
    topic,
    tags,
    identities,
    description,
    isSystem: true,
  }
}

function matrix(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  matrixRows: string[][],
  tags: string[],
  description?: string,
): LibraryItem {
  return {
    id,
    type: 'matrix',
    title,
    subject,
    topic,
    tags,
    matrixRows,
    description,
    isSystem: true,
  }
}

function plot(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  imageUrl: string,
  tags: string[],
  description?: string,
): LibraryItem {
  return {
    id,
    type: 'plot',
    title,
    subject,
    topic,
    tags,
    imageUrl,
    description,
    isSystem: true,
  }
}

/** Axis + series helper for compact plot SVGs. */
function axesSvg(
  w: number,
  h: number,
  paths: string,
  labels: string,
): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <line x1="32" y1="${h - 24}" x2="${w - 12}" y2="${h - 24}" stroke="#6b7280" stroke-width="1.5"/>
  <line x1="32" y1="${h - 24}" x2="32" y2="16" stroke="#6b7280" stroke-width="1.5"/>
  ${paths}
  ${labels}
</svg>`)
}

/**
 * Full enrichment set — ids must not collide with core seedLibrary entries.
 */
export const SEED_LIBRARY_TIERS: LibraryItem[] = [
  // ═══════════════════════════════════════════════════════════
  // DEFINITIONS
  // ═══════════════════════════════════════════════════════════
  defn(
    'def-limit',
    'Limit (definition)',
    'mathematics',
    'Calculus',
    'Limit',
    'We write limₓ→a f(x) = L when f(x) approaches L as x approaches a (from both sides unless one-sided). Formal ε–δ: for every ε > 0 there exists δ > 0 such that 0 < |x−a| < δ implies |f(x)−L| < ε.',
    ['calculus', 'glossary'],
  ),
  defn(
    'def-integral',
    'Definite integral',
    'mathematics',
    'Calculus',
    'Definite integral',
    '∫ₐᵇ f(x) dx is the net signed area under y = f(x) from x = a to x = b. By FTC, if F′ = f then ∫ₐᵇ f = F(b) − F(a).',
    ['calculus', 'glossary'],
  ),
  defn(
    'def-eigenvalue',
    'Eigenvalue',
    'mathematics',
    'Linear Algebra',
    'Eigenvalue',
    'A scalar λ is an eigenvalue of square matrix A if there exists nonzero v with Av = λv. The vector v is an eigenvector for λ.',
    ['linalg', 'glossary'],
  ),
  defn(
    'def-continuous',
    'Continuity at a point',
    'mathematics',
    'Calculus',
    'Continuous',
    'f is continuous at a if limₓ→a f(x) exists, f(a) is defined, and limₓ→a f(x) = f(a).',
    ['calculus', 'glossary'],
  ),
  defn(
    'def-variance',
    'Variance',
    'mathematics',
    'Probability',
    'Variance',
    'Var(X) = E[(X − μ)²] measures spread of a random variable about its mean μ = E[X]. Also Var(X) = E[X²] − μ².',
    ['probability', 'glossary'],
  ),
  defn(
    'def-momentum',
    'Linear momentum',
    'physics',
    'Mechanics',
    'Momentum',
    'p = mv. In an isolated system, total momentum is conserved. Force equals rate of change of momentum: F = dp/dt.',
    ['mechanics', 'glossary'],
  ),
  defn(
    'def-work',
    'Work (mechanics)',
    'physics',
    'Mechanics',
    'Work',
    'W = ∫ F · dr. For a constant force along a straight displacement, W = F d cos θ. Work–energy: net work equals change in kinetic energy.',
    ['energy', 'glossary'],
  ),
  defn(
    'def-potential',
    'Electric potential',
    'physics',
    'Electricity & Magnetism',
    'Potential V',
    'Electric potential V is potential energy per unit charge. For a point charge, V = kq/r (taking V(∞) = 0). Field E = −∇V.',
    ['em', 'glossary'],
  ),
  defn(
    'def-entropy',
    'Entropy (thermo)',
    'physics',
    'Thermodynamics',
    'Entropy S',
    'For a reversible process dS = đQ_rev / T. Entropy of an isolated system never decreases (2nd law). Measures disorder / unavailable energy.',
    ['thermo', 'glossary'],
  ),
  defn(
    'def-mole',
    'Mole',
    'chemistry',
    'Stoichiometry',
    'Mole',
    'One mole contains N_A ≈ 6.022×10²³ elementary entities. Moles = mass / molar mass. Bridge between mass and particle count.',
    ['stoichiometry', 'glossary'],
  ),
  defn(
    'def-ph',
    'pH',
    'chemistry',
    'Acids & Bases',
    'pH',
    'pH = −log₁₀[H₃O⁺] (approx. in dilute aqueous solutions). Neutral water at 25 °C has pH 7; acids lower pH, bases raise it.',
    ['acids', 'glossary'],
  ),
  defn(
    'def-equilibrium-const',
    'Equilibrium constant K',
    'chemistry',
    'Thermodynamics',
    'K',
    'For aA + bB ⇌ cC + dD, K = ([C]^c [D]^d) / ([A]^a [B]^b) at equilibrium (activities; pure solids/liquids ≈ 1). K depends only on T.',
    ['equilibrium', 'glossary'],
  ),
  defn(
    'def-gene',
    'Gene',
    'biology',
    'Genetics',
    'Gene',
    'A gene is a heritable unit of DNA that codes for a functional product (typically a protein or RNA). Alleles are alternative forms of a gene.',
    ['genetics', 'glossary'],
  ),
  defn(
    'def-enzyme',
    'Enzyme',
    'biology',
    'Enzymes',
    'Enzyme',
    'A biological catalyst (usually protein) that speeds a reaction by lowering activation energy without being consumed. Highly substrate-specific.',
    ['biochem', 'glossary'],
  ),
  defn(
    'def-homeostasis',
    'Homeostasis',
    'biology',
    'Physiology',
    'Homeostasis',
    'Maintenance of stable internal conditions (temperature, pH, glucose, etc.) via feedback loops despite external changes.',
    ['physiology', 'glossary'],
  ),
  defn(
    'def-opportunity-cost',
    'Opportunity cost',
    'economics',
    'Microeconomics',
    'Opportunity cost',
    'The value of the next-best alternative forgone when a choice is made. True economic cost includes opportunity cost, not only cash outlay.',
    ['micro', 'glossary'],
  ),
  defn(
    'def-elasticity',
    'Price elasticity of demand',
    'economics',
    'Microeconomics',
    'E_d',
    'E_d = (%ΔQ_d) / (%ΔP). |E| > 1 elastic; |E| < 1 inelastic; |E| = 1 unit elastic. Determines how revenue responds to price changes.',
    ['elasticity', 'glossary'],
  ),
  defn(
    'def-gdp',
    'GDP',
    'economics',
    'Macroeconomics',
    'GDP',
    'Market value of all final goods and services produced within a country in a period. Expenditure: Y = C + I + G + (X − M).',
    ['macro', 'glossary'],
  ),
  defn(
    'def-irr',
    'Internal rate of return',
    'finance',
    'Capital Budgeting',
    'IRR',
    'Discount rate that makes NPV of a project’s cash flows equal zero. Accept if IRR exceeds the hurdle / cost of capital (with caveats).',
    ['irr', 'glossary'],
  ),
  defn(
    'def-beta',
    'Beta (CAPM)',
    'finance',
    'Asset Pricing',
    'β',
    // $...$ → KaTeX in definition body (see lib/proseMath.ts)
    'Measures systematic risk: sensitivity of an asset’s excess return to market excess return. CAPM: $\\mathrm{E}[R_{i}] = R_{f} + \\beta_{i}(\\mathrm{E}[R_{m}] - R_{f})$.',
    ['capm', 'glossary'],
  ),
  defn(
    'def-duration',
    'Macaulay duration',
    'finance',
    'Fixed Income',
    'Duration',
    'Weighted average time to receive a bond’s cash flows (weights = PV of each cash flow / price). Approximates interest-rate sensitivity.',
    ['bonds', 'glossary'],
  ),

  // ═══════════════════════════════════════════════════════════
  // LISTS
  // ═══════════════════════════════════════════════════════════
  listCard(
    'list-derivative-rules',
    'Derivative rules checklist',
    'mathematics',
    'Calculus',
    [
      'Power: (xⁿ)′ = n xⁿ⁻¹',
      'Product: (uv)′ = u′v + uv′',
      'Quotient: (u/v)′ = (u′v − uv′)/v²',
      'Chain: (f(g(x)))′ = f′(g(x)) · g′(x)',
      'eˣ and ln: (eˣ)′ = eˣ, (ln x)′ = 1/x',
    ],
    ['calculus', 'derivatives'],
  ),
  listCard(
    'list-ftc-steps',
    'FTC evaluation steps',
    'mathematics',
    'Calculus',
    [
      'Find antiderivative F with F′ = f',
      'Evaluate F(b) − F(a)',
      'Check continuity of f on [a,b]',
      'Watch sign: net area vs total area',
    ],
    ['calculus', 'integrals'],
    { listOrdered: true },
  ),
  listCard(
    'list-row-reduce',
    'Row reduction goals',
    'mathematics',
    'Linear Algebra',
    [
      'Pivot 1 in each pivot column',
      'Zeros below (then above) each pivot',
      'Identify free variables',
      'Write parametric solution',
    ],
    ['linalg', 'procedure'],
    { listOrdered: true },
  ),
  listCard(
    'list-kinematics-choose',
    'Kinematics equation picker',
    'physics',
    'Mechanics',
    [
      'Known a, t, v₀ → use v = v₀ + at',
      'Known a, t, x₀ → use x = x₀ + v₀t + ½at²',
      'No time → use v² = v₀² + 2aΔx',
      'Constant velocity → a = 0, x = x₀ + vt',
    ],
    ['kinematics', 'checklist'],
  ),
  listCard(
    'list-circuit-laws',
    'Circuit analysis checklist',
    'physics',
    'Electricity & Magnetism',
    [
      'KCL: current into node = current out',
      'KVL: sum of voltage drops around loop = 0',
      'Ohm: V = IR for resistors',
      'Series R: add; parallel R: reciprocal sum',
    ],
    ['circuits', 'checklist'],
  ),
  listCard(
    'list-gas-laws',
    'Ideal gas toolkit',
    'chemistry',
    'Gases',
    [
      'PV = nRT (ideal gas law)',
      'Boyle: P ∝ 1/V at fixed T, n',
      'Charles: V ∝ T at fixed P, n',
      'Dalton: P_total = Σ P_i for gases',
    ],
    ['gases', 'checklist'],
  ),
  listCard(
    'list-buffer-prep',
    'Buffer calculation outline',
    'chemistry',
    'Acids & Bases',
    [
      'Identify HA / A⁻ (or B / BH⁺)',
      'Use Henderson–Hasselbalch: pH = pK_a + log([A⁻]/[HA])',
      'Check assumptions (concentrations ≫ H⁺)',
      'Account for dilution after mixing',
    ],
    ['buffers', 'procedure'],
    { listOrdered: true },
  ),
  listCard(
    'list-mitosis-stages',
    'Mitosis stages',
    'biology',
    'Cell Biology',
    [
      'Prophase: chromosomes condense; spindle forms',
      'Metaphase: chromosomes align at metaphase plate',
      'Anaphase: sister chromatids separate',
      'Telophase: nuclei reform; cytokinesis divides cell',
    ],
    ['cell', 'mitosis'],
    { listOrdered: true },
  ),
  listCard(
    'list-central-dogma',
    'Central dogma flow',
    'biology',
    'Molecular Biology',
    [
      'DNA replication (DNA → DNA)',
      'Transcription (DNA → RNA)',
      'Translation (RNA → protein)',
      'Reverse transcription in some viruses (RNA → DNA)',
    ],
    ['molecular', 'checklist'],
    { listOrdered: true },
  ),
  listCard(
    'list-market-structures',
    'Market structures snapshot',
    'economics',
    'Microeconomics',
    [
      'Perfect competition: many firms, price takers',
      'Monopoly: one seller, market power',
      'Oligopoly: few firms, strategic interaction',
      'Monopolistic competition: many firms, differentiated products',
    ],
    ['markets', 'micro'],
  ),
  listCard(
    'list-npv-decision',
    'Capital budgeting decision rules',
    'finance',
    'Capital Budgeting',
    [
      'NPV > 0 → accept (value-creating)',
      'IRR > hurdle rate → accept (with multiple-IRR caution)',
      'Payback: prefer shorter; ignores TVM unless discounted',
      'Mutually exclusive: choose higher NPV, not higher IRR alone',
    ],
    ['npv', 'checklist'],
  ),
  listCard(
    'list-bond-price-factors',
    'Bond price drivers',
    'finance',
    'Fixed Income',
    [
      'Yield up → price down (inverse)',
      'Longer maturity → more rate-sensitive',
      'Lower coupon → more rate-sensitive',
      'Credit risk / spreads also move price',
    ],
    ['bonds', 'checklist'],
  ),
  listCard(
    'list-hypothesis-test',
    'Hypothesis test outline',
    'mathematics',
    'Probability',
    [
      'State H₀ and H₁',
      'Choose α and test statistic',
      'Compute p-value or critical region',
      'Decide: reject H₀ or fail to reject',
      'State conclusion in context',
    ],
    ['stats', 'procedure'],
    { listOrdered: true },
  ),

  // ═══════════════════════════════════════════════════════════
  // CALLOUTS
  // ═══════════════════════════════════════════════════════════
  callout(
    'callout-chain-rule',
    'Don’t forget the chain rule',
    'mathematics',
    'Calculus',
    'When differentiating composites (sin(3x), e^{x²}, ln(g(x))), multiply by the inner derivative. Missing g′ is the #1 error.',
    ['derivatives', 'tip'],
    { calloutVariant: 'tip' },
  ),
  callout(
    'callout-abs-integrate',
    'Absolute value in integrals',
    'mathematics',
    'Calculus',
    '∫|f| is total area. Split where f changes sign; don’t drop absolute value and integrate blindly.',
    ['integrals', 'warn'],
    { calloutVariant: 'warn' },
  ),
  callout(
    'callout-det-zero',
    'Singular matrices',
    'mathematics',
    'Linear Algebra',
    'If det(A) = 0, A is not invertible. The homogeneous system Ax = 0 has nontrivial solutions; columns are linearly dependent.',
    ['linalg', 'info'],
    { calloutVariant: 'info' },
  ),
  callout(
    'callout-g-direction',
    'g points down',
    'physics',
    'Mechanics',
    'Choose a consistent coordinate system. If +y is up, a_y = −g for free fall. Sign errors dominate kinematics mistakes.',
    ['kinematics', 'tip'],
    { calloutVariant: 'tip' },
  ),
  callout(
    'callout-energy-vs-force',
    'Energy vs Newton',
    'physics',
    'Mechanics',
    'Conservative forces → potential energy and W = −ΔU. Nonconservative work (friction) removes mechanical energy: ΔK + ΔU = W_nc.',
    ['energy', 'note'],
    { calloutVariant: 'note' },
  ),
  callout(
    'callout-right-hand',
    'Right-hand rule',
    'physics',
    'Electricity & Magnetism',
    'For F = q v × B and for magnetic field around a wire, use the right-hand rule carefully — direction mistakes flip the sign of F.',
    ['em', 'tip'],
    { calloutVariant: 'tip' },
  ),
  callout(
    'callout-limiting-reagent',
    'Limiting reagent first',
    'chemistry',
    'Stoichiometry',
    'Convert all reactants to moles of product using the balanced equation; the smallest product amount identifies the limiting reagent.',
    ['stoichiometry', 'tip'],
    { calloutVariant: 'tip' },
  ),
  callout(
    'callout-strong-vs-weak',
    'Strong vs weak acids',
    'chemistry',
    'Acids & Bases',
    'Strong acids fully dissociate (use [H⁺] ≈ C). Weak acids use K_a and ICE tables — do not treat them as fully dissociated.',
    ['acids', 'warn'],
    { calloutVariant: 'warn' },
  ),
  callout(
    'callout-exothermic-sign',
    'Enthalpy sign convention',
    'chemistry',
    'Thermodynamics',
    'Exothermic: ΔH < 0 (system releases heat). Endothermic: ΔH > 0. Heat of reaction signs flip when the reaction is reversed.',
    ['thermo', 'info'],
    { calloutVariant: 'info' },
  ),
  callout(
    'callout-allele-freq',
    'Hardy–Weinberg assumptions',
    'biology',
    'Population Genetics',
    'p² + 2pq + q² = 1 requires no selection, no migration, no mutation, random mating, and large population. Real pops often violate these.',
    ['genetics', 'note'],
    { calloutVariant: 'note' },
  ),
  callout(
    'callout-atp',
    'ATP is not “energy stored forever”',
    'biology',
    'Metabolism',
    'ATP is a short-term energy currency. Cells continuously regenerate ATP from ADP + Pᵢ via respiration or photosynthesis pathways.',
    ['metabolism', 'tip'],
    { calloutVariant: 'tip' },
  ),
  callout(
    'callout-ceteris-paribus',
    'Ceteris paribus',
    'economics',
    'Microeconomics',
    'Demand/supply shifts assume “all else equal.” If income and price change together, separate the movements carefully on the graph.',
    ['micro', 'note'],
    { calloutVariant: 'note' },
  ),
  callout(
    'callout-real-vs-nominal',
    'Real vs nominal',
    'economics',
    'Macroeconomics',
    'Nominal GDP uses current prices; real GDP holds prices fixed to isolate quantity changes. Growth rates usually quote real GDP.',
    ['macro', 'warn'],
    { calloutVariant: 'warn' },
  ),
  callout(
    'callout-sunk-cost',
    'Ignore sunk costs',
    'finance',
    'Capital Budgeting',
    'Sunk costs already spent should not enter NPV. Only incremental future cash flows (including opportunity costs and cannibalization).',
    ['npv', 'danger'],
    { calloutVariant: 'danger' },
  ),
  callout(
    'callout-wacc-match',
    'Match risk to discount rate',
    'finance',
    'Corporate Finance',
    'Discount project cash flows at a rate reflecting project risk. Using firm WACC for a riskier project overstates NPV.',
    ['wacc', 'warn'],
    { calloutVariant: 'warn' },
  ),
  callout(
    'callout-diversification',
    'Diversification limit',
    'finance',
    'Portfolio Theory',
    'Diversification reduces idiosyncratic risk but not market (systematic) risk. β remains; CAPM prices only non-diversifiable risk.',
    ['portfolio', 'info'],
    { calloutVariant: 'info' },
  ),

  // ═══════════════════════════════════════════════════════════
  // CODE / PSEUDOCODE
  // ═══════════════════════════════════════════════════════════
  codeCard(
    'code-bisection',
    'Bisection root finder',
    'mathematics',
    'Numerical Methods',
    `// f continuous, f(a)*f(b) < 0
while (b-a) > tol:
  m = (a+b)/2
  if f(a)*f(m) <= 0: b = m
  else: a = m
return (a+b)/2`,
    ['numerical', 'roots'],
    { codeLanguage: 'pseudocode' },
  ),
  codeCard(
    'code-gradient-descent',
    'Gradient descent step',
    'mathematics',
    'Numerical Methods',
    `// minimize f(x)
x ← x0
for k = 1..N:
  x ← x − η ∇f(x)
return x`,
    ['optimization', 'ml'],
    { codeLanguage: 'pseudocode' },
  ),
  codeCard(
    'code-euler-ode',
    'Euler method (ODE)',
    'mathematics',
    'Differential Equations',
    `// y' = f(t,y), step h
y = y0; t = t0
for i = 1..n:
  y = y + h * f(t, y)
  t = t + h
return y`,
    ['ode', 'numerical'],
    { codeLanguage: 'pseudocode' },
  ),
  codeCard(
    'code-gaussian-elim',
    'Gaussian elimination sketch',
    'mathematics',
    'Linear Algebra',
    `for col = 1..n-1:
  pivot row with max |a[i,col]|
  for row below pivot:
    factor = a[row,col]/a[pivot,col]
    row -= factor * pivot_row
// back-substitute for x`,
    ['linalg', 'algorithm'],
    { codeLanguage: 'pseudocode' },
  ),
  codeCard(
    'code-rk4',
    'RK4 step (sketch)',
    'physics',
    'Mechanics',
    `k1 = f(t, y)
k2 = f(t+h/2, y+h*k1/2)
k3 = f(t+h/2, y+h*k2/2)
k4 = f(t+h, y+h*k3)
y += (h/6)*(k1+2*k2+2*k3+k4)`,
    ['ode', 'numerical'],
    { codeLanguage: 'pseudocode', description: 'One Runge–Kutta 4 step.' },
  ),
  codeCard(
    'code-ice-table',
    'ICE table workflow',
    'chemistry',
    'Equilibrium',
    `// aA ⇌ bB
I: [A]=A0, [B]=0
C: −a x, +b x
E: A0−a x, b x
// plug into K; solve for x
// check x < A0 / a`,
    ['equilibrium', 'procedure'],
    { codeLanguage: 'pseudocode' },
  ),
  codeCard(
    'code-hardy-weinberg',
    'Hardy–Weinberg genotype freqs',
    'biology',
    'Population Genetics',
    `# allele freqs p, q with p+q=1
AA = p**2
Aa = 2*p*q
aa = q**2
# check AA+Aa+aa ≈ 1`,
    ['genetics', 'code'],
    { codeLanguage: 'python-ish' },
  ),
  codeCard(
    'code-elasticity',
    'Arc elasticity of demand',
    'economics',
    'Microeconomics',
    `mid_Q = (Q1+Q2)/2
mid_P = (P1+P2)/2
Ed = ((Q2-Q1)/mid_Q) / ((P2-P1)/mid_P)
# |Ed| > 1 elastic`,
    ['elasticity', 'code'],
    { codeLanguage: 'python-ish' },
  ),
  codeCard(
    'code-capm',
    'CAPM expected return (code)',
    'finance',
    'Asset Pricing',
    `def expected_return(rf, beta, rm):
    """CAPM: E[R] = Rf + beta * (E[Rm] - Rf)"""
    return rf + beta * (rm - rf)

# beta = cov(r, rm) / var(rm)`,
    ['capm', 'code'],
    {
      codeLanguage: 'python',
      description:
        'Computational form of CAPM. Prefer catalog equation “CAPM expected return” (fin-capm) for the LaTeX card.',
    },
  ),
  codeCard(
    'code-black-scholes-d',
    'Black–Scholes d1, d2',
    'finance',
    'Derivatives',
    `d1 = (ln(S/K) + (r + σ**2/2)*T) / (σ*sqrt(T))
d2 = d1 - σ*sqrt(T)
# call = S N(d1) - K e^{-rT} N(d2)`,
    ['options', 'code'],
    { codeLanguage: 'python-ish' },
  ),

  // ═══════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════
  constant(
    'const-g',
    'Standard gravity g',
    'physics',
    'Constants',
    'g',
    '9.81',
    'm/s^{2}',
    ['constant', 'mechanics'],
    {
      latex: 'g \\approx 9.81\\,\\mathrm{m/s^{2}}',
      body: 'Often take g = 9.8 or 10 m/s² in rough problems.',
    },
  ),
  constant(
    'const-G',
    'Gravitational constant G',
    'physics',
    'Constants',
    'G',
    '6.674\\times 10^{-11}',
    'N·m^{2}/kg^{2}',
    ['constant', 'gravity'],
    {
      latex: 'G = 6.674\\times 10^{-11}\\,\\mathrm{N\\,m^{2}/kg^{2}}',
    },
  ),
  constant(
    'const-h-planck',
    "Planck's constant h",
    'physics',
    'Constants',
    'h',
    '6.626\\times 10^{-34}',
    'J·s',
    ['constant', 'quantum'],
    {
      latex: 'h = 6.626\\times 10^{-34}\\,\\mathrm{J\\,s}',
    },
  ),
  constant(
    'const-hbar',
    'Reduced Planck ℏ',
    'physics',
    'Constants',
    '\\hbar',
    '1.055\\times 10^{-34}',
    'J·s',
    ['constant', 'quantum'],
    {
      latex: '\\hbar = h/2\\pi \\approx 1.055\\times 10^{-34}\\,\\mathrm{J\\,s}',
    },
  ),
  constant(
    'const-e-charge',
    'Elementary charge e',
    'physics',
    'Constants',
    'e',
    '1.602\\times 10^{-19}',
    'C',
    ['constant', 'em'],
    {
      latex: 'e = 1.602\\times 10^{-19}\\,\\mathrm{C}',
    },
  ),
  constant(
    'const-k-e',
    'Coulomb constant k_e',
    'physics',
    'Constants',
    'k_e',
    '8.99\\times 10^{9}',
    'N·m^{2}/C^{2}',
    ['constant', 'em'],
    {
      latex: 'k_e = 8.99\\times 10^{9}\\,\\mathrm{N\\,m^{2}/C^{2}}',
      body: 'Also 1/(4πε₀).',
    },
  ),
  constant(
    'const-epsilon0',
    'Vacuum permittivity ε₀',
    'physics',
    'Constants',
    '\\varepsilon_0',
    '8.854\\times 10^{-12}',
    'F/m',
    ['constant', 'em'],
    {
      latex: '\\varepsilon_0 = 8.854\\times 10^{-12}\\,\\mathrm{F/m}',
    },
  ),
  constant(
    'const-k-b',
    'Boltzmann constant k_B',
    'physics',
    'Constants',
    'k_B',
    '1.381\\times 10^{-23}',
    'J/K',
    ['constant', 'thermo'],
    {
      latex: 'k_B = 1.381\\times 10^{-23}\\,\\mathrm{J/K}',
    },
  ),
  constant(
    'const-sigma-sb',
    'Stefan–Boltzmann σ',
    'physics',
    'Constants',
    '\\sigma',
    '5.67\\times 10^{-8}',
    'W/(m^{2}·K^{4})',
    ['constant', 'radiation'],
    {
      latex: '\\sigma = 5.67\\times 10^{-8}\\,\\mathrm{W\\,m^{-2}\\,K^{-4}}',
    },
  ),
  constant(
    'const-F-faraday',
    "Faraday's constant F",
    'chemistry',
    'Constants',
    'F',
    '96485',
    'C/mol',
    ['constant', 'electrochem'],
    {
      latex: 'F = 96485\\,\\mathrm{C/mol}',
      body: 'Charge of one mole of electrons ≈ N_A e.',
    },
  ),
  constant(
    'const-atm',
    'Standard atmosphere',
    'chemistry',
    'Constants',
    '1\\,\\mathrm{atm}',
    '101325',
    'Pa',
    ['constant', 'gases'],
    {
      latex: '1\\,\\mathrm{atm} = 101\\,325\\,\\mathrm{Pa} = 760\\,\\mathrm{torr}',
    },
  ),
  constant(
    'const-kw',
    'Water ion product K_w',
    'chemistry',
    'Constants',
    'K_w',
    '1.0\\times 10^{-14}',
    '(25°C)',
    ['constant', 'acids'],
    {
      latex: 'K_w = [\\mathrm{H_3O^+}][\\mathrm{OH^-}] = 1.0\\times 10^{-14}\\ (25^\\circ\\mathrm{C})',
    },
  ),
  constant(
    'const-e-math',
    "Euler's number e",
    'mathematics',
    'Notation',
    'e',
    '2.71828\\ldots',
    '',
    ['constant', 'analysis'],
    {
      latex: 'e = \\sum_{n=0}^{\\infty} \\frac{1}{n!} \\approx 2.71828',
      body: 'Base of natural logarithm; (e^x)′ = e^x.',
    },
  ),
  constant(
    'const-pi',
    'Pi π',
    'mathematics',
    'Notation',
    '\\pi',
    '3.14159\\ldots',
    '',
    ['constant', 'geometry'],
    {
      latex: '\\pi \\approx 3.14159',
      body: 'Circle circumference/diameter; appears in trig and complex analysis.',
    },
  ),
  constant(
    'const-phi',
    'Golden ratio φ',
    'mathematics',
    'Notation',
    '\\varphi',
    '1.61803\\ldots',
    '',
    ['constant', 'geometry'],
    {
      latex: '\\varphi = \\frac{1+\\sqrt{5}}{2} \\approx 1.61803',
    },
  ),
  constant(
    'const-ln2',
    'ln 2',
    'mathematics',
    'Notation',
    '\\ln 2',
    '0.693147\\ldots',
    '',
    ['constant', 'logs'],
    {
      latex: '\\ln 2 \\approx 0.693147',
      body: 'Useful for half-life: t_{1/2} = ln 2 / λ.',
    },
  ),

  // ═══════════════════════════════════════════════════════════
  // IDENTITY SETS
  // ═══════════════════════════════════════════════════════════
  identitySet(
    'id-angle-add',
    'Angle addition formulas',
    'mathematics',
    'Trigonometry',
    [
      '\\sin(a\\pm b) = \\sin a\\cos b \\pm \\cos a\\sin b',
      '\\cos(a\\pm b) = \\cos a\\cos b \\mp \\sin a\\sin b',
      '\\tan(a\\pm b) = \\frac{\\tan a \\pm \\tan b}{1 \\mp \\tan a\\tan b}',
    ],
    ['trig', 'identity'],
  ),
  identitySet(
    'id-double-angle',
    'Double-angle formulas',
    'mathematics',
    'Trigonometry',
    [
      '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta',
      '\\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta',
      '\\cos 2\\theta = 2\\cos^2\\theta - 1 = 1 - 2\\sin^2\\theta',
    ],
    ['trig', 'identity'],
  ),
  identitySet(
    'id-exp-laws',
    'Exponent laws',
    'mathematics',
    'Algebra',
    [
      'a^m a^n = a^{m+n}',
      '\\frac{a^m}{a^n} = a^{m-n}',
      '(a^m)^n = a^{mn}',
      '(ab)^n = a^n b^n',
    ],
    ['algebra', 'identity'],
  ),
  identitySet(
    'id-diff-rules',
    'Core derivative identities',
    'mathematics',
    'Calculus',
    [
      '\\frac{d}{dx}[x^n] = n x^{n-1}',
      '\\frac{d}{dx}[e^x] = e^x',
      '\\frac{d}{dx}[\\ln x] = \\frac{1}{x}',
      '\\frac{d}{dx}[\\sin x] = \\cos x,\\quad \\frac{d}{dx}[\\cos x] = -\\sin x',
    ],
    ['calculus', 'identity'],
  ),
  identitySet(
    'id-integral-basic',
    'Basic antiderivatives',
    'mathematics',
    'Calculus',
    [
      '\\int x^n\\,dx = \\frac{x^{n+1}}{n+1}+C\\ (n\\neq -1)',
      '\\int e^x\\,dx = e^x + C',
      '\\int \\frac{1}{x}\\,dx = \\ln|x| + C',
      '\\int \\sin x\\,dx = -\\cos x + C',
    ],
    ['calculus', 'identity'],
  ),
  identitySet(
    'id-complex-euler',
    'Euler & complex forms',
    'mathematics',
    'Complex Numbers',
    [
      'e^{i\\theta} = \\cos\\theta + i\\sin\\theta',
      'e^{i\\pi} + 1 = 0',
      '\\overline{z} = x - iy \\text{ if } z = x+iy',
      '|z|^2 = z\\overline{z}',
    ],
    ['complex', 'identity'],
  ),
  identitySet(
    'id-vector-ident',
    'Vector product identities',
    'physics',
    'Mechanics',
    [
      '\\mathbf{a}\\cdot\\mathbf{b} = |a||b|\\cos\\theta',
      '|\\mathbf{a}\\times\\mathbf{b}| = |a||b|\\sin\\theta',
      '\\mathbf{a}\\times\\mathbf{b} = -\\mathbf{b}\\times\\mathbf{a}',
      '\\mathbf{a}\\cdot(\\mathbf{a}\\times\\mathbf{b}) = 0',
    ],
    ['vectors', 'identity'],
  ),
  identitySet(
    'id-maxwell-names',
    'Maxwell equations (names)',
    'physics',
    'Electromagnetism',
    [
      '\\nabla\\cdot\\mathbf{E} = \\rho/\\varepsilon_0 \\quad\\text{(Gauss E)}',
      '\\nabla\\cdot\\mathbf{B} = 0 \\quad\\text{(Gauss B)}',
      '\\nabla\\times\\mathbf{E} = -\\partial_t\\mathbf{B} \\quad\\text{(Faraday)}',
      '\\nabla\\times\\mathbf{B} = \\mu_0\\mathbf{J}+\\mu_0\\varepsilon_0\\partial_t\\mathbf{E}',
    ],
    ['maxwell', 'identity'],
  ),
  identitySet(
    'id-thermo-laws',
    'Thermo first law forms',
    'chemistry',
    'Thermodynamics',
    [
      '\\Delta U = q + w',
      'w = -P_{\\mathrm{ext}}\\Delta V \\text{ (expansion work)}',
      'H = U + PV',
      '\\Delta H = q_P \\text{ (constant pressure)}',
    ],
    ['thermo', 'identity'],
  ),
  identitySet(
    'id-nernst-related',
    'Electrochemistry relations',
    'chemistry',
    'Electrochemistry',
    [
      'E = E^\\circ - \\frac{RT}{nF}\\ln Q',
      'E^\\circ = \\frac{RT}{nF}\\ln K',
      '\\Delta G = -nFE',
      '\\Delta G^\\circ = -nFE^\\circ = -RT\\ln K',
    ],
    ['electrochem', 'identity'],
  ),
  identitySet(
    'id-finance-tvm',
    'TVM core identities',
    'finance',
    'Time Value of Money',
    [
      '\\mathrm{FV} = \\mathrm{PV}(1+r)^{n}',
      '\\mathrm{PV} = \\frac{\\mathrm{FV}}{(1+r)^{n}}',
      '\\mathrm{FV}_{\\mathrm{ann}} = C\\frac{(1+r)^{n}-1}{r}',
      '\\mathrm{PV}_{\\mathrm{ann}} = C\\frac{1-(1+r)^{-n}}{r}',
    ],
    ['tvm', 'identity'],
  ),
  identitySet(
    'id-capm-set',
    'CAPM / portfolio identities',
    'finance',
    'Portfolio Theory',
    [
      '\\mathrm{E}[R_{i}] = R_{f} + \\beta_{i}\\bigl(\\mathrm{E}[R_{m}] - R_{f}\\bigr)',
      '\\beta_{i} = \\frac{\\mathrm{Cov}(R_{i}, R_{m})}{\\mathrm{Var}(R_{m})}',
      '\\sigma_{p}^{2} = w_{1}^{2}\\sigma_{1}^{2} + w_{2}^{2}\\sigma_{2}^{2} + 2 w_{1} w_{2} \\sigma_{1}\\sigma_{2}\\rho',
    ],
    ['capm', 'identity'],
  ),

  // ═══════════════════════════════════════════════════════════
  // MATRICES
  // ═══════════════════════════════════════════════════════════
  matrix(
    'mat-identity-2',
    '2×2 identity',
    'mathematics',
    'Linear Algebra',
    [
      ['1', '0'],
      ['0', '1'],
    ],
    ['matrix', 'linalg'],
    'I₂; AI = IA = A for compatible A.',
  ),
  matrix(
    'mat-identity-3',
    '3×3 identity',
    'mathematics',
    'Linear Algebra',
    [
      ['1', '0', '0'],
      ['0', '1', '0'],
      ['0', '0', '1'],
    ],
    ['matrix', 'linalg'],
  ),
  matrix(
    'mat-pauli-x',
    'Pauli matrix σ_x',
    'mathematics',
    'Linear Algebra',
    [
      ['0', '1'],
      ['1', '0'],
    ],
    ['matrix', 'quantum'],
    'Pauli X (bit-flip) matrix.',
  ),
  matrix(
    'mat-pauli-z',
    'Pauli matrix σ_z',
    'mathematics',
    'Linear Algebra',
    [
      ['1', '0'],
      ['0', '-1'],
    ],
    ['matrix', 'quantum'],
  ),
  matrix(
    'mat-reflection-x',
    'Reflection across x-axis',
    'mathematics',
    'Linear Algebra',
    [
      ['1', '0'],
      ['0', '-1'],
    ],
    ['matrix', 'geometry'],
  ),
  matrix(
    'mat-scale-2d',
    'Scaling matrix 2D',
    'mathematics',
    'Linear Algebra',
    [
      ['s_x', '0'],
      ['0', 's_y'],
    ],
    ['matrix', 'geometry'],
    'Scales x by s_x and y by s_y.',
  ),
  matrix(
    'mat-shear-x',
    'Horizontal shear',
    'mathematics',
    'Linear Algebra',
    [
      ['1', 'k'],
      ['0', '1'],
    ],
    ['matrix', 'geometry'],
    'Shear parallel to x-axis by factor k.',
  ),
  matrix(
    'mat-markov-2',
    '2-state transition matrix',
    'mathematics',
    'Probability',
    [
      ['1-a', 'b'],
      ['a', '1-b'],
    ],
    ['matrix', 'markov'],
    'Columns sum to 1 (column-stochastic form).',
  ),
  matrix(
    'mat-jacobian-2',
    'Jacobian 2×2 template',
    'mathematics',
    'Calculus',
    [
      ['\\partial f/\\partial x', '\\partial f/\\partial y'],
      ['\\partial g/\\partial x', '\\partial g/\\partial y'],
    ],
    ['matrix', 'multivariable'],
    'J for F=(f,g): ℝ²→ℝ².',
  ),
  matrix(
    'mat-hessian-2',
    'Hessian 2×2 template',
    'mathematics',
    'Calculus',
    [
      ['f_{xx}', 'f_{xy}'],
      ['f_{yx}', 'f_{yy}'],
    ],
    ['matrix', 'multivariable'],
    'Symmetric when mixed partials continuous.',
  ),
  matrix(
    'mat-rotation-3d-z',
    'Rotation about z-axis',
    'mathematics',
    'Linear Algebra',
    [
      ['\\cos\\theta', '-\\sin\\theta', '0'],
      ['\\sin\\theta', '\\cos\\theta', '0'],
      ['0', '0', '1'],
    ],
    ['matrix', 'rotation'],
  ),
  matrix(
    'mat-covariance-2',
    '2×2 covariance template',
    'mathematics',
    'Probability',
    [
      ['\\sigma_x^2', '\\mathrm{Cov}(X,Y)'],
      ['\\mathrm{Cov}(Y,X)', '\\sigma_y^2'],
    ],
    ['matrix', 'stats'],
    'Symmetric positive semidefinite for real data.',
  ),

  // ═══════════════════════════════════════════════════════════
  // PLOTS (SVG)
  // ═══════════════════════════════════════════════════════════
  plot(
    'plot-line-y-mx-b',
    'Line y = mx + b',
    'mathematics',
    'Functions',
    axesSvg(
      220,
      160,
      `<line x1="40" y1="120" x2="200" y2="40" stroke="#818cf8" stroke-width="2.5"/>
       <circle cx="40" cy="120" r="3" fill="#fbbf24"/>`,
      `<text x="200" y="150" fill="#9ca3af" font-size="11" font-family="sans-serif">x</text>
       <text x="8" y="24" fill="#9ca3af" font-size="11" font-family="sans-serif">y</text>
       <text x="120" y="50" fill="#a5b4fc" font-size="12" font-family="sans-serif">y=mx+b</text>`,
    ),
    ['plot', 'linear'],
    'Slope m, intercept b.',
  ),
  plot(
    'plot-exponential',
    'Exponential growth',
    'mathematics',
    'Functions',
    axesSvg(
      220,
      160,
      `<path d="M40 130 C80 125, 100 100, 120 70 S180 20, 200 18" fill="none" stroke="#34d399" stroke-width="2.5"/>`,
      `<text x="200" y="150" fill="#9ca3af" font-size="11" font-family="sans-serif">x</text>
       <text x="8" y="24" fill="#9ca3af" font-size="11" font-family="sans-serif">y</text>
       <text x="130" y="45" fill="#86efac" font-size="12" font-family="sans-serif">eˣ</text>`,
    ),
    ['plot', 'exponential'],
  ),
  plot(
    'plot-log',
    'Logarithm y = ln x',
    'mathematics',
    'Functions',
    axesSvg(
      220,
      160,
      `<path d="M50 140 C70 90, 100 60, 200 40" fill="none" stroke="#fbbf24" stroke-width="2.5"/>
       <line x1="50" y1="16" x2="50" y2="140" stroke="#4b5563" stroke-width="1" stroke-dasharray="3"/>`,
      `<text x="200" y="150" fill="#9ca3af" font-size="11" font-family="sans-serif">x</text>
       <text x="8" y="24" fill="#9ca3af" font-size="11" font-family="sans-serif">y</text>
       <text x="140" y="55" fill="#fcd34d" font-size="12" font-family="sans-serif">ln x</text>`,
    ),
    ['plot', 'log'],
    'Vertical asymptote at x = 0.',
  ),
  plot(
    'plot-sine',
    'Sine wave',
    'mathematics',
    'Trigonometry',
    axesSvg(
      240,
      140,
      `<path d="M40 70 C55 30, 70 30, 85 70 S115 110, 130 70 S160 30, 175 70 S205 110, 220 70" fill="none" stroke="#818cf8" stroke-width="2.5"/>`,
      `<text x="220" y="130" fill="#9ca3af" font-size="11" font-family="sans-serif">x</text>
       <text x="8" y="24" fill="#9ca3af" font-size="11" font-family="sans-serif">y</text>
       <text x="175" y="35" fill="#a5b4fc" font-size="12" font-family="sans-serif">sin x</text>`,
    ),
    ['plot', 'trig'],
  ),
  plot(
    'plot-normal',
    'Normal (bell) curve',
    'mathematics',
    'Probability',
    axesSvg(
      220,
      150,
      `<path d="M40 120 C70 118, 85 40, 110 30 S150 40, 180 118 S200 120, 200 120" fill="none" stroke="#c084fc" stroke-width="2.5"/>
       <line x1="110" y1="30" x2="110" y2="126" stroke="#4b5563" stroke-width="1" stroke-dasharray="3"/>`,
      `<text x="200" y="145" fill="#9ca3af" font-size="11" font-family="sans-serif">x</text>
       <text x="105" y="142" fill="#e9d5ff" font-size="10" font-family="sans-serif">μ</text>
       <text x="140" y="50" fill="#e9d5ff" font-size="11" font-family="sans-serif">N(μ,σ²)</text>`,
    ),
    ['plot', 'stats'],
  ),
  plot(
    'plot-projectile',
    'Projectile trajectory',
    'physics',
    'Mechanics',
    axesSvg(
      240,
      150,
      `<path d="M40 120 Q120 20 220 120" fill="none" stroke="#34d399" stroke-width="2.5"/>
       <circle cx="40" cy="120" r="3" fill="#fbbf24"/>
       <circle cx="220" cy="120" r="3" fill="#fbbf24"/>`,
      `<text x="220" y="142" fill="#9ca3af" font-size="11" font-family="sans-serif">x</text>
       <text x="8" y="24" fill="#9ca3af" font-size="11" font-family="sans-serif">y</text>
       <text x="115" y="45" fill="#86efac" font-size="11" font-family="sans-serif">range</text>`,
    ),
    ['plot', 'kinematics'],
    'Parabolic path under constant g (no drag).',
  ),
  plot(
    'plot-sh-m-phase',
    'SHM: x vs t',
    'physics',
    'Waves',
    axesSvg(
      240,
      140,
      `<path d="M40 70 C55 30, 70 30, 85 70 S115 110, 130 70 S160 30, 175 70 S205 110, 220 70" fill="none" stroke="#38bdf8" stroke-width="2.5"/>`,
      `<text x="220" y="130" fill="#9ca3af" font-size="11" font-family="sans-serif">t</text>
       <text x="8" y="24" fill="#9ca3af" font-size="11" font-family="sans-serif">x</text>
       <text x="165" y="35" fill="#7dd3fc" font-size="11" font-family="sans-serif">A cos(ωt)</text>`,
    ),
    ['plot', 'shm'],
  ),
  plot(
    'plot-iv-curve',
    'Ohmic I–V line',
    'physics',
    'Electricity & Magnetism',
    axesSvg(
      200,
      150,
      `<line x1="40" y1="120" x2="180" y2="40" stroke="#f87171" stroke-width="2.5"/>`,
      `<text x="180" y="142" fill="#9ca3af" font-size="11" font-family="sans-serif">V</text>
       <text x="8" y="24" fill="#9ca3af" font-size="11" font-family="sans-serif">I</text>
       <text x="120" y="55" fill="#fca5a5" font-size="11" font-family="sans-serif">I=V/R</text>`,
    ),
    ['plot', 'circuits'],
  ),
  plot(
    'plot-arrhenius',
    'Arrhenius: ln k vs 1/T',
    'chemistry',
    'Kinetics',
    axesSvg(
      220,
      150,
      `<line x1="50" y1="40" x2="190" y2="120" stroke="#fbbf24" stroke-width="2.5"/>`,
      `<text x="175" y="142" fill="#9ca3af" font-size="11" font-family="sans-serif">1/T</text>
       <text x="4" y="28" fill="#9ca3af" font-size="11" font-family="sans-serif">ln k</text>
       <text x="100" y="55" fill="#fcd34d" font-size="11" font-family="sans-serif">slope −Eₐ/R</text>`,
    ),
    ['plot', 'kinetics'],
  ),
  plot(
    'plot-titration',
    'Strong acid–base titration',
    'chemistry',
    'Acids & Bases',
    axesSvg(
      220,
      160,
      `<path d="M40 110 L90 100 L110 90 L120 40 L140 30 L190 28" fill="none" stroke="#34d399" stroke-width="2.5"/>
       <line x1="120" y1="16" x2="120" y2="136" stroke="#4b5563" stroke-width="1" stroke-dasharray="3"/>`,
      `<text x="185" y="152" fill="#9ca3af" font-size="10" font-family="sans-serif">V base</text>
       <text x="4" y="28" fill="#9ca3af" font-size="11" font-family="sans-serif">pH</text>
       <text x="125" y="55" fill="#86efac" font-size="10" font-family="sans-serif">eq pt</text>`,
    ),
    ['plot', 'titration'],
  ),
  plot(
    'plot-mm-kinetics',
    'Michaelis–Menten v vs [S]',
    'biology',
    'Enzymes',
    axesSvg(
      220,
      150,
      `<path d="M40 125 Q90 40 200 30" fill="none" stroke="#34d399" stroke-width="2.5"/>
       <line x1="32" y1="30" x2="200" y2="30" stroke="#818cf8" stroke-width="1" stroke-dasharray="4"/>`,
      `<text x="175" y="142" fill="#9ca3af" font-size="11" font-family="sans-serif">[S]</text>
       <text x="4" y="28" fill="#9ca3af" font-size="11" font-family="sans-serif">v</text>
       <text x="155" y="25" fill="#a5b4fc" font-size="10" font-family="sans-serif">Vmax</text>`,
    ),
    ['plot', 'enzymes'],
  ),
  plot(
    'plot-logistic',
    'Logistic population growth',
    'biology',
    'Population',
    axesSvg(
      220,
      150,
      `<path d="M40 120 C80 118, 100 100, 120 70 S160 35, 200 32" fill="none" stroke="#818cf8" stroke-width="2.5"/>
       <line x1="32" y1="32" x2="200" y2="32" stroke="#4b5563" stroke-width="1" stroke-dasharray="3"/>`,
      `<text x="200" y="142" fill="#9ca3af" font-size="11" font-family="sans-serif">t</text>
       <text x="4" y="28" fill="#9ca3af" font-size="11" font-family="sans-serif">N</text>
       <text x="165" y="28" fill="#a5b4fc" font-size="10" font-family="sans-serif">K</text>`,
    ),
    ['plot', 'ecology'],
    'S-curve approaching carrying capacity K.',
  ),
  plot(
    'plot-laffer',
    'Laffer curve (schematic)',
    'economics',
    'Macroeconomics',
    axesSvg(
      220,
      150,
      `<path d="M40 120 Q110 20 200 120" fill="none" stroke="#fbbf24" stroke-width="2.5"/>
       <circle cx="110" cy="35" r="3" fill="#f87171"/>`,
      `<text x="175" y="142" fill="#9ca3af" font-size="10" font-family="sans-serif">tax rate</text>
       <text x="4" y="28" fill="#9ca3af" font-size="10" font-family="sans-serif">revenue</text>`,
    ),
    ['plot', 'macro'],
    'Schematic only — peak location is empirical.',
  ),
  plot(
    'plot-cost-curves',
    'MC, ATC schematic',
    'economics',
    'Microeconomics',
    axesSvg(
      220,
      160,
      `<path d="M50 40 C80 100, 100 110, 130 70 S180 40, 200 35" fill="none" stroke="#f87171" stroke-width="2"/>
       <path d="M55 90 C90 120, 120 100, 160 70 S200 55, 200 55" fill="none" stroke="#818cf8" stroke-width="2"/>`,
      `<text x="185" y="152" fill="#9ca3af" font-size="11" font-family="sans-serif">Q</text>
       <text x="4" y="28" fill="#9ca3af" font-size="11" font-family="sans-serif">$</text>
       <text x="170" y="40" fill="#fca5a5" font-size="10" font-family="sans-serif">MC</text>
       <text x="170" y="65" fill="#a5b4fc" font-size="10" font-family="sans-serif">ATC</text>`,
    ),
    ['plot', 'costs'],
  ),
  plot(
    'plot-yield-curve',
    'Yield curve (normal)',
    'finance',
    'Fixed Income',
    axesSvg(
      220,
      150,
      `<path d="M40 100 C80 95, 120 70, 200 45" fill="none" stroke="#34d399" stroke-width="2.5"/>`,
      `<text x="160" y="142" fill="#9ca3af" font-size="10" font-family="sans-serif">maturity</text>
       <text x="4" y="28" fill="#9ca3af" font-size="11" font-family="sans-serif">y</text>
       <text x="120" y="55" fill="#86efac" font-size="11" font-family="sans-serif">upward</text>`,
    ),
    ['plot', 'bonds'],
  ),
  plot(
    'plot-efficient-frontier',
    'Efficient frontier (schematic)',
    'finance',
    'Portfolio Theory',
    axesSvg(
      220,
      160,
      `<path d="M50 120 C80 100, 100 50, 140 30 S190 25, 200 28" fill="none" stroke="#c084fc" stroke-width="2.5"/>
       <circle cx="120" cy="55" r="3" fill="#fbbf24"/>`,
      `<text x="165" y="152" fill="#9ca3af" font-size="10" font-family="sans-serif">σ</text>
       <text x="4" y="28" fill="#9ca3af" font-size="11" font-family="sans-serif">E[r]</text>
       <text x="125" y="50" fill="#fcd34d" font-size="10" font-family="sans-serif">tangency</text>`,
    ),
    ['plot', 'portfolio'],
  ),
]
