import { useEffect } from 'react'
import {
  handleCanvasKeyDown,
  isProcessEditorTarget,
} from '@/lib/keyboardShortcuts'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore } from '@/stores/uiStore'
import { useFlowStore } from '@/vendor/mermaid-visual-editor/lib/store'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Delete inside process interactive editor must not remove the canvas card
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Explicit Edit mode: canvas card is unbound; never delete board items
        if (useUiStore.getState().editingProcessChartId) {
          return
        }
        if (
          isProcessEditorTarget(e.target) ||
          isProcessEditorTarget(document.activeElement)
        ) {
          return
        }
        // RF may leave focus on body; still block if editor has a selection
        const flow = useFlowStore.getState()
        if (
          flow.nodes.some((n) => n.selected) ||
          flow.edges.some((ed) => ed.selected)
        ) {
          return
        }
      }

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
