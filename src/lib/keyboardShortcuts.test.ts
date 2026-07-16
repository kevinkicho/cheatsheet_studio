import { describe, expect, it, vi } from 'vitest'
import {
  handleCanvasKeyDown,
  type ShortcutActions,
} from '@/lib/keyboardShortcuts'

function actions(partial: Partial<ShortcutActions> = {}): ShortcutActions & {
  calls: {
    undo: ReturnType<typeof vi.fn>
    redo: ReturnType<typeof vi.fn>
    removeItems: ReturnType<typeof vi.fn>
    removeLayoutPanels: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    setCanvasTool: ReturnType<typeof vi.fn>
  }
} {
  const calls = {
    undo: vi.fn(),
    redo: vi.fn(),
    removeItems: vi.fn(),
    removeLayoutPanels: vi.fn(),
    select: vi.fn(),
    selectAll: vi.fn(),
    setCanvasTool: vi.fn(),
  }
  return {
    undo: calls.undo,
    redo: calls.redo,
    removeItems: calls.removeItems,
    removeLayoutPanels: calls.removeLayoutPanels,
    select: calls.select,
    selectAll: calls.selectAll,
    setCanvasTool: calls.setCanvasTool,
    pastLength: 1,
    futureLength: 1,
    selectedIds: ['a'],
    selectedPanelIds: [],
    ...partial,
    calls,
  }
}

function key(
  k: string,
  mods: Partial<KeyboardEvent> = {},
): Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'target'
> {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: document.body,
    ...mods,
  }
}

describe('handleCanvasKeyDown', () => {
  it('Ctrl/Cmd+Z undoes when history exists', () => {
    const a = actions({ pastLength: 2 })
    const r = handleCanvasKeyDown(key('z', { ctrlKey: true }), a)
    expect(r).toEqual({ handled: true, action: 'undo' })
    expect(a.calls.undo).toHaveBeenCalledOnce()
  })

  it('Ctrl+Shift+E exports sheet JSON when handler provided', () => {
    const exportSheetJson = vi.fn()
    const a = actions({ exportSheetJson })
    const r = handleCanvasKeyDown(
      key('e', { ctrlKey: true, shiftKey: true }),
      a,
    )
    expect(r).toEqual({ handled: true, action: 'export-sheet-json' })
    expect(exportSheetJson).toHaveBeenCalledOnce()
  })

  it('Ctrl+Shift+I imports sheet JSON when handler provided', () => {
    const importSheetJson = vi.fn()
    const a = actions({ importSheetJson })
    const r = handleCanvasKeyDown(
      key('i', { ctrlKey: true, shiftKey: true }),
      a,
    )
    expect(r).toEqual({ handled: true, action: 'import-sheet-json' })
    expect(importSheetJson).toHaveBeenCalledOnce()
  })

  it('Ctrl+Shift+Z and Ctrl+Y redo', () => {
    const a = actions({ futureLength: 1 })
    expect(
      handleCanvasKeyDown(key('z', { ctrlKey: true, shiftKey: true }), a),
    ).toEqual({ handled: true, action: 'redo' })
    expect(handleCanvasKeyDown(key('y', { metaKey: true }), a)).toEqual({
      handled: true,
      action: 'redo',
    })
    expect(a.calls.redo).toHaveBeenCalledTimes(2)
  })

  it('does not delete canvas card when focus is in process editor', () => {
    const a = actions({ selectedIds: ['card1'] })
    const host = document.createElement('div')
    host.className = 'mermaid-visual-editor'
    const inner = document.createElement('div')
    host.appendChild(inner)
    document.body.appendChild(host)
    const r = handleCanvasKeyDown(key('Delete', { target: inner }), a)
    expect(r).toEqual({ handled: false })
    expect(a.calls.removeItems).not.toHaveBeenCalled()
    host.remove()
  })

  it('does not steal undo when typing in an input', () => {
    const a = actions()
    const input = document.createElement('input')
    const r = handleCanvasKeyDown(
      key('z', { ctrlKey: true, target: input }),
      a,
    )
    expect(r.handled).toBe(false)
    expect(a.calls.undo).not.toHaveBeenCalled()
  })

  it('Ctrl/Cmd+A selects all canvas items', () => {
    const a = actions()
    const r = handleCanvasKeyDown(key('a', { ctrlKey: true }), a)
    expect(r).toEqual({ handled: true, action: 'select-all' })
    expect(a.calls.selectAll).toHaveBeenCalledOnce()
  })

  it('Delete/Backspace removes selection', () => {
    const a = actions({ selectedIds: ['x', 'y'] })
    expect(handleCanvasKeyDown(key('Delete'), a)).toEqual({
      handled: true,
      action: 'delete',
    })
    expect(a.calls.removeItems).toHaveBeenCalledWith(['x', 'y'])
    a.calls.removeItems.mockClear()
    expect(handleCanvasKeyDown(key('Backspace'), a)).toEqual({
      handled: true,
      action: 'delete',
    })
  })

  it('does not delete when nothing selected', () => {
    const a = actions({ selectedIds: [], selectedPanelIds: [] })
    expect(handleCanvasKeyDown(key('Delete'), a).handled).toBe(false)
  })

  it('Delete removes layout panels when only panels selected', () => {
    const a = actions({
      selectedIds: [],
      selectedPanelIds: ['p1', 'p2'],
    })
    expect(handleCanvasKeyDown(key('Delete'), a)).toEqual({
      handled: true,
      action: 'delete-panels',
    })
    expect(a.calls.removeLayoutPanels).toHaveBeenCalledWith(['p1', 'p2'])
    expect(a.calls.removeItems).not.toHaveBeenCalled()
  })

  it('Delete prefers cards over panels when both selected', () => {
    const a = actions({
      selectedIds: ['c1'],
      selectedPanelIds: ['p1'],
    })
    expect(handleCanvasKeyDown(key('Delete'), a)).toEqual({
      handled: true,
      action: 'delete',
    })
    expect(a.calls.removeItems).toHaveBeenCalledWith(['c1'])
    expect(a.calls.removeLayoutPanels).not.toHaveBeenCalled()
  })

  it('Escape clears selection', () => {
    const a = actions()
    expect(handleCanvasKeyDown(key('Escape'), a)).toEqual({
      handled: true,
      action: 'deselect',
    })
    expect(a.calls.select).toHaveBeenCalledWith(null)
  })

  it('V selects tool, H pans', () => {
    const a = actions()
    expect(handleCanvasKeyDown(key('v'), a)).toEqual({
      handled: true,
      action: 'tool-select',
    })
    expect(a.calls.setCanvasTool).toHaveBeenCalledWith('select')
    expect(handleCanvasKeyDown(key('H'), a)).toEqual({
      handled: true,
      action: 'tool-pan',
    })
    expect(a.calls.setCanvasTool).toHaveBeenCalledWith('pan')
  })

  it('ignores tool keys with modifiers', () => {
    const a = actions()
    expect(handleCanvasKeyDown(key('v', { ctrlKey: true }), a).handled).toBe(
      false,
    )
  })
})
