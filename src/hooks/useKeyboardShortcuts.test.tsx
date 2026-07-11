import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore } from '@/stores/uiStore'

function Harness() {
  useKeyboardShortcuts()
  return <div data-testid="harness" />
}

describe('useKeyboardShortcuts (integration)', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
    useUiStore.setState({ canvasTool: 'select' })
  })

  afterEach(() => {
    cleanup()
  })

  it('V/H switch canvas tools on window keydown', () => {
    render(<Harness />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }))
    expect(useUiStore.getState().canvasTool).toBe('pan')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }))
    expect(useUiStore.getState().canvasTool).toBe('select')
  })

  it('Delete removes selected items', () => {
    const id = useCanvasStore.getState().addCustomEquation('x', 'x')
    useCanvasStore.getState().select(id)
    render(<Harness />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(useCanvasStore.getState().items).toHaveLength(0)
  })

  it('Escape clears selection', () => {
    const id = useCanvasStore.getState().addCustomEquation('x', 'x')
    useCanvasStore.getState().select(id)
    render(<Harness />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(useCanvasStore.getState().selectedIds).toEqual([])
  })
})
