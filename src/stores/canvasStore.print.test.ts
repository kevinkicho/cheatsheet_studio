import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '@/stores/canvasStore'
import { DEFAULT_CANVAS, FREEFORM_WORKSPACE } from '@/types'
import {
  multiPageLayoutBounds,
  resolvePagePixels,
} from '@/lib/printSizes'

describe('canvasStore — print pages, layout, grid', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
  })

  it('setPrintPageCount grows workspace for multi-page stack', () => {
    useCanvasStore.getState().setPrintPageCount(4)
    const { canvas } = useCanvasStore.getState()
    expect(canvas.printPageCount).toBe(4)
    expect(canvas.showPrintArea).toBe(true)
    const page = resolvePagePixels(
      canvas.printSizeId ?? 'letter',
      canvas.orientation ?? 'portrait',
    )
    const bounds = multiPageLayoutBounds(page, 4, 'vertical')
    expect(canvas.height).toBeGreaterThanOrEqual(
      Math.max(FREEFORM_WORKSPACE.height, bounds.maxY + 200),
    )
  })

  it('setPrintPageLayout horizontal widens workspace needs', () => {
    useCanvasStore.getState().setPrintPageCount(3)
    useCanvasStore.getState().setPrintPageLayout('horizontal')
    const { canvas } = useCanvasStore.getState()
    expect(canvas.printPageLayout).toBe('horizontal')
    const page = resolvePagePixels('letter', 'portrait')
    const bounds = multiPageLayoutBounds(page, 3, 'horizontal')
    expect(canvas.width).toBeGreaterThanOrEqual(
      Math.max(FREEFORM_WORKSPACE.width, bounds.maxX + 200),
    )
  })

  it('setPrintPageLayout free seeds positions from previous auto layout', () => {
    useCanvasStore.getState().setPrintPageCount(2)
    useCanvasStore.getState().setPrintPageLayout('vertical')
    useCanvasStore.getState().setPrintPageLayout('free')
    const { canvas } = useCanvasStore.getState()
    expect(canvas.printPageLayout).toBe('free')
    expect(canvas.printPagePositions?.length).toBe(2)
    expect(canvas.printPagePositions?.[0]).toEqual({ x: 0, y: 0 })
  })

  it('setPrintPagePosition updates free coords and forces free layout', () => {
    useCanvasStore.getState().setPrintPageCount(2)
    useCanvasStore.getState().setPrintPagePosition(1, { x: 120, y: 340 })
    const { canvas } = useCanvasStore.getState()
    expect(canvas.printPageLayout).toBe('free')
    expect(canvas.printPagePositions?.[1]).toEqual({ x: 120, y: 340 })
  })

  it('setCanvas gridOpacity is stored and clamped', () => {
    useCanvasStore.getState().setCanvas({ gridOpacity: 0.5 })
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(0.3)
    useCanvasStore.getState().setCanvas({ gridOpacity: 0.05 })
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(0.05)
  })

  it('setCanvas gridExtent switches without changing opacity', () => {
    useCanvasStore.getState().setCanvas({
      gridOpacity: 0.09,
      gridExtent: 'board',
      showGrid: true,
    })
    const before = useCanvasStore.getState().canvas.gridOpacity
    useCanvasStore.getState().setCanvas({ gridExtent: 'printable' })
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(before)
    expect(useCanvasStore.getState().canvas.gridExtent).toBe('printable')
    useCanvasStore.getState().setCanvas({ gridExtent: 'page' })
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(before)
  })

  it('loadSheet normalizes print page count and grid extent', () => {
    useCanvasStore.getState().loadSheet({
      sheetId: 's1',
      title: 'T',
      canvas: {
        ...DEFAULT_CANVAS,
        printPageCount: 99 as number,
        gridExtent: 'bogus' as 'page',
        gridOpacity: 2,
      },
      items: [],
    })
    const { canvas } = useCanvasStore.getState()
    expect(canvas.printPageCount).toBe(20)
    expect(canvas.gridExtent).toBe('page')
    expect(canvas.gridOpacity).toBe(0.3)
  })

  it('setPrintSize enables print frame', () => {
    useCanvasStore.getState().setShowPrintArea(false)
    useCanvasStore.getState().setPrintSize('a4', 'landscape')
    const { canvas } = useCanvasStore.getState()
    expect(canvas.printSizeId).toBe('a4')
    expect(canvas.orientation).toBe('landscape')
    expect(canvas.showPrintArea).toBe(true)
  })
})

describe('canvasStore — selection & history', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset()
  })

  it('select / setSelectedIds / toggleSelect', () => {
    const s = useCanvasStore.getState()
    s.addCustomEquation('x=1', 'eq')
    const id = useCanvasStore.getState().items[0]!.id
    useCanvasStore.getState().select(id)
    expect(useCanvasStore.getState().selectedIds).toEqual([id])
    useCanvasStore.getState().setSelectedIds([])
    expect(useCanvasStore.getState().selectedIds).toEqual([])
    useCanvasStore.getState().toggleSelect(id)
    expect(useCanvasStore.getState().selectedIds).toContain(id)
    useCanvasStore.getState().toggleSelect(id)
    expect(useCanvasStore.getState().selectedIds).not.toContain(id)
  })

  it('undo restores canvas after setCanvas', () => {
    useCanvasStore.getState().setCanvas({ gridOpacity: 0.2 })
    expect(useCanvasStore.getState().canvas.gridOpacity).toBe(0.2)
    expect(useCanvasStore.getState().past.length).toBeGreaterThan(0)
    useCanvasStore.getState().undo()
    // after undo, opacity should not be the 0.2 we just set
    expect(useCanvasStore.getState().canvas.gridOpacity).not.toBe(0.2)
  })

  it('history batch coalesces continuous setCanvas', () => {
    useCanvasStore.getState().beginHistoryBatch()
    useCanvasStore.getState().setCanvas({ gridOpacity: 0.1 })
    useCanvasStore.getState().setCanvas({ gridOpacity: 0.12 })
    useCanvasStore.getState().setCanvas({ gridOpacity: 0.15 })
    useCanvasStore.getState().endHistoryBatch()
    // One batch → only one past entry from the first mutation
    const pastLen = useCanvasStore.getState().past.length
    expect(pastLen).toBe(1)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().canvas.gridOpacity).not.toBe(0.15)
  })
})
