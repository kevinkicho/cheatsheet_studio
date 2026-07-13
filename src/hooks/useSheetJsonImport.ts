import { useCallback, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useSheetsStore } from '@/stores/sheetsStore'
import { useUiStore } from '@/stores/uiStore'
import {
  readSheetFileFromBrowserFile,
  type ImportedSheetDocument,
} from '@/lib/sheetDocumentImport'
import { pushImportHistory } from '@/lib/importHistory'

export type ImportFeedback = {
  kind: 'success' | 'error' | 'info'
  title: string
  detail?: string
}

export type ImportMode = 'new' | 'replace' | 'append'

/**
 * Shared import pipeline for TopBar + My Sheets + drop overlay.
 * Creates / replaces / appends agent sheet JSON and opens Workspace.
 * After success, requests fit-print so the midterm sheet is in view.
 */
export function useSheetJsonImport(onFeedback?: (fb: ImportFeedback) => void) {
  const user = useAuthStore((s) => s.user)
  const importSheetDocument = useSheetsStore((s) => s.importSheetDocument)
  const setView = useUiStore((s) => s.setView)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<ImportMode>('new')

  const importFile = useCallback(
    async (
      file: File | null | undefined,
      modeOverride?: ImportMode,
    ) => {
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

      const importMode = modeOverride ?? mode
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
        await importSheetDocument(user.uid, sheet, { mode: importMode })
        setView('workspace')
        pushImportHistory({
          title: sheet.title,
          cardCount: sheet.items.length,
          mode: importMode,
          fileName: file.name,
        })
        // Ask MainCanvas to fit print layout after paint
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('cheatsheet:fit-print-layout', {
              detail: { reason: 'import' },
            }),
          )
        }, 80)

        const n = sheet.items.length
        const modeLabel =
          importMode === 'replace'
            ? 'Replaced open sheet'
            : importMode === 'append'
              ? 'Appended to open sheet'
              : 'Imported'
        onFeedback?.({
          kind: 'success',
          title: `${modeLabel} “${sheet.title}”`,
          detail:
            n === 0
              ? 'Empty sheet in Workspace — add cards or drag library items. Use Export → PDF for print pages (Studio WYSIWYG).'
              : `${n} card${n === 1 ? '' : 's'}. Layout fitted to print frame — polish, then Export → PDF (Studio) or CLI export-pdf (agent print).`,
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
    [user, importSheetDocument, setView, onFeedback, mode],
  )

  return { importFile, busy, user, mode, setMode }
}
