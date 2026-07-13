import { useCallback, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useSheetsStore } from '@/stores/sheetsStore'
import { useUiStore } from '@/stores/uiStore'
import {
  readSheetFileFromBrowserFile,
  type ImportedSheetDocument,
} from '@/lib/sheetDocumentImport'

export type ImportFeedback = {
  kind: 'success' | 'error' | 'info'
  title: string
  detail?: string
}

/**
 * Shared import pipeline for TopBar + My Sheets.
 * Creates a new sheet from agent/CLI JSON and opens Workspace.
 */
export function useSheetJsonImport(onFeedback?: (fb: ImportFeedback) => void) {
  const user = useAuthStore((s) => s.user)
  const importSheetDocument = useSheetsStore((s) => s.importSheetDocument)
  const setView = useUiStore((s) => s.setView)
  const [busy, setBusy] = useState(false)

  const importFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      if (!user) {
        onFeedback?.({
          kind: 'error',
          title: 'Sign in to import',
          detail: 'Cloud (or local) sheet creation needs an account.',
        })
        return
      }
      if (!/\.json$/i.test(file.name) && file.type && !file.type.includes('json')) {
        onFeedback?.({
          kind: 'error',
          title: 'Not a JSON sheet',
          detail: 'Use a .sheet.json or .json file from the agent CLI.',
        })
        return
      }

      setBusy(true)
      try {
        const parsed = await readSheetFileFromBrowserFile(file)
        if (!parsed.ok) {
          onFeedback?.({
            kind: 'error',
            title: 'Could not import sheet',
            detail: parsed.error,
          })
          return
        }
        const sheet: ImportedSheetDocument = parsed.sheet
        await importSheetDocument(user.uid, sheet)
        setView('workspace')
        const n = sheet.items.length
        onFeedback?.({
          kind: 'success',
          title: `Imported “${sheet.title}”`,
          detail:
            n === 0
              ? 'Empty sheet opened in Workspace — add cards or drag library items.'
              : `${n} card${n === 1 ? '' : 's'} loaded. Polish layout, then Export JSON / PDF via agents.`,
        })
      } catch (e) {
        onFeedback?.({
          kind: 'error',
          title: 'Import failed',
          detail: e instanceof Error ? e.message : String(e),
        })
      } finally {
        setBusy(false)
      }
    },
    [user, importSheetDocument, setView, onFeedback],
  )

  return { importFile, busy, user }
}
