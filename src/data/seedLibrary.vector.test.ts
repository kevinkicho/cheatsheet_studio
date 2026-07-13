/**
 * Affirmative vector-graphics audit for the entire seed catalog.
 * Every equation / table / figure must be vector (LaTeX, markdown, SVG).
 * See docs/vector-graphics.md
 */
import { describe, expect, it } from 'vitest'
import { SEED_LIBRARY } from '@/data/seedLibrary'

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
      // No data-image latex screenshots
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
      const url = item.imageUrl ?? ''
      expect(url, `figure ${item.id} needs imageUrl`).toBeTruthy()
      const isSvgData = /^data:image\/svg\+xml/i.test(url)
      const isSvgFile = /\.svg(\?|#|$)/i.test(url)
      expect(
        isSvgData || isSvgFile,
        `figure "${item.id}" (${item.title}) must be SVG vector, got ${url.slice(0, 48)}…`,
      ).toBe(true)

      if (isSvgData) {
        const markup = decodeSvgDataUrl(url)
        expect(markup, `figure ${item.id} SVG decode`).toBeTruthy()
        expect(markup!).toMatch(/<svg\b/i)
        expect(
          /viewBox\s*=/i.test(markup!),
          `figure ${item.id} SVG needs viewBox for sharp scale`,
        ).toBe(true)
        // No embedded rasters inside SVG
        expect(
          /<image\b/i.test(markup!) &&
            /\.(png|jpe?g|gif|webp)/i.test(markup!),
          `figure ${item.id} must not embed raster <image>`,
        ).toBe(false)
      }
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

  it('reports catalog composition (vector types only)', () => {
    const counts = { equation: 0, table: 0, figure: 0 }
    for (const item of SEED_LIBRARY) {
      if (item.type in counts) counts[item.type as keyof typeof counts]++
    }
    // Affirmative: all three vector families present
    expect(counts.equation).toBeGreaterThan(0)
    expect(counts.table).toBeGreaterThan(0)
    expect(counts.figure).toBeGreaterThan(0)
    expect(counts.equation + counts.table + counts.figure).toBe(
      SEED_LIBRARY.length,
    )
  })
})
