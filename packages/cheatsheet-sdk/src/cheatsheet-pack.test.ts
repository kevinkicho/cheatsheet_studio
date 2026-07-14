import { describe, expect, it } from 'vitest'
import { createSheet } from './builder'
import {
  estimateBlockSize,
  isHeading,
  packSheetDocument,
  packRectsShelf,
} from './cheatsheet-pack'

describe('cheatsheet-pack', () => {
  it('estimates equations smaller than default builder cards', () => {
    const sheet = createSheet({ title: 't' })
      .addEquation({ title: 'PV', latex: 'PV=C/r' })
      .build()
    const it = sheet.items[0]!
    const sz = estimateBlockSize(it, 'sm', 720)
    expect(sz.w).toBeLessThan(280)
    expect(sz.h).toBeLessThan(80)
  })

  it('detects numbered section dividers with textbf latex', () => {
    const sheet = createSheet({ title: 't' })
      .addEquation({
        title: '1. Time value of money',
        latex: '\\textbf{\\text{1. Time value of money}}',
        showTitle: false,
        height: 26,
        width: 720,
      })
      .addEquation({ title: 'PV', latex: 'PV=C/r' })
      .build()
    expect(isHeading(sheet.items[0]!)).toBe(true)
    expect(isHeading(sheet.items[1]!)).toBe(false)
    const packed = packSheetDocument(sheet, {
      density: 'sm',
      target: 'letter',
      fitOnePage: false,
    })
    const banner = packed.items[0]!
    // Full-width divider band
    expect(banner.width).toBeGreaterThan(500)
    expect(banner.height).toBeLessThan(40)
    expect(banner.showTitle).toBe(false)
  })

  it('sizes process charts large enough for mermaid', () => {
    const sheet = createSheet({ title: 't' })
      .addProcess({
        title: 'NPV',
        mermaidSource: 'flowchart TD\n  A-->B-->C-->D',
        mermaidKind: 'flowchart',
      })
      .build()
    const sz = estimateBlockSize(sheet.items[0]!, 'sm', 720)
    expect(sz.w).toBeGreaterThanOrEqual(250)
    expect(sz.h).toBeGreaterThanOrEqual(180)
  })

  it('shelf packs multiple blocks side by side', () => {
    const rects = [
      { id: 'a', w: 100, h: 40 },
      { id: 'b', w: 100, h: 40 },
      { id: 'c', w: 100, h: 40 },
    ]
    const pos = packRectsShelf(rects, 220, 4)
    expect(pos.get('a')!.x).toBe(0)
    expect(pos.get('b')!.x).toBeGreaterThan(0)
    // third wraps or sits on row
    expect(pos.get('c')).toBeTruthy()
  })

  it('packSheetDocument fills width with many small equations', () => {
    let b = createSheet({ title: 'Midterm' })
    for (let i = 0; i < 15; i++) {
      b = b.addEquation({ title: `E${i}`, latex: `x_${i}=${i}` })
    }
    const sheet = b.build()
    const packed = packSheetDocument(sheet, {
      density: 'xs',
      target: 'letter',
      fitOnePage: true,
    })
    const xs = new Set(packed.items.map((i) => Math.round(i.x / 20)))
    // more than one column of x positions
    expect(xs.size).toBeGreaterThanOrEqual(2)
    const maxY = packed.items.reduce((m, i) => Math.max(m, i.y + i.height), 0)
    expect(maxY).toBeLessThan(1100)
  })
})
