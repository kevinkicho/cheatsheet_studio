/**
 * Mixed prose + KaTeX for definition / list / callout bodies.
 *
 * Delimiters (same idea as Markdown math):
 * - `$...$`  → inline math
 * - `$$...$$` → display math (block)
 *
 * Also upgrades common *plain* equation spellings (no $) so catalog rows that
 * still say `CAPM: E[R_i] = R_f + …` render as KaTeX without a re-publish.
 *
 * Example:
 *   CAPM: $\mathrm{E}[R_i] = R_f + \beta_i(\mathrm{E}[R_m] - R_f)$.
 */

export type ProseMathPart =
  | { kind: 'text'; text: string }
  | { kind: 'math'; latex: string; display: boolean }

/**
 * Convert a plain “equation-ish” fragment to KaTeX-ish LaTeX.
 * Handles unicode greek, subscripts like R_i / β_i, E[·], minus signs.
 */
export function plainMathToLatex(eq: string): string {
  let t = eq.trim()
  // Normalize dashes / spaces around operators
  t = t.replace(/[−–—]/g, '-')
  t = t.replace(/\s+/g, ' ')

  // Greek letters used in finance/STEM prose
  t = t.replace(/β/g, '\\beta')
  t = t.replace(/μ/g, '\\mu')
  t = t.replace(/σ/g, '\\sigma')
  t = t.replace(/Σ/g, '\\Sigma')
  t = t.replace(/π/g, '\\pi')
  t = t.replace(/Δ/g, '\\Delta')
  t = t.replace(/α/g, '\\alpha')

  // Expectation operator E[…]
  t = t.replace(/\bE\[/g, '\\mathrm{E}[')

  // Subscripts: R_i, R_f, R_m, \beta_i → R_{i}, \beta_{i}
  // Already-braced _{…} left alone.
  t = t.replace(/([A-Za-z]|\\[A-Za-z]+)_(?!\{)([A-Za-z0-9]+)/g, '$1_{$2}')

  // Drop spaces inside simple function-like groups: ( E[R_m] - R_f ) → (...)
  t = t.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
  // Spaces around + − = kept for readability in KaTeX
  t = t.replace(/\s*([=+\-])\s*/g, ' $1 ')

  return t.trim()
}

/**
 * If body has no `$…$` yet, wrap common plain formulas so they render as math.
 * Safe no-op when delimiters already present.
 */
export function enhanceProseMath(input: string): string {
  const s0 = input ?? ''
  if (!s0.trim()) return s0
  if (hasProseMath(s0)) return s0

  let s = s0

  // Exact / near-exact CAPM expected-return line (catalog legacy spelling)
  s = s.replace(
    /CAPM:\s*E\[R_i\]\s*=\s*R_f\s*\+\s*β_i\s*\(\s*E\[R_m\]\s*[−–—-]\s*R_f\s*\)\.?/gi,
    'CAPM: $\\mathrm{E}[R_{i}] = R_{f} + \\beta_{i}(\\mathrm{E}[R_{m}] - R_{f})$.',
  )
  if (hasProseMath(s)) return s

  // Labeled formula: "CAPM: …" / "SML: …" through end of clause
  s = s.replace(
    /\b(CAPM|SML|APT|WACC|IRR|NPV|Formula|Eq\.?)\s*:\s*([^\n.]+?)(\.|$)/gi,
    (full, label: string, eq: string, end: string) => {
      const raw = eq.trim()
      // Only upgrade if it looks like math (has = or greek / subscripts)
      if (!/=/.test(raw) && !/[βμσαΔ]|_[a-zA-Z0-9]/.test(raw)) return full
      const latex = plainMathToLatex(raw)
      if (!latex) return full
      return `${label}: $${latex}$${end === '.' ? '.' : ''}`
    },
  )
  if (hasProseMath(s)) return s

  // Trailing bare equation after ". " — e.g. "…. E[R_i] = R_f + …"
  s = s.replace(
    /(^|[.!?]\s+)((?:E\[|[A-Za-zβμσ][A-Za-z0-9_\\]*)[^=\n]{0,40}=\s*[^\n.]{3,80})(\.?)/g,
    (full, pre: string, eq: string, dot: string) => {
      if (!/[βμσE\[_]|R_f|R_m|R_i/.test(eq)) return full
      const latex = plainMathToLatex(eq)
      return `${pre}$${latex}$${dot}`
    },
  )

  return s
}

/**
 * Split a body string into text and math segments.
 * Applies {@link enhanceProseMath} first so plain CAPM lines still format.
 * `$$` is matched before `$` so display math wins.
 */
export function parseProseMath(input: string): ProseMathPart[] {
  const s = enhanceProseMath(input ?? '')
  if (!s) return []

  const parts: ProseMathPart[] = []
  // $$...$$ (display) or $...$ (inline). Non-greedy; no nested $ inside.
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      parts.push({ kind: 'text', text: s.slice(last, m.index) })
    }
    if (m[1] != null) {
      const latex = m[1].trim()
      if (latex) parts.push({ kind: 'math', latex, display: true })
    } else if (m[2] != null) {
      const latex = m[2].trim()
      if (latex) parts.push({ kind: 'math', latex, display: false })
    }
    last = m.index + m[0].length
  }
  if (last < s.length) {
    parts.push({ kind: 'text', text: s.slice(last) })
  }
  return parts.length > 0 ? parts : [{ kind: 'text', text: s }]
}

/** True when body contains at least one math segment (after enhance). */
export function hasProseMath(input: string): boolean {
  const s = input ?? ''
  if (!s) return false
  // Delimiter check only — used by enhanceProseMath before wrapping
  return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/.test(s)
}
