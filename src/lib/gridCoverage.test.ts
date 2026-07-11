import { describe, expect, it } from 'vitest'
import {
  resolveGridCoverage,
  resolvePageGridRect,
} from '@/lib/gridCoverage'
import { DEFAULT_MARGINS } from '@/types'

describe('resolveGridCoverage — mutual exclusion of board vs per-page', () => {
  it('shows nothing when grid is off', () => {
    for (const extent of ['board', 'page', 'printable'] as const) {
      const r = resolveGridCoverage({
        showGrid: false,
        showPrintArea: true,
        gridExtent: extent,
      })
      expect(r.useBoardGrid).toBe(false)
      expect(r.usePerPageGrid).toBe(false)
    }
  })

  it('print off → board grid only (never per-page)', () => {
    for (const extent of ['board', 'page', 'printable'] as const) {
      const r = resolveGridCoverage({
        showGrid: true,
        showPrintArea: false,
        gridExtent: extent,
      })
      expect(r.useBoardGrid).toBe(true)
      expect(r.usePerPageGrid).toBe(false)
    }
  })

  it('print on + board → board only', () => {
    const r = resolveGridCoverage({
      showGrid: true,
      showPrintArea: true,
      gridExtent: 'board',
    })
    expect(r.useBoardGrid).toBe(true)
    expect(r.usePerPageGrid).toBe(false)
  })

  it('print on + page → per-page only', () => {
    const r = resolveGridCoverage({
      showGrid: true,
      showPrintArea: true,
      gridExtent: 'page',
    })
    expect(r.useBoardGrid).toBe(false)
    expect(r.usePerPageGrid).toBe(true)
  })

  it('print on + printable → per-page only', () => {
    const r = resolveGridCoverage({
      showGrid: true,
      showPrintArea: true,
      gridExtent: 'printable',
    })
    expect(r.useBoardGrid).toBe(false)
    expect(r.usePerPageGrid).toBe(true)
  })

  it('never enables board and per-page together', () => {
    const cases = [
      { showGrid: true, showPrintArea: true, gridExtent: 'board' },
      { showGrid: true, showPrintArea: true, gridExtent: 'page' },
      { showGrid: true, showPrintArea: true, gridExtent: 'printable' },
      { showGrid: true, showPrintArea: false, gridExtent: 'page' },
      { showGrid: false, showPrintArea: true, gridExtent: 'page' },
    ]
    for (const c of cases) {
      const r = resolveGridCoverage(c)
      expect(r.useBoardGrid && r.usePerPageGrid).toBe(false)
    }
  })

  it('normalizes unknown extent to page default', () => {
    const r = resolveGridCoverage({
      showGrid: true,
      showPrintArea: true,
      gridExtent: 'nope',
    })
    expect(r.extent).toBe('page')
    expect(r.usePerPageGrid).toBe(true)
  })
})

describe('resolvePageGridRect — geometry per extent', () => {
  const page = { width: 816, height: 1056 }
  const origin = { x: 100, y: 200 }
  const margins = { ...DEFAULT_MARGINS }

  it('board extent yields no page rect', () => {
    expect(resolvePageGridRect('board', origin, page, margins)).toBeNull()
  })

  it('page extent is full page frame at origin', () => {
    expect(resolvePageGridRect('page', origin, page, margins)).toEqual({
      left: 100,
      top: 200,
      width: 816,
      height: 1056,
    })
  })

  it('printable extent is content box inset by margins', () => {
    const r = resolvePageGridRect('printable', origin, page, margins)
    expect(r).toEqual({
      left: 100 + margins.left,
      top: 200 + margins.top,
      width: page.width - margins.left - margins.right,
      height: page.height - margins.top - margins.bottom,
    })
  })

  it('same opacity contract: geometry changes, not alpha', () => {
    // Documents invariant: switching page ↔ printable only changes rect
    const pageRect = resolvePageGridRect('page', origin, page, margins)!
    const printRect = resolvePageGridRect('printable', origin, page, margins)!
    expect(printRect.width).toBeLessThan(pageRect.width)
    expect(printRect.height).toBeLessThan(pageRect.height)
    expect(printRect.left).toBeGreaterThan(pageRect.left)
    expect(printRect.top).toBeGreaterThan(pageRect.top)
  })
})
