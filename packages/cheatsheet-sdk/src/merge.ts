/**
 * Merge multiple SheetDocuments into one (agent workflow: combine packs).
 */
import { createId } from './ids'
import { autoLayoutItems } from './layout'
import type { CanvasItem, SheetDocument } from './types'
import { validateSheetDocument } from './validate'

export type MergeOptions = {
  /** Combined sheet title (default: first sheet title + " (merged)") */
  title?: string
  /** Re-pack all items after merge (default true) */
  autoLayout?: boolean
  /** Remap item ids so duplicates never collide (default true) */
  remapIds?: boolean
}

/**
 * Concatenate items/folders from multiple sheets onto the first sheet's canvas.
 */
export function mergeSheets(
  sheets: SheetDocument[],
  opts: MergeOptions = {},
): SheetDocument {
  if (sheets.length === 0) {
    throw new Error('mergeSheets requires at least one sheet')
  }
  if (sheets.length === 1) return sheets[0]!

  const base = sheets[0]!
  const remap = opts.remapIds !== false
  const items: CanvasItem[] = []
  let z = 1

  for (const sh of sheets) {
    for (const it of sh.items) {
      const id = remap ? createId(it.type.slice(0, 3) || 'item') : it.id
      items.push({
        ...it,
        id,
        zIndex: z++,
      })
    }
  }

  const folders = sheets.flatMap((s) => s.folders ?? [])
  const laid =
    opts.autoLayout !== false
      ? autoLayoutItems(items, base.canvas)
      : items

  const doc: SheetDocument = {
    v: base.v,
    title:
      opts.title?.trim() ||
      `${base.title.replace(/\s*\(merged\)\s*$/i, '')} (merged)`,
    canvas: { ...base.canvas },
    items: laid,
    folders,
    meta: {
      createdBy: 'mergeSheets',
      source: sheets.map((s) => s.title).join(' + '),
      notes: `Merged ${sheets.length} sheets`,
    },
  }

  const v = validateSheetDocument(doc)
  if (!v.ok) {
    throw new Error(
      v.issues.map((i) => `${i.path}: ${i.message}`).join('; '),
    )
  }
  return v.sheet
}
