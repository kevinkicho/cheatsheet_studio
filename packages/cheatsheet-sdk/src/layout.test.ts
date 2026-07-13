import { describe, expect, it } from 'vitest'
import { createSheet } from './builder'
import { autoLayoutItems, layoutSheet } from './layout'
import { defaultCanvas } from './defaults'

describe('layout v2', () => {
  it('uses multiple columns for dense midterm-sized sheets', () => {
    const builder = createSheet({ title: 'Dense' })
    for (let i = 0; i < 12; i++) {
      builder.addEquation({
        title: `Eq ${i}`,
        latex: `x_${i}=${i}`,
        height: 72,
      })
    }
    const before = builder.build()
    // rebuild without layout from same count via layoutSheet
    const items = before.items.map((it, i) => ({
      ...it,
      x: 48,
      y: 48 + i * 90,
    }))
    const laid = autoLayoutItems(items, defaultCanvas(), { dense: true })
    const xs = new Set(laid.map((it) => it.x))
    expect(xs.size).toBeGreaterThanOrEqual(2)
  })

  it('sections mode places heading full-width then body cards', () => {
    const sheet = createSheet({ title: 'Sections' })
      .addEquation({
        title: '1. Section',
        latex: '\\text{1. Section}',
        height: 40,
      })
      .addEquation({ title: 'A', latex: 'a=1', height: 60 })
      .addEquation({ title: 'B', latex: 'b=2', height: 60 })
      .addEquation({
        title: '2. Next',
        latex: '\\text{2. Next}',
        height: 40,
      })
      .addEquation({ title: 'C', latex: 'c=3', height: 60 })
      .autoLayout({ mode: 'sections', dense: true })
      .build()

    const heading = sheet.items.find((i) => i.title === '1. Section')
    const body = sheet.items.find((i) => i.title === 'A')
    expect(heading).toBeTruthy()
    expect(body).toBeTruthy()
    expect(heading!.y).toBeLessThan(body!.y)
  })

  it('layoutSheet may suggest more than one page for very tall content', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`,
      type: 'equation' as const,
      title: `E${i}`,
      x: 0,
      y: 0,
      width: 320,
      height: 100,
      zIndex: i + 1,
      latex: `x=${i}`,
    }))
    const canvas = defaultCanvas()
    const result = layoutSheet(items, canvas, {
      dense: true,
      mode: 'columns',
      multiPage: true,
    })
    expect(result.items.length).toBe(30)
    expect(result.printPageCount).toBeGreaterThanOrEqual(1)
  })
})
