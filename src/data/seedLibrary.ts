import type { LibraryItem, Subject } from '@/types'

/**
 * Encode an inline SVG as a data URL for figure cards.
 *
 * VECTOR GRAPHICS: catalog figures are SVG (not PNG) so enlarge stays sharp.
 * Include a viewBox; FigureView inlines SVG at the card’s display size.
 * New block items: equations → eq(LaTeX); tables → tbl(markdown); diagrams →
 * svgUrl(`<svg viewBox=…>`); photos only → Import Image raster.
 * See docs/vector-graphics.md.
 */
function svgUrl(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg.trim())
}

/**
 * Library equation: KaTeX-compatible LaTeX (vector type on canvas).
 * New equations use eq(…, latex, …) — pure LaTeX, not raster images.
 * Example: Euler’s identity → e^{i\\pi} + 1 = 0
 */
function eq(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  latex: string,
  tags: string[],
  description?: string,
): LibraryItem {
  return {
    id,
    type: 'equation',
    title,
    subject,
    topic,
    tags,
    latex,
    description,
    isSystem: true,
  }
}

/**
 * Library table: markdown pipe table (vector HTML type on canvas via em fonts
 * + FitContent fontSize). Prefer tbl over a PNG screenshot of a table.
 */
function tbl(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  tableMarkdown: string,
  tags: string[],
  description?: string,
): LibraryItem {
  return {
    id,
    type: 'table',
    title,
    subject,
    topic,
    tags,
    tableMarkdown,
    description,
    isSystem: true,
  }
}

/**
 * Library figure — MUST be SVG (vector data URL from svgUrl).
 * Do not pass PNG/JPEG here; photographs use Import Image, not the seed catalog.
 * Canvas paints SVG with fillContainer so enlarge stays sharp (no CSS soft-scale).
 */
function fig(
  id: string,
  title: string,
  subject: Subject,
  topic: string,
  imageUrl: string,
  tags: string[],
  description?: string,
): LibraryItem {
  if (
    typeof imageUrl === 'string' &&
    imageUrl.length > 0 &&
    !/^data:image\/svg\+xml/i.test(imageUrl) &&
    !/\.svg(\?|#|$)/i.test(imageUrl)
  ) {
    // Dev-time guard: seed diagrams that are not SVG will soft-scale on resize
    console.warn(
      `[seedLibrary] fig("${id}") should use svgUrl(\`<svg viewBox=…>\`) for vector graphics`,
    )
  }
  return {
    id,
    type: 'figure',
    title,
    subject,
    topic,
    tags,
    imageUrl,
    description,
    isSystem: true,
  }
}

/**
 * Static catalog: offline fallback and Admin seed source (`npm run seed`).
 *
 * VECTOR GRAPHICS GUARANTEE — every entry is one of:
 * - equation → KaTeX LaTeX (vector type)
 * - table → markdown pipes (vector HTML/em type)
 * - figure → svgUrl(`<svg viewBox=…>`) (vector paths)
 * Enforced by src/data/seedLibrary.vector.test.ts and scripts/seed-library.ts.
 * See docs/vector-graphics.md
 */
/** Keep first occurrence when catalog appends re-use an id. */
function uniqueById(items: LibraryItem[]): LibraryItem[] {
  const seen = new Set<string>()
  const out: LibraryItem[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

const SEED_LIBRARY_RAW: LibraryItem[] = [
  // ═══════════════════════════════════════════════════════════
  // Mathematics
  // ═══════════════════════════════════════════════════════════
  eq(
    'math-quad',
    'Quadratic Formula',
    'mathematics',
    'Algebra',
    'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    ['polynomial', 'roots'],
    'Roots of ax² + bx + c = 0.',
  ),
  eq(
    'math-binom',
    'Binomial Theorem',
    'mathematics',
    'Algebra',
    '(x + y)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^{n-k} y^k',
    ['series', 'combinatorics'],
    'Expansion of a binomial raised to n.',
  ),
  eq(
    'math-log-laws',
    'Logarithm Laws',
    'mathematics',
    'Algebra',
    '\\log(ab) = \\log a + \\log b,\\quad \\log\\frac{a}{b} = \\log a - \\log b',
    ['logs'],
    'Product and quotient rules for logarithms.',
  ),
  eq(
    'math-exp-laws',
    'Exponent Laws',
    'mathematics',
    'Algebra',
    'a^m a^n = a^{m+n},\\quad (a^m)^n = a^{mn},\\quad a^{-n} = \\frac{1}{a^n}',
    ['exponents'],
    'Core power rules.',
  ),
  eq(
    'math-completing-square',
    'Completing the Square',
    'mathematics',
    'Algebra',
    'x^2 + bx = \\left(x + \\frac{b}{2}\\right)^2 - \\left(\\frac{b}{2}\\right)^2',
    ['polynomial'],
    'Rewrite quadratic to vertex form.',
  ),
  eq(
    'math-deriv-def',
    'Derivative Definition',
    'mathematics',
    'Calculus',
    "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}",
    ['limits', 'derivatives'],
    'Instantaneous rate of change.',
  ),
  eq(
    'math-chain',
    'Chain Rule',
    'mathematics',
    'Calculus',
    "\\frac{d}{dx}[f(g(x))] = f'(g(x))\\, g'(x)",
    ['derivatives'],
    'Derivative of a composition.',
  ),
  eq(
    'math-product',
    'Product Rule',
    'mathematics',
    'Calculus',
    "(uv)' = u'v + uv'",
    ['derivatives'],
    'Derivative of a product.',
  ),
  eq(
    'math-quotient',
    'Quotient Rule',
    'mathematics',
    'Calculus',
    "\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^2}",
    ['derivatives'],
    'Derivative of a quotient.',
  ),
  eq(
    'math-ftc',
    'Fundamental Theorem of Calculus',
    'mathematics',
    'Calculus',
    "\\int_a^b f'(x)\\, dx = f(b) - f(a)",
    ['integrals'],
    'Links differentiation and integration.',
  ),
  eq(
    'math-int-parts',
    'Integration by Parts',
    'mathematics',
    'Calculus',
    '\\int u\\, dv = uv - \\int v\\, du',
    ['integrals'],
    'Reverse of the product rule.',
  ),
  eq(
    'math-sub',
    'u-Substitution',
    'mathematics',
    'Calculus',
    '\\int f(g(x))g\'(x)\\, dx = \\int f(u)\\, du',
    ['integrals'],
    'Change of variables in integrals.',
  ),
  eq(
    'math-lhopital',
    "L'Hôpital's Rule",
    'mathematics',
    'Calculus',
    "\\lim_{x\\to a}\\frac{f(x)}{g(x)} = \\lim_{x\\to a}\\frac{f'(x)}{g'(x)}",
    ['limits'],
    'For 0/0 or ∞/∞ indeterminate forms.',
  ),
  eq(
    'math-taylor',
    'Taylor Series',
    'mathematics',
    'Calculus',
    'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n',
    ['series'],
    'Polynomial approximation about a.',
  ),
  eq(
    'math-maclaurin-e',
    'Maclaurin Series for eˣ',
    'mathematics',
    'Calculus',
    'e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!}',
    ['series', 'exponential'],
    'Taylor expansion of exp at 0.',
  ),
  eq(
    'math-mean-value',
    'Mean Value Theorem',
    'mathematics',
    'Calculus',
    "f'(c) = \\frac{f(b)-f(a)}{b-a}",
    ['theorems'],
    'Average slope equals derivative somewhere in (a,b).',
  ),
  eq(
    'math-euler',
    "Euler's Identity",
    'mathematics',
    'Complex Numbers',
    'e^{i\\pi} + 1 = 0',
    ['famous', 'complex'],
    'Links e, i, π, 1, and 0.',
  ),
  eq(
    'math-euler-form',
    'Euler Formula',
    'mathematics',
    'Complex Numbers',
    'e^{i\\theta} = \\cos\\theta + i\\sin\\theta',
    ['complex', 'trig'],
    'Complex exponential as cos + i sin.',
  ),
  eq(
    'math-de-moivre',
    "De Moivre's Theorem",
    'mathematics',
    'Complex Numbers',
    '(\\cos\\theta + i\\sin\\theta)^n = \\cos(n\\theta) + i\\sin(n\\theta)',
    ['complex'],
    'Powers of complex numbers on the unit circle.',
  ),
  eq(
    'math-pythag',
    'Pythagorean Theorem',
    'mathematics',
    'Geometry',
    'a^2 + b^2 = c^2',
    ['triangles'],
    'Right triangle legs a, b and hypotenuse c.',
  ),
  eq(
    'math-distance',
    'Distance Formula (2D)',
    'mathematics',
    'Geometry',
    'd = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}',
    ['coordinate'],
    'Distance between two points in the plane.',
  ),
  eq(
    'math-circle',
    'Circle Equation',
    'mathematics',
    'Geometry',
    '(x-h)^2 + (y-k)^2 = r^2',
    ['conics'],
    'Circle center (h,k), radius r.',
  ),
  eq(
    'math-trig-pythag',
    'Trig Identity (Pythagorean)',
    'mathematics',
    'Trigonometry',
    '\\sin^2\\theta + \\cos^2\\theta = 1',
    ['identities'],
    'Fundamental Pythagorean identity.',
  ),
  eq(
    'math-law-sines',
    'Law of Sines',
    'mathematics',
    'Trigonometry',
    '\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}',
    ['triangles'],
    'Relates sides to opposite angles.',
  ),
  eq(
    'math-law-cosines',
    'Law of Cosines',
    'mathematics',
    'Trigonometry',
    'c^2 = a^2 + b^2 - 2ab\\cos C',
    ['triangles'],
    'Generalizes Pythagoras to any triangle.',
  ),
  eq(
    'math-double-angle-sin',
    'Double-Angle (sin)',
    'mathematics',
    'Trigonometry',
    '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta',
    ['identities'],
    'Sin of twice an angle.',
  ),
  eq(
    'math-matrix-det2',
    '2×2 Determinant',
    'mathematics',
    'Linear Algebra',
    '\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc',
    ['matrices'],
    'Area scale factor of a 2×2 linear map.',
  ),
  eq(
    'math-dot',
    'Dot Product',
    'mathematics',
    'Linear Algebra',
    '\\mathbf{a}\\cdot\\mathbf{b} = \\|\\mathbf{a}\\|\\|\\mathbf{b}\\|\\cos\\theta',
    ['vectors'],
    'Projection form of the inner product.',
  ),
  eq(
    'math-cross-mag',
    'Cross Product Magnitude',
    'mathematics',
    'Linear Algebra',
    '\\|\\mathbf{a}\\times\\mathbf{b}\\| = \\|\\mathbf{a}\\|\\|\\mathbf{b}\\|\\sin\\theta',
    ['vectors'],
    'Area of the parallelogram spanned by a and b.',
  ),
  eq(
    'math-eigen',
    'Eigenvalue Equation',
    'mathematics',
    'Linear Algebra',
    'A\\mathbf{v} = \\lambda\\mathbf{v}',
    ['eigen'],
    'v is an eigenvector with eigenvalue λ.',
  ),
  eq(
    'math-inv-2x2',
    '2×2 Inverse',
    'mathematics',
    'Linear Algebra',
    '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}^{-1} = \\frac{1}{ad-bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}',
    ['matrices'],
    'Requires nonzero determinant.',
  ),
  eq(
    'math-bayes',
    "Bayes' Theorem",
    'mathematics',
    'Probability',
    'P(A\\mid B) = \\frac{P(B\\mid A)\\,P(A)}{P(B)}',
    ['probability', 'stats'],
    'Update beliefs given evidence B.',
  ),
  eq(
    'math-normal-pdf',
    'Normal PDF',
    'mathematics',
    'Probability',
    'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}',
    ['stats', 'distributions'],
    'Gaussian density with mean μ, sd σ.',
  ),
  eq(
    'math-combin',
    'Combinations',
    'mathematics',
    'Combinatorics',
    '\\binom{n}{k} = \\frac{n!}{k!(n-k)!}',
    ['counting'],
    'Ways to choose k from n without order.',
  ),
  eq(
    'math-perm',
    'Permutations',
    'mathematics',
    'Combinatorics',
    'P(n,k) = \\frac{n!}{(n-k)!}',
    ['counting'],
    'Ordered selections of k from n.',
  ),
  eq(
    'math-arith-sum',
    'Arithmetic Series Sum',
    'mathematics',
    'Sequences',
    'S_n = \\frac{n}{2}\\big(2a + (n-1)d\\big)',
    ['series'],
    'Sum of n terms, first a, common difference d.',
  ),
  eq(
    'math-geo-sum',
    'Geometric Series Sum',
    'mathematics',
    'Sequences',
    'S_n = a\\frac{1-r^n}{1-r}\\quad (r\\neq 1)',
    ['series'],
    'Sum of geometric progression.',
  ),

  tbl(
    'math-si-prefixes',
    'SI Prefixes',
    'mathematics',
    'Notation',
    '| Prefix | Symbol | Factor |\n|---|---|---|\n| giga | G | 10⁹ |\n| mega | M | 10⁶ |\n| kilo | k | 10³ |\n| milli | m | 10⁻³ |\n| micro | μ | 10⁻⁶ |\n| nano | n | 10⁻⁹ |',
    ['units', 'reference'],
    'Common SI metric prefixes.',
  ),
  tbl(
    'math-deriv-table',
    'Common Derivatives',
    'mathematics',
    'Calculus',
    '| f(x) | f′(x) |\n|---|---|\n| xⁿ | n xⁿ⁻¹ |\n| eˣ | eˣ |\n| ln x | 1/x |\n| sin x | cos x |\n| cos x | −sin x |\n| tan x | sec² x |',
    ['derivatives', 'reference'],
    'High-frequency derivative pairs.',
  ),
  tbl(
    'math-trig-values',
    'Common Trig Values',
    'mathematics',
    'Trigonometry',
    '| θ | sin | cos | tan |\n|---|---|---|---|\n| 0 | 0 | 1 | 0 |\n| π/6 | 1/2 | √3/2 | 1/√3 |\n| π/4 | √2/2 | √2/2 | 1 |\n| π/3 | √3/2 | 1/2 | √3 |\n| π/2 | 1 | 0 | — |',
    ['trig', 'reference'],
    'Standard angles on the unit circle.',
  ),

  // ═══════════════════════════════════════════════════════════
  // Physics
  // ═══════════════════════════════════════════════════════════
  eq(
    'phys-newton2',
    "Newton's Second Law",
    'physics',
    'Mechanics',
    '\\mathbf{F} = m\\mathbf{a}',
    ['force'],
    'Net force equals mass times acceleration.',
  ),
  eq(
    'phys-ke',
    'Kinetic Energy',
    'physics',
    'Mechanics',
    'K = \\frac{1}{2}mv^2',
    ['energy'],
    'Energy of motion.',
  ),
  eq(
    'phys-pe',
    'Gravitational Potential Energy',
    'physics',
    'Mechanics',
    'U = mgh',
    ['energy'],
    'Near-Earth gravitational PE.',
  ),
  eq(
    'phys-momentum',
    'Linear Momentum',
    'physics',
    'Mechanics',
    '\\mathbf{p} = m\\mathbf{v}',
    ['momentum'],
    'Mass times velocity.',
  ),
  eq(
    'phys-impulse',
    'Impulse–Momentum',
    'physics',
    'Mechanics',
    '\\mathbf{J} = \\int \\mathbf{F}\\, dt = \\Delta\\mathbf{p}',
    ['momentum'],
    'Impulse equals change in momentum.',
  ),
  eq(
    'phys-work',
    'Work (constant force)',
    'physics',
    'Mechanics',
    'W = \\mathbf{F}\\cdot\\mathbf{d} = Fd\\cos\\theta',
    ['energy'],
    'Work done by a constant force.',
  ),
  eq(
    'phys-power',
    'Power',
    'physics',
    'Mechanics',
    'P = \\frac{dW}{dt} = \\mathbf{F}\\cdot\\mathbf{v}',
    ['energy'],
    'Rate of doing work.',
  ),
  eq(
    'phys-centrip',
    'Centripetal Acceleration',
    'physics',
    'Mechanics',
    'a_c = \\frac{v^2}{r}',
    ['circular'],
    'Toward center for uniform circular motion.',
  ),
  eq(
    'phys-grav',
    "Newton's Law of Gravitation",
    'physics',
    'Mechanics',
    'F = G\\frac{m_1 m_2}{r^2}',
    ['gravity'],
    'Attractive force between point masses.',
  ),
  eq(
    'phys-coulomb',
    "Coulomb's Law",
    'physics',
    'Electromagnetism',
    'F = k_e \\frac{q_1 q_2}{r^2}',
    ['electrostatics'],
    'Force between point charges.',
  ),
  eq(
    'phys-ohm',
    "Ohm's Law",
    'physics',
    'Electromagnetism',
    'V = IR',
    ['circuits'],
    'Voltage, current, resistance relation.',
  ),
  eq(
    'phys-power-elec',
    'Electric Power',
    'physics',
    'Electromagnetism',
    'P = IV = I^2 R = \\frac{V^2}{R}',
    ['circuits'],
    'Power dissipated in a resistor.',
  ),
  eq(
    'phys-cap',
    'Capacitance',
    'physics',
    'Electromagnetism',
    'C = \\frac{Q}{V}',
    ['circuits'],
    'Charge per unit voltage.',
  ),
  eq(
    'phys-maxwell-faraday',
    'Faraday (Maxwell form)',
    'physics',
    'Electromagnetism',
    '\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}',
    ['maxwell'],
    'Changing B induces curl of E.',
  ),
  eq(
    'phys-gauss-e',
    "Gauss's Law (electric)",
    'physics',
    'Electromagnetism',
    '\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}',
    ['maxwell'],
    'Flux of E related to charge density.',
  ),
  eq(
    'phys-lorentz',
    'Lorentz Force',
    'physics',
    'Electromagnetism',
    '\\mathbf{F} = q(\\mathbf{E} + \\mathbf{v}\\times\\mathbf{B})',
    ['magnetism'],
    'Force on a charge in E and B fields.',
  ),
  eq(
    'phys-ideal-gas',
    'Ideal Gas Law',
    'physics',
    'Thermodynamics',
    'PV = nRT',
    ['gases'],
    'Macroscopic state equation for ideal gas.',
  ),
  eq(
    'phys-1st-law',
    'First Law of Thermodynamics',
    'physics',
    'Thermodynamics',
    '\\Delta U = Q - W',
    ['energy'],
    'Energy conservation for a thermodynamic system (sign convention: work by system).',
  ),
  eq(
    'phys-entropy',
    'Entropy Change (rev.)',
    'physics',
    'Thermodynamics',
    'dS = \\frac{\\delta Q_{\\mathrm{rev}}}{T}',
    ['entropy'],
    'Clausius definition for reversible heat.',
  ),
  eq(
    'phys-einstein',
    'Mass–Energy Equivalence',
    'physics',
    'Modern Physics',
    'E = mc^2',
    ['relativity'],
    'Rest energy of mass m.',
  ),
  eq(
    'phys-schrodinger',
    'Time-Independent Schrödinger',
    'physics',
    'Modern Physics',
    '\\hat{H}\\psi = E\\psi',
    ['quantum'],
    'Stationary-state eigenvalue problem.',
  ),
  eq(
    'phys-de-broglie',
    'de Broglie Wavelength',
    'physics',
    'Modern Physics',
    '\\lambda = \\frac{h}{p}',
    ['quantum'],
    'Matter wavelength from momentum.',
  ),
  eq(
    'phys-photoelectric',
    'Photoelectric Effect',
    'physics',
    'Modern Physics',
    'K_{\\max} = hf - \\phi',
    ['quantum'],
    'Max KE of photoelectrons.',
  ),
  eq(
    'phys-wave',
    'Wave Speed',
    'physics',
    'Waves',
    'v = f\\lambda',
    ['waves'],
    'Speed = frequency × wavelength.',
  ),
  eq(
    'phys-snell',
    "Snell's Law",
    'physics',
    'Optics',
    'n_1\\sin\\theta_1 = n_2\\sin\\theta_2',
    ['refraction'],
    'Refraction at an interface.',
  ),
  eq(
    'phys-lens',
    'Thin Lens Equation',
    'physics',
    'Optics',
    '\\frac{1}{f} = \\frac{1}{d_o} + \\frac{1}{d_i}',
    ['optics'],
    'Object and image distances vs focal length.',
  ),

  tbl(
    'phys-constants',
    'Physical Constants',
    'physics',
    'Constants',
    '| Constant | Symbol | Value |\n|---|---|---|\n| Speed of light | c | 2.998×10⁸ m/s |\n| Planck | h | 6.626×10⁻³⁴ J·s |\n| Boltzmann | k_B | 1.381×10⁻²³ J/K |\n| Elementary charge | e | 1.602×10⁻¹⁹ C |\n| Avogadro | N_A | 6.022×10²³ mol⁻¹ |\n| Gravity (Earth) | g | 9.81 m/s² |\n| Vacuum permittivity | ε₀ | 8.854×10⁻¹² F/m |',
    ['reference'],
    'Frequently used constants.',
  ),
  tbl(
    'phys-kinematic',
    'Kinematic Equations (1D, const a)',
    'physics',
    'Mechanics',
    '| Equation |\n|---|\n| v = v₀ + at |\n| x = x₀ + v₀t + ½at² |\n| v² = v₀² + 2a(x−x₀) |\n| x = x₀ + ½(v₀+v)t |',
    ['kinematics', 'reference'],
    'Constant-acceleration motion set.',
  ),

  // ═══════════════════════════════════════════════════════════
  // Chemistry
  // ═══════════════════════════════════════════════════════════
  eq(
    'chem-ideal-gas',
    'Ideal Gas Law',
    'chemistry',
    'Gases',
    'PV = nRT',
    ['gases'],
    'Ideal gas state equation.',
  ),
  eq(
    'chem-boyle',
    "Boyle's Law",
    'chemistry',
    'Gases',
    'P_1 V_1 = P_2 V_2 \\quad (T,n\\ \\mathrm{const})',
    ['gases'],
    'Pressure–volume inverse relation.',
  ),
  eq(
    'chem-charles',
    "Charles's Law",
    'chemistry',
    'Gases',
    '\\frac{V_1}{T_1} = \\frac{V_2}{T_2} \\quad (P,n\\ \\mathrm{const})',
    ['gases'],
    'Volume proportional to absolute T.',
  ),
  eq(
    'chem-ph',
    'pH Definition',
    'chemistry',
    'Acids & Bases',
    '\\mathrm{pH} = -\\log_{10}[\\mathrm{H}^+]',
    ['equilibrium'],
    'Acidity scale from [H⁺].',
  ),
  eq(
    'chem-poh',
    'pOH and pH',
    'chemistry',
    'Acids & Bases',
    '\\mathrm{pH} + \\mathrm{pOH} = 14 \\quad (25^\\circ\\mathrm{C})',
    ['equilibrium'],
    'Water ion product relation at 25 °C.',
  ),
  eq(
    'chem-henderson',
    'Henderson–Hasselbalch',
    'chemistry',
    'Acids & Bases',
    '\\mathrm{pH} = \\mathrm{p}K_a + \\log_{10}\\frac{[\\mathrm{A}^-]}{[\\mathrm{HA}]}',
    ['buffers'],
    'Buffer pH from acid/base ratio.',
  ),
  eq(
    'chem-ka',
    'Acid Dissociation Constant',
    'chemistry',
    'Acids & Bases',
    'K_a = \\frac{[\\mathrm{H}^+][\\mathrm{A}^-]}{[\\mathrm{HA}]}',
    ['equilibrium'],
    'Strength of a weak acid HA.',
  ),
  eq(
    'chem-nernst',
    'Nernst Equation',
    'chemistry',
    'Electrochemistry',
    'E = E^\\circ - \\frac{RT}{nF}\\ln Q',
    ['redox'],
    'Cell potential under nonstandard conditions.',
  ),
  eq(
    'chem-arrhenius',
    'Arrhenius Equation',
    'chemistry',
    'Kinetics',
    'k = Ae^{-E_a / RT}',
    ['rates'],
    'Temperature dependence of rate constants.',
  ),
  eq(
    'chem-rate-1st',
    'First-Order Rate Law',
    'chemistry',
    'Kinetics',
    '\\ln\\frac{[A]}{[A]_0} = -kt',
    ['rates'],
    'Integrated first-order kinetics.',
  ),
  eq(
    'chem-half-life-1st',
    'First-Order Half-Life',
    'chemistry',
    'Kinetics',
    't_{1/2} = \\frac{\\ln 2}{k}',
    ['rates'],
    'Half-life independent of concentration.',
  ),
  eq(
    'chem-gibbs',
    'Gibbs Free Energy',
    'chemistry',
    'Thermodynamics',
    '\\Delta G = \\Delta H - T\\Delta S',
    ['spontaneity'],
    'Spontaneity criterion at constant T,P.',
  ),
  eq(
    'chem-gibbs-k',
    'ΔG° and Equilibrium',
    'chemistry',
    'Thermodynamics',
    '\\Delta G^\\circ = -RT\\ln K',
    ['equilibrium'],
    'Standard free energy from K.',
  ),
  eq(
    'chem-moles',
    'Mole Relation',
    'chemistry',
    'Stoichiometry',
    'n = \\frac{m}{M}',
    ['moles'],
    'Moles from mass and molar mass.',
  ),
  eq(
    'chem-molarity',
    'Molarity',
    'chemistry',
    'Stoichiometry',
    'M = \\frac{n}{V}',
    ['solutions'],
    'Moles of solute per liter of solution.',
  ),
  eq(
    'chem-beer',
    'Beer–Lambert Law',
    'chemistry',
    'Spectroscopy',
    'A = \\varepsilon\\, c\\, l',
    ['absorbance'],
    'Absorbance proportional to concentration and path length.',
  ),
  eq(
    'chem-dilution',
    'Dilution Equation',
    'chemistry',
    'Stoichiometry',
    'M_1 V_1 = M_2 V_2',
    ['solutions'],
    'Moles conserved when diluting.',
  ),

  tbl(
    'chem-strong-acids',
    'Common Strong Acids',
    'chemistry',
    'Acids & Bases',
    '| Acid | Formula |\n|---|---|\n| Hydrochloric | HCl |\n| Hydrobromic | HBr |\n| Hydroiodic | HI |\n| Nitric | HNO₃ |\n| Sulfuric | H₂SO₄ |\n| Perchloric | HClO₄ |',
    ['reference', 'acids'],
    'Strong acids fully dissociate in water.',
  ),
  tbl(
    'chem-solubility',
    'Solubility Rules (selected)',
    'chemistry',
    'Aqueous Chemistry',
    '| Rule | Notes |\n|---|---|\n| Group 1 & NH₄⁺ salts | Soluble |\n| NO₃⁻, C₂H₃O₂⁻ | Soluble |\n| Cl⁻, Br⁻, I⁻ | Soluble except Ag⁺, Pb²⁺, Hg₂²⁺ |\n| SO₄²⁻ | Soluble except Ba²⁺, Pb²⁺, Ca²⁺ (sparing) |\n| OH⁻, S²⁻, CO₃²⁻, PO₄³⁻ | Often insoluble (except Group 1) |',
    ['reference'],
    'Quick solubility heuristics.',
  ),

  // ═══════════════════════════════════════════════════════════
  // Biology
  // ═══════════════════════════════════════════════════════════
  eq(
    'bio-hardy',
    'Hardy–Weinberg',
    'biology',
    'Population Genetics',
    'p^2 + 2pq + q^2 = 1',
    ['genetics'],
    'Genotype frequencies under HWE.',
  ),
  eq(
    'bio-growth',
    'Exponential Growth',
    'biology',
    'Ecology',
    'N(t) = N_0 e^{rt}',
    ['populations'],
    'Unlimited growth model.',
  ),
  eq(
    'bio-logistic',
    'Logistic Growth',
    'biology',
    'Ecology',
    '\\frac{dN}{dt} = rN\\left(1 - \\frac{N}{K}\\right)',
    ['populations'],
    'Growth with carrying capacity K.',
  ),
  eq(
    'bio-mm',
    'Michaelis–Menten',
    'biology',
    'Biochemistry',
    'v = \\frac{V_{\\max}[S]}{K_m + [S]}',
    ['enzymes'],
    'Enzyme kinetics vs substrate concentration.',
  ),
  eq(
    'bio-lineweaver',
    'Lineweaver–Burk',
    'biology',
    'Biochemistry',
    '\\frac{1}{v} = \\frac{K_m}{V_{\\max}}\\frac{1}{[S]} + \\frac{1}{V_{\\max}}',
    ['enzymes'],
    'Double-reciprocal MM form.',
  ),
  eq(
    'bio-nernst-bio',
    'Nernst Potential (ion)',
    'biology',
    'Neurophysiology',
    'E = \\frac{RT}{zF}\\ln\\frac{[\\mathrm{ion}]_o}{[\\mathrm{ion}]_i}',
    ['membrane'],
    'Equilibrium potential for one ion.',
  ),
  eq(
    'bio-g-h-k',
    'Goldman–Hodgkin–Katz',
    'biology',
    'Neurophysiology',
    'V_m = \\frac{RT}{F}\\ln\\frac{P_K[K^+]_o + P_{Na}[Na^+]_o + P_{Cl}[Cl^-]_i}{P_K[K^+]_i + P_{Na}[Na^+]_i + P_{Cl}[Cl^-]_o}',
    ['membrane'],
    'Resting potential from multiple ions.',
  ),
  eq(
    'bio-photosyn',
    'Photosynthesis (summary)',
    'biology',
    'Plant Biology',
    '6\\,\\mathrm{CO}_2 + 6\\,\\mathrm{H}_2\\mathrm{O} \\xrightarrow{\\text{light}} \\mathrm{C}_6\\mathrm{H}_{12}\\mathrm{O}_6 + 6\\,\\mathrm{O}_2',
    ['metabolism'],
    'Overall photosynthetic equation.',
  ),
  eq(
    'bio-respiration',
    'Cellular Respiration (summary)',
    'biology',
    'Metabolism',
    '\\mathrm{C}_6\\mathrm{H}_{12}\\mathrm{O}_6 + 6\\,\\mathrm{O}_2 \\to 6\\,\\mathrm{CO}_2 + 6\\,\\mathrm{H}_2\\mathrm{O} + \\text{ATP}',
    ['metabolism'],
    'Overall aerobic respiration.',
  ),
  eq(
    'bio-bmi',
    'Body Mass Index',
    'biology',
    'Physiology',
    '\\mathrm{BMI} = \\frac{m}{h^2}',
    ['health'],
    'Mass (kg) over height² (m).',
  ),
  eq(
    'bio-henderson-bio',
    'Blood Buffer (approx.)',
    'biology',
    'Physiology',
    '\\mathrm{pH} = 6.1 + \\log_{10}\\frac{[\\mathrm{HCO}_3^-]}{0.03\\,P_{\\mathrm{CO}_2}}',
    ['acid-base'],
    'Henderson–Hasselbalch for bicarbonate buffer.',
  ),

  tbl(
    'bio-central-dogma',
    'Central Dogma Flow',
    'biology',
    'Molecular Biology',
    '| Step | From | To | Enzyme |\n|---|---|---|---|\n| Replication | DNA | DNA | DNA polymerase |\n| Transcription | DNA | RNA | RNA polymerase |\n| Translation | mRNA | Protein | Ribosome |',
    ['dna', 'reference'],
    'Information flow DNA → RNA → protein.',
  ),
  tbl(
    'bio-nucleotides',
    'DNA/RNA Bases',
    'biology',
    'Molecular Biology',
    '| Base | DNA | RNA | Pairs with |\n|---|---|---|---|\n| Adenine (A) | ✓ | ✓ | T (DNA) / U (RNA) |\n| Thymine (T) | ✓ | — | A |\n| Uracil (U) | — | ✓ | A |\n| Guanine (G) | ✓ | ✓ | C |\n| Cytosine (C) | ✓ | ✓ | G |',
    ['dna', 'reference'],
    'Base pairing and DNA vs RNA.',
  ),
  tbl(
    'bio-organelles',
    'Key Organelles',
    'biology',
    'Cell Biology',
    '| Organelle | Main role |\n|---|---|\n| Nucleus | DNA storage, transcription |\n| Mitochondrion | ATP (oxidative phosphorylation) |\n| Chloroplast | Photosynthesis (plants) |\n| Ribosome | Protein synthesis |\n| ER / Golgi | Protein folding & trafficking |\n| Lysosome | Degradation |',
    ['cells', 'reference'],
    'High-level organelle functions.',
  ),

  // ═══════════════════════════════════════════════════════════
  // Economics
  // ═══════════════════════════════════════════════════════════
  eq(
    'econ-elasticity',
    'Price Elasticity of Demand',
    'economics',
    'Microeconomics',
    'E_d = \\frac{\\%\\Delta Q_d}{\\%\\Delta P}',
    ['elasticity'],
    'Responsiveness of quantity to price.',
  ),
  eq(
    'econ-income-elast',
    'Income Elasticity',
    'economics',
    'Microeconomics',
    'E_I = \\frac{\\%\\Delta Q}{\\%\\Delta I}',
    ['elasticity'],
    'Normal vs inferior goods via sign.',
  ),
  eq(
    'econ-gdp',
    'GDP (Expenditure)',
    'economics',
    'Macroeconomics',
    'Y = C + I + G + (X - M)',
    ['gdp'],
    'Expenditure approach to national income.',
  ),
  eq(
    'econ-quantity',
    'Quantity Theory of Money',
    'economics',
    'Macroeconomics',
    'MV = PY',
    ['money'],
    'Money × velocity = price × output.',
  ),
  eq(
    'econ-utility',
    'Cobb–Douglas Utility',
    'economics',
    'Microeconomics',
    'U(x,y) = x^{\\alpha} y^{1-\\alpha}',
    ['utility'],
    'Classic homothetic preferences.',
  ),
  eq(
    'econ-mrs',
    'Marginal Rate of Substitution',
    'economics',
    'Microeconomics',
    'MRS = \\frac{MU_x}{MU_y} = -\\frac{dy}{dx}\\Big|_{U}',
    ['utility'],
    'Slope of an indifference curve.',
  ),
  eq(
    'econ-is',
    'IS Relation (simple)',
    'economics',
    'Macroeconomics',
    'Y = C(Y - T) + I(r) + G',
    ['is-lm'],
    'Goods-market equilibrium.',
  ),
  eq(
    'econ-lm',
    'LM Relation (simple)',
    'economics',
    'Macroeconomics',
    '\\frac{M}{P} = L(Y, r)',
    ['is-lm', 'money'],
    'Money-market equilibrium.',
  ),
  eq(
    'econ-profit',
    'Economic Profit',
    'economics',
    'Microeconomics',
    '\\pi = TR - TC',
    ['firms'],
    'Total revenue minus total cost.',
  ),
  eq(
    'econ-mc',
    'Marginal Cost',
    'economics',
    'Microeconomics',
    'MC = \\frac{dTC}{dQ}',
    ['firms'],
    'Cost of one more unit of output.',
  ),
  eq(
    'econ-mr',
    'Marginal Revenue',
    'economics',
    'Microeconomics',
    'MR = \\frac{dTR}{dQ}',
    ['firms'],
    'Revenue from one more unit sold.',
  ),
  eq(
    'econ-profit-max',
    'Profit Max Condition',
    'economics',
    'Microeconomics',
    'MR = MC',
    ['firms'],
    'Interior profit-maximizing output rule.',
  ),
  eq(
    'econ-cpi',
    'Inflation (CPI)',
    'economics',
    'Macroeconomics',
    '\\pi_t = \\frac{CPI_t - CPI_{t-1}}{CPI_{t-1}}',
    ['inflation'],
    'Period-to-period inflation rate.',
  ),
  eq(
    'econ-okun',
    "Okun's Law (approx.)",
    'economics',
    'Macroeconomics',
    '\\frac{Y - Y^*}{Y^*} \\approx -\\beta (u - u^*)',
    ['unemployment'],
    'Output gap vs unemployment gap.',
  ),
  eq(
    'econ-phillips',
    'Phillips Curve (simple)',
    'economics',
    'Macroeconomics',
    '\\pi = \\pi^e - \\alpha(u - u_n)',
    ['inflation', 'unemployment'],
    'Inflation–unemployment tradeoff with expectations.',
  ),

  tbl(
    'econ-market-structures',
    'Market Structures',
    'economics',
    'Microeconomics',
    '| Structure | Sellers | Price power | Entry |\n|---|---|---|---|\n| Perfect competition | Many | None | Free |\n| Monopoly | One | High | Blocked |\n| Oligopoly | Few | Some | Barriers |\n| Monopolistic comp. | Many | Some | Free |',
    ['reference', 'firms'],
    'Quick comparison of market types.',
  ),

  // ═══════════════════════════════════════════════════════════
  // Finance
  // ═══════════════════════════════════════════════════════════
  eq(
    'fin-pv',
    'Present Value',
    'finance',
    'Time Value of Money',
    'PV = \\frac{FV}{(1 + r)^n}',
    ['discounting'],
    'Discount a future cash amount.',
  ),
  eq(
    'fin-fv',
    'Future Value',
    'finance',
    'Time Value of Money',
    'FV = PV(1 + r)^n',
    ['compounding'],
    'Compound a present amount forward.',
  ),
  eq(
    'fin-annuity',
    'Annuity Present Value',
    'finance',
    'Time Value of Money',
    'PV = C \\cdot \\frac{1 - (1+r)^{-n}}{r}',
    ['annuity'],
    'PV of level payments for n periods.',
  ),
  eq(
    'fin-annuity-fv',
    'Annuity Future Value',
    'finance',
    'Time Value of Money',
    'FV = C \\cdot \\frac{(1+r)^n - 1}{r}',
    ['annuity'],
    'FV of level deposits for n periods.',
  ),
  eq(
    'fin-perp',
    'Perpetuity',
    'finance',
    'Time Value of Money',
    'PV = \\frac{C}{r}',
    ['annuity'],
    'PV of infinite level cash flows.',
  ),
  eq(
    'fin-ear',
    'Effective Annual Rate',
    'finance',
    'Time Value of Money',
    'EAR = \\left(1 + \\frac{r_{\\mathrm{nom}}}{m}\\right)^m - 1',
    ['rates'],
    'True annual rate with m compounds/year.',
  ),
  eq(
    'fin-continuous',
    'Continuous Compounding',
    'finance',
    'Time Value of Money',
    'FV = PV\\, e^{rt}',
    ['compounding'],
    'Limit of compounding frequency → ∞.',
  ),
  eq(
    'fin-capm',
    'CAPM',
    'finance',
    'Asset Pricing',
    'E[R_i] = R_f + \\beta_i\\big(E[R_m] - R_f\\big)',
    ['returns'],
    'Expected return vs systematic risk.',
  ),
  eq(
    'fin-beta',
    'Beta (definition)',
    'finance',
    'Asset Pricing',
    '\\beta_i = \\frac{\\mathrm{Cov}(R_i, R_m)}{\\mathrm{Var}(R_m)}',
    ['risk'],
    'Sensitivity to market returns.',
  ),
  eq(
    'fin-bs',
    'Black–Scholes Call (form)',
    'finance',
    'Derivatives',
    'C = S_0 N(d_1) - Ke^{-rT} N(d_2)',
    ['options'],
    'European call under Black–Scholes assumptions.',
  ),
  eq(
    'fin-bs-d1',
    'Black–Scholes d₁, d₂',
    'finance',
    'Derivatives',
    'd_1 = \\frac{\\ln(S_0/K) + (r + \\sigma^2/2)T}{\\sigma\\sqrt{T}},\\quad d_2 = d_1 - \\sigma\\sqrt{T}',
    ['options'],
    'Inputs to N(d₁), N(d₂) in BS formula.',
  ),
  eq(
    'fin-put-call',
    'Put–Call Parity',
    'finance',
    'Derivatives',
    'C - P = S_0 - Ke^{-rT}',
    ['options'],
    'European options parity (no dividends).',
  ),
  eq(
    'fin-sharpe',
    'Sharpe Ratio',
    'finance',
    'Portfolio Theory',
    'S = \\frac{E[R_p] - R_f}{\\sigma_p}',
    ['risk'],
    'Excess return per unit of total risk.',
  ),
  eq(
    'fin-treynor',
    'Treynor Ratio',
    'finance',
    'Portfolio Theory',
    'T = \\frac{E[R_p] - R_f}{\\beta_p}',
    ['risk'],
    'Excess return per unit of systematic risk.',
  ),
  eq(
    'fin-npv',
    'Net Present Value',
    'finance',
    'Capital Budgeting',
    'NPV = \\sum_{t=0}^{n} \\frac{C_t}{(1+r)^t}',
    ['valuation'],
    'Sum of discounted project cash flows.',
  ),
  eq(
    'fin-irr',
    'Internal Rate of Return',
    'finance',
    'Capital Budgeting',
    '0 = \\sum_{t=0}^{n} \\frac{C_t}{(1+\\mathrm{IRR})^t}',
    ['valuation'],
    'Discount rate that zeros NPV.',
  ),
  eq(
    'fin-wacc',
    'WACC',
    'finance',
    'Corporate Finance',
    'r_{\\mathrm{WACC}} = \\frac{E}{V}r_E + \\frac{D}{V}r_D(1-t_c)',
    ['cost-of-capital'],
    'Weighted average cost of capital (tax shield on debt).',
  ),
  eq(
    'fin-gordon',
    'Gordon Growth Model',
    'finance',
    'Equity Valuation',
    'P_0 = \\frac{D_1}{r - g}',
    ['valuation'],
    'Constant-growth dividend discount model.',
  ),
  eq(
    'fin-duration',
    'Macaulay Duration (idea)',
    'finance',
    'Fixed Income',
    'D_{\\mathrm{Mac}} = \\sum_{t=1}^{T} t\\,\\frac{PV(CF_t)}{P}',
    ['bonds'],
    'Weighted average time to cash flows.',
  ),

  tbl(
    'fin-compound',
    'Compounding Frequencies',
    'finance',
    'Time Value of Money',
    '| Frequency | m |\n|---|---|\n| Annual | 1 |\n| Semiannual | 2 |\n| Quarterly | 4 |\n| Monthly | 12 |\n| Daily | 365 |\n| Continuous | e^{rt} |',
    ['reference'],
    'How often interest is compounded.',
  ),
  tbl(
    'fin-ratios',
    'Key Financial Ratios',
    'finance',
    'Analysis',
    '| Ratio | Formula (idea) |\n|---|---|\n| Current | CA / CL |\n| Quick | (CA − Inventory) / CL |\n| ROE | Net Income / Equity |\n| ROA | Net Income / Assets |\n| Debt/Equity | Total Debt / Equity |\n| P/E | Price / EPS |',
    ['reference', 'ratios'],
    'Common analysis ratios.',
  ),

  // ═══════════════════════════════════════════════════════════
  // Extra named formulas (catalog browse / Create Equation insert)
  // ═══════════════════════════════════════════════════════════
  eq(
    'math-pythag-id',
    'Pythagorean Identity',
    'mathematics',
    'Trigonometry',
    '\\sin^2\\theta + \\cos^2\\theta = 1',
    ['trig', 'identity'],
    'Fundamental trig identity.',
  ),
  eq(
    'math-double-angle-sin',
    'Double-Angle (sin)',
    'mathematics',
    'Trigonometry',
    '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta',
    ['trig'],
    'Sine of twice an angle.',
  ),
  eq(
    'math-double-angle-cos',
    'Double-Angle (cos)',
    'mathematics',
    'Trigonometry',
    '\\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta',
    ['trig'],
    'Cosine of twice an angle.',
  ),
  eq(
    'math-law-sines',
    'Law of Sines',
    'mathematics',
    'Trigonometry',
    '\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}',
    ['triangles'],
    'Side / opposite-angle ratios in a triangle.',
  ),
  eq(
    'math-law-cosines',
    'Law of Cosines',
    'mathematics',
    'Trigonometry',
    'c^2 = a^2 + b^2 - 2ab\\cos C',
    ['triangles'],
    'Generalizes Pythagoras to any triangle.',
  ),
  eq(
    'math-dot-product',
    'Dot Product',
    'mathematics',
    'Linear Algebra',
    '\\mathbf{a}\\cdot\\mathbf{b} = |\\mathbf{a}||\\mathbf{b}|\\cos\\theta = \\sum_i a_i b_i',
    ['vectors'],
    'Scalar product of two vectors.',
  ),
  eq(
    'math-cross-product-mag',
    'Cross Product Magnitude',
    'mathematics',
    'Linear Algebra',
    '|\\mathbf{a}\\times\\mathbf{b}| = |\\mathbf{a}||\\mathbf{b}|\\sin\\theta',
    ['vectors'],
    'Area of parallelogram spanned by a, b.',
  ),
  eq(
    'math-matrix-2x2-det',
    '2×2 Determinant',
    'mathematics',
    'Linear Algebra',
    '\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc',
    ['matrices'],
    'Determinant of a 2×2 matrix.',
  ),
  eq(
    'math-eigen',
    'Eigenvalue Equation',
    'mathematics',
    'Linear Algebra',
    'A\\mathbf{v} = \\lambda\\mathbf{v}',
    ['eigen'],
    'Eigenvector v with eigenvalue λ.',
  ),
  eq(
    'math-sep-vars',
    'Separable DE',
    'mathematics',
    'Differential Equations',
    '\\frac{dy}{dx} = g(x)h(y) \\quad\\Rightarrow\\quad \\int\\frac{dy}{h(y)} = \\int g(x)\\,dx',
    ['ode'],
    'Separate and integrate both sides.',
  ),
  eq(
    'math-binom-pmf',
    'Binomial PMF',
    'mathematics',
    'Probability',
    'P(X=k) = \\binom{n}{k} p^k (1-p)^{n-k}',
    ['probability', 'discrete'],
    'Probability of k successes in n Bernoulli trials.',
  ),
  eq(
    'math-normal-pdf',
    'Normal PDF',
    'mathematics',
    'Probability',
    'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}',
    ['probability', 'gaussian'],
    'Gaussian density with mean μ and sd σ.',
  ),
  eq(
    'phys-hooke',
    "Hooke's Law",
    'physics',
    'Mechanics',
    'F = -kx',
    ['spring', 'elastic'],
    'Restoring force of an ideal spring.',
  ),
  eq(
    'phys-kinetic',
    'Kinetic Energy',
    'physics',
    'Mechanics',
    'K = \\frac{1}{2}mv^2',
    ['energy'],
    'Translational kinetic energy.',
  ),
  eq(
    'phys-grav-pe',
    'Gravitational PE (near Earth)',
    'physics',
    'Mechanics',
    'U = mgh',
    ['energy', 'gravity'],
    'Potential energy with constant g.',
  ),
  eq(
    'phys-coulomb',
    "Coulomb's Law",
    'physics',
    'Electricity & Magnetism',
    'F = k_e \\frac{q_1 q_2}{r^2}',
    ['electrostatics'],
    'Force between two point charges.',
  ),
  eq(
    'phys-maxwell-gauss-e',
    "Gauss's Law (E)",
    'physics',
    'Electricity & Magnetism',
    '\\nabla\\cdot\\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}',
    ['maxwell'],
    'Divergence of electric field from charge density.',
  ),
  eq(
    'phys-maxwell-gauss-b',
    "Gauss's Law (B)",
    'physics',
    'Electricity & Magnetism',
    '\\nabla\\cdot\\mathbf{B} = 0',
    ['maxwell'],
    'No magnetic monopoles.',
  ),
  eq(
    'phys-maxwell-faraday',
    'Faraday–Maxwell',
    'physics',
    'Electricity & Magnetism',
    '\\nabla\\times\\mathbf{E} = -\\frac{\\partial\\mathbf{B}}{\\partial t}',
    ['maxwell', 'induction'],
    'Induced electric field from changing B.',
  ),
  eq(
    'phys-maxwell-ampere',
    'Ampère–Maxwell',
    'physics',
    'Electricity & Magnetism',
    '\\nabla\\times\\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\frac{\\partial\\mathbf{E}}{\\partial t}',
    ['maxwell'],
    'Magnetic field from currents and changing E.',
  ),
  eq(
    'phys-wave',
    '1D Wave Equation',
    'physics',
    'Waves',
    '\\frac{\\partial^2 y}{\\partial x^2} = \\frac{1}{v^2}\\frac{\\partial^2 y}{\\partial t^2}',
    ['waves', 'pde'],
    'Traveling waves at speed v.',
  ),
  eq(
    'chem-ph',
    'pH Definition',
    'chemistry',
    'Acids & Bases',
    '\\mathrm{pH} = -\\log_{10}[\\mathrm{H}^+]',
    ['acids'],
    'Acidity scale from hydrogen ion concentration.',
  ),
  eq(
    'chem-kw',
    'Water Ion Product',
    'chemistry',
    'Acids & Bases',
    'K_w = [\\mathrm{H}^+][\\mathrm{OH}^-] = 1.0\\times 10^{-14}\\ (25^\\circ\\mathrm{C})',
    ['equilibrium'],
    'Autoionization of water at 25 °C.',
  ),
  eq(
    'chem-arrhenius',
    'Arrhenius Equation',
    'chemistry',
    'Kinetics',
    'k = A e^{-E_a/(RT)}',
    ['kinetics', 'temperature'],
    'Rate constant vs activation energy and T.',
  ),
  eq(
    'chem-ideal-gas',
    'Ideal Gas Law',
    'chemistry',
    'Gases',
    'PV = nRT',
    ['gases', 'thermo'],
    'Ideal gas equation of state.',
  ),
  eq(
    'bio-hardy-weinberg',
    'Hardy–Weinberg',
    'biology',
    'Genetics',
    'p^2 + 2pq + q^2 = 1',
    ['genetics', 'equilibrium'],
    'Genotype frequencies under HW assumptions.',
  ),
  eq(
    'bio-exponential-growth',
    'Exponential Growth',
    'biology',
    'Population',
    'N(t) = N_0 e^{rt}',
    ['population'],
    'Unlimited population growth at rate r.',
  ),
  eq(
    'bio-logistic',
    'Logistic Growth',
    'biology',
    'Population',
    '\\frac{dN}{dt} = rN\\left(1 - \\frac{N}{K}\\right)',
    ['population'],
    'Growth with carrying capacity K.',
  ),
  eq(
    'bio-michaelis',
    'Michaelis–Menten',
    'biology',
    'Enzymes',
    'v = \\frac{V_{\\max}[S]}{K_m + [S]}',
    ['enzymes', 'kinetics'],
    'Enzyme rate vs substrate concentration.',
  ),
  eq(
    'econ-gdp-exp',
    'GDP (expenditure)',
    'economics',
    'Macroeconomics',
    'Y = C + I + G + (X - M)',
    ['gdp'],
    'Expenditure approach to national income.',
  ),
  eq(
    'econ-elasticity',
    'Price Elasticity of Demand',
    'economics',
    'Microeconomics',
    'E_d = \\frac{\\%\\Delta Q_d}{\\%\\Delta P}',
    ['elasticity'],
    'Responsiveness of quantity to price.',
  ),
  eq(
    'fin-npv',
    'Net Present Value',
    'finance',
    'Capital Budgeting',
    'NPV = \\sum_{t=0}^{n} \\frac{C_t}{(1+r)^t}',
    ['npv', 'discounting'],
    'Sum of discounted project cash flows.',
  ),
  eq(
    'fin-irr',
    'Internal Rate of Return',
    'finance',
    'Capital Budgeting',
    '0 = \\sum_{t=0}^{n} \\frac{C_t}{(1+\\mathrm{IRR})^t}',
    ['irr'],
    'Discount rate that sets NPV to zero.',
  ),

  // ═══════════════════════════════════════════════════════════
  // Figures (inline SVG)
  // ═══════════════════════════════════════════════════════════
  fig(
    'fig-unit-circle',
    'Unit Circle',
    'mathematics',
    'Trigonometry',
    svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="70" fill="none" stroke="#818cf8" stroke-width="2"/>
      <line x1="30" y1="100" x2="170" y2="100" stroke="#4b5563" stroke-width="1"/>
      <line x1="100" y1="30" x2="100" y2="170" stroke="#4b5563" stroke-width="1"/>
      <line x1="100" y1="100" x2="149.5" y2="50.5" stroke="#34d399" stroke-width="2"/>
      <circle cx="149.5" cy="50.5" r="4" fill="#fbbf24"/>
      <text x="155" y="48" fill="#e5e7eb" font-size="10" font-family="sans-serif">(cos,sin)</text>
      <text x="100" y="190" text-anchor="middle" fill="#9ca3af" font-size="12" font-family="sans-serif">Unit Circle</text>
    </svg>`),
    ['diagram', 'trig'],
    'Point on the unit circle at angle θ.',
  ),
  fig(
    'fig-parabola',
    'Parabola y = x²',
    'mathematics',
    'Algebra',
    svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="180" viewBox="0 0 220 180">
      <line x1="20" y1="150" x2="200" y2="150" stroke="#6b7280" stroke-width="1"/>
      <line x1="110" y1="20" x2="110" y2="160" stroke="#6b7280" stroke-width="1"/>
      <path d="M30 150 Q110 20 190 150" fill="none" stroke="#818cf8" stroke-width="2.5"/>
      <circle cx="110" cy="150" r="3" fill="#fbbf24"/>
      <text x="118" y="165" fill="#9ca3af" font-size="11" font-family="sans-serif">vertex</text>
      <text x="110" y="14" text-anchor="middle" fill="#a5b4fc" font-size="11" font-family="sans-serif">y = x²</text>
    </svg>`),
    ['diagram', 'graphs'],
    'Basic upward-opening parabola.',
  ),
  fig(
    'fig-right-triangle',
    'Right Triangle',
    'mathematics',
    'Geometry',
    svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160" viewBox="0 0 200 160">
      <polygon points="40,130 160,130 40,40" fill="none" stroke="#818cf8" stroke-width="2"/>
      <rect x="40" y="118" width="12" height="12" fill="none" stroke="#34d399" stroke-width="1.5"/>
      <text x="95" y="145" fill="#9ca3af" font-size="12" font-family="sans-serif">a</text>
      <text x="22" y="90" fill="#9ca3af" font-size="12" font-family="sans-serif">b</text>
      <text x="110" y="75" fill="#fbbf24" font-size="12" font-family="sans-serif">c</text>
    </svg>`),
    ['diagram', 'triangles'],
    'Right triangle with legs a, b and hypotenuse c.',
  ),
  fig(
    'fig-supply-demand',
    'Supply & Demand',
    'economics',
    'Microeconomics',
    svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="180" viewBox="0 0 220 180">
      <line x1="40" y1="150" x2="200" y2="150" stroke="#6b7280" stroke-width="1.5"/>
      <line x1="40" y1="150" x2="40" y2="20" stroke="#6b7280" stroke-width="1.5"/>
      <line x1="50" y1="40" x2="190" y2="140" stroke="#34d399" stroke-width="2"/>
      <line x1="50" y1="140" x2="190" y2="40" stroke="#f87171" stroke-width="2"/>
      <circle cx="120" cy="90" r="5" fill="#818cf8"/>
      <text x="55" y="35" fill="#34d399" font-size="11" font-family="sans-serif">S</text>
      <text x="55" y="145" fill="#f87171" font-size="11" font-family="sans-serif">D</text>
      <text x="110" y="172" fill="#9ca3af" font-size="11" font-family="sans-serif">Q</text>
      <text x="18" y="90" fill="#9ca3af" font-size="11" font-family="sans-serif">P</text>
      <text x="128" y="88" fill="#c7d2fe" font-size="10" font-family="sans-serif">eq</text>
    </svg>`),
    ['diagram', 'markets'],
    'Equilibrium at supply–demand intersection.',
  ),
  fig(
    'fig-ppf',
    'Production Possibility Frontier',
    'economics',
    'Macroeconomics',
    svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="180" viewBox="0 0 220 180">
      <line x1="40" y1="150" x2="200" y2="150" stroke="#6b7280" stroke-width="1.5"/>
      <line x1="40" y1="150" x2="40" y2="25" stroke="#6b7280" stroke-width="1.5"/>
      <path d="M45 145 Q100 40 190 35" fill="none" stroke="#818cf8" stroke-width="2.5"/>
      <circle cx="120" cy="70" r="4" fill="#34d399"/>
      <text x="128" y="68" fill="#86efac" font-size="10" font-family="sans-serif">efficient</text>
      <circle cx="90" cy="110" r="4" fill="#fbbf24"/>
      <text x="98" y="125" fill="#fcd34d" font-size="10" font-family="sans-serif">inefficient</text>
      <text x="110" y="172" fill="#9ca3af" font-size="11" font-family="sans-serif">Good X</text>
      <text x="8" y="90" fill="#9ca3af" font-size="11" font-family="sans-serif">Y</text>
    </svg>`),
    ['diagram', 'tradeoffs'],
    'PPF: efficient vs inefficient production points.',
  ),
  fig(
    'fig-free-body',
    'Free-Body Sketch',
    'physics',
    'Mechanics',
    svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="180" viewBox="0 0 200 180">
      <rect x="70" y="70" width="60" height="50" fill="#312e81" stroke="#818cf8" stroke-width="2"/>
      <line x1="100" y1="70" x2="100" y2="30" stroke="#34d399" stroke-width="2" marker-end="url(#a)"/>
      <line x1="100" y1="120" x2="100" y2="160" stroke="#f87171" stroke-width="2"/>
      <line x1="70" y1="95" x2="30" y2="95" stroke="#fbbf24" stroke-width="2"/>
      <text x="105" y="40" fill="#86efac" font-size="11" font-family="sans-serif">N</text>
      <text x="105" y="155" fill="#fca5a5" font-size="11" font-family="sans-serif">mg</text>
      <text x="20" y="88" fill="#fcd34d" font-size="11" font-family="sans-serif">F</text>
      <text x="100" y="175" text-anchor="middle" fill="#9ca3af" font-size="11" font-family="sans-serif">Free-body</text>
    </svg>`),
    ['diagram', 'force'],
    'Block with normal, weight, and applied force.',
  ),
  fig(
    'fig-wave',
    'Sine Wave',
    'physics',
    'Waves',
    svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
      <line x1="10" y1="60" x2="230" y2="60" stroke="#4b5563" stroke-width="1"/>
      <path d="M10 60 C40 20, 70 20, 100 60 S160 100, 190 60 S230 20, 230 60" fill="none" stroke="#818cf8" stroke-width="2.5"/>
      <text x="95" y="100" fill="#9ca3af" font-size="11" font-family="sans-serif">λ</text>
      <line x1="100" y1="60" x2="190" y2="60" stroke="#34d399" stroke-width="1.5" stroke-dasharray="3"/>
      <text x="120" y="18" fill="#a5b4fc" font-size="11" font-family="sans-serif">A</text>
    </svg>`),
    ['diagram', 'waves'],
    'Wave with amplitude A and wavelength λ.',
  ),
  fig(
    'fig-enzyme',
    'Enzyme Kinetics Curve',
    'biology',
    'Biochemistry',
    svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="160" viewBox="0 0 220 160">
      <line x1="35" y1="140" x2="200" y2="140" stroke="#6b7280" stroke-width="1.5"/>
      <line x1="35" y1="140" x2="35" y2="20" stroke="#6b7280" stroke-width="1.5"/>
      <path d="M40 135 Q80 40 190 30" fill="none" stroke="#34d399" stroke-width="2.5"/>
      <line x1="35" y1="30" x2="200" y2="30" stroke="#818cf8" stroke-width="1" stroke-dasharray="4"/>
      <text x="170" y="25" fill="#a5b4fc" font-size="10" font-family="sans-serif">Vmax</text>
      <text x="100" y="155" fill="#9ca3af" font-size="11" font-family="sans-serif">[S]</text>
      <text x="8" y="85" fill="#9ca3af" font-size="11" font-family="sans-serif">v</text>
    </svg>`),
    ['diagram', 'enzymes'],
    'Michaelis–Menten hyperbolic rate curve.',
  ),
  fig(
    'fig-cashflow',
    'Cash Flow Timeline',
    'finance',
    'Time Value of Money',
    svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="260" height="100" viewBox="0 0 260 100">
      <line x1="20" y1="55" x2="240" y2="55" stroke="#6b7280" stroke-width="2"/>
      <circle cx="40" cy="55" r="4" fill="#818cf8"/>
      <circle cx="100" cy="55" r="4" fill="#818cf8"/>
      <circle cx="160" cy="55" r="4" fill="#818cf8"/>
      <circle cx="220" cy="55" r="4" fill="#818cf8"/>
      <line x1="40" y1="55" x2="40" y2="25" stroke="#f87171" stroke-width="2"/>
      <line x1="100" y1="55" x2="100" y2="35" stroke="#34d399" stroke-width="2"/>
      <line x1="160" y1="55" x2="160" y2="30" stroke="#34d399" stroke-width="2"/>
      <line x1="220" y1="55" x2="220" y2="28" stroke="#34d399" stroke-width="2"/>
      <text x="34" y="18" fill="#fca5a5" font-size="10" font-family="sans-serif">−PV</text>
      <text x="95" y="28" fill="#86efac" font-size="10" font-family="sans-serif">C</text>
      <text x="155" y="24" fill="#86efac" font-size="10" font-family="sans-serif">C</text>
      <text x="215" y="22" fill="#86efac" font-size="10" font-family="sans-serif">C</text>
      <text x="35" y="75" fill="#9ca3af" font-size="10" font-family="sans-serif">0</text>
      <text x="95" y="75" fill="#9ca3af" font-size="10" font-family="sans-serif">1</text>
      <text x="155" y="75" fill="#9ca3af" font-size="10" font-family="sans-serif">2</text>
      <text x="215" y="75" fill="#9ca3af" font-size="10" font-family="sans-serif">n</text>
    </svg>`),
    ['diagram', 'tvm'],
    'Annuity cash-flow timeline.',
  ),
]

export const SEED_LIBRARY: LibraryItem[] = uniqueById(SEED_LIBRARY_RAW)
