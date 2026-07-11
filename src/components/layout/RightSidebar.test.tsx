import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useUiStore } from '@/stores/uiStore'

// Heavy panels need canvas/DOM APIs — stub so we only test tab routing
vi.mock('@/components/tools/LayersPanel', () => ({
  LayersPanel: () => <div data-testid="layers-panel" />,
}))
vi.mock('@/components/tools/CreateEquationPanel', () => ({
  CreateEquationPanel: () => <div data-testid="equation-panel" />,
}))
vi.mock('@/components/tools/ImportImagePanel', () => ({
  ImportImagePanel: () => <div data-testid="image-panel" />,
}))

import { RightSidebar } from './RightSidebar'

describe('RightSidebar', () => {
  beforeEach(() => {
    useUiStore.setState({ rightTool: 'layers', rightOpen: true })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows tool tabs', () => {
    render(<RightSidebar />)
    expect(screen.getByText('Layers')).toBeInTheDocument()
    expect(screen.getByText('Equation')).toBeInTheDocument()
    expect(screen.getByText('Image')).toBeInTheDocument()
  })

  it('switches tools via tabs and mounts matching panel', () => {
    render(<RightSidebar />)
    expect(screen.getByTestId('layers-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Equation'))
    expect(useUiStore.getState().rightTool).toBe('equation')
    expect(screen.getByTestId('equation-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Image'))
    expect(useUiStore.getState().rightTool).toBe('image')
    expect(screen.getByTestId('image-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Layers'))
    expect(useUiStore.getState().rightTool).toBe('layers')
    expect(screen.getByTestId('layers-panel')).toBeInTheDocument()
  })
})
