import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CanvasGridLayer } from './CanvasGridLayer'
import { percentToGridOpacity } from '@/types'

describe('CanvasGridLayer', () => {
  it('renders with CSS opacity matching clamped store value', () => {
    const opacity = percentToGridOpacity(5)
    const { container } = render(
      <CanvasGridLayer
        left={10}
        top={20}
        width={200}
        height={300}
        spacing={24}
        opacity={opacity}
      />,
    )
    const el = container.querySelector('[data-grid-opacity]') as HTMLElement
    expect(el).toBeTruthy()
    expect(el.dataset.gridOpacity).toBe(String(opacity))
    expect(el.style.opacity).toBe(String(opacity))
    expect(el.style.left).toBe('10px')
    expect(el.style.top).toBe('20px')
    expect(el.style.width).toBe('200px')
    expect(el.style.height).toBe('300px')
    expect(el.style.backgroundImage).toContain('url(')
  })

  it('uses the same opacity style for board-sized and page-sized layers', () => {
    const opacity = percentToGridOpacity(40)
    const board = render(
      <CanvasGridLayer
        left={0}
        top={0}
        width={3200}
        height={2400}
        spacing={24}
        opacity={opacity}
      />,
    )
    const page = render(
      <CanvasGridLayer
        left={0}
        top={0}
        width={816}
        height={1056}
        spacing={24}
        opacity={opacity}
      />,
    )
    const b = board.container.querySelector(
      '[data-grid-opacity]',
    ) as HTMLElement
    const p = page.container.querySelector(
      '[data-grid-opacity]',
    ) as HTMLElement
    expect(b.style.opacity).toBe(p.style.opacity)
    expect(b.dataset.gridOpacity).toBe(p.dataset.gridOpacity)
    expect(b.style.opacity).toBe(String(opacity))
  })

  it('renders nothing when opacity is 0', () => {
    const { container } = render(
      <CanvasGridLayer
        left={0}
        top={0}
        width={100}
        height={100}
        spacing={24}
        opacity={0}
      />,
    )
    expect(container.querySelector('[data-grid-opacity]')).toBeNull()
  })

  it('renders nothing for degenerate size', () => {
    const { container } = render(
      <CanvasGridLayer
        left={0}
        top={0}
        width={0}
        height={100}
        spacing={24}
        opacity={0.1}
      />,
    )
    expect(container.querySelector('[data-grid-opacity]')).toBeNull()
  })

  it('clamps opacity above soft max in data attribute and style', () => {
    const { container } = render(
      <CanvasGridLayer
        left={0}
        top={0}
        width={100}
        height={100}
        spacing={24}
        opacity={1}
      />,
    )
    const el = container.querySelector('[data-grid-opacity]') as HTMLElement
    expect(el.dataset.gridOpacity).toBe('0.3')
    expect(el.style.opacity).toBe('0.3')
  })

  it('records spacing on data attribute', () => {
    const { container } = render(
      <CanvasGridLayer
        left={0}
        top={0}
        width={100}
        height={100}
        spacing={24}
        opacity={0.1}
      />,
    )
    const el = container.querySelector('[data-grid-opacity]') as HTMLElement
    expect(el.dataset.gridSpacing).toBe('24')
  })
})
