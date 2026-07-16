import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '@/stores/canvasStore'
import type { LibraryItem } from '@/types'

const libEq = (over?: Partial<LibraryItem>): LibraryItem => ({
  id: 'lib-eq-1',
  type: 'equation',
  title: 'Pythagorean',
  subject: 'mathematics',
  topic: 'Geometry',
  tags: [],
  latex: 'a^2+b^2=c^2',
  isSystem: true,
  ...over,
})

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

  it('updateItem normalizes and persists processFlow (Done/Save card path)', () => {
    // Regression: missing normalizeCanvasItem import threw
    // "normalizeCanvasItem is not defined" on every updateItem (mindmap Done).
    const id = useCanvasStore.getState().addProcessChart(
      'mindmap\n  root((Topic))',
      {
        title: 'Mind map',
        mermaidKind: 'mindmap',
        processFlow: {
          v: 1,
          direction: 'TD',
          curveStyle: 'basis',
          diagramKind: 'mindmap',
          width: 200,
          height: 200,
          nodes: [
            {
              id: 'root',
              x: 0,
              y: 0,
              width: 120,
              height: 120,
              label: 'Topic',
              shape: 'circle',
            },
          ],
          edges: [],
        },
      },
    )
    expect(() => {
      useCanvasStore.getState().updateItem(id, {
        mermaidSource: 'mindmap\n  root((Topic))\n    child(New topic)',
        processFlow: {
          v: 1,
          direction: 'TD',
          curveStyle: 'basis',
          diagramKind: 'mindmap',
          width: 400,
          height: 300,
          nodes: [
            {
              id: 'root',
              x: 0,
              y: 0,
              width: 120,
              height: 120,
              label: 'Topic',
              shape: 'circle',
            },
            {
              id: 'child',
              x: 200,
              y: 40,
              width: 220,
              height: 220,
              label: 'New topic',
              shape: 'circle',
            },
          ],
          edges: [{ id: 'e1', source: 'root', target: 'child' }],
        },
        contentFitKey: 1,
      })
    }).not.toThrow()
    const item = useCanvasStore.getState().items.find((i) => i.id === id)!
    expect(item.processFlow?.nodes).toHaveLength(2)
    expect(item.processFlow?.nodes[1]!.width).toBe(220)
    expect(item.mermaidSource).toContain('New topic')
  })

  it('addFromLibrary with matchPreview uses ghost size and freezes autoFit', () => {
    const id = useCanvasStore.getState().addFromLibrary(libEq(), 40, 50, {
      width: 312,
      height: 88,
      matchPreview: true,
    })
    const item = useCanvasStore.getState().items.find((i) => i.id === id)!
    expect(item.x).toBe(40)
    expect(item.y).toBe(50)
    expect(item.width).toBe(312)
    expect(item.height).toBe(88)
    expect(item.autoFit).toBe(false)
    expect(item.latex).toBe('a^2+b^2=c^2')
    expect(item.libraryItemId).toBe('lib-eq-1')
  })

  it('addFromLibrary matchPreview freezes definition (text) cards like equations', () => {
    const lib: LibraryItem = {
      id: 'lib-def-1',
      type: 'definition',
      title: 'Beta (CAPM)',
      subject: 'finance',
      topic: 'Asset Pricing',
      tags: [],
      term: 'β',
      body: 'Measures systematic risk. CAPM: $E=mc^2$.',
      isSystem: true,
    }
    const id = useCanvasStore.getState().addFromLibrary(lib, 10, 20, {
      width: 280,
      height: 120,
      matchPreview: true,
    })
    const item = useCanvasStore.getState().items.find((i) => i.id === id)!
    expect(item.type).toBe('definition')
    expect(item.width).toBe(280)
    expect(item.height).toBe(120)
    expect(item.autoFit).toBe(false)
    expect(item.contentFill).toBe(true)
    expect(item.term).toBe('β')
    expect(item.body).toContain('systematic')
  })

  it('addFromLibrary without preview keeps estimate + autoFit for equations', () => {
    const id = useCanvasStore.getState().addFromLibrary(libEq(), 10, 20)
    const item = useCanvasStore.getState().items.find((i) => i.id === id)!
    expect(item.width).toBe(240)
    expect(item.height).toBe(72)
    expect(item.autoFit).toBe(true)
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
