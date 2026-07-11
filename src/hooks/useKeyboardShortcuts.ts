import { useEffect } from 'react'
import { useCanvasStore } from '@/stores/canvasStore'

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

      const { selectedId, removeItem, select } = useCanvasStore.getState()

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeItem(selectedId)
      }
      if (e.key === 'Escape') {
        select(null)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
