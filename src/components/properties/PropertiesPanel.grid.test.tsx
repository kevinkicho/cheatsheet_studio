import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import { PropertiesPanel } from './PropertiesPanel'
import { useCanvasStore } from '@/stores/canvasStore'
import { percentToGridOpacity } from '@/types'

describe('PropertiesPanel — sheet grid settings (no selection)', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
    useCanvasStore.getState().setSelectedIds([])
  })

  afterEach(() => {
    cleanup()
  })

  it('shows grid covers options when nothing selected', () => {
    render(<PropertiesPanel />)
    expect(screen.getByText('Sheet properties')).toBeInTheDocument()
    expect(screen.getByText('Full page')).toBeInTheDocument()
    expect(screen.getByText('Printable area')).toBeInTheDocument()
    expect(screen.getByText('Whole board')).toBeInTheDocument()
  })

  it('switching grid extent does not change gridOpacity', () => {
    const alpha = percentToGridOpacity(5)
    useCanvasStore.getState().setCanvas({
      gridOpacity: alpha,
      gridExtent: 'board',
      showGrid: true,
    })
    const { container } = render(<PropertiesPanel />)
    const root = within(container)

    fireEvent.click(root.getByRole('button', { name: /Printable area/i }))
    expect(useCanvasStore.getState().canvas.gridExtent).toBe('printable')
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(alpha)

    fireEvent.click(root.getByRole('button', { name: /Full page/i }))
    expect(useCanvasStore.getState().canvas.gridExtent).toBe('page')
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(alpha)

    fireEvent.click(root.getByRole('button', { name: /Whole board/i }))
    expect(useCanvasStore.getState().canvas.gridExtent).toBe('board')
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(alpha)
  })

  it('opacity range updates store via soft mapping', () => {
    const { container } = render(<PropertiesPanel />)
    const sliders = within(container).getAllByRole('slider')
    const opacitySlider = sliders[sliders.length - 1]!
    fireEvent.change(opacitySlider, { target: { value: '50' } })
    expect(useCanvasStore.getState().canvas.gridOpacity).toBeCloseTo(
      percentToGridOpacity(50),
      5,
    )
    expect(useCanvasStore.getState().canvas.showGrid).toBe(true)
  })

  it('show grid checkbox toggles canvas.showGrid', () => {
    const { container } = render(<PropertiesPanel />)
    const checkbox = within(container).getByRole('checkbox', {
      name: /Show grid/i,
    })
    const before = useCanvasStore.getState().canvas.showGrid
    fireEvent.click(checkbox)
    expect(useCanvasStore.getState().canvas.showGrid).toBe(!before)
  })
})
