import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '@/stores/canvasStore'

describe('canvasStore — multi-select ops', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
  })

  it('moveItemsBy moves all unlocked selected origins', () => {
    const a = useCanvasStore.getState().addCustomEquation('a', 'a')
    const b = useCanvasStore.getState().addCustomEquation('b', 'b')
    const ia = useCanvasStore.getState().items.find((i) => i.id === a)!
    const ib = useCanvasStore.getState().items.find((i) => i.id === b)!
    useCanvasStore.getState().moveItemsBy(
      {
        [a]: { x: ia.x, y: ia.y },
        [b]: { x: ib.x, y: ib.y },
      },
      40,
      20,
    )
    const na = useCanvasStore.getState().items.find((i) => i.id === a)!
    const nb = useCanvasStore.getState().items.find((i) => i.id === b)!
    expect(na.x).toBe(ia.x + 40)
    expect(na.y).toBe(ia.y + 20)
    expect(nb.x).toBe(ib.x + 40)
    expect(nb.y).toBe(ib.y + 20)
  })

  it('removeItems deletes many at once', () => {
    const a = useCanvasStore.getState().addCustomEquation('a', 'a')
    const b = useCanvasStore.getState().addCustomEquation('b', 'b')
    useCanvasStore.getState().removeItems([a, b])
    expect(useCanvasStore.getState().items).toHaveLength(0)
  })

  it('toggleItemHidden / toggleItemLocked', () => {
    const id = useCanvasStore.getState().addCustomEquation('a', 'a')
    useCanvasStore.getState().toggleItemHidden(id)
    expect(
      useCanvasStore.getState().items.find((i) => i.id === id)?.hidden,
    ).toBe(true)
    useCanvasStore.getState().toggleItemLocked(id)
    expect(
      useCanvasStore.getState().items.find((i) => i.id === id)?.locked,
    ).toBe(true)
  })

  it('locked items do not move via moveItem', () => {
    const id = useCanvasStore.getState().addCustomEquation('a', 'a')
    useCanvasStore.getState().toggleItemLocked(id)
    const before = useCanvasStore.getState().items.find((i) => i.id === id)!
    useCanvasStore.getState().moveItem(id, 999, 999)
    const after = useCanvasStore.getState().items.find((i) => i.id === id)!
    expect(after.x).toBe(before.x)
    expect(after.y).toBe(before.y)
  })

  it('setUniformMargin updates all sides', () => {
    useCanvasStore.getState().setUniformMargin(96)
    const m = useCanvasStore.getState().canvas.margins
    expect(m).toEqual({ top: 96, right: 96, bottom: 96, left: 96 })
  })

  it('redo after undo restores canvas edit', () => {
    useCanvasStore.getState().setCanvas({ gridOpacity: 0.2 })
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().canvas.gridOpacity).not.toBe(0.2)
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(0.2)
  })
})
