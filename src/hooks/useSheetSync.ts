import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useCanvasStore } from '@/stores/canvasStore'
import { useSheetsStore } from '@/stores/sheetsStore'

const SAVE_DEBOUNCE_MS = 1000

/**
 * Debounced autosave of the active canvas sheet to Firestore.
 * Requires Google sign-in. Local-only sheets are promoted to cloud on first save.
 */
export function useSheetSync() {
  const user = useAuthStore((s) => s.user)
  const dirty = useCanvasStore((s) => s.dirty)
  const sheetId = useCanvasStore((s) => s.sheetId)
  const items = useCanvasStore((s) => s.items)
  const title = useCanvasStore((s) => s.title)
  const canvas = useCanvasStore((s) => s.canvas)
  const saveActiveSheet = useSheetsStore((s) => s.saveActiveSheet)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Autosave shortly after any dirty change
  useEffect(() => {
    if (!user || !dirty) return

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void saveActiveSheet(user.uid).catch((err) => {
        console.error('Failed to save sheet', err)
      })
    }, SAVE_DEBOUNCE_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [user, sheetId, dirty, items, title, canvas, saveActiveSheet])

  // Flush pending save when leaving the tab / closing the window
  useEffect(() => {
    const flush = () => {
      if (!user || !useCanvasStore.getState().dirty) return
      void saveActiveSheet(user.uid)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user, saveActiveSheet])
}
