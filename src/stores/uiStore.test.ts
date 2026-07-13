import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore, ZOOM_MAX, ZOOM_MIN } from '@/stores/uiStore'

describe('uiStore — zoom & tools', () => {
  beforeEach(() => {
    useUiStore.setState({
      canvasZoom: 1,
      canvasTool: 'select',
      view: 'workspace',
    })
  })

  it('clamps zoom to min/max', () => {
    useUiStore.getState().setCanvasZoom(0.01)
    expect(useUiStore.getState().canvasZoom).toBe(ZOOM_MIN)
    useUiStore.getState().setCanvasZoom(99)
    expect(useUiStore.getState().canvasZoom).toBe(ZOOM_MAX)
  })

  it('zoomIn / zoomOut / zoomReset', () => {
    useUiStore.getState().zoomIn()
    expect(useUiStore.getState().canvasZoom).toBeGreaterThan(1)
    useUiStore.getState().zoomReset()
    expect(useUiStore.getState().canvasZoom).toBe(1)
    useUiStore.getState().zoomOut()
    expect(useUiStore.getState().canvasZoom).toBeLessThan(1)
  })

  it('setCanvasTool switches select/pan', () => {
    useUiStore.getState().setCanvasTool('pan')
    expect(useUiStore.getState().canvasTool).toBe('pan')
    useUiStore.getState().setCanvasTool('select')
    expect(useUiStore.getState().canvasTool).toBe('select')
  })

  it('setRightTool opens right sidebar', () => {
    useUiStore.getState().setRightOpen(false)
    useUiStore.getState().setRightTool('equation')
    expect(useUiStore.getState().rightOpen).toBe(true)
    expect(useUiStore.getState().rightTool).toBe('equation')
  })

  it('beginEditProcessChart opens Process panel and binds card', () => {
    useUiStore.setState({
      rightOpen: false,
      rightTool: 'layers',
      editingProcessChartId: null,
    })
    useUiStore.getState().beginEditProcessChart('card-abc')
    const s = useUiStore.getState()
    expect(s.editingProcessChartId).toBe('card-abc')
    expect(s.rightTool).toBe('process')
    expect(s.rightOpen).toBe(true)
  })

  it('setRightTool does not clear edit id (panel unmount owns that)', () => {
    useUiStore.getState().beginEditProcessChart('card-xyz')
    useUiStore.getState().setRightTool('layers')
    // Still set until CreateProcessChartPanel unmount flushes/ends edit
    expect(useUiStore.getState().editingProcessChartId).toBe('card-xyz')
    expect(useUiStore.getState().rightTool).toBe('layers')
  })

  it('setLibraryLayout switches cards / list', () => {
    useUiStore.getState().setLibraryLayout('list')
    expect(useUiStore.getState().libraryLayout).toBe('list')
    useUiStore.getState().setLibraryLayout('cards')
    expect(useUiStore.getState().libraryLayout).toBe('cards')
  })
})
