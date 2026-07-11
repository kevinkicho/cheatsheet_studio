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

  it('setLibraryLayout switches cards / list', () => {
    useUiStore.getState().setLibraryLayout('list')
    expect(useUiStore.getState().libraryLayout).toBe('list')
    useUiStore.getState().setLibraryLayout('cards')
    expect(useUiStore.getState().libraryLayout).toBe('cards')
  })
})
