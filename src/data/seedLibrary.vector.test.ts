/**
 * Affirmative vector-graphics audit for the entire seed catalog.
 * Every content kind must use vector payloads (LaTeX, text, markdown, SVG).
 * See docs/vector-graphics.md
 */
import { describe, expect, it } from 'vitest'
import { SEED_LIBRARY } from '@/data/seedLibrary'
import { LIBRARY_ITEM_TYPES } from '@/types'
import { matrixRowsToLatex } from '@/lib/cardKinds'

function decodeSvgDataUrl(src: string): string | null {
  const m = src.match(
    /^data:image\/svg\+xml(;charset=[^;,]+)?(;(base64))?,([\s\S]*)$/i,
  )
  if (!m) return null
  const isB64 = Boolean(m[3])
  const payload = m[4] ?? ''
  try {
    if (isB64) return atob(payload)
    return decodeURIComponent(payload)
  } catch {
    return null
  }
}

function assertSvgUrl(id: string, url: string) {
  expect(url, `${id} needs imageUrl`).toBeTruthy()
  const isSvgData = /^data:image\/svg\+xml/i.test(url)
  const isSvgFile = /\.svg(\?|#|$)/i.test(url)
  expect(
    isSvgData || isSvgFile,
    `"${id}" must be SVG vector, got ${url.slice(0, 48)}…`,
  ).toBe(true)
  if (isSvgData) {
    const markup = decodeSvgDataUrl(url)
    expect(markup, `${id} SVG decode`).toBeTruthy()
    expect(markup!).toMatch(/<svg\b/i)
    expect(
      /viewBox\s*=/i.test(markup!),
      `${id} SVG needs viewBox for sharp scale`,
    ).toBe(true)
    expect(
      /<image\b/i.test(markup!) &&
        /\.(png|jpe?g|gif|webp)/i.test(markup!),
      `${id} must not embed raster <image>`,
    ).toBe(false)
  }
}

describe('SEED_LIBRARY vector graphics audit', () => {
  it('catalog is non-empty', () => {
    expect(SEED_LIBRARY.length).toBeGreaterThan(50)
  })

  it('every equation is pure LaTeX (vector type, no raster)', () => {
    const eqs = SEED_LIBRARY.filter((i) => i.type === 'equation')
    expect(eqs.length).toBeGreaterThan(0)
    for (const item of eqs) {
      expect(item.latex?.trim(), `equation ${item.id} needs latex`).toBeTruthy()
      expect(
        item.imageUrl,
        `equation ${item.id} must not use imageUrl — LaTeX only`,
      ).toBeFalsy()
      expect(item.latex).not.toMatch(/^data:image\//i)
    }
  })

  it('every table is markdown pipes (vector HTML type, no image)', () => {
    const tables = SEED_LIBRARY.filter((i) => i.type === 'table')
    expect(tables.length).toBeGreaterThan(0)
    for (const item of tables) {
      expect(
        item.tableMarkdown?.trim(),
        `table ${item.id} needs tableMarkdown`,
      ).toBeTruthy()
      expect(
        item.imageUrl,
        `table ${item.id} must not use imageUrl — markdown only`,
      ).toBeFalsy()
      expect(item.tableMarkdown).toContain('|')
    }
  })

  it('every figure is SVG vector with viewBox (no PNG/JPEG diagrams)', () => {
    const figures = SEED_LIBRARY.filter((i) => i.type === 'figure')
    expect(figures.length).toBeGreaterThan(0)
    for (const item of figures) {
      assertSvgUrl(item.id, item.imageUrl ?? '')
    }
  })

  it('every plot is SVG vector with viewBox', () => {
    const plots = SEED_LIBRARY.filter((i) => i.type === 'plot')
    expect(plots.length).toBeGreaterThan(0)
    for (const item of plots) {
      assertSvgUrl(item.id, item.imageUrl ?? '')
    }
  })

  it('tier-1 prose cards have required text payloads', () => {
    const defs = SEED_LIBRARY.filter((i) => i.type === 'definition')
    const lists = SEED_LIBRARY.filter((i) => i.type === 'list')
    const callouts = SEED_LIBRARY.filter((i) => i.type === 'callout')
    const codes = SEED_LIBRARY.filter((i) => i.type === 'code')
    expect(defs.length).toBeGreaterThan(0)
    expect(lists.length).toBeGreaterThan(0)
    expect(callouts.length).toBeGreaterThan(0)
    expect(codes.length).toBeGreaterThan(0)
    for (const d of defs) {
      expect(d.term?.trim() || d.title, d.id).toBeTruthy()
      expect(d.body?.trim(), d.id).toBeTruthy()
    }
    for (const l of lists) {
      expect(l.listItems?.length, l.id).toBeGreaterThan(0)
    }
    for (const c of callouts) {
      expect(c.body?.trim(), c.id).toBeTruthy()
    }
    for (const c of codes) {
      expect(c.code?.trim(), c.id).toBeTruthy()
    }
  })

  it('tier-2 STEM cards have structured payloads', () => {
    const constants = SEED_LIBRARY.filter((i) => i.type === 'constant')
    const ids = SEED_LIBRARY.filter((i) => i.type === 'identity-set')
    const matrices = SEED_LIBRARY.filter((i) => i.type === 'matrix')
    expect(constants.length).toBeGreaterThan(0)
    expect(ids.length).toBeGreaterThan(0)
    expect(matrices.length).toBeGreaterThan(0)
    for (const c of constants) {
      expect(c.symbol?.trim() || c.latex?.trim(), c.id).toBeTruthy()
    }
    for (const s of ids) {
      expect(s.identities?.length, s.id).toBeGreaterThan(0)
    }
    for (const m of matrices) {
      const latex = m.latex?.trim() || matrixRowsToLatex(m.matrixRows)
      expect(latex, m.id).toBeTruthy()
    }
  })

  it('no seed item uses raster image MIME for diagrams', () => {
    for (const item of SEED_LIBRARY) {
      const url = item.imageUrl ?? ''
      if (!url) continue
      expect(
        /^data:image\/(png|jpeg|jpg|gif|webp)/i.test(url),
        `${item.id} uses raster data URL — convert diagram to SVG`,
      ).toBe(false)
    }
  })

  it('reports catalog composition (all library kinds present)', () => {
    const counts: Record<string, number> = {}
    for (const t of LIBRARY_ITEM_TYPES) counts[t] = 0
    for (const item of SEED_LIBRARY) {
      counts[item.type] = (counts[item.type] ?? 0) + 1
    }
    // Core + both tiers
    for (const t of LIBRARY_ITEM_TYPES) {
      expect(counts[t], `missing seed samples for type ${t}`).toBeGreaterThan(0)
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(SEED_LIBRARY.length)
  })
})
