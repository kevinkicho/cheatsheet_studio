import { useEffect } from 'react'
import { useCanvasStore } from '@/stores/canvasStore'
import { useUiStore } from '@/stores/uiStore'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        target?.isContentEditable
      ) {
        return
      }

      const { selectedIds, removeItems, select } = useCanvasStore.getState()
      const { setCanvasTool } = useUiStore.getState()

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedIds.length > 0
      ) {
        e.preventDefault()
        removeItems(selectedIds)
      }
      if (e.key === 'Escape') {
        select(null)
      }
      // Tool shortcuts (no modifiers)
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault()
          setCanvasTool('select')
        }
        if (e.key === 'h' || e.key === 'H') {
          e.preventDefault()
          setCanvasTool('pan')
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
