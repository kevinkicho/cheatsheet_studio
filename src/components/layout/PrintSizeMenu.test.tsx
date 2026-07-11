import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PrintSizeMenu } from './PrintSizeMenu'
import { useCanvasStore } from '@/stores/canvasStore'

describe('PrintSizeMenu', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  function openMenu() {
    render(<PrintSizeMenu />)
    // Chevron opens the portal menu
    const buttons = screen.getAllByRole('button')
    const chevron = buttons.find((b) => b.getAttribute('aria-haspopup') === 'listbox')
    expect(chevron).toBeTruthy()
    fireEvent.click(chevron!)
    return screen.getByRole('listbox', { name: /Print page size/i })
  }

  it('opens menu with page size presets', () => {
    const menu = openMenu()
    expect(within(menu).getByText('US Letter')).toBeInTheDocument()
    expect(within(menu).getByText('A4')).toBeInTheDocument()
  })

  it('sets print page count via quick buttons', () => {
    const menu = openMenu()
    fireEvent.click(within(menu).getByRole('button', { name: '4' }))
    expect(useCanvasStore.getState().canvas.printPageCount).toBe(4)
    expect(useCanvasStore.getState().canvas.showPrintArea).toBe(true)
  })

  it('increments and decrements page count', () => {
    useCanvasStore.getState().setPrintPageCount(2)
    const menu = openMenu()
    fireEvent.click(within(menu).getByTitle('More pages'))
    expect(useCanvasStore.getState().canvas.printPageCount).toBe(3)
    fireEvent.click(within(menu).getByTitle('Fewer pages'))
    expect(useCanvasStore.getState().canvas.printPageCount).toBe(2)
  })

  it('sets page layout modes without losing page count', () => {
    useCanvasStore.getState().setPrintPageCount(3)
    const menu = openMenu()
    fireEvent.click(within(menu).getByRole('button', { name: /Horizontal/i }))
    expect(useCanvasStore.getState().canvas.printPageLayout).toBe('horizontal')
    expect(useCanvasStore.getState().canvas.printPageCount).toBe(3)

    fireEvent.click(within(menu).getByRole('button', { name: /Grid/i }))
    expect(useCanvasStore.getState().canvas.printPageLayout).toBe('grid')

    fireEvent.click(within(menu).getByRole('button', { name: /Drag & place/i }))
    expect(useCanvasStore.getState().canvas.printPageLayout).toBe('free')

    fireEvent.click(within(menu).getByRole('button', { name: /Vertical/i }))
    expect(useCanvasStore.getState().canvas.printPageLayout).toBe('vertical')
  })

  it('selects A4 preset', () => {
    const menu = openMenu()
    const a4 = within(menu)
      .getAllByRole('button')
      .find((b) => /ISO A4/i.test(b.textContent ?? ''))
    expect(a4).toBeTruthy()
    fireEvent.click(a4!)
    expect(useCanvasStore.getState().canvas.printSizeId).toBe('a4')
    expect(useCanvasStore.getState().canvas.showPrintArea).toBe(true)
  })

  it('toggles orientation to landscape', () => {
    const menu = openMenu()
    fireEvent.click(within(menu).getByRole('button', { name: /^Landscape$/i }))
    expect(useCanvasStore.getState().canvas.orientation).toBe('landscape')
  })
})
