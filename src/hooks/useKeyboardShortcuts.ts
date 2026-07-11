import { useEffect } from 'react'
import { handleCanvasKeyDown } from '@/lib/keyboardShortcuts'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore } from '@/stores/uiStore'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = useCanvasStore.getState()
      const result = handleCanvasKeyDown(e, {
        undo: () => state.undo(),
        redo: () => state.redo(),
        removeItems: (ids) => state.removeItems(ids),
        select: (id) => state.select(id),
        setCanvasTool: (tool) => useUiStore.getState().setCanvasTool(tool),
        pastLength: state.past.length,
        futureLength: state.future.length,
        selectedIds: state.selectedIds,
      })
      if (result.handled) e.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
