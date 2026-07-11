import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LeftSidebar } from './LeftSidebar'
import { useCanvasStore } from '@/stores/canvasStore'

describe('LeftSidebar', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows Sheet properties when nothing selected', () => {
    useCanvasStore.getState().setSelectedIds([])
    render(<LeftSidebar />)
    // Header + panel both say "Sheet properties"
    expect(screen.getAllByText('Sheet properties').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/Title, grid covers, background/i),
    ).toBeInTheDocument()
  })

  it('shows Card properties when items selected', () => {
    const id = useCanvasStore.getState().addCustomEquation('x', 'x')
    useCanvasStore.getState().select(id)
    render(<LeftSidebar />)
    expect(screen.getByText('Card properties')).toBeInTheDocument()
    expect(
      screen.getByText(/Click empty canvas for sheet/i),
    ).toBeInTheDocument()
  })
})
