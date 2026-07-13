/**
 * Import agent / CLI sheet JSON into the workspace.
 * Self-contained (does not import packages/) so the Vite app stays isolated.
 * Shape matches packages/cheatsheet-sdk SheetDocument v1 + app canvas items.
 */
import type {
  CanvasItem,
  OutlinerFolder,
  SheetCanvas,
} from '@/types'
import { DEFAULT_CANVAS } from '@/types'
import { normalizeCanvasItems } from '@/lib/cardDefaults'

export type ImportedSheetDocument = {
  title: string
  canvas: SheetCanvas
  items: CanvasItem[]
  folders: OutlinerFolder[]
}

export type ImportParseResult =
  | { ok: true; sheet: ImportedSheetDocument }
  | { ok: false; error: string }

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Parse + lightly validate a SheetDocument JSON blob from an agent/CLI.
 */
export function parseSheetDocumentJson(input: unknown): ImportParseResult {
  if (!isObj(input)) {
    return { ok: false, error: 'Root must be a JSON object' }
  }
  if (typeof input.title !== 'string' || !input.title.trim()) {
    return { ok: false, error: 'title is required' }
  }
  if (!isObj(input.canvas)) {
    return { ok: false, error: 'canvas object is required' }
  }
  if (!Array.isArray(input.items)) {
    return { ok: false, error: 'items must be an array' }
  }

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i]
    if (!isObj(it)) {
      return { ok: false, error: `items[${i}] must be an object` }
    }
    if (typeof it.id !== 'string' || !it.id) {
      return { ok: false, error: `items[${i}].id is required` }
    }
    if (typeof it.type !== 'string') {
      return { ok: false, error: `items[${i}].type is required` }
    }
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      if (typeof it[k] !== 'number' || !Number.isFinite(it[k])) {
        return { ok: false, error: `items[${i}].${k} must be a number` }
      }
    }
  }

  const canvas: SheetCanvas = {
    ...DEFAULT_CANVAS,
    ...(input.canvas as Partial<SheetCanvas>),
  }

  const rawItems = input.items as CanvasItem[]
  const items = normalizeCanvasItems(
    rawItems.map((it, i) => ({
      ...it,
      zIndex: typeof it.zIndex === 'number' ? it.zIndex : i + 1,
    })),
  )

  const folders = Array.isArray(input.folders)
    ? (input.folders as OutlinerFolder[])
    : []

  return {
    ok: true,
    sheet: {
      title: input.title.trim(),
      canvas,
      items,
      folders,
    },
  }
}

export async function readSheetFileFromBrowserFile(
  file: File,
): Promise<ImportParseResult> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: 'Could not read file' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON' }
  }
  return parseSheetDocumentJson(parsed)
}
