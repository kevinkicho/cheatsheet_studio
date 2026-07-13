import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '@/stores/canvasStore'
import { exportWorkspaceSheetDocument } from './exportSheetDocument'

describe('exportWorkspaceSheetDocument', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
  })

  it('exports title and empty items from workspace', () => {
    useCanvasStore.getState().setTitle('Export me')
    const doc = exportWorkspaceSheetDocument()
    expect(doc.v).toBe(1)
    expect(doc.title).toBe('Export me')
    expect(doc.items).toEqual([])
    expect(doc.canvas).toBeDefined()
    expect(doc.meta?.source).toBe('CheatSheet Studio')
  })

  it('includes canvas items', () => {
    useCanvasStore.getState().addCustomEquation('E=mc^2', 'Energy')
    const doc = exportWorkspaceSheetDocument()
    expect(doc.items.length).toBeGreaterThanOrEqual(1)
    expect(doc.items.some((i) => i.latex === 'E=mc^2')).toBe(true)
  })
})
