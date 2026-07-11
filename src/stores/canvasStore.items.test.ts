import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '@/stores/canvasStore'

describe('canvasStore — items, folders, multi-select', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
  })

  it('addCustomEquation adds a card and marks dirty', () => {
    const id = useCanvasStore.getState().addCustomEquation('E=mc^2', 'Energy')
    const { items, dirty } = useCanvasStore.getState()
    expect(dirty).toBe(true)
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(id)
    expect(items[0]!.latex).toBe('E=mc^2')
    expect(items[0]!.type).toBe('custom-equation')
  })

  it('removeItem deletes card and clears selection', () => {
    const id = useCanvasStore.getState().addCustomEquation('x', 'x')
    useCanvasStore.getState().select(id)
    useCanvasStore.getState().removeItem(id)
    expect(useCanvasStore.getState().items).toHaveLength(0)
    expect(useCanvasStore.getState().selectedIds).toEqual([])
  })

  it('moveItem updates position', () => {
    const id = useCanvasStore.getState().addCustomEquation('x', 'x')
    useCanvasStore.getState().moveItem(id, 120, 240)
    const item = useCanvasStore.getState().items[0]!
    expect(item.x).toBe(120)
    expect(item.y).toBe(240)
  })

  it('addFolder and moveItemsToFolder', () => {
    const folderId = useCanvasStore.getState().addFolder('Algebra')
    expect(useCanvasStore.getState().folders.some((f) => f.id === folderId)).toBe(
      true,
    )
    const itemId = useCanvasStore.getState().addCustomEquation('a', 'a')
    useCanvasStore.getState().moveItemsToFolder([itemId], folderId)
    expect(
      useCanvasStore.getState().items.find((i) => i.id === itemId)?.folderId,
    ).toBe(folderId)
  })

  it('updateItemsStyle applies to multiple selected', () => {
    const a = useCanvasStore.getState().addCustomEquation('a', 'a')
    const b = useCanvasStore.getState().addCustomEquation('b', 'b')
    useCanvasStore.getState().setSelectedIds([a, b])
    useCanvasStore.getState().updateItemsStyle([a, b], { fontSize: 22 })
    for (const id of [a, b]) {
      const item = useCanvasStore.getState().items.find((i) => i.id === id)!
      expect(item.style?.fontSize).toBe(22)
    }
  })

  it('bringToFront raises zIndex', () => {
    const a = useCanvasStore.getState().addCustomEquation('a', 'a')
    const b = useCanvasStore.getState().addCustomEquation('b', 'b')
    const zBefore = useCanvasStore.getState().items.find((i) => i.id === a)!
      .zIndex
    useCanvasStore.getState().bringToFront(a)
    const zAfter = useCanvasStore.getState().items.find((i) => i.id === a)!
      .zIndex
    expect(zAfter).toBeGreaterThanOrEqual(zBefore)
    const zb = useCanvasStore.getState().items.find((i) => i.id === b)!.zIndex
    expect(zAfter).toBeGreaterThanOrEqual(zb)
  })
})
