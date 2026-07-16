import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '@/stores/canvasStore'

describe('canvasStore — folders nesting', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
  })

  it('addFolder nests under parent', () => {
    const parent = useCanvasStore.getState().addFolder('Parent')
    const child = useCanvasStore.getState().addFolder('Child', parent)
    const f = useCanvasStore.getState().folders.find((x) => x.id === child)!
    expect(f.parentId).toBe(parent)
    expect(f.name).toBe('Child')
  })

  it('moveFolder rejects cycles', () => {
    const a = useCanvasStore.getState().addFolder('A')
    const b = useCanvasStore.getState().addFolder('B', a)
    // Attempt to make A a child of B (cycle)
    useCanvasStore.getState().moveFolder(a, b)
    const fa = useCanvasStore.getState().folders.find((x) => x.id === a)!
    // Should not set parentId to descendant
    expect(fa.parentId).not.toBe(b)
  })

  it('deleteFolder with keep items promotes them', () => {
    const folder = useCanvasStore.getState().addFolder('Temp')
    const itemId = useCanvasStore.getState().addCustomEquation('x', 'x')
    useCanvasStore.getState().moveItemsToFolder([itemId], folder)
    useCanvasStore.getState().deleteFolder(folder, { deleteItems: false })
    expect(
      useCanvasStore.getState().folders.find((f) => f.id === folder),
    ).toBeUndefined()
    expect(
      useCanvasStore.getState().items.find((i) => i.id === itemId)?.folderId,
    ).toBeFalsy()
  })

  it('deleteFolder with deleteItems removes cards', () => {
    const folder = useCanvasStore.getState().addFolder('Gone')
    const itemId = useCanvasStore.getState().addCustomEquation('y', 'y')
    useCanvasStore.getState().moveItemsToFolder([itemId], folder)
    useCanvasStore.getState().deleteFolder(folder, { deleteItems: true })
    expect(useCanvasStore.getState().items.find((i) => i.id === itemId)).toBeUndefined()
  })

  it('renameFolder and toggleFolderOpen', () => {
    const id = useCanvasStore.getState().addFolder('Old')
    useCanvasStore.getState().renameFolder(id, 'New')
    expect(useCanvasStore.getState().folders.find((f) => f.id === id)?.name).toBe(
      'New',
    )
    const openBefore =
      useCanvasStore.getState().folders.find((f) => f.id === id)?.open !== false
    useCanvasStore.getState().toggleFolderOpen(id)
    const openAfter =
      useCanvasStore.getState().folders.find((f) => f.id === id)?.open !== false
    expect(openAfter).toBe(!openBefore)
  })

  it('renameFolder updates matching layout panel title on canvas', () => {
    const id = useCanvasStore.getState().addFolder('Old Topic')
    useCanvasStore.setState((s) => ({
      canvas: {
        ...s.canvas,
        layoutPanels: [
          {
            id: 'panel-1',
            folderId: id,
            title: 'Old Topic',
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            memberIds: [],
          },
          {
            id: 'panel-other',
            folderId: 'other',
            title: 'Keep me',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          },
        ],
      },
    }))
    useCanvasStore.getState().renameFolder(id, 'New Topic')
    const panels = useCanvasStore.getState().canvas.layoutPanels ?? []
    expect(panels.find((p) => p.id === 'panel-1')?.title).toBe('New Topic')
    expect(panels.find((p) => p.id === 'panel-other')?.title).toBe('Keep me')
  })

  it('setFolderHidden hides items in folder', () => {
    const folder = useCanvasStore.getState().addFolder('HideMe')
    const itemId = useCanvasStore.getState().addCustomEquation('z', 'z')
    useCanvasStore.getState().moveItemsToFolder([itemId], folder)
    useCanvasStore.getState().setFolderHidden(folder, true)
    expect(
      useCanvasStore.getState().items.find((i) => i.id === itemId)?.hidden,
    ).toBe(true)
  })
})
