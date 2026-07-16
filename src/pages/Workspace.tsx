import { useEffect, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useAuthStore } from '@/stores/authStore'
import { useLibraryStore } from '@/stores/libraryStore'
// useLibraryStore.getState() used for splash-already-loaded guard
import { useSheetsStore } from '@/stores/sheetsStore'

export function Workspace() {
  const user = useAuthStore((s) => s.user)
  const loadLibrary = useLibraryStore((s) => s.load)
  const ensureDefaultSheet = useSheetsStore((s) => s.ensureDefaultSheet)
  const bootstrappedFor = useRef<string | null>(null)

  // Catalog bulk-load runs in AppInitSplash (runAppBootstrap → libraryStore.load).
  // Keep a safety reload if splash was skipped / store empty.
  useEffect(() => {
    if (useLibraryStore.getState().items.length === 0) {
      void loadLibrary()
    }
  }, [loadLibrary])

  useEffect(() => {
    if (!user) {
      bootstrappedFor.current = null
      return
    }
    // Avoid double bootstrap (React Strict Mode / re-renders) leaving local_* stuck
    if (bootstrappedFor.current === user.uid) return
    bootstrappedFor.current = user.uid
    void ensureDefaultSheet(user.uid)
  }, [user, ensureDefaultSheet])

  return <AppShell />
}
