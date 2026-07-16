import { describe, expect, it } from 'vitest'
import { packIntoBox } from './packIntoBox'
import type { CanvasItem } from '@/types'

function card(
  id: string,
  w: number,
  h: number,
  extra: Partial<CanvasItem> = {},
): CanvasItem {
  return {
    id,
    type: extra.type ?? 'equation',
    title: id,
    x: 0,
    y: 0,
    width: w,
    height: h,
    zIndex: 1,
    latex: extra.latex ?? 'x',
    ...extra,
  }
}

describe('packIntoBox', () => {
  it('places short cards beside a tall process card (fills residual column)', () => {
    const cards = [
      card('tall', 200, 280, {
        type: 'process-chart',
        mermaidSource: 'flowchart TD\n A-->B',
        latex: undefined,
      }),
      card('e1', 140, 48),
      card('e2', 140, 48),
      card('e3', 140, 48),
      card('e4', 140, 48),
      card('e5', 140, 48),
      card('e6', 140, 48),
    ]
    const r = packIntoBox(cards, {
      ox: 100,
      oy: 100,
      packW: 400,
      packH: 360,
      gapPx: 2,
      seed: 0,
    })
    const tall = r.placed.find((c) => c.id === 'tall')!
    const eqs = r.placed.filter((c) => c.id.startsWith('e'))
    const beside = eqs.filter(
      (e) =>
        e.x >= tall.x + tall.width - 4 &&
        e.y + e.height <= tall.y + tall.height + 8,
    )
    expect(beside.length).toBeGreaterThanOrEqual(3)
    // Used height should be much less than pure stack under tall
    const pureStack =
      tall.height + eqs.reduce((s, e) => s + e.height + 2, 0)
    expect(r.usedH).toBeLessThan(pureStack * 0.85)
    // No overlaps
    for (let i = 0; i < r.placed.length; i++) {
      for (let j = i + 1; j < r.placed.length; j++) {
        const a = r.placed[i]!
        const b = r.placed[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        expect(xOl > 1 && yOl > 1).toBe(false)
      }
    }
  })

  it('respects large block gap without overlapping', () => {
    const cards = Array.from({ length: 6 }, (_, i) =>
      card(`c${i}`, 100, 60),
    )
    const r = packIntoBox(cards, {
      ox: 100,
      oy: 100,
      packW: 272,
      packH: 176,
      gapPx: 48,
      seed: 0,
    })
    for (let i = 0; i < r.placed.length; i++) {
      for (let j = i + 1; j < r.placed.length; j++) {
        const a = r.placed[i]!
        const b = r.placed[j]!
        const xOl =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const yOl =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (xOl > 5) {
          const gap = Math.max(
            0,
            Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)),
          )
          expect(gap).toBeGreaterThanOrEqual(48)
        } else if (yOl > 5) {
          const gap = Math.max(
            0,
            Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)),
          )
          expect(gap).toBeGreaterThanOrEqual(48)
        }
      }
    }
  })

  it('keeps card sizes', () => {
    const cards = [card('a', 120, 60), card('b', 100, 50)]
    const r = packIntoBox(cards, {
      ox: 0,
      oy: 0,
      packW: 300,
      packH: 200,
      gapPx: 4,
    })
    expect(r.placed.find((c) => c.id === 'a')!.width).toBe(120)
    expect(r.placed.find((c) => c.id === 'b')!.height).toBe(50)
  })

  it('places all cards inside origin + packW horizontally', () => {
    const cards = Array.from({ length: 8 }, (_, i) =>
      card(`c${i}`, 90 + (i % 3) * 20, 40 + (i % 2) * 20),
    )
    const ox = 50
    const packW = 320
    const r = packIntoBox(cards, {
      ox,
      oy: 40,
      packW,
      packH: 400,
      gapPx: 2,
      seed: 1,
    })
    for (const c of r.placed) {
      expect(c.x).toBeGreaterThanOrEqual(ox - 1)
      expect(c.x + c.width).toBeLessThanOrEqual(ox + packW + 1)
    }
  })
})
