import { describe, expect, it } from 'vitest'
import {
  clientPointToCanvasDrop,
  estimateLibraryCardSize,
  previewRectToCanvasDrop,
} from '@/lib/canvasDrop'
import type { LibraryItem } from '@/types'

const eq = (over?: Partial<LibraryItem>): LibraryItem => ({
  id: 'e1',
  type: 'equation',
  title: 'Test',
  subject: 'mathematics',
  topic: 'A',
  tags: [],
  latex: 'a+b',
  isSystem: true,
  ...over,
})

describe('estimateLibraryCardSize', () => {
  it('sizes equations compactly', () => {
    expect(estimateLibraryCardSize(eq())).toEqual({ width: 240, height: 72 })
  })

  it('sizes figures', () => {
    expect(
      estimateLibraryCardSize(
        eq({ type: 'figure', latex: undefined, imageUrl: 'x.svg' }),
      ),
    ).toEqual({ width: 240, height: 220 })
  })
})

describe('previewRectToCanvasDrop', () => {
  it('maps preview top-left to canvas coords at zoom 1', () => {
    const p = previewRectToCanvasDrop(
      { left: 300, top: 200 },
      { left: 100, top: 50 },
      1,
    )
    expect(p).toEqual({ x: 200, y: 150 })
  })

  it('undoes CSS board zoom', () => {
    // zoom 0.5: client offset 100 → canvas 200
    const p = previewRectToCanvasDrop(
      { left: 100, top: 50 },
      { left: 0, top: 0 },
      0.5,
    )
    expect(p).toEqual({ x: 200, y: 100 })
  })

  it('clamps negative coords to 0', () => {
    const p = previewRectToCanvasDrop(
      { left: 10, top: 10 },
      { left: 100, top: 100 },
      1,
    )
    expect(p).toEqual({ x: 0, y: 0 })
  })
})

describe('clientPointToCanvasDrop (legacy)', () => {
  it('top-left anchor places at pointer in canvas space', () => {
    const p = clientPointToCanvasDrop(
      400,
      200,
      { left: 100, top: 50 },
      1,
      { width: 280, height: 100 },
      'top-left',
    )
    expect(p).toEqual({ x: 300, y: 150 })
  })
})
