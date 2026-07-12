import { describe, expect, it } from 'vitest'
import {
  composeBorderCss,
  hasBackgroundFill,
  isFigureLike,
  normalizeCanvasItem,
  newCardBase,
  withBorderStyle,
} from '@/lib/cardDefaults'
import { DEFAULT_BORDER_COLOR } from '@/types'

describe('composeBorderCss / withBorderStyle', () => {
  it('builds solid border by default', () => {
    expect(composeBorderCss({})).toBe(`1px solid ${DEFAULT_BORDER_COLOR}`)
  })

  it('returns none when border disabled', () => {
    expect(composeBorderCss({ borderEnabled: false })).toBe('none')
    expect(composeBorderCss({ borderStyle: 'none' })).toBe('none')
    expect(composeBorderCss({ borderWidth: 0 })).toBe('none')
  })

  it('keeps border shorthand in sync after patch', () => {
    const style = withBorderStyle({}, { borderWidth: 2, borderStyle: 'dashed' })
    expect(style.border).toBe(`2px dashed ${DEFAULT_BORDER_COLOR}`)
    expect(style.borderWidth).toBe(2)
  })
})

describe('isFigureLike / hasBackgroundFill', () => {
  it('detects figure and custom-image types', () => {
    expect(isFigureLike({ type: 'figure' })).toBe(true)
    expect(isFigureLike({ type: 'custom-image' })).toBe(true)
    expect(isFigureLike({ type: 'equation' })).toBe(false)
    expect(
      isFigureLike({
        type: 'equation',
        imageUrl: 'x.png',
      }),
    ).toBe(true)
  })

  it('background fill is on unless transparentBackground', () => {
    expect(hasBackgroundFill({})).toBe(true)
    expect(hasBackgroundFill({ transparentBackground: false })).toBe(true)
    expect(hasBackgroundFill({ transparentBackground: true })).toBe(false)
  })
})

describe('normalizeCanvasItem', () => {
  it('fills default panel background for opaque cards', () => {
    const item = normalizeCanvasItem({
      id: 'a',
      type: 'equation',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      zIndex: 1,
      latex: 'x',
      style: { background: 'transparent' },
    })
    expect(item.transparentBackground).toBe(false)
    expect(item.style?.background).not.toBe('transparent')
    expect(item.contentFill).toBe(true)
    expect(item.keepAspectRatio).toBe(true)
    expect(item.showTitle).toBe(true)
  })

  it('allows keepAspectRatio opt-out (stretch free-transform)', () => {
    const item = normalizeCanvasItem({
      id: 'stretch',
      type: 'equation',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      zIndex: 1,
      latex: 'x',
      keepAspectRatio: false,
    })
    expect(item.keepAspectRatio).toBe(false)
  })

  it('keeps transparent background when opted out', () => {
    const item = normalizeCanvasItem({
      id: 'b',
      type: 'figure',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      zIndex: 1,
      imageUrl: 'i.png',
      transparentBackground: true,
    })
    expect(item.style?.background).toBe('transparent')
    expect(item.autoFit).toBe(false)
  })
})

describe('newCardBase', () => {
  it('creates equation card with autoFit and solid panel', () => {
    const card = newCardBase('equation', {
      id: 'e1',
      x: 10,
      y: 20,
      width: 200,
      height: 80,
      zIndex: 2,
      latex: 'a+b',
    })
    expect(card.type).toBe('equation')
    expect(card.autoFit).toBe(true)
    expect(card.x).toBe(10)
    expect(card.style?.border).toMatch(/px solid/)
  })

  it('creates figure card without autoFit', () => {
    const card = newCardBase('figure', {
      id: 'f1',
      x: 0,
      y: 0,
      width: 120,
      height: 120,
      zIndex: 1,
      imageUrl: 'fig.png',
    })
    expect(card.autoFit).toBe(false)
  })
})
