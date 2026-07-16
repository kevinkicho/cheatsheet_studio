import { describe, expect, it } from 'vitest'
import {
  enhanceProseMath,
  hasProseMath,
  parseProseMath,
  plainMathToLatex,
} from './proseMath'

describe('parseProseMath', () => {
  it('returns plain text when no math-like content', () => {
    expect(parseProseMath('hello beta')).toEqual([
      { kind: 'text', text: 'hello beta' },
    ])
  })

  it('parses inline $...$', () => {
    const parts = parseProseMath('CAPM: $E = mc^2$ end')
    expect(parts).toEqual([
      { kind: 'text', text: 'CAPM: ' },
      { kind: 'math', latex: 'E = mc^2', display: false },
      { kind: 'text', text: ' end' },
    ])
  })

  it('parses display $$...$$', () => {
    const parts = parseProseMath('Rule:\n$$a+b$$\nok')
    expect(parts).toEqual([
      { kind: 'text', text: 'Rule:\n' },
      { kind: 'math', latex: 'a+b', display: true },
      { kind: 'text', text: '\nok' },
    ])
  })

  it('prefers $$ over $', () => {
    const parts = parseProseMath('$$x^2$$ and $y$')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toMatchObject({ kind: 'math', display: true, latex: 'x^2' })
    expect(parts[1]).toMatchObject({ kind: 'text', text: ' and ' })
    expect(parts[2]).toMatchObject({ kind: 'math', display: false, latex: 'y' })
  })

  it('formats delimited CAPM-style definition body', () => {
    const body =
      'Measures systematic risk. CAPM: $\\mathrm{E}[R_{i}] = R_{f} + \\beta_{i}(\\mathrm{E}[R_{m}] - R_{f})$.'
    const parts = parseProseMath(body)
    expect(hasProseMath(body)).toBe(true)
    expect(parts.some((p) => p.kind === 'math')).toBe(true)
    const math = parts.find((p) => p.kind === 'math')
    expect(math).toMatchObject({
      kind: 'math',
      display: false,
      latex: '\\mathrm{E}[R_{i}] = R_{f} + \\beta_{i}(\\mathrm{E}[R_{m}] - R_{f})',
    })
  })

  it('upgrades legacy plain CAPM body (no $) to KaTeX', () => {
    const body =
      'Measures systematic risk: sensitivity of an asset’s excess return to market excess return. CAPM: E[R_i] = R_f + β_i (E[R_m] − R_f).'
    const parts = parseProseMath(body)
    expect(parts.some((p) => p.kind === 'math')).toBe(true)
    const math = parts.find((p) => p.kind === 'math')
    expect(math?.kind === 'math' && math.latex).toMatch(/\\mathrm\{E\}/)
    expect(math?.kind === 'math' && math.latex).toMatch(/\\beta/)
  })
})

describe('enhanceProseMath / plainMathToLatex', () => {
  it('leaves already-delimited bodies alone', () => {
    const body = 'CAPM: $x=1$.'
    expect(enhanceProseMath(body)).toBe(body)
  })

  it('converts unicode subscripts and beta', () => {
    expect(plainMathToLatex('E[R_i] = R_f + β_i')).toMatch(/\\beta_\{i\}/)
    expect(plainMathToLatex('E[R_i] = R_f + β_i')).toMatch(/\\mathrm\{E\}/)
  })
})
