/**
 * Export the live workspace canvas as an agent-compatible SheetDocument v1.
 * Mirrors packages/cheatsheet-sdk shape so Import JSON can re-open the file.
 */
import { useCanvasStore } from '@/stores/canvasStore'
import type { CanvasItem, OutlinerFolder, SheetCanvas } from '@/types'

export const SHEET_DOC_VERSION = 1 as const

export type ExportedSheetDocument = {
  v: typeof SHEET_DOC_VERSION
  title: string
  canvas: SheetCanvas
  items: CanvasItem[]
  folders: OutlinerFolder[]
  meta?: {
    createdBy?: string
    source?: string
    notes?: string
    sheetId?: string | null
    exportedAt?: string
  }
}

/** Snapshot current workspace into portable JSON (does not hit network). */
export function exportWorkspaceSheetDocument(): ExportedSheetDocument {
  const s = useCanvasStore.getState()
  return {
    v: SHEET_DOC_VERSION,
    title: s.title || 'Untitled sheet',
    canvas: { ...s.canvas },
    items: s.items.map((it) => ({ ...it })),
    folders: (s.folders ?? []).map((f) => ({ ...f })),
    meta: {
      createdBy: 'workspace-export',
      source: 'CheatSheet Studio',
      sheetId: s.sheetId,
      exportedAt: new Date().toISOString(),
      notes: 'Exported from Workspace — re-open via My Sheets → Import JSON',
    },
  }
}

/** Trigger a browser download of the current sheet as .sheet.json */
export function downloadWorkspaceSheetJson(filename?: string): void {
  const doc = exportWorkspaceSheetDocument()
  const safe =
    filename ??
    `${(doc.title || 'sheet')
      .replace(/[^\w\-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 48)}.sheet.json`
  const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safe.endsWith('.json') ? safe : `${safe}.json`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
